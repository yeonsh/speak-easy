use crate::event_bus::{bus_send, WebEvent};
use crate::llm::{ChatMessage, LlmState};
use crate::tts::{TtsState, clean_for_tts};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use tauri::{AppHandle, Emitter, Manager};

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

/// Accumulates LLM tokens and detects sentence boundaries.
pub(crate) struct SentenceBuffer {
    pub buffer: String,
    max_len: usize,
}

impl SentenceBuffer {
    pub(crate) fn new() -> Self {
        Self {
            buffer: String::new(),
            max_len: 200,
        }
    }

    /// Feed a token into the buffer. Returns a completed sentence if a boundary is detected.
    pub(crate) fn feed(&mut self, token: &str) -> Option<String> {
        self.buffer.push_str(token);

        // Check for sentence-ending punctuation followed by space/uppercase
        if let Some(sentence) = self.try_split() {
            return Some(sentence);
        }

        // Force flush if buffer exceeds max length (char count for CJK correctness)
        if self.buffer.chars().count() >= self.max_len {
            return Some(self.flush());
        }

        None
    }

    /// Flush any remaining text (call when LLM stream ends).
    pub(crate) fn flush(&mut self) -> String {
        let text = self.buffer.trim().to_string();
        self.buffer.clear();
        text
    }

    fn try_split(&mut self) -> Option<String> {
        let chars: Vec<char> = self.buffer.chars().collect();
        let len = chars.len();

        for i in 0..len {
            let ch = chars[i];

            // CJK sentence-ending punctuation — always split after these
            if ch == '\u{3002}' || ch == '\u{FF01}' || ch == '\u{FF1F}' {
                let split_pos: usize = chars[..=i].iter().map(|c| c.len_utf8()).sum();
                let sentence = self.buffer[..split_pos].trim().to_string();
                self.buffer = self.buffer[split_pos..].to_string();
                if !sentence.is_empty() {
                    return Some(sentence);
                }
            }

            // ASCII sentence-ending punctuation
            if ch == '.' || ch == '!' || ch == '?' {
                // Need a character after the punctuation to decide
                if i + 1 < len {
                    let next = chars[i + 1];
                    // Split if followed by space or uppercase
                    if next == ' ' || next.is_uppercase() {
                        // Skip abbreviations: single letter before dot (e.g., "U.S.")
                        if ch == '.' && i >= 2 {
                            let prev = chars[i - 1];
                            let before_prev = chars[i - 2];
                            if prev.is_uppercase() && (before_prev == '.' || before_prev == ' ') {
                                continue;
                            }
                        }
                        // Skip decimals: digit before and after dot (e.g., "3.14")
                        if ch == '.' && i > 0 && chars[i - 1].is_ascii_digit() {
                            if i + 1 < len && chars[i + 1].is_ascii_digit() {
                                continue;
                            }
                        }

                        let split_pos: usize = chars[..=i].iter().map(|c| c.len_utf8()).sum();
                        let sentence = self.buffer[..split_pos].trim().to_string();
                        self.buffer = self.buffer[split_pos..].trim_start().to_string();
                        if !sentence.is_empty() {
                            return Some(sentence);
                        }
                    }
                }
                // If punctuation is at the end of buffer, wait for more tokens
            }
        }

        None
    }
}

