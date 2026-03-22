use crate::event_bus::{bus_send, WebEvent};
use crate::llm::ChatMessage;
use crate::tts::{TtsState, clean_for_tts};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::sync::mpsc;
use tauri::{AppHandle, Emitter, Manager};

// ── Model listing ──

#[derive(Debug, Deserialize)]
struct GeminiModelInfo {
    name: String,
    #[serde(rename = "displayName")]
    display_name: String,
    #[serde(rename = "supportedGenerationMethods", default)]
    supported_methods: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiModelList {
    models: Vec<GeminiModelInfo>,
}

#[derive(Debug, Serialize, Clone)]
pub struct GeminiModelOption {
    pub id: String,
    pub name: String,
}

#[tauri::command]
pub fn list_gemini_models(api_key: String) -> Result<Vec<GeminiModelOption>, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        api_key
    );

    let response = ureq::get(&url)
        .call()
        .map_err(|e| format!("Gemini API error: {}", e))?;

    let body = response.into_body().read_to_string()
        .map_err(|e| format!("Read error: {}", e))?;

    let list: GeminiModelList = serde_json::from_str(&body)
        .map_err(|e| format!("Parse error: {}", e))?;

    let models: Vec<GeminiModelOption> = list.models
        .into_iter()
        .filter(|m| m.supported_methods.contains(&"generateContent".to_string()))
        .map(|m| {
            let id = m.name.strip_prefix("models/").unwrap_or(&m.name).to_string();
            GeminiModelOption { id, name: m.display_name }
        })
        .collect();

    Ok(models)
}

// ── Gemini API types ──

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiThinkingConfig {
    thinking_budget: u32,
}

#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiInstruction>,
    generation_config: GeminiGenConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking_config: Option<GeminiThinkingConfig>,
}

#[derive(Debug, Serialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize)]
struct GeminiInstruction {
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize)]
struct GeminiPart {
    text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenConfig {
    temperature: f32,
    max_output_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiCandidate {
    content: Option<GeminiContentResp>,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiContentResp {
    parts: Option<Vec<GeminiPartResp>>,
}

#[derive(Debug, Deserialize)]
struct GeminiPartResp {
    text: Option<String>,
    #[serde(default)]
    thought: bool,
}

// ── Event types (same shape as chat.rs for frontend compatibility) ──

#[derive(Debug, Serialize, Clone)]
struct StreamDelta {
    content: String,
    done: bool,
}

#[derive(Debug, Serialize, Clone)]
struct TtsChunk {
    samples: Vec<f32>,
    sample_rate: u32,
    index: u32,
    text: String,
    done: bool,
}

// ── Message conversion ──

fn convert_messages(messages: &[ChatMessage]) -> (Option<String>, Vec<GeminiContent>) {
    let mut system_parts: Vec<String> = Vec::new();
    let mut contents: Vec<GeminiContent> = Vec::new();

    for msg in messages {
        if msg.role == "system" {
            system_parts.push(msg.content.clone());
            continue;
        }

        let role = if msg.role == "assistant" { "model" } else { "user" };

        // Gemini requires alternating roles — merge consecutive same-role
        if let Some(last) = contents.last_mut() {
            if last.role == role {
                last.parts.push(GeminiPart { text: msg.content.clone() });
                continue;
            }
        }

        contents.push(GeminiContent {
            role: role.to_string(),
            parts: vec![GeminiPart { text: msg.content.clone() }],
        });
    }

    // Gemini requires contents to start with "user" role
    if contents.first().is_some_and(|c| c.role != "user") {
        contents.insert(0, GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart { text: ".".to_string() }],
        });
    }

    let system = if system_parts.is_empty() {
        None
    } else {
        Some(system_parts.join("\n"))
    };

    (system, contents)
}

// ── Non-streaming completion ──

pub fn complete_text(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: f32,
    max_tokens: u32,
) -> Result<String, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );

    // Only include thinkingConfig for models that support it (2.5 series)
    let thinking_config = if model.contains("2.5") {
        Some(GeminiThinkingConfig { thinking_budget: 0 })
    } else {
        None
    };

    let body = GeminiRequest {
        contents: vec![GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart { text: user_prompt.to_string() }],
        }],
        system_instruction: Some(GeminiInstruction {
            parts: vec![GeminiPart { text: system_prompt.to_string() }],
        }),
        generation_config: GeminiGenConfig { temperature, max_output_tokens: max_tokens },
        thinking_config,
    };

    let body_str = serde_json::to_string(&body).map_err(|e| e.to_string())?;

    let response = ureq::post(&url)
        .header("Content-Type", "application/json")
        .send(body_str.as_bytes())
        .map_err(|e| format!("Gemini API error: {}", e))?;

    let body_text = response.into_body().read_to_string()
        .map_err(|e| format!("Read error: {}", e))?;

    let parsed: GeminiResponse = serde_json::from_str(&body_text)
        .map_err(|e| format!("Parse error: {}", e))?;

    let text = parsed.candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|c| c.parts)
        .and_then(|parts| {
            // Filter out thinking/thought parts, use only actual response
            parts.into_iter()
                .filter(|p| !p.thought)
                .find_map(|p| p.text)
        })
        .unwrap_or_default();

    Ok(text)
}

