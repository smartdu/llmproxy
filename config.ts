export interface ProxyConfig {
  /** 代理监听端口 */
  port: number;
  /** 代理监听地址 */
  host: string;
  /** 目标 HTTPS 站点 (e.g. "https://api.openai.com") */
  target: string;
  /** 要拦截记录的 URL 路径前缀列表 */
  interceptPaths: string[];
  /** 日志输出目录 */
  logDir: string;
  /** 是否在控制台打印完整请求/响应体 */
  verbose: boolean;
  /** Web UI 端口 */
  webPort: number;
  /** 需要脱敏的请求头 */
  sensitiveHeaders: string[];
}

export const defaultConfig: ProxyConfig = {
  port: 8080,
  host: '0.0.0.0',
  target: 'https://api.deepseek.com',
  interceptPaths: ['/v1/chat/completions', '/chat/completions'],
  logDir: './logs',
  verbose: true,
  webPort: 3000,
  sensitiveHeaders: ['authorization', 'cookie', 'set-cookie', 'api-key'],
};

export function loadConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
  return {
    ...defaultConfig,
    port: parseInt(process.env.PROXY_PORT || '') || defaultConfig.port,
    host: process.env.PROXY_HOST || defaultConfig.host,
    target: process.env.PROXY_TARGET || defaultConfig.target,
    interceptPaths: process.env.PROXY_INTERCEPT_PATHS
      ? process.env.PROXY_INTERCEPT_PATHS.split(',')
      : defaultConfig.interceptPaths,
    logDir: process.env.PROXY_LOG_DIR || defaultConfig.logDir,
    verbose: process.env.PROXY_VERBOSE === 'false' ? false : defaultConfig.verbose,
    webPort: parseInt(process.env.PROXY_WEB_PORT || '') || defaultConfig.webPort,
    sensitiveHeaders: defaultConfig.sensitiveHeaders,
    ...overrides,
  };
}