#[tauri::command]
pub fn send_chat_message(
    app: AppHandle,
    state: tauri::State<'_, LlmState>,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    request_id: String,
    tts_enabled: Option<bool>,
    tts_speed: Option<f32>,
    language: Option<String>,
    custom_endpoint: Option<String>,
) -> Result<(), String> {
    let url = if let Some(ref endpoint) = custom_endpoint {
        format!("{}/v1/chat/completions", endpoint.trim_end_matches('/'))
    } else {
        let port = *state.port.lock().unwrap();
        if port == 0 {
            return Err("LLM server is not running".to_string());
        }
        format!("http://127.0.0.1:{}/v1/chat/completions", port)
    };
    let temp = temperature.unwrap_or(0.7);

    let body = serde_json::json!({
        "messages": messages,
        "temperature": temp,
        "stream": true,
        "max_tokens": 4096,
    });

    let event_name = format!("chat-stream-{}", request_id);
    let tts_event_name = format!("tts-chunk-{}", request_id);
    let tts_stop_event = format!("tts-stop-{}", request_id);

    // Create cancel flag
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut flags = state.cancel_flags.lock().unwrap();
        flags.insert(request_id.clone(), cancel_flag.clone());
    }

    // Set up TTS channel if TTS is enabled
    let tts_enabled = tts_enabled.unwrap_or(false);
    let speed = tts_speed.unwrap_or(1.0);
    let lang = language.unwrap_or_else(|| "en".to_string());
    let (sentence_tx, sentence_rx) = mpsc::channel::<Option<String>>();

    // Spawn TTS worker thread
    let tts_app = app.clone();
    let tts_cancel = cancel_flag.clone();
    let tts_event = tts_event_name.clone();
    let tts_stop = tts_stop_event.clone();
    let tts_request_id = request_id.clone();

    let tts_handle = if tts_enabled {
        Some(std::thread::spawn(move || {
            // Access TtsState via the cloned AppHandle inside the thread.
            // Tauri manages state as Arc<T> internally; AppHandle is Clone + Send + 'static.
            let tts_state: tauri::State<'_, TtsState> = tts_app.state();
            let mut index: u32 = 0;

            loop {
                let msg = match sentence_rx.recv() {
                    Ok(m) => m,
                    Err(_) => break, // channel closed
                };

                // None = sentinel (stream ended)
                let sentence = match msg {
                    Some(s) => s,
                    None => break,
                };

                // Check cancel flag (before and after empty-check to minimize wasted synthesis)
                if tts_cancel.load(Ordering::Relaxed) {
                    // Drain remaining messages without synthesizing
                    // Must break on None sentinel to avoid deadlock (SSE thread holds sender)
                    loop {
                        match sentence_rx.recv() {
                            Ok(Some(_)) => {} // discard
                            _ => break,       // None sentinel or channel closed
                        }
                    }
                    let _ = tts_app.emit(&tts_stop, true);
                    bus_send(&tts_app, WebEvent::TtsStop {
                        request_id: tts_request_id.clone(),
                    });
                    return;
                }

                if sentence.trim().is_empty() {
                    continue;
                }

                // Strip emojis before synthesis — keep original for display
                let tts_input = clean_for_tts(&sentence);
                if tts_input.trim().is_empty() {
                    // Sentence was only emojis — reveal text without audio
                    let chunk = TtsChunk {
                        samples: vec![],
                        sample_rate: 24000,
                        index,
                        text: sentence,
                        done: false,
                    };
                    let _ = tts_app.emit(&tts_event, &chunk);
                    bus_send(&tts_app, WebEvent::TtsChunk {
                        request_id: tts_request_id.clone(),
                        data: base64::engine::general_purpose::STANDARD.encode(&[] as &[u8]),
                        sample_rate: chunk.sample_rate,
                        index: chunk.index,
                        text: chunk.text.clone(),
                        done: chunk.done,
                    });
                    index += 1;
                    continue;
                }
                let result = crate::tts::synthesize_text(&tts_state, &tts_input, speed, &lang);

                let (samples, sample_rate) = match result {
                    Ok(tts_result) => (tts_result.samples, tts_result.sample_rate),
                    Err(e) => {
                        eprintln!("[tts-worker] Synthesis failed for '{}': {}", sentence, e);
                        // Emit chunk with empty samples so frontend reveals text anyway
                        (vec![], 24000)
                    }
                };

                let pcm_bytes: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
                let chunk = TtsChunk {
                    samples,
                    sample_rate,
                    index,
                    text: sentence,
                    done: false,
                };
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

            if !tts_cancel.load(Ordering::Relaxed) {
                // Send final done chunk
                let done_chunk = TtsChunk {
                    samples: vec![],
                    sample_rate: 24000,
                    index,
                    text: String::new(),
                    done: true,
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
            }
        }))
    } else {
        // Drop the receiver so sender doesn't block
        drop(sentence_rx);
        None
    };

    let event_name_err = event_name.clone();
    let cancel_for_sse = cancel_flag.clone();
    let request_id_cleanup = request_id.clone();
    let sse_app = app.clone();

    std::thread::spawn(move || {
        let body_str = body.to_string();
        eprintln!("[chat] Sending to {}: {}", url, &body_str[..body_str.len().min(200)]);

        let result = ureq::post(&url)
            .header("Content-Type", "application/json")
            .send(body_str.as_bytes());

        let mut sentence_buffer = SentenceBuffer::new();
        // Track whether we've hit the "---" corrections delimiter;
        // once true, stop feeding text to TTS but keep streaming to frontend.
        let mut past_corrections_delimiter = false;

        match result {
            Ok(response) => {
                eprintln!("[chat] Got response, reading stream...");
                let reader = BufReader::new(response.into_body().into_reader());
                for line in reader.lines() {
                    // Check cancel flag
                    if cancel_for_sse.load(Ordering::Relaxed) {
                        eprintln!("[chat] Generation cancelled");
                        break;
                    }

                    let line = match line {
                        Ok(l) => l,
                        Err(_) => break,
                    };

                    if !line.starts_with("data: ") {
                        continue;
                    }

                    let data = &line[6..];
                    if data == "[DONE]" {
                        // Flush remaining sentence buffer
                        if !past_corrections_delimiter {
                            let remaining = sentence_buffer.flush();
                            if !remaining.is_empty() && tts_enabled {
                                let _ = sentence_tx.send(Some(remaining));
                            }
                        }
                        // Send sentinel to TTS worker
                        if tts_enabled {
                            let _ = sentence_tx.send(None);
                        }

                        let _ = app.emit(
                            &event_name,
                            StreamDelta {
                                content: String::new(),
                                done: true,
                            },
                        );
                        bus_send(&app, WebEvent::ChatDone {
                            request_id: request_id.clone(),
                        });
                        break;
                    }

                    if let Ok(sse) = serde_json::from_str::<SseResponse>(data) {
                        if let Some(choices) = sse.choices {
                            if let Some(choice) = choices.first() {
                                if let Some(ref delta) = choice.delta {
                                    if let Some(ref content) = delta.content {
                                        // Emit text token
                                        let _ = app.emit(
                                            &event_name,
                                            StreamDelta {
                                                content: content.clone(),
                                                done: false,
                                            },
                                        );
                                        bus_send(&app, WebEvent::ChatToken {
                                            request_id: request_id.clone(),
                                            token: content.clone(),
                                        });

                                        // Check for corrections delimiter "---"
                                        if !past_corrections_delimiter {
                                            if let Some(sentence) = sentence_buffer.feed(content) {
                                                // Check if this sentence contains the delimiter
                                                if sentence.contains("---") {
                                                    // Send only the part before "---" to TTS
                                                    if let Some(before) = sentence.split("---").next() {
                                                        let before = before.trim().to_string();
                                                        if !before.is_empty() && tts_enabled {
                                                            let _ = sentence_tx.send(Some(before));
                                                        }
                                                    }
                                                    past_corrections_delimiter = true;
                                                } else if tts_enabled {
                                                    let _ = sentence_tx.send(Some(sentence));
                                                }
                                            }
                                            // Also check the buffer itself for "---"
                                            if sentence_buffer.buffer.contains("---") {
                                                let remaining = sentence_buffer.flush();
                                                if let Some(before) = remaining.split("---").next() {
                                                    let before = before.trim().to_string();
                                                    if !before.is_empty() && tts_enabled {
                                                        let _ = sentence_tx.send(Some(before));
                                                    }
                                                }
                                                past_corrections_delimiter = true;
                                            }
                                        }
                                    }
                                }
                                if choice.finish_reason.is_some() {
                                    // Flush remaining sentence buffer
                                    if !past_corrections_delimiter {
                                        let remaining = sentence_buffer.flush();
                                        if !remaining.is_empty() && tts_enabled {
                                            let _ = sentence_tx.send(Some(remaining));
                                        }
                                    }
                                    if tts_enabled {
                                        let _ = sentence_tx.send(None);
                                    }

                                    let _ = app.emit(
                                        &event_name,
                                        StreamDelta {
                                            content: String::new(),
                                            done: true,
                                        },
                                    );
                                    bus_send(&app, WebEvent::ChatDone {
                                        request_id: request_id.clone(),
                                    });
                                    break;
                                }
                            }
                        }
                    }
                }

                // If cancelled, still need to close the TTS channel
                if cancel_for_sse.load(Ordering::Relaxed) && tts_enabled {
                    let _ = sentence_tx.send(None);
                }
            }
            Err(e) => {
                eprintln!("[chat] Error: {}", e);
                if tts_enabled {
                    let _ = sentence_tx.send(None);
                }
                let err_msg = format!("[Error: {}]", e);
                let _ = app.emit(
                    &event_name_err,
                    StreamDelta {
                        content: err_msg.clone(),
                        done: true,
                    },
                );
                bus_send(&app, WebEvent::Error {
                    request_id: request_id.clone(),
                    message: err_msg,
                });
            }
        }

        // Wait for TTS worker to finish
        if let Some(handle) = tts_handle {
            let _ = handle.join();
        }

        // Clean up cancel flag via cloned AppHandle
        let llm_state: tauri::State<'_, LlmState> = sse_app.state();
        let _ = llm_state.cancel_flags.lock().map(|mut flags| {
            flags.remove(&request_id_cleanup);
        });
    });

    Ok(())
}

pub fn cancel_generation_inner(state: &LlmState, request_id: &str) {
    let flags = state.cancel_flags.lock().unwrap();
    if let Some(flag) = flags.get(request_id) {
        flag.store(true, Ordering::Relaxed);
        eprintln!("[chat] Cancelled generation {}", request_id);
    }
}

#[tauri::command]
pub fn cancel_generation(
    state: tauri::State<'_, LlmState>,
    request_id: String,
) {
    cancel_generation_inner(&state, &request_id)
}

#[derive(Debug, Deserialize)]
struct CompletionResponse {
    choices: Option<Vec<CompletionChoice>>,
}

#[derive(Debug, Deserialize)]
struct CompletionChoice {
    message: Option<CompletionMessage>,
}

#[derive(Debug, Deserialize)]
struct CompletionMessage {
    content: Option<String>,
    reasoning_content: Option<String>,
}

/// Extract the best available text from a completion response.
/// Prefers `content`; falls back to `reasoning_content` for reasoning models.
fn extract_completion_text(resp: CompletionResponse) -> String {
    let msg = resp
        .choices
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.message);
    msg.as_ref()
        .and_then(|m| m.content.as_deref())
        .filter(|s| !s.is_empty())
        .or_else(|| msg.as_ref().and_then(|m| m.reasoning_content.as_deref()))
        .unwrap_or("")
        .to_string()
}

