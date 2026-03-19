# Web Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Axum web server inside the Tauri app so the React UI is accessible via browser over Tailscale.

**Architecture:** Axum runs as a tokio task alongside Tauri, sharing state via `Clone` (inner `Arc<Mutex>` fields). Frontend adapter (`backend.ts`) detects runtime and routes calls through Tauri IPC or HTTP/WebSocket. An `EventBus` broadcast channel bridges Tauri events to WebSocket clients.

**Tech Stack:** Axum, tower-http, tokio, WebSocket (axum built-in), base64

**Spec:** `docs/superpowers/specs/2026-03-19-web-interface-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src-tauri/src/event_bus.rs` | `EventBus` struct with `broadcast::Sender<WebEvent>`, `WebEvent` enum |
| `src-tauri/src/web.rs` | Axum server: routes, handlers, WebSocket, static file serving |
| `src/lib/backend.ts` | Frontend adapter: `invoke()`, `listen()`, `getCurrentWindow()` with Tauri/web runtime dispatch |

### Modified Files

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add axum, tower-http, tokio, base64 dependencies |
| `src-tauri/src/lib.rs` | Clone state for Axum, launch web server, register EventBus |
| `src-tauri/src/llm.rs` | `Arc<Mutex>` fields + `Clone`, store resolved llama-server path, dual-emit |
| `src-tauri/src/stt.rs` | `Arc<Mutex>` fields + `Clone` |
| `src-tauri/src/tts.rs` | `Arc<Mutex>` fields + `Clone` |
| `src-tauri/src/dictionary.rs` | `Arc<Mutex>` field + `Clone` |
| `src-tauri/src/chat.rs` | Dual-emit to EventBus alongside app.emit() |
| `src-tauri/src/gemini.rs` | Dual-emit to EventBus alongside app.emit() |
| `src/hooks/useLlm.ts` | Import from `backend.ts` instead of `@tauri-apps/api` |
| `src/hooks/useStt.ts` | Import from `backend.ts` instead of `@tauri-apps/api` |
| `src/hooks/useTts.ts` | Import from `backend.ts` instead of `@tauri-apps/api` |
| `src/App.tsx` | Import from `backend.ts` instead of `@tauri-apps/api` |
| `src/components/Sidebar.tsx` | Import from `backend.ts`, hide downloads in web mode |
| `src/components/ReviewPanel.tsx` | Import from `backend.ts` |
| `src/components/CourageScore.tsx` | Import from `backend.ts` |
| `src/components/SessionHistoryPanel.tsx` | Import from `backend.ts` |
| `src/components/SetupWizard.tsx` | Import from `backend.ts` |
| `vite.config.ts` | Add proxy for `/api` and `/ws` to port 3456 |

---

## Task 1: Add Rust Dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add dependencies to Cargo.toml**

Add after the existing `[dependencies]` entries:

```toml
axum = { version = "0.8", features = ["ws"] }
tower-http = { version = "0.6", features = ["fs"] }
tokio = { version = "1", features = ["rt", "macros", "net", "sync"] }
base64 = "0.22"
```

- [ ] **Step 2: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: compiles successfully (warnings OK)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "deps: add axum, tower-http, tokio, base64 for web server"
```

---

## Task 2: Refactor State Structs for Sharing

State structs must be `Clone` so Tauri and Axum share the same inner data. Wrap each `Mutex<T>` field in `Arc<Mutex<T>>` and derive `Clone`. No changes to call-site code needed — `Arc<Mutex<T>>` has the same `.lock()` API.

**Send/Sync risk:** `WhisperContext` (in SttState) and `ort::Session` (in TtsState) use raw C/C++ pointers. If `Arc<Mutex<T>>` fails to compile because `T: !Send`, fallback: keep these as `Mutex<T>` (not Arc-wrapped), don't derive `Clone` on that struct, and instead wrap the entire struct in `Arc` at the `WebState` level (e.g., `pub stt: Arc<SttState>`). Task 7 Step 1 `WebState` definition should accommodate this.

**Files:**
- Modify: `src-tauri/src/llm.rs`
- Modify: `src-tauri/src/stt.rs`
- Modify: `src-tauri/src/tts.rs`
- Modify: `src-tauri/src/dictionary.rs`

- [ ] **Step 1: Wrap LlmState fields in Arc, add llama_server_path**

In `src-tauri/src/llm.rs`, change:

```rust
pub struct LlmState {
    pub process: Mutex<Option<Child>>,
    pub port: Mutex<u16>,
    pub cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}