// ── Streaming chat with TTS ──

#[tauri::command]
pub fn send_chat_gemini(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    request_id: String,
    tts_enabled: Option<bool>,
    tts_speed: Option<f32>,
    language: Option<String>,
    api_key: String,
    model: Option<String>,
) -> Result<(), String> {
    let model = model.unwrap_or_else(|| "gemini-2.5-flash".to_string());
    let temp = temperature.unwrap_or(0.7);
    let tts_on = tts_enabled.unwrap_or(false);
    let speed = tts_speed.unwrap_or(1.0);
    let lang = language.unwrap_or_else(|| "en".to_string());

    let (system_text, contents) = convert_messages(&messages);

    let body = GeminiRequest {
        contents,
        system_instruction: system_text.map(|t| GeminiInstruction {
            parts: vec![GeminiPart { text: t }],
        }),
        generation_config: GeminiGenConfig {
            temperature: temp,
            max_output_tokens: 2048,
        },
        thinking_config: None,
    };

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
        model, api_key
    );

    let body_str = serde_json::to_string(&body).map_err(|e| e.to_string())?;

    let event_name = format!("chat-stream-{}", request_id);
    let tts_event_name = format!("tts-chunk-{}", request_id);

    // TTS channel
    let (sentence_tx, sentence_rx) = mpsc::channel::<Option<String>>();

    // Spawn TTS worker (same pattern as chat.rs)
    let tts_app = app.clone();
    let tts_event = tts_event_name.clone();
    let tts_request_id = request_id.clone();

    let tts_handle = if tts_on {
        Some(std::thread::spawn(move || {
            let tts_state: tauri::State<'_, TtsState> = tts_app.state();
            let mut index: u32 = 0;
            loop {
                let msg = match sentence_rx.recv() {
                    Ok(m) => m,
                    Err(_) => break,
                };
                let sentence = match msg {
                    Some(s) => s,
                    None => break,
                };
                if sentence.trim().is_empty() { continue; }

                let tts_input = clean_for_tts(&sentence);
                let (samples, sample_rate) = if tts_input.trim().is_empty() {
                    (vec![], 24000)
                } else {
                    match crate::tts::synthesize_text(&tts_state, &tts_input, speed, &lang) {
                        Ok(r) => (r.samples, r.sample_rate),
                        Err(_) => (vec![], 24000),
                    }
                };

                let chunk = TtsChunk {
                    samples, sample_rate, index, text: sentence, done: false,
                };
                let pcm_bytes: Vec<u8> = chunk.samples.iter().flat_map(|s| s.to_le_bytes()).collect();
                let _ = tts_app.emit(&tts_event, &chunk);
                bus_send(&tts_app, WebEvent::TtsChunk {
                    request_id: tts_request_id.clone(),
                    data: base64::engine::general_purpose::STANDARD.encode(&pcm_bytes),
                    sample_rate: chunk.sample_rate,
                    index: chunk.index,
                    text: chunk.text.clone(),
                    done: chunk.done,
                });
                index += 1;
            }
            // Final done chunk
            let done_chunk = TtsChunk {
                samples: vec![], sample_rate: 24000, index, text: String::new(), done: true,
            };
            let _ = tts_app.emit(&tts_event, &done_chunk);
            bus_send(&tts_app, WebEvent::TtsChunk {
                request_id: tts_request_id.clone(),
                data: base64::engine::general_purpose::STANDARD.encode(&[] as &[u8]),
                sample_rate: done_chunk.sample_rate,
                index: done_chunk.index,
                text: done_chunk.text.clone(),
                done: done_chunk.done,
            });
        }))
    } else {
        drop(sentence_rx);
        None
    };

    std::thread::spawn(move || {
        eprintln!("[gemini] Sending to {} ({} contents)", model, body_str.len());

        let result = ureq::post(&url)
            .header("Content-Type", "application/json")
            .send(body_str.as_bytes());

        let mut sentence_buffer = crate::chat::SentenceBuffer::new();
        let mut past_corrections_delimiter = false;

        match result {
            Ok(response) => {
                let reader = BufReader::new(response.into_body().into_reader());
                for line in reader.lines() {
                    let line = match line {
                        Ok(l) => l,
                        Err(_) => break,
                    };

                    if !line.starts_with("data: ") { continue; }
                    let data = &line[6..];

                    if let Ok(resp) = serde_json::from_str::<GeminiResponse>(data) {
                        let text = resp.candidates
                            .and_then(|c| c.into_iter().next())
                            .and_then(|c| c.content)
                            .and_then(|c| c.parts)
                            .and_then(|parts| {
                                parts.into_iter()
                                    .filter(|p| !p.thought)
                                    .find_map(|p| p.text)
                            });

                        if let Some(content) = text {
                            let _ = app.emit(&event_name, StreamDelta {
                                content: content.clone(), done: false,
                            });
                            bus_send(&app, WebEvent::ChatToken {
                                request_id: request_id.clone(),
                                token: content.clone(),
                            });

                            // TTS sentence buffering
                            if !past_corrections_delimiter {
                                if let Some(sentence) = sentence_buffer.feed(&content) {
                                    if sentence.contains("---") {
                                        if let Some(before) = sentence.split("---").next() {
                                            let before = before.trim().to_string();
                                            if !before.is_empty() && tts_on {
                                                let _ = sentence_tx.send(Some(before));
                                            }
                                        }
                                        past_corrections_delimiter = true;
                                    } else if tts_on {
                                        let _ = sentence_tx.send(Some(sentence));
                                    }
                                }
                                if sentence_buffer.buffer.contains("---") {
                                    let remaining = sentence_buffer.flush();
                                    if let Some(before) = remaining.split("---").next() {
                                        let before = before.trim().to_string();
                                        if !before.is_empty() && tts_on {
                                            let _ = sentence_tx.send(Some(before));
                                        }
                                    }
                                    past_corrections_delimiter = true;
                                }
                            }
                        }
                    }
                }

                // Flush remaining
                if !past_corrections_delimiter {
                    let remaining = sentence_buffer.flush();
                    if !remaining.is_empty() && tts_on {
                        let _ = sentence_tx.send(Some(remaining));
                    }
                }
                if tts_on { let _ = sentence_tx.send(None); }

                let _ = app.emit(&event_name, StreamDelta { content: String::new(), done: true });
                bus_send(&app, WebEvent::ChatDone {
                    request_id: request_id.clone(),
                });
            }
            Err(e) => {
                eprintln!("[gemini] Error: {}", e);
                if tts_on { let _ = sentence_tx.send(None); }
                let err_msg = format!("[Gemini Error: {}]", e);
                let _ = app.emit(&event_name, StreamDelta {
                    content: err_msg.clone(), done: true,
                });
                bus_send(&app, WebEvent::Error {
                    request_id: request_id.clone(),
                    message: err_msg,
                });
            }
        }

        if let Some(handle) = tts_handle {
            let _ = handle.join();
        }
    });

    Ok(())
}