/// Provider-aware completion: routes to local llama-server or external API.
pub(crate) fn complete_with_provider(
    port: u16,
    provider: &str,
    api_key: &str,
    api_model: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: f32,
    max_tokens: u32,
    custom_endpoint: Option<&str>,
) -> Result<String, String> {
    match provider {
        "gemini" => crate::gemini::complete_text(api_key, api_model, system_prompt, user_prompt, temperature, max_tokens),
        _ => {
            let url = if let Some(endpoint) = custom_endpoint {
                format!("{}/v1/chat/completions", endpoint.trim_end_matches('/'))
            } else {
                if port == 0 {
                    return Err("LLM server is not running".to_string());
                }
                format!("http://127.0.0.1:{}/v1/chat/completions", port)
            };
            let body = serde_json::json!({
                "messages": [
                    { "role": "system", "content": system_prompt },
                    { "role": "user", "content": user_prompt }
                ],
                "temperature": temperature,
                "stream": false,
                "max_tokens": max_tokens,
            });
            let body_str = body.to_string();
            let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
            std::thread::spawn(move || {
                let reply = match ureq::post(&url)
                    .header("Content-Type", "application/json")
                    .send(body_str.as_bytes())
                {
                    Ok(response) => match response.into_body().read_to_string() {
                        Ok(body_text) => match serde_json::from_str::<CompletionResponse>(&body_text) {
                            Ok(parsed) => Ok(extract_completion_text(parsed)),
                            Err(e) => Err(format!("Parse error: {}", e)),
                        },
                        Err(e) => Err(format!("Read error: {}", e)),
                    },
                    Err(e) => Err(format!("LLM request failed: {}", e)),
                };
                let _ = tx.send(reply);
            });
            rx.recv().map_err(|e| format!("Channel error: {}", e))?
        }
    }
}

