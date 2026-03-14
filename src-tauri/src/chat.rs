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

        // Force flush if buffer exceeds max length
        if self.buffer.len() >= self.max_len {
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
        let body_str = body.to_string();
        eprintln!("[chat] Sending to {}: {}", url, &body_str[..body_str.len().min(200)]);

        let result = ureq::post(&url)
            .header("Content-Type", "application/json")
            .send(body_str.as_bytes());

        match result {
            Ok(response) => {
                eprintln!("[chat] Got response, reading stream...");
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
                eprintln!("[chat] Error: {}", e);
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
