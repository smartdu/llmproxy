import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import type { ProxyConfig } from './config.js';
import { logRequest, logResponse, logSSEChunk, info, error, warn } from './logger.js';

/**
 * 判断请求路径是否需要拦截记录
 */
function shouldIntercept(pathname: string, interceptPaths: string[]): boolean {
  return interceptPaths.some((p) => pathname.startsWith(p));
}

/**
 * 收集可读流的数据（带背压处理）
 */
function collectBody(stream: http.IncomingMessage, maxBytes = 10 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;

    const onData = (chunk: Buffer) => {
      if (aborted) return;
      total += chunk.length;
      if (total > maxBytes) {
        aborted = true;
        stream.removeListener('data', onData);
        stream.removeListener('end', onEnd);
        stream.removeListener('error', onError);
        reject(new Error(`Body too large: ${total} bytes`));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (aborted) return;
      resolve(Buffer.concat(chunks).toString('utf-8'));
    };
    const onError = (err: Error) => {
      if (aborted) return;
      reject(err);
    };

    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);
  });
}

/**
 * 创建反向代理服务器（高并发优化）
 */
export function createProxyServer(config: ProxyConfig): http.Server {
  const targetUrl = new URL(config.target);
  const isTargetHttps = targetUrl.protocol === 'https:';
  const targetPort = targetUrl.port || (isTargetHttps ? 443 : 80);

  // HTTPS Agent：连接池复用 + keep-alive
  const agent = isTargetHttps
    ? new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 100,
        maxFreeSockets: 10,
        timeout: 60000,
      })
    : new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 100,
        maxFreeSockets: 10,
        timeout: 60000,
      });

  const server = http.createServer(async (clientReq, clientRes) => {
    const pathname = clientReq.url || '/';

    // 删除代理相关头
    const reqHeaders = { ...clientReq.headers, host: targetUrl.host } as Record<string, string | string[] | undefined>;
    delete reqHeaders['proxy-connection'];
    delete reqHeaders['connection'];
    reqHeaders['connection'] = 'keep-alive';

    const options: https.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetPort,
      path: clientReq.url,
      method: clientReq.method,
      headers: reqHeaders,
      agent,
      timeout: 120000,
    };

    const doIntercept = shouldIntercept(pathname, config.interceptPaths);

    // 如果需要拦截，先收集请求体
    let reqBody = '';
    if (doIntercept) {
      try {
        reqBody = await collectBody(clientReq);
      } catch (e) {
        error(`收集请求体失败: ${(e as Error).message}`);
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
          clientRes.end('Bad Gateway: failed to read request body');
        }
        return;
      }
    }

    // 记录请求日志
    let reqId: string | undefined;
    if (doIntercept) {
      reqId = logRequest(config, clientReq.method || 'GET', pathname, clientReq.headers, reqBody);
    } else {
      info(`转发 (不记录): ${clientReq.method} ${pathname}`);
    }

    // 发起目标请求
    const requestModule = isTargetHttps ? https : http;
    const proxyReq = requestModule.request(options, (proxyRes) => {
      const isStream = /text\/event-stream/i.test(proxyRes.headers['content-type'] || '');

      if (doIntercept && !isStream) {
        // 非流式：收集完整响应体后记录再返回
        collectBody(proxyRes)
          .then((resBody) => {
            logResponse(config, proxyRes.statusCode || 0, proxyRes.headers, resBody, false, reqId);
            const resHeaders = { ...proxyRes.headers };
            delete resHeaders['content-length'];
            if (!clientRes.headersSent) {
              clientRes.writeHead(proxyRes.statusCode || 502, resHeaders);
            }
            clientRes.end(resBody);
          })
          .catch((e) => {
            error(`收集响应体失败: ${(e as Error).message}`);
            if (!clientRes.headersSent) {
              clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
              clientRes.end('Bad Gateway: failed to read response body');
            }
          });
      } else {
        // 流式或不需要拦截：直接管道转发
        if (doIntercept && isStream) {
          warn(`SSE 流式响应开始 — 实时转发并记录每个 chunk`);
          logResponse(config, proxyRes.statusCode || 0, proxyRes.headers, '(streaming...)', true, reqId);

          // 注入 chunk 日志（用 PassThrough 避免影响管道）
          proxyRes.on('data', (chunk: Buffer) => {
            const text = chunk.toString('utf-8');
            for (const line of text.split('\n')) {
              const trimmed = line.trim();
              if (trimmed && trimmed.startsWith('data:')) {
                logSSEChunk(trimmed, reqId);
              }
            }
          });
        }

        if (!clientRes.headersSent) {
          clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        }
        proxyRes.pipe(clientRes, { end: true });
      }
    });

    proxyReq.on('timeout', () => {
      error(`代理请求超时: ${pathname}`);
      proxyReq.destroy(new Error('timeout'));
    });

    proxyReq.on('error', (e) => {
      error(`代理请求错误: ${e.message}`);
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
        clientRes.end(`Bad Gateway: ${e.message}`);
      } else {
        clientRes.end();
      }
    });

    // 转发请求体
    if (doIntercept && reqBody) {
      proxyReq.end(reqBody);
    } else {
      clientReq.pipe(proxyReq, { end: true });
    }
  });

  return server;
}