pub fn explain_message_inner(
    llm: &LlmState,
    db: &crate::dictionary::DictionaryDb,
    text: &str,
    language: &str,
    native_language: Option<&str>,
    provider: Option<&str>,
    api_key: Option<&str>,
    api_model: Option<&str>,
    force_refresh: bool,
    custom_endpoint: Option<&str>,
) -> Result<String, String> {
    let native_code = native_language.unwrap_or("ko");

    if !force_refresh {
        if let Some(cached) = db.get("translate", text, language, native_code) {
            return Ok(cached);
        }
    }

    let port = *llm.port.lock().unwrap();
    let prov = provider.unwrap_or("local");
    let key = api_key.unwrap_or("");
    let model = api_model.unwrap_or("");

    let native_lang = lang_name(native_code);
    let target_lang = lang_name(language);

    let system_prompt = format!(
        "Translate the following {} sentence into {}. \
         Return ONLY the {} translation, nothing else. \
         No explanations, no original text, no formatting.",
        target_lang, native_lang, native_lang
    );

    eprintln!("[explain_message] provider={}, lang={}, native={}, text_len={}", prov, language, native_code, text.len());
    let result = complete_with_provider(port, prov, key, model, &system_prompt, text, 0.3, 2048, custom_endpoint)?;
    eprintln!("[explain_message] result_len={}", result.len());
    db.put("translate", text, language, native_code, &result);
    Ok(result)
}

