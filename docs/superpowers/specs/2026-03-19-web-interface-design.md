# SpeakEasy Web Interface Design

## Problem

SpeakEasy is a Tauri desktop app that only works locally. The user wants to run it at home and access it remotely via Tailscale, using a web browser on any device.

## Solution

Add an Axum web server inside the Tauri app that serves the same React frontend and exposes backend functionality via HTTP + WebSocket. The Tauri desktop UI continues to work via IPC; web clients use HTTP/WS to the same Rust backend.

## Architecture

```
[Remote browser] ──Tailscale──→ [Axum :3456]
                                    ├─ GET /        → React SPA (static files)
                                    ├─ POST /api/*  → STT, settings, models
                                    └─ WS /ws       → chat streaming, TTS chunks

[Tauri desktop]  ──IPC──→ [Same Rust backend]
```

Axum launches as a tokio task inside Tauri's `setup()` hook. It shares the same `LlmState`, `SttState`, `TtsState`, and `DictionaryDb` state objects via `Arc`.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Serve React SPA (static files from `dist/`) |
| POST | `/api/transcribe` | Upload WAV → return STT text |
| GET | `/api/settings` | Load app settings |
| POST | `/api/settings` | Save app settings |
| POST | `/api/models/whisper/load` | Load whisper model |
| POST | `/api/models/whisper/unload` | Unload whisper model |
| POST | `/api/models/tts/load` | Load TTS voice |
| POST | `/api/models/tts/unload` | Unload TTS voice |
| GET | `/api/status` | Server/model readiness status |
| GET | `/api/llm/models` | List available LLM models |
| POST | `/api/llm/switch` | Switch LLM model |
| GET | `/api/sessions` | List session history |
| GET | `/api/sessions/:id` | Get session details |
| POST | `/api/courage` | Get courage score |
| WS | `/ws` | Bidirectional streaming (chat + TTS) |

## WebSocket Protocol

Single persistent WebSocket connection per client. JSON messages with a `type` discriminator.

### Client → Server

```json
{"type": "chat", "requestId": "uuid", "messages": [...], "settings": {...}}
{"type": "chat-cancel", "requestId": "uuid"}
{"type": "tts-cancel", "requestId": "uuid"}
```

### Server → Client

```json
{"type": "chat-token", "requestId": "uuid", "token": "string"}
{"type": "chat-done", "requestId": "uuid", "corrections": [...]}
{"type": "tts-chunk", "requestId": "uuid", "data": "base64"}
{"type": "tts-done", "requestId": "uuid"}
{"type": "llm-ready"}
{"type": "llm-log", "line": "string"}
{"type": "error", "requestId": "uuid", "message": "string"}
```

## Frontend Adapter (`src/lib/backend.ts`)

Runtime detection via `'__TAURI__' in window`. Two implementations behind a unified interface:

```typescript
const isTauri = '__TAURI__' in window;

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return tauriInvoke<T>(cmd, args);
  }
  // Map command names to API endpoints
  const resp = await fetch(`/api/${mapCmdToPath(cmd)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return resp.json();
}

export function listen(event: string, handler: (payload: any) => void): UnlistenFn {
  if (isTauri) {
    return tauriListen(event, handler);
  }
  // Route through shared WebSocket connection
  return wsSubscribe(event, handler);
}
```

### Command-to-API Mapping

The adapter maps Tauri command names to REST endpoints. Examples:
- `load_settings` → `GET /api/settings`
- `save_settings` → `POST /api/settings`
- `transcribe_audio` → `POST /api/transcribe` (multipart with WAV data)
- `send_chat_message` → WS `{"type": "chat", ...}`

## Audio Handling

Audio capture and playback happen in the browser regardless of mode (Tauri or web). The only difference is transport:

- **STT**: Browser records via `MediaRecorder` → converts to WAV → uploads via `POST /api/transcribe` (multipart/form-data with raw bytes)
- **TTS**: Server sends audio chunks via WebSocket as base64-encoded PCM → browser decodes and plays via `AudioWorkletNode` (same as current Tauri flow)
- **Chat streaming**: Tokens arrive via WebSocket instead of Tauri events

## Static File Serving

- Production: Axum serves the built `dist/` folder using `tower-http::services::ServeDir`
- Development: Vite dev server runs on `:1420`, configured to proxy `/api/*` and `/ws` to Axum on `:3456`

## Security

No authentication layer. The server binds to `0.0.0.0:3456` and trusts the network. When used with Tailscale, only authenticated devices on the tailnet can reach the port.

## State Sharing

Tauri manages state via `app.manage()`. The Axum server receives `Arc` references to the same state objects:

```rust
pub async fn start_web_server(
    llm: Arc<Mutex<LlmInner>>,
    stt: Arc<Mutex<SttInner>>,
    tts: Arc<Mutex<TtsInner>>,
    db: Arc<Mutex<DictionaryDb>>,
) { ... }
```

This is called from `setup()` after Tauri initializes its state, extracting the inner `Arc`s.

## File Changes

### New Files
- `src-tauri/src/web.rs` — Axum server setup, routes, WebSocket handler
- `src/lib/backend.ts` — Frontend adapter (invoke/listen abstraction)

### Modified Files
- `src-tauri/Cargo.toml` — Add `axum`, `tower-http`, `tokio-tungstenite`, `base64`
- `src-tauri/src/lib.rs` — Launch Axum in `setup()` hook, extract state `Arc`s
- `src/hooks/useLlm.ts` — Replace `invoke()`/`listen()` with adapter
- `src/hooks/useStt.ts` — Replace `invoke()` with adapter
- `src/hooks/useTts.ts` — Replace `invoke()`/`listen()` with adapter
- `src/hooks/useAudioRecorder.ts` — No change (browser-only)
- `src/App.tsx` — Replace direct `invoke()`/`listen()` calls with adapter
- `vite.config.ts` — Add proxy for `/api` and `/ws` in dev mode

### No Changes
- `src-tauri/src/chat.rs` — Chat logic unchanged
- `src-tauri/src/stt.rs` — STT logic unchanged
- `src-tauri/src/tts.rs` — TTS logic unchanged
- `src-tauri/src/llm.rs` — LLM management unchanged
- `src-tauri/src/settings.rs` — Settings logic unchanged
- UI components — No changes to any component files
