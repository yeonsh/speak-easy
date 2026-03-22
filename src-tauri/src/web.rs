use axum::{
    Router,
    routing::{get, post},
    extract::{State as AxState, Query, Path, ws::{WebSocket, WebSocketUpgrade, Message}},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tower_http::services::{ServeDir, ServeFile};
use crate::event_bus::{EventBus, WebEvent};
use crate::llm::LlmState;
use crate::stt::SttState;
use crate::tts::TtsState;
use crate::dictionary::DictionaryDb;

#[derive(Clone)]
pub struct WebState {
    pub llm: LlmState,
    pub stt: SttState,
    pub tts: TtsState,
    pub db: DictionaryDb,
    pub bus: EventBus,
}

// ── request/response types ──

#[derive(Deserialize)]
struct TranscribeQuery {
    target: String,
    native: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WhisperLoadReq {
    model_size: Option<String>,
    custom_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TtsLoadReq {
    voice_name: String,
    engine: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmStartReq {
    model_path: Option<String>,
    gpu_layers: Option<i32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModelsReq {
    api_key: String,
}

#[derive(Deserialize)]
struct SessionListQuery {
    language: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveSessionReq {
    session_id: String,
    language: String,
    mode: String,
    scenario_context: Option<String>,
    messages: Vec<crate::session::SavedMessage>,
    started_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExplainReq {
    text: String,
    language: String,
    native_language: Option<String>,
    provider: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
    force_refresh: Option<bool>,
    custom_endpoint: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuggestReq {
    text: String,
    language: String,
    native_language: Option<String>,
    provider: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
    custom_endpoint: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TranslateReq {
    text: String,
    native_language: String,
    target_language: String,
    provider: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
    custom_endpoint: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LookupReq {
    word: String,
    sentence: String,
    target_language: String,
    native_language: String,
    provider: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
    custom_endpoint: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewReq {
    session_id: String,
    native_language: String,
    provider: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
    custom_endpoint: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CourageCalcReq {
    session_id: String,
    native_language: String,
    response_gaps_ms: Option<Vec<i64>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CourageHistoryQuery {
    session_id: String,
    language: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CancelReq {
    request_id: String,
}

#[derive(Serialize)]
struct StatusResp {
    ok: bool,
}

#[derive(Serialize)]
struct ErrorResp {
    error: String,
}

fn ok_json() -> Json<StatusResp> {
    Json(StatusResp { ok: true })
}

fn err_json(msg: String) -> (axum::http::StatusCode, Json<ErrorResp>) {
    (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResp { error: msg }),
    )
}

// ── route builder ──

pub async fn start_web_server(state: WebState) {
    let port: u16 = std::env::var("SPEAKEASY_WEB_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3456);

    // Static file serving: serve ../dist with fallback to index.html
    let dist_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist");
    let index_file = dist_dir.join("index.html");

    let serve_dir = ServeDir::new(&dist_dir)
        .not_found_service(ServeFile::new(&index_file));

    let app = Router::new()
        // Settings
        .route("/api/settings", get(get_settings).post(post_settings))
        // STT
        .route("/api/transcribe", post(transcribe))
        .route("/api/models/whisper/load", post(whisper_load))
        .route("/api/models/whisper/status", get(whisper_status))
        // TTS
        .route("/api/models/tts/load", post(tts_load))
        .route("/api/models/tts/status", get(tts_status))
        .route("/api/models/tts/voices", get(tts_voices))
        // Models dir
        .route("/api/models/dir", get(models_dir))
        // LLM
        .route("/api/llm/models", get(llm_models))
        .route("/api/llm/start", post(llm_start))
        .route("/api/llm/stop", post(llm_stop))
        .route("/api/llm/status", get(llm_status))
        // Gemini
        .route("/api/gemini/models", post(gemini_models))
        // Sessions
        .route("/api/sessions", get(list_sessions).post(save_session))
        .route("/api/sessions/{id}", get(load_session).delete(delete_session))
        // Chat helpers
        .route("/api/explain", post(explain))
        .route("/api/suggest", post(suggest))
        .route("/api/translate", post(translate))
        .route("/api/lookup", post(lookup))
        // Review & courage
        .route("/api/review", post(review))
        .route("/api/courage", get(courage_history).post(courage_calc))
        // Cancel
        .route("/api/cancel", post(cancel))
        .route("/api/synthesize", post(synthesize_speech))
        // WebSocket
        .route("/ws", get(ws_handler))
        // Static files (fallback)
        .fallback_service(serve_dir)
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    eprintln!("[web] Starting Axum server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind web server port");

    axum::serve(listener, app)
        .await
        .expect("Web server error");
}

// ── Settings ──

async fn get_settings() -> impl IntoResponse {
    match crate::settings::load_settings() {
        Ok(s) => Ok(Json(s)),
        Err(e) => Err(err_json(e)),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveSettingsWrapper {
    new_settings: crate::settings::Settings,
}

async fn post_settings(
    Json(wrapper): Json<SaveSettingsWrapper>,
) -> impl IntoResponse {
    match crate::settings::save_settings(&wrapper.new_settings) {
        Ok(()) => Ok(ok_json()),
        Err(e) => Err(err_json(e)),
    }
}

// ── STT ──

async fn transcribe(
    AxState(state): AxState<WebState>,
    Query(q): Query<TranscribeQuery>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        let wav_bytes = body.to_vec();
        let samples = crate::stt::decode_wav_to_samples(wav_bytes)?;
        crate::stt::transcribe_audio_inner(&state.stt, samples, &q.target, &q.native)
    })
    .await
    .map_err(|e| err_json(format!("Task join error: {}", e)))?;

    match result {
        Ok(r) => Ok(Json(r)),
        Err(e) => Err(err_json(e)),
    }
}

async fn whisper_load(
    AxState(state): AxState<WebState>,
    Json(req): Json<WhisperLoadReq>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        crate::stt::load_whisper_model_inner(&state.stt, req.model_size, req.custom_path)
    })
    .await
    .map_err(|e| err_json(format!("Task join error: {}", e)))?;

    match result {
        Ok(()) => Ok(ok_json()),
        Err(e) => Err(err_json(e)),
    }
}

async fn whisper_status(
    AxState(state): AxState<WebState>,
) -> impl IntoResponse {
    let loaded = crate::stt::is_whisper_loaded_inner(&state.stt);
    Json(serde_json::json!({ "loaded": loaded }))
}

// ── TTS ──

async fn tts_load(
    AxState(state): AxState<WebState>,
    Json(req): Json<TtsLoadReq>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        crate::tts::load_tts_voice_inner(&state.tts, req.voice_name, req.engine)
    })
    .await
    .map_err(|e| err_json(format!("Task join error: {}", e)))?;

    match result {
        Ok(()) => Ok(ok_json()),
        Err(e) => Err(err_json(e)),
    }
}

async fn tts_status(
    AxState(state): AxState<WebState>,
) -> impl IntoResponse {
    let loaded = crate::tts::is_tts_loaded_inner(&state.tts);
    Json(serde_json::json!({ "loaded": loaded }))
}

async fn tts_voices(
    AxState(state): AxState<WebState>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        crate::tts::list_voices_inner(&state.tts)
    })
    .await
    .map_err(|e| err_json(format!("Task join error: {}", e)))?;

    match result {
        Ok(voices) => Ok(Json(voices)),
        Err(e) => Err(err_json(e)),
    }
}

// ── Models dir ──

async fn models_dir() -> impl IntoResponse {
    let dir = dirs::home_dir()
        .map(|h| h.join(".speakeasy").join("models").to_string_lossy().to_string())
        .unwrap_or_default();
    Json(serde_json::json!({ "path": dir }))
}

// ── LLM ──

async fn llm_models() -> impl IntoResponse {
    match crate::downloads::list_llm_models() {
        Ok(models) => Ok(Json(models)),
        Err(e) => Err(err_json(e)),
    }
}

async fn llm_start(
    AxState(state): AxState<WebState>,
    Json(req): Json<LlmStartReq>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        crate::llm::start_llm_server_inner(&state.llm, &state.bus, req.model_path, req.gpu_layers)
    })
    .await
    .map_err(|e| err_json(format!("Task join error: {}", e)))?;

    match result {
        Ok(port) => Ok(Json(serde_json::json!({ "port": port }))),
        Err(e) => Err(err_json(e)),
    }
}

async fn llm_stop(
    AxState(state): AxState<WebState>,
) -> impl IntoResponse {
    match crate::llm::stop_llm_server_inner(&state.llm) {
        Ok(()) => Ok(ok_json()),
        Err(e) => Err(err_json(e)),
    }
}

async fn llm_status(
    AxState(state): AxState<WebState>,
) -> impl IntoResponse {
    let running = crate::llm::is_llm_running_inner(&state.llm);
    let port = crate::llm::get_llm_port_inner(&state.llm);
    Json(serde_json::json!({ "running": running, "port": port }))
}

// ── Gemini ──

async fn gemini_models(
    Json(req): Json<GeminiModelsReq>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        crate::gemini::list_gemini_models(req.api_key)
    })
    .await
    .map_err(|e| err_json(format!("Task join error: {}", e)))?;

    match result {
        Ok(models) => Ok(Json(models)),
        Err(e) => Err(err_json(e)),
    }
}

// ── Sessions ──

async fn list_sessions(
    AxState(state): AxState<WebState>,
    Query(q): Query<SessionListQuery>,
) -> impl IntoResponse {
    match crate::session::list_sessions_inner(&state.db, q.language.as_deref(), q.limit) {
        Ok(sessions) => Ok(Json(sessions)),
        Err(e) => Err(err_json(e)),
    }
}

async fn save_session(
    AxState(state): AxState<WebState>,
    Json(req): Json<SaveSessionReq>,
) -> impl IntoResponse {
    match crate::session::save_session_inner(
        &state.db, &req.session_id, &req.language, &req.mode,
        req.scenario_context.as_deref(), &req.messages, req.started_at,
    ) {
        Ok(()) => Ok(ok_json()),
        Err(e) => Err(err_json(e)),
    }
}

async fn load_session(
    AxState(state): AxState<WebState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match crate::session::load_session_messages_inner(&state.db, &id) {
        Ok(msgs) => Ok(Json(msgs)),
        Err(e) => Err(err_json(e)),
    }
}

async fn delete_session(
    AxState(state): AxState<WebState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match crate::session::delete_session_inner(&state.db, &id) {
        Ok(()) => Ok(ok_json()),
        Err(e) => Err(err_json(e)),
    }
}

// ── Chat helpers ──

async fn explain(
    AxState(state): AxState<WebState>,
    Json(req): Json<ExplainReq>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        crate::chat::explain_message_inner(
            &state.llm, &state.db, &req.text, &req.language,
            req.native_language.as_deref(), req.provider.as_deref(),
            req.api_key.as_deref(), req.api_model.as_deref(),
            req.force_refresh.unwrap_or(false),
            req.custom_endpoint.as_deref(),
        )
    })
    .await
    .map_err(|e| err_json(format!("Task join error: {}", e)))?;

    match result {
        Ok(text) => Ok(Json(text)),
        Err(e) => Err(err_json(e)),
    }
}

async fn suggest(
    AxState(state): AxState<WebState>,
    Json(req): Json<SuggestReq>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        crate::chat::suggest_responses_inner(
            &state.llm, &req.text, &req.language,
            req.native_language.as_deref(), req.provider.as_deref(),
            req.api_key.as_deref(), req.api_model.as_deref(),
            req.custom_endpoint.as_deref(),
        )
    })
    .await
    .map_err(|e| err_json(format!("Task join error: {}", e)))?;

    match result {
        Ok(text) => Ok(Json(text)),
        Err(e) => Err(err_json(e)),
    }
}