#[tauri::command]
pub async fn explain_message(
    state: tauri::State<'_, LlmState>,
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    text: String,
    language: String,
    native_language: Option<String>,
    provider: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
    force_refresh: Option<bool>,
    custom_endpoint: Option<String>,
) -> Result<String, String> {
    explain_message_inner(
        &state, &db, &text, &language,
        native_language.as_deref(), provider.as_deref(),
        api_key.as_deref(), api_model.as_deref(),
        force_refresh.unwrap_or(false),
        custom_endpoint.as_deref(),
    )
}

pub fn suggest_responses_inner(
    llm: &LlmState,
    text: &str,
    language: &str,
    native_language: Option<&str>,
    provider: Option<&str>,
    api_key: Option<&str>,
    api_model: Option<&str>,
    custom_endpoint: Option<&str>,
) -> Result<String, String> {
    let port = *llm.port.lock().unwrap();
    let prov = provider.unwrap_or("local");
    let key = api_key.unwrap_or("");
    let model = api_model.unwrap_or("");

    let (native_lang, native_label) = match native_language {
        Some("en") => ("English", "English"),
        _ => ("Korean", "\u{d55c}\u{ad6d}\u{c5b4}"),
    };

    let system_prompt = format!(
        "The user is practicing {}. Given the following sentence from a conversation partner, \
         suggest 2 natural sample responses that the learner could say back. \
         For each response, show the {} text first, then the {} translation on the next line. \
         Use this exact format:\n\
         1. [response in {}]\n({}: [{} translation])\n\n\
         2. [response in {}]\n({}: [{} translation])\n\n\
         Keep responses concise and natural for an intermediate learner. Do NOT add any other explanation.",
        language, language, native_lang,
        language, native_label, native_lang,
        language, native_label, native_lang
    );

    complete_with_provider(port, prov, key, model, &system_prompt, text, 0.7, 2048, custom_endpoint)
}