```

To:

```rust
#[derive(Clone)]
pub struct LlmState {
    pub process: Arc<Mutex<Option<Child>>>,
    pub port: Arc<Mutex<u16>>,
    pub cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    /// Resolved path to llama-server binary, set once at startup.
    /// Allows the web server to start LLM without needing AppHandle.
    pub llama_server_path: Arc<Mutex<Option<PathBuf>>>,
}
```

Update `LlmState::new()` to wrap each field in `Arc::new(...)` and add `llama_server_path: Arc::new(Mutex::new(None))`.

Also add `use std::path::PathBuf;` if not already imported.

**Drop impl:** The current `LlmState` has a `Drop` impl that kills the child process. With `Clone`, each clone's drop would try to kill the process. Fix: remove the `Drop` impl and add an explicit `pub fn shutdown(&self)` method that kills the process. Call this from Tauri's window close handler instead of relying on implicit Drop.

- [ ] **Step 2: Wrap SttState fields in Arc**

In `src-tauri/src/stt.rs`, wrap each `Mutex<T>` field in `Arc<Mutex<T>>` and add `#[derive(Clone)]`. Update `SttState::new()` accordingly.

- [ ] **Step 3: Wrap TtsState fields in Arc**

In `src-tauri/src/tts.rs`, wrap all 6 `Mutex<T>` fields in `Arc<Mutex<T>>` and add `#[derive(Clone)]`. Update `TtsState::new()`.

- [ ] **Step 4: Wrap DictionaryDb field in Arc**

In `src-tauri/src/dictionary.rs`, change:

```rust
pub struct DictionaryDb {
    conn: Mutex<Connection>,
}
```

To:

```rust
#[derive(Clone)]
pub struct DictionaryDb {
    conn: Arc<Mutex<Connection>>,
}
```

Update `DictionaryDb::open()` to wrap in `Arc::new(...)`.

- [ ] **Step 5: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: compiles. All `.lock()` call sites are unchanged.

- [ ] **Step 6: Run the app to verify Tauri still works**

Run: `npm run tauri dev`
Expected: app launches normally

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/llm.rs src-tauri/src/stt.rs src-tauri/src/tts.rs src-tauri/src/dictionary.rs
git commit -m "refactor: make state structs Clone via Arc<Mutex> for web sharing"
```

---

## Task 3: EventBus — Broadcast Channel for Event Bridging

**Files:**
- Create: `src-tauri/src/event_bus.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod event_bus;`)

- [ ] **Step 1: Create event_bus.rs**

```rust
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WebEvent {
    #[serde(rename = "chat-token")]
    ChatToken {
        #[serde(rename = "requestId")]
        request_id: String,
        token: String,
    },
    #[serde(rename = "chat-done")]
    ChatDone {
        #[serde(rename = "requestId")]
        request_id: String,
    },
    #[serde(rename = "tts-chunk")]
    TtsChunk {
        #[serde(rename = "requestId")]
        request_id: String,
        data: String, // base64-encoded f32 LE PCM samples
        #[serde(rename = "sampleRate")]
        sample_rate: u32,
        index: u32,
        text: String,
        done: bool,
    },
    #[serde(rename = "tts-stop")]
    TtsStop {
        #[serde(rename = "requestId")]
        request_id: String,
    },
    #[serde(rename = "llm-ready")]
    LlmReady,
    #[serde(rename = "llm-log")]
    LlmLog { line: String },
    #[serde(rename = "error")]
    Error {
        #[serde(rename = "requestId")]
        request_id: String,
        message: String,
    },
}

#[derive(Clone)]
pub struct EventBus {
    pub tx: Arc<broadcast::Sender<WebEvent>>,
}

impl EventBus {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(256);
        Self { tx: Arc::new(tx) }
    }
}

/// Helper: send event to the bus if it's registered in Tauri state.
pub fn bus_send(app: &tauri::AppHandle, event: WebEvent) {
    if let Some(bus) = app.try_state::<EventBus>() {
        let _ = bus.tx.send(event);
    }
}
```

- [ ] **Step 2: Add mod declaration in lib.rs**

In `src-tauri/src/lib.rs`, add `mod event_bus;` with the other module declarations.

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/event_bus.rs src-tauri/src/lib.rs
git commit -m "feat: EventBus broadcast channel for web event bridging"
```

---

## Task 4: Dual-Emit in chat.rs

**Files:**
- Modify: `src-tauri/src/chat.rs`

The `send_chat_message` function has ~8 `app.emit()` call sites. Add `bus_send()` after each one.

- [ ] **Step 1: Add import**

At the top of `chat.rs`:

```rust
use crate::event_bus::{bus_send, WebEvent};
use base64::Engine;
```

- [ ] **Step 2: Add dual-emit at each app.emit() call site**

For each `app.emit(chat_stream_event, StreamDelta { content, done: false })`, add after it:

```rust
bus_send(&app, WebEvent::ChatToken {
    request_id: request_id.clone(),
    token: content.clone(),
});
```

For each `app.emit(chat_stream_event, StreamDelta { content: "".., done: true })`, add after it:

```rust
bus_send(&app, WebEvent::ChatDone {
    request_id: request_id.clone(),
});
```

For each `app.emit(tts_chunk_event, TtsChunk { samples, sample_rate, index, text, done })`, add after it:

