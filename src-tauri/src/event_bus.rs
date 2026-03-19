use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::Manager;
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
        data: String,
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
