import * as fs from 'fs';
import * as path from 'path';
import type { ProxyConfig } from './config.js';

// ─── 颜色工具 ───
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function ts(): string {
  return new Date().toISOString();
}

// ─── 日志目录初始化 ───
let logStream: fs.WriteStream | null = null;
let jsonLogStream: fs.WriteStream | null = null;

export function initLogger(config: ProxyConfig): void {
  if (!fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir, { recursive: true });
  }
  const date = new Date().toISOString().slice(0, 10);
  const logFile = path.join(config.logDir, `proxy-${date}.log`);
  const jsonFile = path.join(config.logDir, `proxy-${date}.jsonl`);
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
  jsonLogStream = fs.createWriteStream(jsonFile, { flags: 'a' });
  info(`日志文件: ${logFile}`);
  info(`JSON日志: ${jsonFile}`);
}

// ─── 基础日志 ───
function writeToFile(msg: string): void {
  if (logStream) {
    logStream.write(msg + '\n');
  }
}

function writeJsonLine(entry: object): void {
  if (jsonLogStream) {
    jsonLogStream.write(JSON.stringify(entry) + '\n');
  }
}

export function info(msg: string): void {
  const line = `[${ts()}] ℹ️  ${msg}`;
  console.log(`${C.dim}${line}${C.reset}`);
  writeToFile(line);
}

export function warn(msg: string): void {
  const line = `[${ts()}] ⚠️  ${msg}`;
  console.log(`${C.yellow}${line}${C.reset}`);
  writeToFile(line);
}

export function error(msg: string): void {
  const line = `[${ts()}] ❌ ${msg}`;
  console.error(`${C.red}${line}${C.reset}`);
  writeToFile(line);
}

// ─── 脱敏请求头 ───
function maskHeaders(
  headers: Record<string, string | string[] | undefined>,
  sensitiveKeys: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      if (typeof value === 'string') {
        if (value.length > 8) {
          result[key] = value.slice(0, 4) + '****' + value.slice(-4);
        } else {
          result[key] = '****';
        }
      } else {
        result[key] = '****';
      }
    } else {
      result[key] = Array.isArray(value) ? value.join(', ') : (value ?? '');
    }
  }
  return result;
}

// ─── 安全 JSON 格式化 ───
function safeStringify(body: string, indent = 2): string {
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed, null, indent);
  } catch {
    return body;
  }
}

// ─── 解析 chat/completions 协议 ───
function parseChatRequest(body: string): ChatParsedRequest | undefined {
  try {
    const obj = JSON.parse(body);
    if (!obj.messages) return undefined;
    return {
      model: obj.model,
      stream: obj.stream,
      temperature: obj.temperature,
      max_tokens: obj.max_tokens,
      messages: obj.messages,
    };
  } catch { return undefined; }
}

function parseChatResponse(body: string, isStream: boolean): { parsed?: ChatParsedResponse; sseContent?: string } {
  if (isStream) return {};
  try {
    const obj = JSON.parse(body);
    const choice = obj.choices?.[0];
    return {
      parsed: {
        model: obj.model,
        content: choice?.message?.content,
        finish_reason: choice?.finish_reason,
        usage: obj.usage,
      },
    };
  } catch { return {}; }
}

function parseSSEChunk(data: string): { content?: string; finish_reason?: string; usage?: ChatParsedResponse['usage'] } {
  try {
    const jsonStr = data.replace(/^data:\s*/, '');
    if (jsonStr === '[DONE]') return {};
    const obj = JSON.parse(jsonStr);
    const delta = obj.choices?.[0]?.delta;
    return {
      content: delta?.content,
      finish_reason: obj.choices?.[0]?.finish_reason,
      usage: obj.usage,
    };
  } catch { return {}; }
}

// ─── 内存日志存储 ───
export interface ChatParsedRequest {
  model?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  messages?: Array<{ role: string; content: string }>;
}