```rust
let pcm_bytes: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
bus_send(&app, WebEvent::TtsChunk {
    request_id: request_id.clone(),
    data: base64::engine::general_purpose::STANDARD.encode(&pcm_bytes),
    sample_rate,
    index,
    text: text.clone(),
    done,
});
```

For `app.emit(tts_stop_event, true)` (cancel path only), add:

```rust
bus_send(&app, WebEvent::TtsStop {
    request_id: request_id.clone(),
});
```

For error emits, add:

```rust
bus_send(&app, WebEvent::Error {
    request_id: request_id.clone(),
    message: error_msg.clone(),
});
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/chat.rs
git commit -m "feat: dual-emit chat events to EventBus for web clients"
```

---

## Task 5: Dual-Emit in gemini.rs

**Files:**
- Modify: `src-tauri/src/gemini.rs`

Same pattern as Task 4. The `send_chat_gemini` function has ~4 emit sites.

- [ ] **Step 1: Add imports**

```rust
use crate::event_bus::{bus_send, WebEvent};
use base64::Engine;
```

- [ ] **Step 2: Add dual-emit at each emit site**

Same pattern as Task 4: `ChatToken`, `ChatDone`, `TtsChunk`, `Error` events.

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/gemini.rs
git commit -m "feat: dual-emit gemini chat events to EventBus"
```

---

## Task 6: Dual-Emit in llm.rs + Store Resolved Path

**Files:**
- Modify: `src-tauri/src/llm.rs`

Two things: (a) dual-emit `llm-ready` and `llm-log` events, (b) store the resolved llama-server path in `LlmState.llama_server_path` at startup so the web server can start the LLM without `AppHandle`.

- [ ] **Step 1: Add imports**

```rust
use crate::event_bus::{bus_send, WebEvent};
```

- [ ] **Step 2: Dual-emit llm-ready (both call sites)**

There are two places `llm-ready` is emitted:
1. The "already running" early return path (~line 107)
2. Inside the background stderr thread when the server starts (~line 169)

After each `app.emit("llm-ready", true)`:

```rust
bus_send(&app, WebEvent::LlmReady);
```

- [ ] **Step 3: Dual-emit llm-log**

Inside the background stderr monitoring thread (~line 166), after `app.emit("llm-log", &line)`:

```rust
bus_send(&app, WebEvent::LlmLog { line: line.clone() });
```

- [ ] **Step 4: Store resolved llama-server path**

In `start_llm_server`, after `resolve_llama_server(&app)` successfully resolves the path, store it:

```rust
let server_path = resolve_llama_server(&app)?;
*state.llama_server_path.lock().unwrap() = Some(server_path.clone());
```

This enables the web server to later read the path without needing `AppHandle`.

- [ ] **Step 5: Verify compilation**

Run: `cd src-tauri && cargo check`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/llm.rs
git commit -m "feat: dual-emit llm events to EventBus, store resolved server path"
```

---

## Task 7: Axum Web Server

**Files:**
- Create: `src-tauri/src/web.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create web.rs with server skeleton**

```rust
use axum::{
    Router,
    routing::{get, post, delete},
    extract::{State as AxState, Query, ws::{WebSocket, WebSocketUpgrade, Message}},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use tower_http::services::{ServeDir, ServeFile};

use crate::llm::LlmState;
use crate::stt::SttState;
use crate::tts::TtsState;
use crate::dictionary::DictionaryDb;
use crate::event_bus::{EventBus, WebEvent};

#[derive(Clone)]
pub struct WebState {
    pub llm: LlmState,
    pub stt: SttState,
    pub tts: TtsState,
    pub db: DictionaryDb,
    pub bus: EventBus,
}

pub async fn start_web_server(state: WebState) {
    let port: u16 = std::env::var("SPEAKEASY_WEB_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3456);

    let api = Router::new()
        .route("/api/settings", get(get_settings).post(post_settings))
        .route("/api/status", get(get_status))
        .route("/api/transcribe", post(transcribe))
        .route("/api/models/whisper/load", post(load_whisper))
        .route("/api/models/whisper/status", get(whisper_status))
        .route("/api/models/tts/load", post(load_tts))
        .route("/api/models/tts/status", get(tts_status))
        .route("/api/models/tts/voices", get(list_voices))
        .route("/api/models/dir", get(get_models_dir))
        .route("/api/llm/models", get(list_llm_models))
        .route("/api/llm/start", post(start_llm))
        .route("/api/llm/stop", post(stop_llm))
        .route("/api/llm/status", get(llm_status))
        .route("/api/gemini/models", post(list_gemini_models))
        .route("/api/sessions", get(list_sessions).post(save_session))
        .route("/api/sessions/{id}", get(get_session).delete(delete_session))
        .route("/api/explain", post(explain))
        .route("/api/suggest", post(suggest))
        .route("/api/translate", post(translate))
        .route("/api/lookup", post(lookup))
        .route("/api/review", post(review))
        .route("/api/courage", get(courage_history).post(calculate_courage))
        .route("/api/cancel", post(cancel))
        .route("/ws", get(ws_handler))
        .with_state(state);

    // Static files: serve dist/ with SPA fallback
    let dist_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("../dist")))
        .unwrap_or_else(|| std::path::PathBuf::from("../dist"));

    let app = Router::new()
        .merge(api)
        .fallback_service(
            ServeDir::new(&dist_dir)
                .fallback(ServeFile::new(dist_dir.join("index.html")))
        );

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .expect("Failed to bind web server port");
    eprintln!("Web server listening on http://0.0.0.0:{}", port);
    axum::serve(listener, app).await.ok();
}
```

- [ ] **Step 2: Extract inner functions from Tauri commands**

Several `#[tauri::command]` functions take `tauri::State<'_, T>` or `AppHandle` which are unavailable in Axum handlers. Extract the core logic into standalone functions:

**In `src-tauri/src/stt.rs`:** Extract `transcribe_audio_inner`:
```rust
// Existing #[tauri::command] becomes a thin wrapper:
pub fn transcribe_audio(state: tauri::State<'_, SttState>, ...) -> Result<...> {
    transcribe_audio_inner(&state, audio_data, target_language, native_language)
}

// New standalone function callable from web.rs:
pub fn transcribe_audio_inner(state: &SttState, audio_data: Vec<f32>, target_language: &str, native_language: &str) -> Result<TranscriptionResult, String> {
    // ... existing logic moved here ...
}
```

Apply same pattern to all commands that web.rs needs to call:
- `stt.rs`: `transcribe_audio` → `transcribe_audio_inner(&SttState, ...)`
- `tts.rs`: `load_tts_voice` → `load_tts_voice_inner(&TtsState, ...)`
- `tts.rs`: `synthesize_speech` → `synthesize_speech_inner(&TtsState, ...)`
- `llm.rs`: `is_llm_running` → `is_llm_running_inner(&LlmState) -> bool`
- `session.rs`: All session commands → `_inner(&DictionaryDb, ...)`
- `chat.rs`: `explain_message`, `suggest_responses`, `tutor_translate` → `_inner(&LlmState, ...)`
- `dictionary.rs`: `lookup_word` → `lookup_word_inner(&DictionaryDb, ...)`

For each: the `#[tauri::command]` wrapper calls the `_inner` function. Web handlers call `_inner` directly.

- [ ] **Step 3: Implement REST handlers**

Each handler extracts `AxState(state)` and calls the `_inner` functions. Use `tokio::task::spawn_blocking` for compute-heavy work (STT, TTS). Pattern:

```rust
async fn get_settings() -> impl IntoResponse {
    match crate::settings::load_settings() {
        Ok(s) => Json(s).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

async fn post_settings(Json(settings): Json<crate::settings::Settings>) -> impl IntoResponse {
    match crate::settings::save_settings(&settings) {
        Ok(_) => axum::http::StatusCode::OK.into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

#[derive(Deserialize)]
struct TranscribeQuery {
    target: String,
    native: String,
}

async fn transcribe(
    AxState(state): AxState<WebState>,
    Query(q): Query<TranscribeQuery>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let stt = state.stt.clone();
    let target = q.target.clone();
    let native = q.native.clone();
    match tokio::task::spawn_blocking(move || {
        let samples = crate::stt::decode_wav_to_samples(body.to_vec())?;
        crate::stt::transcribe_audio_inner(&stt, samples, &target, &native)
    }).await {
        Ok(Ok(result)) => Json(result).into_response(),
        Ok(Err(e)) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
```

**For commands that use `AppHandle`:**

- `start_llm_server`: Create `start_llm_server_web()` in `web.rs`. It reads `llama_server_path` from `LlmState` (stored by Task 6 Step 4), then spawns the llama-server process. The stderr monitoring thread cannot use `bus_send()` (needs AppHandle), so it receives a `EventBus` clone directly and calls `bus.tx.send(WebEvent::LlmReady)` / `bus.tx.send(WebEvent::LlmLog { line })`. Extract the process-spawning logic from `llm.rs::start_llm_server` into a `start_llm_process(server_path, model_path, port, gpu_layers, ctx_size) -> Result<Child>` inner function that both the Tauri command and web handler can call.
- `cancel_generation`: Operates on `LlmState.cancel_flags` directly — set the AtomicBool flag.
- `explain_message`, `suggest_responses`, `tutor_translate`: These use `LlmState` only for the port number to call ureq. Use `_inner(&LlmState, ...)` functions.

Implement all ~27 REST handlers. Refer to the existing Tauri command functions and their signatures in `chat.rs`, `llm.rs`, `stt.rs`, `tts.rs`, `settings.rs`, `dictionary.rs`, `session.rs`, `courage.rs`.

- [ ] **Step 3: Implement WebSocket handler**

