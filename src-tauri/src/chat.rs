use crate::llm::{ChatMessage, LlmState};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Clone)]
struct StreamDelta {
    content: String,
    done: bool,
}

#[derive(Debug, Deserialize)]
struct SseChoice {
    delta: Option<SseDelta>,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SseDelta {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SseResponse {
    choices: Option<Vec<SseChoice>>,
}

#[tauri::command]
pub fn send_chat_message(
    app: AppHandle,
    state: tauri::State<'_, LlmState>,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    request_id: String,
) -> Result<(), String> {
    let port = *state.port.lock().unwrap();
    if port == 0 {
        return Err("LLM server is not running".to_string());
    }

    let url = format!("http://127.0.0.1:{}/v1/chat/completions", port);
    let temp = temperature.unwrap_or(0.7);

    let body = serde_json::json!({
        "messages": messages,
        "temperature": temp,
        "stream": true,
        "max_tokens": 1024,
    });

    let event_name = format!("chat-stream-{}", request_id);
    let event_name_clone = event_name.clone();

    std::thread::spawn(move || {
        let result = ureq::post(&url)
            .header("Content-Type", "application/json")
            .send(body.to_string().as_bytes());

        match result {
            Ok(response) => {
                let reader = BufReader::new(response.into_body().into_reader());
                for line in reader.lines() {
                    let line = match line {
                        Ok(l) => l,
                        Err(_) => break,
                    };

                    if !line.starts_with("data: ") {
                        continue;
                    }

                    let data = &line[6..];
                    if data == "[DONE]" {
                        let _ = app.emit(
                            &event_name,
                            StreamDelta {
                                content: String::new(),
                                done: true,
                            },
                        );
                        break;
                    }

                    if let Ok(sse) = serde_json::from_str::<SseResponse>(data) {
                        if let Some(choices) = sse.choices {
                            if let Some(choice) = choices.first() {
                                if let Some(ref delta) = choice.delta {
                                    if let Some(ref content) = delta.content {
                                        let _ = app.emit(
                                            &event_name,
                                            StreamDelta {
                                                content: content.clone(),
                                                done: false,
                                            },
                                        );
                                    }
                                }
                                if choice.finish_reason.is_some() {
                                    let _ = app.emit(
                                        &event_name,
                                        StreamDelta {
                                            content: String::new(),
                                            done: true,
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let _ = app.emit(
                    &event_name_clone,
                    StreamDelta {
                        content: format!("[Error: {}]", e),
                        done: true,
                    },
                );
            }
        }
    });

    Ok(())
}