async fn translate(
    AxState(state): AxState<WebState>,
    Json(req): Json<TranslateReq>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        crate::chat::tutor_translate_inner(
            &state.llm, &req.text, &req.native_language, &req.target_language,
            req.provider.as_deref(), req.api_key.as_deref(), req.api_model.as_deref(),
            req.custom_endpoint.as_deref(),
        )
    })
    .await
    .map_err(|e| err_json(format!("Task join error: {}", e)))?;

    match result {
        Ok(text) => Ok(Json(text)),
        Err(e) => Err(err_json(e)),
    }
}

async fn lookup(
    AxState(state): AxState<WebState>,
    Json(req): Json<LookupReq>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        crate::chat::lookup_word_inner(
            &state.llm, &req.word, &req.sentence,
            &req.target_language, &req.native_language,
            req.provider.as_deref(), req.api_key.as_deref(), req.api_model.as_deref(),
            req.custom_endpoint.as_deref(),
        )
    })
    .await
    .map_err(|e| err_json(format!("Task join error: {}", e)))?;

    match result {
        Ok(text) => Ok(Json(text)),
        Err(e) => Err(err_json(e)),
    }
}

// ── Review & courage ──

async fn review(
    AxState(state): AxState<WebState>,
    Json(req): Json<ReviewReq>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        crate::session::generate_review_inner(
            &state.llm, &state.db, &req.session_id, &req.native_language,
            req.provider.as_deref(), req.api_key.as_deref(), req.api_model.as_deref(),
            req.custom_endpoint.as_deref(),
        )
    })
    .await
    .map_err(|e| err_json(format!("Task join error: {}", e)))?;

    match result {
        Ok(items) => Ok(Json(items)),
        Err(e) => Err(err_json(e)),
    }
}