```rust
async fn ws_handler(
    ws: WebSocketUpgrade,
    AxState(state): AxState<WebState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

async fn handle_ws(mut socket: WebSocket, state: WebState) {
    let mut rx = state.bus.tx.subscribe();

    loop {
        tokio::select! {
            Ok(event) = rx.recv() => {
                let json = serde_json::to_string(&event).unwrap();
                if socket.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
            Some(Ok(msg)) = socket.recv() => {
                if let Message::Text(text) = msg {
                    handle_ws_message(text.to_string(), &state).await;
                }
            }
            else => break,
        }
    }
}

#[derive(Deserialize)]
struct WsChat {
    #[serde(rename = "type")]
    msg_type: String,
    provider: Option<String>,
    #[serde(rename = "requestId")]
    request_id: Option<String>,
    messages: Option<serde_json::Value>,
    settings: Option<serde_json::Value>,
}

async fn handle_ws_message(text: String, state: &WebState) {
    let msg: WsChat = match serde_json::from_str(&text) {
        Ok(m) => m,
        Err(_) => return,
    };

    match msg.msg_type.as_str() {
        "chat" => {
            let state = state.clone();
            let request_id = msg.request_id.unwrap_or_default();
            let provider = msg.provider.unwrap_or_else(|| "local".to_string());
            let messages = msg.messages.unwrap_or_default();
            let settings = msg.settings.unwrap_or_default();

            // Extract send_chat_message / send_chat_gemini core logic into
            // _inner functions that take (&LlmState, &TtsState, &EventBus, ...)
            // instead of AppHandle.
            //
            // Key differences from Tauri path:
            // - TtsState accessed from state.tts (not app.state::<TtsState>())
            // - Events emitted via state.bus.tx.send() (not app.emit())
            // - Cancel flag registered in state.llm.cancel_flags
            //
            // Spawn blocking because the SSE loop (ureq) is synchronous:
            tokio::task::spawn_blocking(move || {
                // Register cancel flag
                let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
                state.llm.cancel_flags.lock().unwrap()
                    .insert(request_id.clone(), cancel.clone());

                let result = if provider == "gemini" {
                    crate::gemini::send_chat_gemini_web(
                        &state.llm, &state.tts, &state.bus,
                        &request_id, messages, settings,
                    )
                } else {
                    crate::chat::send_chat_message_web(
                        &state.llm, &state.tts, &state.bus,
                        &request_id, messages, settings,
                    )
                };

                // Cleanup cancel flag
                state.llm.cancel_flags.lock().unwrap().remove(&request_id);

                if let Err(e) = result {
                    let _ = state.bus.tx.send(WebEvent::Error {
                        request_id,
                        message: e,
                    });
                }
            });
        }
        "chat-cancel" | "tts-cancel" => {
            // TTS cancel is functionally identical to chat cancel:
            // the TTS worker checks the same cancel flag as chat streaming.
            // Setting the flag stops both token streaming and TTS synthesis.
            if let Some(rid) = msg.request_id {
                if let Ok(flags) = state.llm.cancel_flags.lock() {
                    if let Some(flag) = flags.get(&rid) {
                        flag.store(true, std::sync::atomic::Ordering::Relaxed);
                    }
                }
            }
        }
        _ => {}
    }
}

// This means chat.rs and gemini.rs each need a `_web` variant:
// - send_chat_message_web(&LlmState, &TtsState, &EventBus, request_id, messages, settings)
// - send_chat_gemini_web(&LlmState, &TtsState, &EventBus, request_id, messages, settings)
//
// These are extracted from the existing functions. Key change:
// replace app.emit() with bus.tx.send(), and replace
// tts_app.state::<TtsState>() with the passed &TtsState reference.
// The SSE loop (ureq to llama-server) and TTS synthesis logic are unchanged.
```

- [ ] **Step 4: Add mod web and launch in lib.rs**

In `src-tauri/src/lib.rs`:

1. Add `mod web;`
2. Add `use crate::event_bus::EventBus;`
3. In the `run()` function, create state, clone for web, manage for Tauri:

```rust
// Replace the current state creation (lines ~53-56) with:
let llm = LlmState::new();
let stt = SttState::new();
let tts = TtsState::new();
let db = DictionaryDb::open().expect("Failed to open dictionary DB");
let bus = EventBus::new();

let web_state = web::WebState {
    llm: llm.clone(),
    stt: stt.clone(),
    tts: tts.clone(),
    db: db.clone(),
    bus: bus.clone(),
};

// Tauri gets the original (shared via inner Arc<Mutex> fields)
app.manage(llm);
app.manage(stt);
app.manage(tts);
app.manage(db);
app.manage(bus);

// Spawn web server
tokio::spawn(web::start_web_server(web_state));
```

Both Tauri and Axum now reference the same inner mutexes through Clone. `bus_send()` in chat.rs/gemini.rs/llm.rs uses `app.try_state::<EventBus>()` which returns the same `EventBus` clone — its `tx: Arc<broadcast::Sender>` points to the same channel.