#[tauri::command]
pub async fn suggest_responses(
    state: tauri::State<'_, LlmState>,
    text: String,
    language: String,
    native_language: Option<String>,
    provider: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
    custom_endpoint: Option<String>,
) -> Result<String, String> {
    suggest_responses_inner(
        &state, &text, &language,
        native_language.as_deref(), provider.as_deref(),
        api_key.as_deref(), api_model.as_deref(),
        custom_endpoint.as_deref(),
    )
}

pub(crate) fn lang_name(code: &str) -> &str {
    match code {
        "en" => "English",
        "es" => "Spanish",
        "fr" => "French",
        "zh" => "Chinese",
        "ja" => "Japanese",
        "de" => "German",
        "ko" => "Korean",
        "pt" => "Portuguese",
        "it" => "Italian",
        "ru" => "Russian",
        "ar" => "Arabic",
        "hi" => "Hindi",
        "tr" => "Turkish",
        "id" => "Indonesian",
        "vi" => "Vietnamese",
        "pl" => "Polish",
        _ => "English",
    }
}

pub fn tutor_translate_inner(
    llm: &LlmState,
    text: &str,
    native_language: &str,
    target_language: &str,
    provider: Option<&str>,
    api_key: Option<&str>,
    api_model: Option<&str>,
    custom_endpoint: Option<&str>,
) -> Result<String, String> {
    let port = *llm.port.lock().unwrap();
    let prov = provider.unwrap_or("local");
    let key = api_key.unwrap_or("");
    let model = api_model.unwrap_or("");

    let native_lang = lang_name(native_language);
    let target_lang = lang_name(target_language);

    let system_prompt = format!(
        "The user is practicing {} and said something in {} because they didn't know how to say it. \
         Translate their message into natural {}. \
         Return ONLY the {} translation, nothing else. \
         No explanations, no original text, no quotation marks, no formatting.",
        target_lang, native_lang, target_lang, target_lang
    );

    complete_with_provider(port, prov, key, model, &system_prompt, text, 0.3, 2048, custom_endpoint)
}

#[tauri::command]
pub async fn tutor_translate(
    state: tauri::State<'_, LlmState>,
    text: String,
    native_language: String,
    target_language: String,
    provider: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
    custom_endpoint: Option<String>,
) -> Result<String, String> {
    tutor_translate_inner(
        &state, &text, &native_language, &target_language,
        provider.as_deref(), api_key.as_deref(), api_model.as_deref(),
        custom_endpoint.as_deref(),
    )
}

pub fn lookup_word_inner(
    llm: &LlmState,
    db: &crate::dictionary::DictionaryDb,
    word: &str,
    sentence: &str,
    target_language: &str,
    native_language: &str,
    provider: Option<&str>,
    api_key: Option<&str>,
    api_model: Option<&str>,
    force_refresh: bool,
    custom_endpoint: Option<&str>,
) -> Result<String, String> {
    if !force_refresh {
        if let Some(cached) = db.get("word", word, target_language, native_language) {
            eprintln!("[lookup_word] cache hit: '{}'", word);
            return Ok(cached);
        }
    }

    let port = *llm.port.lock().unwrap();
    let prov = provider.unwrap_or("local");
    let key = api_key.unwrap_or("");
    let model = api_model.unwrap_or("");

    let target_lang_name = lang_name(target_language);
    let native_lang_name = lang_name(native_language);

    let system_prompt = format!(
        "You are a {target_lang_name}-{native_lang_name} dictionary. \
         Explain the meaning of the {target_lang_name} text to a {native_lang_name} speaker. \
         Respond in {native_lang_name}. Be concise (2-3 lines max). No markdown."
    );
    let user_prompt = format!(
        "Text: \"{word}\"\nSentence: \"{sentence}\"\n\n\
         1) Meaning in {native_lang_name}\n\
         2) Grammar if useful\n\
         3) Example sentence if helpful"
    );

    let effective_model = if prov == "gemini" {
        "gemini-3.1-flash-lite-preview"
    } else {
        model
    };

    eprintln!("[lookup_word] word='{}' model={}", word, effective_model);

    let result = complete_with_provider(port, prov, key, effective_model, &system_prompt, &user_prompt, 0.3, 2048, custom_endpoint)?;
    db.put("word", word, target_language, native_language, &result);
    Ok(result)
}