async fn courage_calc(
    AxState(state): AxState<WebState>,
    Json(req): Json<CourageCalcReq>,
) -> impl IntoResponse {
    match crate::session::calculate_courage_score_inner(
        &state.db, &req.session_id, &req.native_language, &req.response_gaps_ms,
    ) {
        Ok(metrics) => Ok(Json(metrics)),
        Err(e) => Err(err_json(e)),
    }
}

async fn courage_history(
    AxState(state): AxState<WebState>,
    Query(q): Query<CourageHistoryQuery>,
) -> impl IntoResponse {
    match crate::session::get_courage_history_inner(&state.db, &q.session_id, &q.language) {
        Ok(history) => Ok(Json(history)),
        Err(e) => Err(err_json(e)),
    }
}

// ── Synthesize (one-shot TTS for replay) ──

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SynthesizeReq {
    text: String,
    speed: Option<f32>,
    language: Option<String>,
}

async fn synthesize_speech(
    AxState(state): AxState<WebState>,
    Json(req): Json<SynthesizeReq>,
) -> impl IntoResponse {
    let tts = state.tts.clone();
    match tokio::task::spawn_blocking(move || {
        crate::tts::synthesize_speech_inner(&tts, &req.text, req.speed.unwrap_or(1.0), req.language.as_deref().unwrap_or("en"))
    }).await {
        Ok(Ok(result)) => Json(result).into_response(),
        Ok(Err(e)) => err_json(e).into_response(),
        Err(e) => err_json(e.to_string()).into_response(),
    }
}