- [ ] **Step 5: Verify compilation**

Run: `cd src-tauri && cargo check`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/web.rs src-tauri/src/lib.rs
git commit -m "feat: Axum web server with REST API, WebSocket, and static serving"
```

---

## Task 8: Frontend Adapter — backend.ts

**Files:**
- Create: `src/lib/backend.ts`

- [ ] **Step 1: Create backend.ts**

```typescript
const isTauri = "__TAURI__" in window;

// --- Lazy Tauri imports (only loaded in Tauri context, awaited on first use) ---

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type ListenFn = <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
type GetCurrentWindowFn = () => any;

let _tauriInvoke: InvokeFn | null = null;
let _tauriListen: ListenFn | null = null;
let _tauriGetCurrentWindow: GetCurrentWindowFn | null = null;
let _tauriLoaded: Promise<void> | null = null;

function ensureTauriLoaded(): Promise<void> {
  if (!_tauriLoaded) {
    _tauriLoaded = Promise.all([
      import("@tauri-apps/api/core").then((m) => { _tauriInvoke = m.invoke; }),
      import("@tauri-apps/api/event").then((m) => { _tauriListen = m.listen; }),
      import("@tauri-apps/api/window").then((m) => { _tauriGetCurrentWindow = m.getCurrentWindow; }),
    ]).then(() => {});
  }
  return _tauriLoaded;
}

// Pre-load in Tauri context
if (isTauri) ensureTauriLoaded();

// --- WebSocket singleton ---

let ws: WebSocket | null = null;
const wsListeners = new Map<string, Set<(event: { payload: any }) => void>>();
let wsConnecting: Promise<WebSocket> | null = null;

function getWs(): Promise<WebSocket> {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(ws);
  if (wsConnecting) return wsConnecting;

  wsConnecting = new Promise((resolve) => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.onopen = () => {
      ws = socket;
      wsConnecting = null;
      resolve(socket);
    };
    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const eventType: string = data.type;
        const requestId: string | undefined = data.requestId;

        // Dispatch by "type-requestId" (matches Tauri's dynamic event names)
        if (requestId) {
          // chat-stream-{requestId} pattern for chat tokens
          if (eventType === "chat-token" || eventType === "chat-done") {
            dispatch(`chat-stream-${requestId}`, {
              content: data.token || "",
              done: eventType === "chat-done",
            });
          }
          // tts-chunk-{requestId} pattern
          if (eventType === "tts-chunk") {
            dispatch(`tts-chunk-${requestId}`, data);
          }
          // tts-stop-{requestId} pattern
          if (eventType === "tts-stop") {
            dispatch(`tts-stop-${requestId}`, true);
          }
        }
        // Also dispatch by type alone (e.g., "llm-ready")
        dispatch(eventType, data);
      } catch { /* ignore parse errors */ }
    };
    socket.onclose = () => {
      ws = null;
      wsConnecting = null;
      setTimeout(() => getWs(), 2000); // auto-reconnect
    };
  });
  return wsConnecting;
}

function dispatch(key: string, payload: any) {
  const listeners = wsListeners.get(key);
  if (listeners) {
    for (const fn of listeners) fn({ payload });
  }
}

// --- Command-to-API mapping ---

interface ApiRoute { method: string; path: string }

const CMD_MAP: Record<string, (args?: any) => ApiRoute> = {
  get_settings:            () => ({ method: "GET",  path: "/api/settings" }),
  save_settings:           () => ({ method: "POST", path: "/api/settings" }),
  get_models_dir:          () => ({ method: "GET",  path: "/api/models/dir" }),
  load_whisper_model:      () => ({ method: "POST", path: "/api/models/whisper/load" }),
  is_whisper_loaded:       () => ({ method: "GET",  path: "/api/models/whisper/status" }),
  load_tts_voice:          () => ({ method: "POST", path: "/api/models/tts/load" }),
  is_tts_loaded:           () => ({ method: "GET",  path: "/api/models/tts/status" }),
  list_voices:             () => ({ method: "GET",  path: "/api/models/tts/voices" }),
  is_llm_running:          () => ({ method: "GET",  path: "/api/llm/status" }),
  start_llm_server:        () => ({ method: "POST", path: "/api/llm/start" }),
  stop_llm_server:         () => ({ method: "POST", path: "/api/llm/stop" }),
  list_llm_models:         () => ({ method: "GET",  path: "/api/llm/models" }),
  list_gemini_models:      () => ({ method: "POST", path: "/api/gemini/models" }),
  list_sessions:           () => ({ method: "GET",  path: "/api/sessions" }),
  load_session_messages: (a) => ({ method: "GET",  path: `/api/sessions/${a?.session_id}` }),
  save_session:            () => ({ method: "POST", path: "/api/sessions" }),
  delete_session:        (a) => ({ method: "DELETE", path: `/api/sessions/${a?.session_id}` }),
  explain_message:         () => ({ method: "POST", path: "/api/explain" }),
  suggest_responses:       () => ({ method: "POST", path: "/api/suggest" }),
  tutor_translate:         () => ({ method: "POST", path: "/api/translate" }),
  lookup_word:             () => ({ method: "POST", path: "/api/lookup" }),
  generate_review:         () => ({ method: "POST", path: "/api/review" }),
  get_courage_history:     () => ({ method: "GET",  path: "/api/courage" }),
  calculate_courage_score: () => ({ method: "POST", path: "/api/courage" }),
  cancel_generation:       () => ({ method: "POST", path: "/api/cancel" }),
  // Desktop-only stubs
  check_setup_complete:    () => ({ method: "STUB", path: "" }),
  open_models_folder:      () => ({ method: "STUB", path: "" }),
  download_file:           () => ({ method: "STUB", path: "" }),
  get_available_models:    () => ({ method: "STUB", path: "" }),
  get_installed_models:    () => ({ method: "STUB", path: "" }),
  delete_model:            () => ({ method: "STUB", path: "" }),
};

