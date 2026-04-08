import { loadConfig } from './config.js';
import { createProxyServer } from './proxy.js';
import { createWebServer } from './web.js';
import { initLogger, info } from './logger.js';

const config = loadConfig();
initLogger(config);

const proxyServer = createProxyServer(config);
const webServer = createWebServer(config);

proxyServer.listen(config.port, config.host, () => {
  info('╔══════════════════════════════════════════════════╗');
  info('║        LLM HTTPS Reverse Proxy                  ║');
  info('╠══════════════════════════════════════════════════╣');
  info(`║  代理地址:   http://${config.host}:${config.port}`);
  info(`║  目标站点:   ${config.target}`);
  info(`║  拦截路径:   ${config.interceptPaths.join(', ')}`);
  info(`║  日志目录:   ${config.logDir}`);
  info('╚══════════════════════════════════════════════════╝');
});

webServer.listen(config.webPort, config.host, () => {
  info('╔══════════════════════════════════════════════════╗');
  info('║        Web UI 抓包日志                          ║');
  info('╠══════════════════════════════════════════════════╣');
  info(`║  访问地址:   http://${config.host}:${config.webPort}`);
  info('╚══════════════════════════════════════════════════╝');
  info('');
  info('使用方法:');
  info(`  将你的 API 请求从 ${config.target} 改为 http://${config.host}:${config.port}`);
  info(`  浏览器打开 http://localhost:${config.webPort} 查看抓包日志`);
  info('');
  info('环境变量覆盖:');
  info('  PROXY_TARGET    - 目标站点 (默认 https://api.deepseek.com)');
  info('  PROXY_PORT      - 代理端口 (默认 8080)');
  info('  PROXY_WEB_PORT  - Web UI 端口 (默认 3000)');
  info('  PROXY_HOST      - 监听地址 (默认 0.0.0.0)');
  info('  PROXY_LOG_DIR   - 日志目录 (默认 ./logs)');
  info('  PROXY_VERBOSE   - 详细输出 false/true (默认 true)');
});

proxyServer.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    info(`端口 ${config.port} 已被占用，请更换端口或关闭占用进程`);
    process.exit(1);
  }
  info(`代理服务器错误: ${e.message}`);
});

webServer.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    info(`Web UI 端口 ${config.webPort} 已被占用，请设置 PROXY_WEB_PORT 更换端口`);
    process.exit(1);
  }
  info(`Web 服务器错误: ${e.message}`);
});

process.on('SIGINT', () => {
  info('正在关闭服务器...');
  proxyServer.close();
  webServer.close();
  // 强制退出，避免 SSE 等长连接阻塞
  setTimeout(() => process.exit(0), 500);
});