// ── Cancel ──

async fn cancel(
    AxState(state): AxState<WebState>,
    Json(req): Json<CancelReq>,
) -> impl IntoResponse {
    crate::chat::cancel_generation_inner(&state.llm, &req.request_id);
    ok_json()
}

// ── WebSocket ──

async fn ws_handler(
    ws: WebSocketUpgrade,
    AxState(state): AxState<WebState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

#[derive(Deserialize)]
struct WsMessage {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(default)]
    provider: String,
    #[serde(rename = "requestId", default)]
    request_id: String,
    #[serde(default)]
    messages: Vec<crate::llm::ChatMessage>,
    #[serde(default)]
    settings: WsChatSettings,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WsChatSettings {
    #[serde(default)]
    temperature: Option<f32>,
    #[serde(default)]
    tts_enabled: Option<bool>,
    #[serde(default)]
    tts_speed: Option<f32>,
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    api_key: Option<String>,
    #[serde(default)]
    api_model: Option<String>,
    #[serde(default)]
    custom_endpoint: Option<String>,
}

async fn handle_ws(mut socket: WebSocket, state: WebState) {
    let mut rx = state.bus.tx.subscribe();
    loop {
        tokio::select! {
            Ok(event) = rx.recv() => {
                let json = match serde_json::to_string(&event) {
                    Ok(j) => j,
                    Err(_) => continue,
                };
                if socket.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
            Some(Ok(msg)) = socket.recv() => {
                if let Message::Text(text) = msg {
                    handle_ws_message(text.to_string(), &state);
                }
            }
            else => break,
        }
    }
}

fn handle_ws_message(text: String, state: &WebState) {
    let msg: WsMessage = match serde_json::from_str(&text) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[ws] Failed to parse message: {}", e);
            return;
        }
    };

    match msg.msg_type.as_str() {
        "chat" => {
            let llm = state.llm.clone();
            let tts = state.tts.clone();
            let bus = state.bus.clone();
            let request_id = msg.request_id.clone();
            let messages = msg.messages;
            let settings = msg.settings;
            let provider = msg.provider.clone();

            std::thread::spawn(move || {
                handle_ws_chat(
                    &llm, &tts, &bus, &provider, &request_id,
                    messages, settings,
                );
            });
        }
        "chat-cancel" | "tts-cancel" => {
            crate::chat::cancel_generation_inner(&state.llm, &msg.request_id);
        }
        other => {
            eprintln!("[ws] Unknown message type: {}", other);
        }
    }
}