// --- Public API ---

export { isTauri };

export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isTauri) {
    await ensureTauriLoaded();
    return _tauriInvoke!<T>(cmd, args);
  }

  const route = CMD_MAP[cmd]?.(args);
  if (!route) {
    console.warn(`Unknown command: ${cmd}`);
    return undefined as T;
  }

  if (route.method === "STUB") {
    if (cmd === "check_setup_complete") return { llm: true, stt: true, tts: true } as T;
    return undefined as T;
  }

  const fetchOpts: RequestInit = { method: route.method };
  if (route.method === "POST" && args) {
    fetchOpts.headers = { "Content-Type": "application/json" };
    fetchOpts.body = JSON.stringify(args);
  }

  const resp = await fetch(route.path, fetchOpts);
  if (!resp.ok) throw new Error(await resp.text());

  const ct = resp.headers.get("content-type");
  if (ct?.includes("application/json")) return resp.json();
  return (await resp.text()) as T;
}

export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<() => void> {
  if (isTauri) {
    await ensureTauriLoaded();
    return _tauriListen!<T>(event, handler);
  }

  // WebSocket-based event subscription
  if (!wsListeners.has(event)) wsListeners.set(event, new Set());
  wsListeners.get(event)!.add(handler as any);
  getWs(); // ensure connected

  return () => { wsListeners.get(event)?.delete(handler as any); };
}

export async function getCurrentWindow() {
  if (isTauri) {
    await ensureTauriLoaded();
    return _tauriGetCurrentWindow!();
  }
  return {
    onCloseRequested: (cb: any) => {
      window.addEventListener("beforeunload", cb);
      return () => window.removeEventListener("beforeunload", cb);
    },
  };
}

/**
 * Web-specific: transcribe WAV bytes in one round-trip.
 * In Tauri mode, calls decode_wav_to_samples + transcribe_audio.
 */
