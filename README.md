# LLM Proxy

HTTPS reverse proxy for intercepting, logging and inspecting LLM API requests/responses. Built with Node.js, zero runtime dependencies, with a real-time web UI.

## Features

- Intercept and log LLM API requests and responses (OpenAI-compatible chat/completions protocol)
- Real-time web UI with SSE (Server-Sent Events) — see requests appear instantly
- Support both streaming (SSE) and non-streaming responses
- Virtual scrolling list for high performance with many requests
- Dark/light theme
- Search/filter across model names, message content, response content
- Token usage tracking (prompt + completion) across all requests
- Conversation view rendering (system/user/assistant message bubbles)
- Sensitive header masking (Authorization, Cookie, etc.)
- Dual log format: human-readable `.log` + machine-readable `.jsonl`
- Historical log import via file upload
- Zero runtime dependencies

## Quick Start

```bash
# Clone
git clone https://github.com/smartdu/llmproxy.git
cd llmproxy

# Install
npm install

# Start (default target: api.deepseek.com)
npm start
```

Then:

- Point your LLM client to `http://localhost:8080` (instead of the original API URL)
- Open `http://localhost:3000` in your browser to see the web UI

## Usage

### Target Different Providers

```bash
# OpenAI
npm run openai

# DeepSeek (default)
npm run deepseek

# Claude (Anthropic)
npm run claude

# Or set any target via environment variable
PROXY_TARGET=https://api.your-provider.com npm start
```

### Development

```bash
npm run dev   # Hot reload with tsx watch
```

### Configuration

All config can be set via environment variables:

| Variable | Default | Description |
|---|---|---|
| `PROXY_TARGET` | `https://api.deepseek.com` | Target API base URL |
| `PROXY_PORT` | `8080` | Proxy server port |
| `PROXY_WEB_PORT` | `3000` | Web UI port |
| `PROXY_HOST` | `0.0.0.0` | Listen address |
| `PROXY_LOG_DIR` | `./logs` | Log output directory |
| `PROXY_VERBOSE` | `true` | Verbose console output |

### Example: Proxy with Custom Ports

```bash
PROXY_TARGET=https://api.openai.com PROXY_PORT=9000 PROXY_WEB_PORT=4000 npm start
```

### Example: Use with OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",  # point to proxy
    api_key="your-api-key"
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Example: Use with curl

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

## Architecture

```
LLM Client → Proxy (:8080) → Target API (e.g. api.deepseek.com)
                  ↓
             logger.ts (in-memory store + file logging)
                  ↓
           Web UI (:3000) → Browser
```

- **`config.ts`** — Configuration types, defaults, and environment variable loading
- **`index.ts`** — Entry point, starts proxy and web servers
- **`proxy.ts`** — HTTPS reverse proxy with connection pooling and keep-alive. Intercepts matching paths, collects full request/response bodies for logging, pipes non-matching paths directly
- **`logger.ts`** — Dual output (console + file). In-memory store with subscriber pattern for SSE broadcast. Parses OpenAI-compatible chat/completions protocol
- **`web.ts`** — Web UI server with embedded SPA. REST API + SSE for real-time updates

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/logs` | Get all log entries |
| DELETE | `/api/logs` | Clear all logs |
| GET | `/api/logs/stream` | SSE stream of new log entries |
| POST | `/api/logs/import` | Import log entries (JSON body) |

## License

MIT