#[tauri::command]
pub async fn lookup_word(
    state: tauri::State<'_, LlmState>,
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    word: String,
    sentence: String,
    target_language: String,
    native_language: String,
    provider: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
    force_refresh: Option<bool>,
    custom_endpoint: Option<String>,
) -> Result<String, String> {
    lookup_word_inner(
        &state, &db, &word, &sentence, &target_language, &native_language,
        provider.as_deref(), api_key.as_deref(), api_model.as_deref(),
        force_refresh.unwrap_or(false),
        custom_endpoint.as_deref(),
    )
}

#[cfg(test)]
mod tests {
    use super::SentenceBuffer;

    #[test]
    fn splits_on_period_space() {
        let mut buf = SentenceBuffer::new();
        assert_eq!(buf.feed("Hello world. "), Some("Hello world.".to_string()));
        assert_eq!(buf.flush(), "");
    }

    #[test]
    fn splits_on_exclamation() {
        let mut buf = SentenceBuffer::new();
        assert_eq!(buf.feed("Wow! Great"), Some("Wow!".to_string()));
        assert_eq!(buf.flush(), "Great");
    }

    #[test]
    fn splits_on_question_mark() {
        let mut buf = SentenceBuffer::new();
        assert_eq!(buf.feed("Really? Yes"), Some("Really?".to_string()));
    }

    #[test]
    fn waits_for_char_after_punctuation() {
        let mut buf = SentenceBuffer::new();
        assert_eq!(buf.feed("Hello world."), None);
        assert_eq!(buf.feed(" Next"), Some("Hello world.".to_string()));
    }

    #[test]
    fn skips_abbreviations() {
        let mut buf = SentenceBuffer::new();
        assert_eq!(buf.feed("The U.S. is large."), None); // waits for char after final dot
        assert_eq!(buf.feed(" Next"), Some("The U.S. is large.".to_string()));
    }

    #[test]
    fn skips_decimals() {
        let mut buf = SentenceBuffer::new();
        assert_eq!(buf.feed("It costs 3.14 dollars. "), Some("It costs 3.14 dollars.".to_string()));
    }

    #[test]
    fn splits_cjk_punctuation() {
        let mut buf = SentenceBuffer::new();
        assert_eq!(buf.feed("こんにちは。次"), Some("こんにちは。".to_string()));
        assert_eq!(buf.flush(), "次");
    }

    #[test]
    fn splits_cjk_exclamation() {
        let mut buf = SentenceBuffer::new();
        assert_eq!(buf.feed("すごい！はい"), Some("すごい！".to_string()));
    }

    #[test]
    fn splits_cjk_question() {
        let mut buf = SentenceBuffer::new();
        assert_eq!(buf.feed("本当？はい"), Some("本当？".to_string()));
    }

    #[test]
    fn flushes_at_max_length() {
        let mut buf = SentenceBuffer::new();
        let long_text = "a".repeat(201);
        let result = buf.feed(&long_text);
        assert!(result.is_some());
        assert_eq!(result.unwrap().len(), 201);
    }

    #[test]
    fn flush_returns_remaining() {
        let mut buf = SentenceBuffer::new();
        buf.feed("partial text");
        assert_eq!(buf.flush(), "partial text");
        assert_eq!(buf.flush(), ""); // second flush is empty
    }

    #[test]
    fn incremental_tokens() {
        let mut buf = SentenceBuffer::new();
        assert_eq!(buf.feed("Hel"), None);
        assert_eq!(buf.feed("lo"), None);
        assert_eq!(buf.feed(" world"), None);
        assert_eq!(buf.feed("."), None);
        assert_eq!(buf.feed(" Next"), Some("Hello world.".to_string()));
    }
}
