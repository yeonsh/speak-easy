use crate::llm::{ChatMessage, LlmState};
use crate::tts::TtsState;
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

/// Clean text for TTS: strip emojis, replace fullwidth CJK punctuation with
/// ASCII equivalents so eSpeak can use them for prosody/intonation.
fn clean_for_tts(text: &str) -> String {
    text.chars()
        .filter_map(|c| {
            let cp = c as u32;
            // Strip emojis
            if matches!(
                cp,
                0x200D
                | 0x20E3
                | 0xFE00..=0xFE0F
                | 0x1F1E0..=0x1F1FF
                | 0x1F300..=0x1F9FF
                | 0x1FA00..=0x1FAFF
                | 0x2600..=0x26FF
                | 0x2700..=0x27BF
                | 0xE0020..=0xE007F
            ) {
                return None;
            }
            // Replace CJK punctuation with ASCII equivalents (preserves prosody)
            match cp {
                0x3002 => Some('.'),  // 。→ .
                0xFF01 => Some('!'),  // ！→ !
                0xFF1F => Some('?'),  // ？→ ?
                0xFF0C => Some(','),  // ，→ ,
                0x300C | 0x300D | 0x300E | 0x300F => None, // 「」『』 strip
                0xFF08 | 0xFF09 => None, // （） strip
                _ => Some(c),
            }
        })
        .collect()
}

/// Accumulates LLM tokens and detects sentence boundaries.
struct SentenceBuffer {
    buffer: String,
    max_len: usize,
}

impl SentenceBuffer {
    fn new() -> Self {
        Self {
            buffer: String::new(),
            max_len: 200,
        }
    }

    /// Feed a token into the buffer. Returns a completed sentence if a boundary is detected.
    fn feed(&mut self, token: &str) -> Option<String> {
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
    fn flush(&mut self) -> String {
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
                    return;
                }

                if sentence.trim().is_empty() {
                    continue;
                }

                // Strip emojis before synthesis — keep original for display
                let tts_input = clean_for_tts(&sentence);
                if tts_input.trim().is_empty() {
                    // Sentence was only emojis — reveal text without audio
                    let _ = tts_app.emit(
                        &tts_event,
                        TtsChunk {
                            samples: vec![],
                            sample_rate: 24000,
                            index,
                            text: sentence,
                            done: false,
                        },
                    );
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

                let _ = tts_app.emit(
                    &tts_event,
                    TtsChunk {
                        samples,
                        sample_rate,
                        index,
                        text: sentence,
                        done: false,
                    },
                );
                index += 1;
            }

            if !tts_cancel.load(Ordering::Relaxed) {
                // Send final done chunk
                let _ = tts_app.emit(
                    &tts_event,
                    TtsChunk {
                        samples: vec![],
                        sample_rate: 24000,
                        index,
                        text: String::new(),
                        done: true,
                    },
                );
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
                        let remaining = sentence_buffer.flush();
                        if !remaining.is_empty() && tts_enabled {
                            let _ = sentence_tx.send(Some(remaining));
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
                        break;
                    }

                    if let Ok(sse) = serde_json::from_str::<SseResponse>(data) {
                        if let Some(choices) = sse.choices {
                            if let Some(choice) = choices.first() {
                                if let Some(ref delta) = choice.delta {
                                    if let Some(ref content) = delta.content {
                                        // Emit text token (unchanged behavior)
                                        let _ = app.emit(
                                            &event_name,
                                            StreamDelta {
                                                content: content.clone(),
                                                done: false,
                                            },
                                        );

                                        // Feed to sentence buffer for TTS
                                        if tts_enabled {
                                            if let Some(sentence) = sentence_buffer.feed(content) {
                                                let _ = sentence_tx.send(Some(sentence));
                                            }
                                        }
                                    }
                                }
                                if choice.finish_reason.is_some() {
                                    // Flush remaining sentence buffer
                                    let remaining = sentence_buffer.flush();
                                    if !remaining.is_empty() && tts_enabled {
                                        let _ = sentence_tx.send(Some(remaining));
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
                let _ = app.emit(
                    &event_name_err,
                    StreamDelta {
                        content: format!("[Error: {}]", e),
                        done: true,
                    },
                );
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

#[tauri::command]
pub fn cancel_generation(
    state: tauri::State<'_, LlmState>,
    request_id: String,
) {
    let flags = state.cancel_flags.lock().unwrap();
    if let Some(flag) = flags.get(&request_id) {
        flag.store(true, Ordering::Relaxed);
        eprintln!("[chat] Cancelled generation {}", request_id);
    }
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