fn handle_ws_chat(
    llm: &LlmState,
    tts: &TtsState,
    bus: &EventBus,
    provider: &str,
    request_id: &str,
    messages: Vec<crate::llm::ChatMessage>,
    settings: WsChatSettings,
) {
    let port = *llm.port.lock().unwrap();
    let temp = settings.temperature.unwrap_or(0.7);
    let tts_enabled = settings.tts_enabled.unwrap_or(false);
    let tts_speed = settings.tts_speed.unwrap_or(1.0);
    let language = settings.language.clone().unwrap_or_else(|| "en".to_string());
    let api_key = settings.api_key.as_deref().unwrap_or("");
    let api_model = settings.api_model.as_deref().unwrap_or("");

    // Create cancel flag
    let cancel_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    {
        let mut flags = llm.cancel_flags.lock().unwrap();
        flags.insert(request_id.to_string(), cancel_flag.clone());
    }

    // TTS worker: receives sentences, synthesizes, emits TtsChunk events
    let (tts_tx, tts_rx) = std::sync::mpsc::channel::<(String, u32, bool)>();
    let tts_bus = bus.clone();
    let tts_rid = request_id.to_string();
    let tts_state = tts.clone();
    let tts_cancel = cancel_flag.clone();
    let tts_handle = if tts_enabled {
        Some(std::thread::spawn(move || {
            while let Ok((sentence, index, is_last)) = tts_rx.recv() {
                if tts_cancel.load(std::sync::atomic::Ordering::Relaxed) {
                    let _ = tts_bus.tx.send(WebEvent::TtsStop { request_id: tts_rid.clone() });
                    break;
                }
                if sentence.trim().is_empty() { continue; }
                match crate::tts::synthesize_speech_inner(&tts_state, &sentence, tts_speed, &language) {
                    Ok(result) => {
                        let pcm_bytes: Vec<u8> = result.samples.iter()
                            .flat_map(|s| s.to_le_bytes())
                            .collect();
                        let _ = tts_bus.tx.send(WebEvent::TtsChunk {
                            request_id: tts_rid.clone(),
                            data: base64::Engine::encode(
                                &base64::engine::general_purpose::STANDARD,
                                &pcm_bytes,
                            ),
                            sample_rate: result.sample_rate,
                            index,
                            text: sentence,
                            done: is_last,
                        });
                    }
                    Err(_) => {}
                }
            }
        }))
    } else {
        None
    };

    // Sentence accumulation for TTS
    let mut accumulated_text = String::new();
    let mut sentence_buf = String::new();
    let mut tts_index: u32 = 0;

    let send_sentence = |buf: &mut String, idx: &mut u32, is_last: bool, tx: &std::sync::mpsc::Sender<(String, u32, bool)>| {
        let s = buf.trim().to_string();
        if !s.is_empty() {
            let _ = tx.send((s, *idx, is_last));
            *idx += 1;
        }
        buf.clear();
    };

    // Determine URL + build request body based on provider
    let result = if provider == "gemini" {
        let system_text: String = messages.iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.clone())
            .collect::<Vec<_>>()
            .join("\n");
        let user_text: String = messages.iter()
            .filter(|m| m.role != "system")
            .map(|m| format!("{}: {}", m.role, m.content))
            .collect::<Vec<_>>()
            .join("\n");
        crate::gemini::complete_text(api_key, api_model, &system_text, &user_text, temp, 2048)
    } else {
        let url = if let Some(ref endpoint) = settings.custom_endpoint {
            format!("{}/v1/chat/completions", endpoint.trim_end_matches('/'))
        } else {
            if port == 0 {
                return;
            }
            format!("http://127.0.0.1:{}/v1/chat/completions", port)
        };
        {
            let body = serde_json::json!({
                "messages": messages,
                "temperature": temp,
                "stream": true,
                "max_tokens": 4096,
            });

            let body_str = body.to_string();
            match ureq::post(&url)
                .header("Content-Type", "application/json")
                .send(body_str.as_bytes())
            {
                Ok(response) => {
                    use std::io::{BufRead, BufReader};
                    let reader = BufReader::new(response.into_body().into_reader());
                    for line in reader.lines() {
                        if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
                            break;
                        }
                        let line = match line {
                            Ok(l) => l,
                            Err(_) => break,
                        };
                        if !line.starts_with("data: ") { continue; }
                        let data = &line[6..];
                        if data == "[DONE]" {
                            // Flush remaining sentence to TTS
                            if tts_enabled {
                                send_sentence(&mut sentence_buf, &mut tts_index, true, &tts_tx);
                            }
                            let _ = bus.tx.send(WebEvent::ChatDone {
                                request_id: request_id.to_string(),
                            });
                            break;
                        }
                        #[derive(serde::Deserialize)]
                        struct SseChoice { delta: Option<SseDelta>, finish_reason: Option<String> }
                        #[derive(serde::Deserialize)]
                        struct SseDelta { content: Option<String> }
                        #[derive(serde::Deserialize)]
                        struct SseResp { choices: Option<Vec<SseChoice>> }

                        if let Ok(sse) = serde_json::from_str::<SseResp>(data) {
                            if let Some(choices) = sse.choices {
                                if let Some(choice) = choices.first() {
                                    if let Some(ref delta) = choice.delta {
                                        if let Some(ref content) = delta.content {
                                            let _ = bus.tx.send(WebEvent::ChatToken {
                                                request_id: request_id.to_string(),
                                                token: content.clone(),
                                            });
                                            // Accumulate for TTS sentence splitting
                                            if tts_enabled {
                                                accumulated_text.push_str(content);
                                                sentence_buf.push_str(content);
                                                // Send sentence on boundary (. ! ? or CJK sentence-enders)
                                                if sentence_buf.len() > 10 {
                                                    let last = sentence_buf.trim_end().chars().last().unwrap_or(' ');
                                                    if ".!?。！？".contains(last) {
                                                        send_sentence(&mut sentence_buf, &mut tts_index, false, &tts_tx);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    if choice.finish_reason.is_some() {
                                        if tts_enabled {
                                            send_sentence(&mut sentence_buf, &mut tts_index, true, &tts_tx);
                                        }
                                        let _ = bus.tx.send(WebEvent::ChatDone {
                                            request_id: request_id.to_string(),
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    Ok(String::new())
                }
                Err(e) => Err(format!("LLM request failed: {}", e)),
            }
        }
    };

    // Close TTS channel so worker thread exits
    drop(tts_tx);
    if let Some(handle) = tts_handle {
        let _ = handle.join();
    }

    match result {
        Ok(text) if !text.is_empty() => {
            // Non-streaming response (Gemini) — emit as single token + done
            let _ = bus.tx.send(WebEvent::ChatToken {
                request_id: request_id.to_string(),
                token: text,
            });
            let _ = bus.tx.send(WebEvent::ChatDone {
                request_id: request_id.to_string(),
            });
        }
        Ok(_) => {}
        Err(e) => {
            let _ = bus.tx.send(WebEvent::Error {
                request_id: request_id.to_string(),
                message: e,
            });
        }
    }

    // Cleanup cancel flag
    if let Ok(mut flags) = llm.cancel_flags.lock() {
        flags.remove(request_id);
    }
}
