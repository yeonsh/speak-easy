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

Axum launches as a tokio task inside Tauri's `setup()` hook. It shares the same state objects via `Arc`.

## Constraints

- **Single client**: Only one web client at a time. The LLM server handles one request at a time, and STT/TTS serialize behind mutexes. Document this as an explicit limitation rather than adding request queuing.
- **Blocking work on spawn_blocking**: WhisperContext and ort Session may not be Send-safe across async boundaries. All compute-heavy handlers (STT transcription, TTS synthesis) must use `tokio::task::spawn_blocking`.
- **Desktop-only features**: SetupWizard, model downloads, `open_models_folder`, `install_espeak`, `extract_llama_server` are desktop-only. The web UI assumes models are already set up on the host machine. The web frontend hides SetupWizard when not running in Tauri. `check_setup_complete` returns `true` stub in web mode via the frontend adapter. Download-related invoke calls in Sidebar are hidden in web mode.

## State Sharing

Create `Arc<T>` before calling `app.manage()`, keep a clone for Axum:

```rust
// in setup()
let llm = Arc::new(LlmState::new());
let stt = Arc::new(SttState::new());
let tts = Arc::new(TtsState::new());
let db = Arc::new(DictionaryDb::open()?);

app.manage(llm.clone());
app.manage(stt.clone());
app.manage(tts.clone());
app.manage(db.clone());

tokio::spawn(start_web_server(llm, stt, tts, db));
```

```rust
pub async fn start_web_server(
    llm: Arc<LlmState>,
    stt: Arc<SttState>,
    tts: Arc<TtsState>,
    db: Arc<DictionaryDb>,
) { ... }
```

## Event Bridging

The current backend emits events via `app.emit()` (Tauri-specific). WebSocket clients cannot receive these. Solution: **broadcast channel bridge**.

Add a `tokio::sync::broadcast::Sender<WebEvent>` to the shared state. Streaming code in `chat.rs`, `gemini.rs`, and `llm.rs` sends to both `app.emit()` and the broadcast channel. The Axum WebSocket handler subscribes to the broadcast channel and forwards events to the client.

```rust
pub struct EventBus {
    pub tx: broadcast::Sender<WebEvent>,
}

// In chat.rs streaming loop:
app.emit(&event_name, &payload);         // Tauri desktop
if let Some(bus) = app.try_state::<EventBus>() {
    let _ = bus.tx.send(web_event);      // WebSocket clients
}
```

This means `chat.rs`, `gemini.rs`, and `llm.rs` need minor modifications to dual-emit.

## API Endpoints

### REST (request-response)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Serve React SPA (static files from `dist/`) |
| POST | `/api/transcribe` | Upload WAV → decode + transcribe → return text |
| GET | `/api/settings` | Load app settings |
| POST | `/api/settings` | Save app settings |
| POST | `/api/models/whisper/load` | Load whisper model |
| GET | `/api/models/whisper/status` | Check if whisper is loaded |
| POST | `/api/models/tts/load` | Load TTS voice |
| GET | `/api/models/tts/status` | Check if TTS is loaded |
| GET | `/api/models/tts/voices` | List available voices |
| GET | `/api/status` | Server/model readiness status |
| GET | `/api/llm/models` | List available LLM models |
| POST | `/api/llm/start` | Start LLM server |
| POST | `/api/llm/stop` | Stop LLM server |
| POST | `/api/llm/switch` | Switch LLM model |
| GET | `/api/llm/status` | Check if LLM is running |
| GET | `/api/sessions` | List session history |
| GET | `/api/sessions/:id` | Get session messages |
| POST | `/api/sessions` | Save session |
| DELETE | `/api/sessions/:id` | Delete session |
| POST | `/api/explain` | Explain a message |
| POST | `/api/suggest` | Suggest responses |
| POST | `/api/translate` | Tutor translate |
| POST | `/api/lookup` | Dictionary lookup |
| POST | `/api/review` | Generate session review |
| GET | `/api/courage` | Get courage score/history |
| POST | `/api/cancel` | Cancel current generation |
| GET | `/api/models/dir` | Get models directory path |

Note: `/api/transcribe` combines `decode_wav_to_samples` + `transcribe_audio` into a single call. The client uploads raw WAV bytes and gets text back.

### WebSocket

| Path | Purpose |
|------|---------|
| WS `/ws` | Bidirectional streaming (chat + TTS) |

## WebSocket Protocol

Single persistent WebSocket connection per client. JSON messages with a `type` discriminator.

### Client → Server

```json
{"type": "chat", "requestId": "uuid", "provider": "local|gemini", "messages": [...], "settings": {...}}
{"type": "chat-cancel", "requestId": "uuid"}
{"type": "tts-cancel", "requestId": "uuid"}
```

### Server → Client

