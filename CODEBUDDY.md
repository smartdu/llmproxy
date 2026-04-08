# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Project Overview

An HTTPS reverse proxy for intercepting and logging LLM API requests/responses (OpenAI-compatible chat completions). Runs two concurrent servers: a proxy (port 8080) and a web UI (port 3000). Built entirely on Node.js built-in modules with **zero runtime dependencies**.

## Commands

```bash
npm start          # Run proxy (tsx index.ts)
npm run dev        # Development with hot reload (tsx watch index.ts)
npm run openai     # Proxy targeting api.openai.com
npm run deepseek   # Proxy targeting api.deepseek.com (default)
npm run claude     # Proxy targeting api.anthropic.com
npx tsc --noEmit   # Type-check only (no build step; tsx runs TS directly)
```

No test framework is configured. There is no build/compile step — TypeScript is executed directly via `tsx`.

## Architecture

```
Client → Proxy Server (:8080) → Target LLM API
                ↓
           logger.ts (in-memory store + file logging)
                ↓
         Web UI Server (:3000) → Browser
```

**Data flow:** Client requests hit the proxy. Matching paths (`/v1/chat/completions`, `/chat/completions`) are intercepted — full request/response bodies are collected and logged, then forwarded. Non-matching paths are piped through unmodified. SSE streaming responses are piped through with per-chunk logging.

### Key Files

- **`config.ts`** — `ProxyConfig` interface, defaults, and env var loading (`PROXY_TARGET`, `PROXY_PORT`, `PROXY_WEB_PORT`, `PROXY_HOST`, `PROXY_LOG_DIR`, `PROXY_VERBOSE`)
- **`index.ts`** — Entry point. Loads config, inits logger, starts both servers. Handles `EADDRINUSE` and `SIGINT` graceful shutdown
- **`proxy.ts`** — HTTPS reverse proxy. Uses `https.Agent` with keep-alive pooling (maxSockets: 100). 10MB body collection safety limit. Strips proxy headers, sets `connection: keep-alive`
- **`logger.ts`** — Dual output (console + file). Writes `.log` (human-readable) and `.jsonl` (machine-readable). In-memory store (max 1000 entries) with `onLog()` subscriber pattern for SSE. Parses OpenAI-compatible chat/completions protocol. Masks sensitive headers
- **`web.ts`** — Web UI server. Embeds full SPA in `getHtml()`. REST API: `GET/DELETE /api/logs`, `SSE /api/logs/stream`, `POST /api/logs/import`. Virtual scrolling, dark/light theme, search/filter, token usage tracking

### Module System

ESM (`"type": "module"`) with `ESNEXT` target. All imports use `.js` extension convention for ESM compatibility with `tsx`.

## Critical: Editing web.ts

The `getHtml()` function returns the entire SPA as a template literal string sent to the browser. This has sharp edges:

- **No TypeScript syntax** in `<script>` — tsx does not strip TS from template literals. No type annotations, `as` casts, or generics.
- **No raw `\n`** in single-quoted strings inside the template — use `\\n` to produce the escape sequence in the browser.
- **No nested backticks** — the outer template literal uses backticks, so inner JS must use string concatenation (`+`) instead of template literals.
- **Validate after editing** — extract the `<script>` content and run `node --check` on it to catch syntax errors before they break the entire UI.

## Critical: SSE Connection

Start `connect()` independently at startup, not chained after `loadHistory()`. If `loadHistory()` fails or is slow, a `.then(connect)` chain prevents SSE from ever connecting. Also set connection status in both `EventSource.onopen` and `onmessage` as fallback.

## UI Language

Console output and web UI labels are in Chinese. Maintain consistency with existing Chinese strings when modifying user-facing text.