export async function transcribeAudio(
  wavBytes: ArrayBuffer,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<{ text: string; language: string | null }> {
  if (isTauri) {
    await ensureTauriLoaded();
    const samples = await _tauriInvoke!<number[]>("decode_wav_to_samples", {
      wavBytes: Array.from(new Uint8Array(wavBytes)),
    });
    return _tauriInvoke!("transcribe_audio", {
      audioData: samples,
      targetLanguage,
      nativeLanguage,
    });
  }

  const resp = await fetch(
    `/api/transcribe?target=${encodeURIComponent(targetLanguage)}&native=${encodeURIComponent(nativeLanguage)}`,
    { method: "POST", body: wavBytes },
  );
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

/** Send chat via WebSocket (web mode) or invoke (Tauri mode). */
export async function sendChat(
  provider: "local" | "gemini",
  requestId: string,
  messages: any[],
  settings: any,
) {
  if (isTauri) {
    await ensureTauriLoaded();
    const cmd = provider === "gemini" ? "send_chat_gemini" : "send_chat_message";
    return _tauriInvoke!(cmd, { requestId, messages, ...settings });
  }
  const socket = await getWs();
  socket.send(JSON.stringify({ type: "chat", provider, requestId, messages, settings }));
}

/** Cancel chat generation. */
export async function cancelChat(requestId: string) {
  if (isTauri) {
    await ensureTauriLoaded();
    return _tauriInvoke!("cancel_generation", { requestId });
  }
  const socket = await getWs();
  socket.send(JSON.stringify({ type: "chat-cancel", requestId }));
}

/** Cancel TTS playback. */
export async function cancelTts(requestId: string) {
  if (isTauri) {
    // In Tauri mode, TTS cancel is handled client-side (stop AudioWorklet)
    return;
  }
  const socket = await getWs();
  socket.send(JSON.stringify({ type: "tts-cancel", requestId }));
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/backend.ts
git commit -m "feat: frontend adapter for Tauri/web runtime dispatch"
```

---

## Task 9: Replace Tauri Imports in Frontend Files

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/hooks/useLlm.ts`
- Modify: `src/hooks/useStt.ts`
- Modify: `src/hooks/useTts.ts`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/ReviewPanel.tsx`
- Modify: `src/components/CourageScore.tsx`
- Modify: `src/components/SessionHistoryPanel.tsx`
- Modify: `src/components/SetupWizard.tsx`

Mechanical: replace imports from `@tauri-apps/api/*` with imports from `backend.ts`.

- [ ] **Step 1: Update App.tsx**

Replace:
```typescript
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
```
With:
```typescript
import { invoke, getCurrentWindow, isTauri } from "./lib/backend";
```

Also skip rendering `<SetupWizard>` when `!isTauri`:
```typescript
{isTauri && showSetup && <SetupWizard ... />}
```

Note: `getCurrentWindow()` is now async — update the call site:
```typescript
// Before: getCurrentWindow().onCloseRequested(...)
// After: getCurrentWindow().then(w => w.onCloseRequested(...))
```

- [ ] **Step 2: Update useLlm.ts**

Replace:
```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
```
With:
```typescript
import { invoke, listen, sendChat, isTauri } from "../lib/backend";
```

For `send_chat_message`/`send_chat_gemini` calls: use `sendChat()` instead of `invoke()`:

```typescript
// Before:
// invoke("send_chat_message", { requestId, messages, ... });
// After:
sendChat(provider === "gemini" ? "gemini" : "local", requestId, messages, settings);
```

- [ ] **Step 3: Update useStt.ts**

Replace `invoke` import. For the transcription flow, use `transcribeAudio()` from backend.ts:

```typescript
import { invoke, transcribeAudio } from "../lib/backend";

// Replace the decode_wav_to_samples + transcribe_audio two-step with:
const result = await transcribeAudio(wavBytes, targetLanguage, nativeLanguage);
```

- [ ] **Step 4: Update useTts.ts**

Replace `invoke` and `listen` imports. The `listen()` adapter handles WebSocket event routing automatically — the same event name pattern `tts-chunk-${requestId}` works in both modes.

```typescript
import { invoke, listen } from "../lib/backend";
```

- [ ] **Step 5: Update Sidebar.tsx**

Replace imports. Guard download-related calls with `isTauri`:

```typescript
import { invoke, listen, isTauri } from "../lib/backend";

// In download handler:
if (!isTauri) return;
invoke("download_file", { ... });
```

- [ ] **Step 6: Update ReviewPanel.tsx, CourageScore.tsx, SessionHistoryPanel.tsx**

Replace `invoke` import in each. Straightforward — all calls map to REST endpoints.

```typescript
import { invoke } from "../lib/backend";
```

- [ ] **Step 7: Update SetupWizard.tsx**

Replace `invoke` import. All calls are desktop-only, guarded by the parent's `isTauri` check.

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 9: Verify Tauri app still works**

Run: `npm run tauri dev`
Expected: desktop app works identically to before

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx src/hooks/ src/components/Sidebar.tsx src/components/ReviewPanel.tsx src/components/CourageScore.tsx src/components/SessionHistoryPanel.tsx src/components/SetupWizard.tsx
git commit -m "refactor: replace @tauri-apps/api imports with backend adapter"
```

---

## Task 10: Vite Dev Proxy

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add proxy config**

Add `proxy` to the `server` config:

```typescript
server: {
  port: 1420,
  strictPort: true,
  host: host || false,
  hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
  proxy: {
    "/api": {
      target: "http://localhost:3456",
      changeOrigin: true,
    },
    "/ws": {
      target: "ws://localhost:3456",
      ws: true,
    },
  },
},
```

- [ ] **Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "feat: vite dev proxy for /api and /ws to Axum server"
```

---

## Task 11: Integration Test

Manual verification — no automated test framework in this project.

- [ ] **Step 1: Build frontend**

Run: `npm run build`

- [ ] **Step 2: Start app**

Run: `npm run tauri dev`
Expected: Tauri app launches, console shows "Web server listening on http://0.0.0.0:3456"

- [ ] **Step 3: Test desktop mode**

Verify in the Tauri window:
- Language switching
- STT recording and transcription
- Chat with LLM (tokens stream)
- TTS playback
- Settings save/load
- Session history

- [ ] **Step 4: Test web mode**

Open `http://localhost:3456` in Chrome/Firefox.
Verify:
- React app loads (not a blank page)
- SetupWizard does NOT appear
- Settings load correctly
- Can switch languages
- STT works (browser mic → POST /api/transcribe → text)
- Chat streams tokens via WebSocket
- TTS plays audio via WebSocket
- Session history lists and loads correctly

- [ ] **Step 5: Test over Tailscale**

From another device on the tailnet, open `http://<tailscale-ip>:3456`.
Verify same functionality as Step 4.

- [ ] **Step 6: Commit any fixes**

```bash
git commit -am "fix: integration fixes for web interface"
```