export interface ChatParsedResponse {
  model?: string;
  content?: string;
  finish_reason?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'request' | 'response' | 'sse_chunk';
  method?: string;
  url?: string;
  statusCode?: number;
  isStream?: boolean;
  headers?: Record<string, string>;
  body?: string;
  /** 关联的请求 ID（SSE chunk 和 response 关联到对应 request） */
  requestId?: string;
  /** 解析后的 chat/completions 请求内容 */
  chatRequest?: ChatParsedRequest;
  /** 解析后的 chat/completions 响应内容 */
  chatResponse?: ChatParsedResponse;
  /** SSE 流式拼接的完整内容 */
  sseContent?: string;
}

const logStore: LogEntry[] = [];
let logIdCounter = 0;
const MAX_LOG_ENTRIES = 1000;

type LogListener = (entry: LogEntry) => void;
const listeners = new Set<LogListener>();

export function onLog(listener: LogListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function addLog(entry: Omit<LogEntry, 'id'>): LogEntry {
  const full: LogEntry = { ...entry, id: String(++logIdCounter) };
  logStore.push(full);
  if (logStore.length > MAX_LOG_ENTRIES) {
    logStore.splice(0, logStore.length - MAX_LOG_ENTRIES);
  }
  for (const listener of listeners) {
    listener(full);
  }
  return full;
}

export function getLogs(): LogEntry[] {
  return [...logStore];
}

export function clearLogs(): void {
  logStore.length = 0;
  logIdMap.clear();
  logIdCounter = 0;
}

// ─── 打印请求 ───
let currentRequestId: string | null = null;

export function logRequest(
  config: ProxyConfig,
  method: string,
  url: string,
  headers: Record<string, string | string[] | undefined>,
  body: string,
): void {
  const masked = maskHeaders(headers, config.sensitiveHeaders);
  const separator = '─'.repeat(60);

  const lines: string[] = [
    '',
    separator,
    `${C.bright}${C.cyan}>>> REQUEST  ${method} ${url}${C.reset}`,
    `${C.dim}Time: ${ts()}${C.reset}`,
    `${C.blue}Headers:${C.reset}`,
    safeStringify(JSON.stringify(masked)),
    `${C.green}Body:${C.reset}`,
    body ? safeStringify(body) : '(empty)',
    separator,
  ];

  console.log(lines.join('\n'));

  const fileLines = [
    '',
    separator,
    `>>> REQUEST  ${method} ${url}`,
    `Time: ${ts()}`,
    'Headers:',
    safeStringify(JSON.stringify(masked)),
    'Body:',
    body ? safeStringify(body) : '(empty)',
    separator,
  ];
  writeToFile(fileLines.join('\n'));

  // 解析 chat/completions 请求
  const chatRequest = parseChatRequest(body);

  // 写入内存
  const entry = addLog({
    timestamp: ts(),
    type: 'request',
    method,
    url,
    headers: masked,
    body: body || undefined,
    chatRequest,
  });
  writeJsonLine(entry);
  currentRequestId = entry.id;
}

// ─── 打印响应 ───
export function logResponse(
  config: ProxyConfig,
  statusCode: number,
  headers: Record<string, string | string[] | undefined>,
  body: string,
  isStream: boolean,
): void {
  const masked = maskHeaders(headers, config.sensitiveHeaders);
  const separator = '─'.repeat(60);
  const streamTag = isStream ? ' [SSE]' : '';

  const lines: string[] = [
    '',
    separator,
    `${C.bright}${C.magenta}<<< RESPONSE ${statusCode}${streamTag}${C.reset}`,
    `${C.dim}Time: ${ts()}${C.reset}`,
    `${C.blue}Headers:${C.reset}`,
    safeStringify(JSON.stringify(masked)),
    `${C.green}Body:${C.reset}`,
    body ? (isStream ? body : safeStringify(body)) : '(empty)',
    separator,
  ];

  console.log(lines.join('\n'));

  const fileLines = [
    '',
    separator,
    `<<< RESPONSE ${statusCode}${streamTag}`,
    `Time: ${ts()}`,
    'Headers:',
    safeStringify(JSON.stringify(masked)),
    'Body:',
    body ? (isStream ? body : safeStringify(body)) : '(empty)',
    separator,
  ];
  writeToFile(fileLines.join('\n'));

  // 解析 chat/completions 响应
  const { parsed: chatResponse } = parseChatResponse(body, isStream);

  // 写入内存
  const entry = addLog({
    timestamp: ts(),
    type: 'response',
    statusCode,
    isStream,
    headers: masked,
    body: body || undefined,
    requestId: currentRequestId ?? undefined,
    chatResponse,
  });
  writeJsonLine(entry);
}

// ─── SSE 数据块日志 ───
export function logSSEChunk(data: string): void {
  const line = `[${ts()}] SSE chunk: ${data}`;
  console.log(`${C.dim}${line}${C.reset}`);
  writeToFile(line);

  // 解析 SSE chunk
  const parsed = parseSSEChunk(data);

  // 写入内存，并更新对应请求的 sseContent
  const reqId = currentRequestId ?? undefined;
  if (reqId && parsed.content) {
    const reqEntry = logStore.find(e => e.id === reqId);
    if (reqEntry) {
      reqEntry.sseContent = (reqEntry.sseContent || '') + parsed.content;
    }
  }
  // 如果 SSE 流结束时有 usage，更新 response 的 chatResponse
  if (reqId && parsed.usage) {
    const resEntry = logStore.find(e => e.type === 'response' && e.requestId === reqId);
    if (resEntry) {
      resEntry.chatResponse = { ...resEntry.chatResponse, usage: parsed.usage };
    }
  }

  addLog({
    timestamp: ts(),
    type: 'sse_chunk',
    body: data,
    requestId: reqId,
    chatResponse: parsed.finish_reason || parsed.usage ? { finish_reason: parsed.finish_reason, usage: parsed.usage } : undefined,
  });
}

// ─── 导入日志 ───
const logIdMap = new Map<string, string>();

export function importLogs(entries: LogEntry[]): { imported: number } {
  let imported = 0;
  for (const entry of entries) {
    const originalId = entry.id;
    // Map request/response IDs; update requestId references for responses/chunks
    let mappedRequestId: string | undefined;
    if (entry.requestId) {
      mappedRequestId = logIdMap.get(entry.requestId);
    }
    const newEntry: LogEntry = {
      ...entry,
      id: String(++logIdCounter),
      requestId: mappedRequestId,
    };
    logStore.push(newEntry);
    logIdMap.set(originalId, newEntry.id);
    // Broadcast to SSE listeners so UI updates
    for (const listener of listeners) {
      listener(newEntry);
    }
    imported++;
  }
  if (logStore.length > MAX_LOG_ENTRIES) {
    logStore.splice(0, logStore.length - MAX_LOG_ENTRIES);
  }
  return { imported };
}

export function resetLogIdMap(): void {
  logIdMap.clear();
}

export function loadFromServerFile(filepath: string): { imported: number; error?: string } {
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n');
    let imported = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Skip formatted log lines (start with [timestamp] ℹ️ or ═)
      if (trimmed.startsWith('[') || trimmed.startsWith('─') || trimmed.startsWith('>>>') || trimmed.startsWith('<<<')) {
        continue;
      }
      try {
        const entry = JSON.parse(trimmed) as LogEntry;
        if (!entry.id || !entry.type) continue;
        const originalId = entry.id;
        const newEntry: LogEntry = { ...entry, id: String(++logIdCounter) };
        logStore.push(newEntry);
        logIdMap.set(originalId, newEntry.id);
        // Broadcast to SSE listeners
        for (const listener of listeners) {
          listener(newEntry);
        }
        imported++;
      } catch {
        // Skip invalid JSON lines
      }
    }
    if (logStore.length > MAX_LOG_ENTRIES) {
      logStore.splice(0, logStore.length - MAX_LOG_ENTRIES);
    }
    return { imported };
  } catch (e) {
    return { imported: 0, error: String(e) };
  }
}

export function getLogFiles(logDir: string): string[] {
  try {
    return fs.readdirSync(logDir)
      .filter(f => f.endsWith('.jsonl') || f.endsWith('.log'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}