```json
{"type": "chat-token", "requestId": "uuid", "token": "string"}
{"type": "chat-done", "requestId": "uuid", "corrections": [...]}
{"type": "tts-chunk", "requestId": "uuid", "data": "base64", "sampleRate": 24000}
{"type": "tts-done", "requestId": "uuid"}
{"type": "llm-ready"}
{"type": "llm-log", "line": "string"}
{"type": "error", "requestId": "uuid", "message": "string"}
```

TTS chunks include `sampleRate` because it varies by engine (24000 for Kokoro, variable for Edge TTS).

## Frontend Adapter (`src/lib/backend.ts`)

Runtime detection via `'__TAURI__' in window`. Two implementations behind a unified interface:

```typescript
const isTauri = '__TAURI__' in window;

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return tauriInvoke<T>(cmd, args);
  }
  const { method, path, body } = mapCommand(cmd, args);
  const resp = await fetch(path, { method, headers: {'Content-Type': 'application/json'}, body });
  return resp.json();
}

export function listen(event: string, handler: (payload: any) => void): UnlistenFn {
  if (isTauri) {
    return tauriListen(event, handler);
  }
  return wsSubscribe(event, handler);
}

// Stub for Tauri window APIs (no-op in web)
export function getCurrentWindow() {
  if (isTauri) return tauriGetCurrentWindow();
  return { onCloseRequested: (_cb: any) => () => {} };
}
```

## Audio Handling

Audio capture and playback happen in the browser regardless of mode. The only difference is transport:

- **STT**: Browser records via `MediaRecorder` → converts to WAV → `POST /api/transcribe` with raw WAV bytes (combines decode + transcribe into one round-trip)
- **TTS**: Server sends audio chunks via WebSocket as base64-encoded PCM with sample rate → browser decodes and plays via `AudioWorkletNode`
- **Chat streaming**: Tokens arrive via WebSocket instead of Tauri events

## Static File Serving

- Production: Axum serves the built `dist/` folder using `tower-http::services::ServeDir` with fallback to `index.html` for SPA routing
- Development: Vite dev server runs on `:1420`, configured to proxy `/api/*` and `/ws` to Axum on `:3456`

## Security

No authentication layer. The server binds to `0.0.0.0:3456` and trusts the network. When used with Tailscale, only authenticated devices on the tailnet can reach the port. The Tauri desktop app always uses IPC and never hits the HTTP endpoints.

Port is configurable via `SPEAKEASY_WEB_PORT` environment variable (default: 3456).

## File Changes

### New Files
- `src-tauri/src/web.rs` — Axum server setup, routes, WebSocket handler
- `src-tauri/src/event_bus.rs` — Broadcast channel for event bridging
- `src/lib/backend.ts` — Frontend adapter (invoke/listen/window abstraction)

### Modified Files (Rust)
- `src-tauri/Cargo.toml` — Add `axum`, `tower-http` (fs feature), `tokio` (rt, macros, net), `base64`
- `src-tauri/src/lib.rs` — Create Arc states before manage(), launch Axum in setup(), register EventBus
- `src-tauri/src/chat.rs` — Dual-emit: app.emit() + EventBus broadcast
- `src-tauri/src/gemini.rs` — Dual-emit: app.emit() + EventBus broadcast
- `src-tauri/src/llm.rs` — Dual-emit: llm-ready/llm-log events to EventBus

### Modified Files (Frontend)
- `src/App.tsx` — Replace invoke/listen/getCurrentWindow with adapter
- `src/hooks/useLlm.ts` — Replace invoke/listen with adapter
- `src/hooks/useStt.ts` — Replace invoke with adapter
- `src/hooks/useTts.ts` — Replace invoke/listen with adapter
- `src/components/ReviewPanel.tsx` — Replace invoke with adapter
- `src/components/CourageScore.tsx` — Replace invoke with adapter
- `src/components/SessionHistoryPanel.tsx` — Replace invoke with adapter
- `src/components/Sidebar.tsx` — Replace invoke/listen with adapter
- `src/components/SetupWizard.tsx` — Hide in web mode (or replace invoke with adapter)
- `vite.config.ts` — Add proxy for `/api` and `/ws` in dev mode

### No Changes
- `src-tauri/src/stt.rs` — STT logic unchanged (called from web.rs via shared state)
- `src-tauri/src/tts.rs` — TTS logic unchanged (called from web.rs via shared state)
- `src-tauri/src/settings.rs` — Settings logic unchanged
- `src-tauri/src/downloads.rs` — Desktop-only (SetupWizard)
- `src/hooks/useAudioRecorder.ts` — Browser-only, no Tauri dependency
- `src/components/ChatView.tsx` — No direct invoke/listen calls
- `src/components/MicButton.tsx` — No direct invoke/listen calls
- `src/components/LanguageBar.tsx` — No direct invoke/listen calls
