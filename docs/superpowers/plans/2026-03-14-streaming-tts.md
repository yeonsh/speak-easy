# Streaming TTS Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synthesize and play AI speech sentence-by-sentence as the LLM streams tokens, with text revealed progressively as each sentence finishes playing.

**Architecture:** Rust backend detects sentence boundaries in the LLM token stream, synthesizes each via Kokoro ONNX on a worker thread, and emits audio chunks via Tauri events. Frontend AudioWorklet queues chunks for gapless playback and signals per-chunk completion to reveal text.

**Tech Stack:** Rust (Tauri 2, ort/ONNX, std::sync::mpsc), TypeScript/React, Web Audio API (AudioWorklet)

**Spec:** `docs/superpowers/specs/2026-03-14-streaming-tts-design.md`

---

## Chunk 1: Rust Backend

### Task 1: Extract `synthesize_text()` from `tts.rs`

**Files:**

- Modify: `src-tauri/src/tts.rs`

- [ ] **Step 1: Create `synthesize_text()` public function**

Move the synthesis logic out of the `synthesize_speech` Tauri command into a standalone public function. The Tauri command becomes a thin wrapper.

```rust
// In tts.rs, add this function BEFORE the synthesize_speech command:

/// Core synthesis function callable from any thread with access to TtsState.
pub fn synthesize_text(state: &TtsState, text: &str, speed: f32) -> Result<TtsResult, String> {
    let mut session_guard = state.session.lock().unwrap();
    let session = session_guard
        .as_mut()
        .ok_or("TTS not loaded. Call load_tts_voice first.")?;

    let embedding_guard = state.voice_embedding.lock().unwrap();
    let voice_matrix = embedding_guard
        .as_ref()
        .ok_or("No voice selected.")?;

    let vocab = kokoro_vocab();

    // Phonemize text using espeak-ng
    let phonemes = espeak_phonemize(text);
    eprintln!("[tts] Phonemes: {}", phonemes);

    // Convert phonemes to token IDs
    let mut tokens: Vec<i64> = Vec::new();
    for ch in phonemes.chars() {
        let key = ch.to_string();
        if let Some(&id) = vocab.get(&key) {
            tokens.push(id);
        }
    }

    if tokens.is_empty() {
        return Ok(TtsResult {
            sample_rate: KOKORO_SAMPLE_RATE,
            samples: vec![],
        });
    }

    // Truncate to max length
    if tokens.len() > MAX_PHONEME_LENGTH {
        tokens.truncate(MAX_PHONEME_LENGTH);
    }

    // Get style embedding for this token length
    let token_len = tokens.len();
    let style: Vec<f32> = if token_len < voice_matrix.len() {
        voice_matrix[token_len].clone()
    } else {
        voice_matrix[voice_matrix.len() - 1].clone()
    };

    // Add padding tokens: [0, ...tokens, 0]
    let mut padded: Vec<i64> = Vec::with_capacity(tokens.len() + 2);
    padded.push(0);
    padded.extend(&tokens);
    padded.push(0);

    let padded_len = padded.len();

    // Create tensors
    let input_tensor = Tensor::from_array(([1, padded_len], padded))
        .map_err(|e| format!("Failed to create input tensor: {}", e))?;

    let style_dim = style.len();
    let style_tensor = Tensor::from_array(([1_usize, style_dim], style))
        .map_err(|e| format!("Failed to create style tensor: {}", e))?;

    let speed_tensor = Tensor::from_array(([1_usize], vec![speed]))
        .map_err(|e| format!("Failed to create speed tensor: {}", e))?;

    // Run inference
    let outputs = session
        .run(ort::inputs!["tokens" => input_tensor, "style" => style_tensor, "speed" => speed_tensor])
        .map_err(|e| format!("TTS inference failed: {}", e))?;

    // Extract audio from output
    let output = &outputs[0];
    let audio_tensor = output
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("Failed to extract audio tensor: {}", e))?;

    let samples: Vec<f32> = audio_tensor.1.iter().copied().collect();

    Ok(TtsResult {
        sample_rate: KOKORO_SAMPLE_RATE,
        samples,
    })
}
```

- [ ] **Step 2: Simplify `synthesize_speech` to call `synthesize_text`**

Replace the body of the existing `synthesize_speech` Tauri command:

```rust
#[tauri::command]
pub fn synthesize_speech(
    state: tauri::State<'_, TtsState>,
    text: String,
    speed: Option<f32>,
) -> Result<TtsResult, String> {
    synthesize_text(&state, &text, speed.unwrap_or(1.0))
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/tts.rs
git commit -m "refactor: extract synthesize_text() from Tauri command for reuse"
```

---

### Task 2: Add cancel flag storage to `LlmState`

**Files:**

- Modify: `src-tauri/src/llm.rs`

- [ ] **Step 1: Add cancel flags HashMap to LlmState**

```rust
// Add to imports at top of llm.rs:
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

// Modify LlmState struct:
pub struct LlmState {
    process: Mutex<Option<Child>>,
    pub(crate) port: Mutex<u16>,
    pub(crate) cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

// Modify LlmState::new():
impl LlmState {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            port: Mutex::new(0),
            cancel_flags: Mutex::new(HashMap::new()),
        }
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles (unused field warning is fine)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/llm.rs
git commit -m "feat: add cancel_flags to LlmState for generation cancellation"
```

---

### Task 3: Implement `SentenceBuffer`

**Files:**

- Modify: `src-tauri/src/chat.rs`

- [ ] **Step 1: Add `SentenceBuffer` struct**

Add this above the `send_chat_message` function in `chat.rs`:

```rust
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
```

- [ ] **Step 2: Add unit tests for SentenceBuffer**

Add at the bottom of `chat.rs`:

```rust
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
```

- [ ] **Step 3: Verify it compiles and tests pass**

Run: `cd src-tauri && cargo test --lib -- tests`
Expected: all SentenceBuffer tests pass

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/chat.rs
git commit -m "feat: add SentenceBuffer with unit tests for sentence boundary detection"
```

---

### Task 4: Wire up TTS worker thread and cancellation in `chat.rs`

**Files:**

- Modify: `src-tauri/src/chat.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add TtsChunk struct and new imports**

Add at the top of `chat.rs`:

```rust
use crate::tts::TtsState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
```

Add the TtsChunk struct after StreamDelta:

```rust
#[derive(Debug, Serialize, Clone)]
struct TtsChunk {
    samples: Vec<f32>,
    sample_rate: u32,
    index: u32,
    text: String,
    done: bool,
}
```

- [ ] **Step 2: Add `cancel_generation` command**

Add after `send_chat_message`:

```rust
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
```

- [ ] **Step 3: Modify `send_chat_message` to set up the streaming TTS pipeline**

Replace the entire `send_chat_message` function:

```rust
#[tauri::command]
pub fn send_chat_message(
    app: AppHandle,
    state: tauri::State<'_, LlmState>,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    request_id: String,
    tts_enabled: Option<bool>,
    tts_speed: Option<f32>,
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

                if tts_cancel.load(Ordering::Relaxed) {
                    // Drain remaining messages without synthesizing
                    while sentence_rx.recv().is_ok() {}
                    let _ = tts_app.emit(&tts_stop, true);
                    return;
                }

                if sentence.trim().is_empty() {
                    continue;
                }

                // Synthesize this sentence
                let result = crate::tts::synthesize_text(&tts_state, &sentence, speed);

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
        if let Ok(mut flags) = llm_state.cancel_flags.lock() {
            flags.remove(&request_id_cleanup);
        }
    });

    Ok(())
}
```

- [ ] **Step 4: Register `cancel_generation` in `lib.rs`**

Add `chat::cancel_generation` to the `invoke_handler` list in `lib.rs`, after `chat::send_chat_message`:

```rust
            chat::send_chat_message,
            chat::cancel_generation,
```

- [ ] **Step 5: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors. Both `TtsState` and `LlmState` are accessed inside spawned threads via cloned `AppHandle`s (which are `Clone + Send + 'static`), avoiding the need for the state structs themselves to implement `Clone`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/chat.rs src-tauri/src/lib.rs
git commit -m "feat: streaming TTS pipeline — sentence detection, TTS worker thread, cancellation"
```

---

## Chunk 2: Frontend

### Task 5: Create `ttsChunkProcessor.js` AudioWorklet

**Files:**

- Create: `public/ttsChunkProcessor.js`

- [ ] **Step 1: Create the AudioWorklet processor**

```javascript
// public/ttsChunkProcessor.js
class TtsChunkProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferQueue = []; // Array of { samples: Float32Array, index: number }
    this.readOffset = 0;
    this.currentChunk = null;

    this.port.onmessage = (event) => {
      if (event.data.type === "chunk") {
        this.bufferQueue.push({
          samples: event.data.samples,
          index: event.data.index,
        });
      } else if (event.data.type === "clear") {
        this.bufferQueue = [];
        this.currentChunk = null;
        this.readOffset = 0;
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;

    let outIdx = 0;

    while (outIdx < output.length) {
      // Load next chunk if needed
      if (!this.currentChunk && this.bufferQueue.length > 0) {
        this.currentChunk = this.bufferQueue.shift();
        this.readOffset = 0;
      }

      if (!this.currentChunk) {
        // No audio available — output silence
        while (outIdx < output.length) {
          output[outIdx++] = 0;
        }
        break;
      }

      // Copy samples from current chunk to output
      const remaining = this.currentChunk.samples.length - this.readOffset;
      const toCopy = Math.min(remaining, output.length - outIdx);

      for (let i = 0; i < toCopy; i++) {
        output[outIdx++] = this.currentChunk.samples[this.readOffset++];
      }

      // Check if chunk is fully consumed
      if (this.readOffset >= this.currentChunk.samples.length) {
        this.port.postMessage({
          type: "chunkDone",
          index: this.currentChunk.index,
        });
        this.currentChunk = null;
        this.readOffset = 0;
      }
    }

    return true;
  }
}

registerProcessor("tts-chunk-processor", TtsChunkProcessor);
```

- [ ] **Step 2: Commit**

```bash
git add public/ttsChunkProcessor.js
git commit -m "feat: add AudioWorklet processor for streaming TTS chunk playback"
```

---

### Task 6: Rewrite `useTts.ts` for streaming playback

**Files:**

- Modify: `src/hooks/useTts.ts`

- [ ] **Step 1: Replace the hook implementation**

Replace the entire file contents:

```typescript
import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Language } from "../lib/types";

const DEFAULT_VOICES: Record<Language, string> = {
  en: "af_heart",
  es: "ef_dora",
  zh: "zf_xiaobei",
  de: "df_anna",
  ja: "jf_alpha",
};

interface TtsChunkPayload {
  samples: number[];
  sample_rate: number;
  index: number;
  text: string;
  done: boolean;
}

interface UseTtsReturn {
  isLoaded: boolean;
  isSpeaking: boolean;
  error: string | null;
  loadVoice: (language: Language, voiceName?: string) => Promise<void>;
  startStreaming: (requestId: string) => Promise<void>;
  stopStreaming: () => void;
  stop: () => void;
  availableVoices: string[];
  refreshVoices: () => Promise<void>;
  onChunkDone: React.MutableRefObject<
    ((index: number, text: string, done: boolean) => void) | null
  >;
}

export function useTts(): UseTtsReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const workletReadyRef = useRef(false);
  const unlistenChunkRef = useRef<UnlistenFn | null>(null);
  const unlistenStopRef = useRef<UnlistenFn | null>(null);
  const chunkMetaRef = useRef<Map<number, string>>(new Map());
  const onChunkDone = useRef<
    ((index: number, text: string, done: boolean) => void) | null
  >(null);
  const doneReceivedRef = useRef(false);
  const lastDoneIndexRef = useRef<number>(-1);

  const ensureWorklet = useCallback(async () => {
    if (workletReadyRef.current && workletNodeRef.current) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    await ctx.audioWorklet.addModule("/ttsChunkProcessor.js");

    const node = new AudioWorkletNode(ctx, "tts-chunk-processor");
    node.port.onmessage = (event) => {
      if (event.data.type === "chunkDone") {
        const idx = event.data.index as number;
        const text = chunkMetaRef.current.get(idx) ?? "";
        const isDone = doneReceivedRef.current && idx === lastDoneIndexRef.current;
        onChunkDone.current?.(idx, text, isDone);
        chunkMetaRef.current.delete(idx);

        if (isDone) {
          setIsSpeaking(false);
        }
      }
    };
    node.connect(ctx.destination);
    workletNodeRef.current = node;
    workletReadyRef.current = true;
  }, []);

  const refreshVoices = useCallback(async () => {
    try {
      const voices = await invoke<string[]>("list_voices");
      setAvailableVoices(voices);
    } catch (e) {
      setError(`Failed to list voices: ${e}`);
    }
  }, []);

  const loadVoice = useCallback(
    async (language: Language, voiceName?: string) => {
      setError(null);
      const resolvedVoice = voiceName || DEFAULT_VOICES[language];

      if (!resolvedVoice) {
        setError(`No TTS voice available for ${language}`);
        setIsLoaded(false);
        return;
      }

      try {
        await invoke("load_tts_voice", { voiceName: resolvedVoice });
        setIsLoaded(true);
        await refreshVoices();
      } catch (e) {
        setError(`Failed to load voice: ${e}`);
        setIsLoaded(false);
      }
    },
    [refreshVoices],
  );

  const startStreaming = useCallback(
    async (requestId: string) => {
      // Clean up any previous streaming
      if (unlistenChunkRef.current) {
        unlistenChunkRef.current();
        unlistenChunkRef.current = null;
      }
      if (unlistenStopRef.current) {
        unlistenStopRef.current();
        unlistenStopRef.current = null;
      }

      chunkMetaRef.current.clear();
      doneReceivedRef.current = false;
      lastDoneIndexRef.current = -1;

      await ensureWorklet();
      setIsSpeaking(true);
      setError(null);

      // Clear any old audio in the worklet
      workletNodeRef.current?.port.postMessage({ type: "clear" });

      // Listen for TTS chunks
      const unChunk = await listen<TtsChunkPayload>(
        `tts-chunk-${requestId}`,
        (event) => {
          const { samples, index, text, done } = event.payload;

          if (done) {
            // This is the final marker — no audio, just signals completion
            doneReceivedRef.current = true;
            // The last real chunk's index is index - 1
            // But if no chunks were sent, handle immediately
            if (chunkMetaRef.current.size === 0 && lastDoneIndexRef.current === -1) {
              setIsSpeaking(false);
              onChunkDone.current?.(-1, "", true);
            }
            return;
          }

          // Store text for this chunk index
          chunkMetaRef.current.set(index, text);
          lastDoneIndexRef.current = index;

          if (samples.length > 0) {
            // Convert to Float32Array and send to worklet
            const float32 = new Float32Array(samples);
            workletNodeRef.current?.port.postMessage(
              { type: "chunk", samples: float32, index },
              [float32.buffer],
            );
          } else {
            // Empty samples (synthesis failed) — reveal text immediately
            onChunkDone.current?.(index, text, doneReceivedRef.current && index === lastDoneIndexRef.current);
          }
        },
      );
      unlistenChunkRef.current = unChunk;

      // Listen for TTS stop (cancellation)
      const unStop = await listen<boolean>(`tts-stop-${requestId}`, () => {
        workletNodeRef.current?.port.postMessage({ type: "clear" });
        setIsSpeaking(false);
        cleanup();
      });
      unlistenStopRef.current = unStop;

      const cleanup = () => {
        unChunk();
        unStop();
        unlistenChunkRef.current = null;
        unlistenStopRef.current = null;
      };
    },
    [ensureWorklet],
  );

  const stopStreaming = useCallback(() => {
    // Clear worklet audio queue
    workletNodeRef.current?.port.postMessage({ type: "clear" });
    setIsSpeaking(false);

    // Clean up listeners
    if (unlistenChunkRef.current) {
      unlistenChunkRef.current();
      unlistenChunkRef.current = null;
    }
    if (unlistenStopRef.current) {
      unlistenStopRef.current();
      unlistenStopRef.current = null;
    }
    chunkMetaRef.current.clear();
  }, []);

  const stop = useCallback(() => {
    stopStreaming();
  }, [stopStreaming]);

  return {
    isLoaded,
    isSpeaking,
    error,
    loadVoice,
    startStreaming,
    stopStreaming,
    stop,
    availableVoices,
    refreshVoices,
    onChunkDone,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/ysh/proj/speak-easy && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTts.ts
git commit -m "feat: rewrite useTts for streaming AudioWorklet playback"
```

---

### Task 7: Expose `requestId` from `useLlm.ts`

**Files:**

- Modify: `src/hooks/useLlm.ts`

- [ ] **Step 1: Add `currentRequestId` ref and expose it**

Add a ref and return it:

```typescript
// After the existing refs (around line 27):
const currentRequestIdRef = useRef<string | null>(null);

// Inside sendMessage, after `const requestId = crypto.randomUUID();` (around line 81):
currentRequestIdRef.current = requestId;

// When generation completes (inside the done handler, after setIsGenerating(false)):
currentRequestIdRef.current = null;

// Add to the return object:
currentRequestId: currentRequestIdRef.current,
```

Also update the `UseLlmReturn` interface to include:

```typescript
currentRequestId: string | null;
```

And update `sendMessage` to accept and pass `ttsEnabled` and `ttsSpeed`:

```typescript
  sendMessage: (
    messages: { role: string; content: string }[],
    temperature?: number,
    ttsEnabled?: boolean,
    ttsSpeed?: number,
  ) => Promise<string>;  // returns requestId
```

Inside `sendMessage`, change the invoke call to pass the new params:

```typescript
      await invoke("send_chat_message", {
        messages,
        temperature: temperature ?? null,
        requestId,
        ttsEnabled: ttsEnabled ?? false,
        ttsSpeed: ttsSpeed ?? null,
      });
```

And return the `requestId` at the end of `sendMessage`:

```typescript
      return requestId;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/ysh/proj/speak-easy && npx tsc --noEmit`
Expected: errors in App.tsx (expected — we haven't updated it yet)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useLlm.ts
git commit -m "feat: expose requestId and pass ttsEnabled/ttsSpeed to backend"
```

---

### Task 8: Update `App.tsx` for streaming TTS

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: Add streaming TTS state and wire up the flow**

Add new state variables after existing state declarations:

```typescript
  const [revealedSentences, setRevealedSentences] = useState<string[]>([]);
  const [isStreamingTts, setIsStreamingTts] = useState(false);
  const [pendingFullText, setPendingFullText] = useState<string | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);
```

- [ ] **Step 2: Wire up `tts.onChunkDone`**

Replace the existing `onComplete` useEffect with:

```typescript
  // Wire up TTS chunk completion to reveal sentences
  useEffect(() => {
    tts.onChunkDone.current = (index: number, text: string, done: boolean) => {
      if (text) {
        setRevealedSentences((prev) => [...prev, text]);
      }
      if (done) {
        // All audio finished — finalize message
        setIsStreamingTts(false);
        setPendingFullText((fullText) => {
          if (fullText) {
            const msg: Message = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: fullText,
              timestamp: Date.now(),
            };
            setMessages((msgs) => [...msgs, msg]);
          }
          return null;
        });
        setRevealedSentences([]);
      }
    };
  }, [tts.onChunkDone]);

  // Wire up LLM completion
  useEffect(() => {
    llm.onComplete.current = (fullText: string) => {
      if (tts.isLoaded && isStreamingTts) {
        // TTS is streaming — wait for audio to finish before adding message
        setPendingFullText(fullText);
      } else {
        // No TTS — add message immediately (current behavior)
        const msg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: fullText,
          timestamp: Date.now(),
        };
        setMessages((msgs) => [...msgs, msg]);
      }
    };
  }, [llm.onComplete, tts.isLoaded, isStreamingTts]);
```

- [ ] **Step 3: Update `sendToLlm` to start streaming TTS**

Replace the existing `sendToLlm` callback:

```typescript
  const sendToLlm = useCallback(
    async (userText: string) => {
      // Cancel any previous generation
      if (currentRequestIdRef.current) {
        tts.stopStreaming();
        await invoke("cancel_generation", {
          requestId: currentRequestIdRef.current,
        }).catch(() => {});
      }

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: userText,
        timestamp: Date.now(),
      };
      setMessages((msgs) => [...msgs, userMsg]);
      setRevealedSentences([]);
      setIsStreamingTts(false);
      setPendingFullText(null);

      const systemPrompt = getSystemPrompt(settings.language, settings.mode);
      const allMessages = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userText },
      ];

      try {
        const requestId = await llm.sendMessage(
          allMessages,
          settings.llmTemperature,
          tts.isLoaded,
          settings.ttsSpeed,
        );
        currentRequestIdRef.current = requestId;

        // Start listening for TTS chunks if TTS is loaded
        if (tts.isLoaded) {
          setIsStreamingTts(true);
          await tts.startStreaming(requestId);
        }
      } catch (e) {
        const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `[Error: ${e}]`,
          timestamp: Date.now(),
        };
        setMessages((msgs) => [...msgs, errorMsg]);
      }
    },
    [messages, settings, llm, tts],
  );
```

- [ ] **Step 4: Update MicButton interruption handler**

Update the `onRecordStop` handler to interrupt TTS:

```typescript
            onRecordStop={async () => {
              // Interrupt any playing TTS
              if (tts.isSpeaking && currentRequestIdRef.current) {
                tts.stopStreaming();
                await invoke("cancel_generation", {
                  requestId: currentRequestIdRef.current,
                }).catch(() => {});
                // Keep whatever text was already revealed as a truncated message
                if (revealedSentences.length > 0) {
                  const msg: Message = {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: revealedSentences.join(" "),
                    timestamp: Date.now(),
                  };
                  setMessages((msgs) => [...msgs, msg]);
                  setRevealedSentences([]);
                  setIsStreamingTts(false);
                  setPendingFullText(null);
                }
                currentRequestIdRef.current = null;
              }

              const text = await stt.stopAndTranscribe(settings.language);
              if (text) {
                sendToLlm(text);
              }
            }}
```

- [ ] **Step 5: Add `useRef` import and remove unused `listen` import if present**

Ensure the imports include `useRef`:

```typescript
import { useState, useCallback, useEffect, useRef } from "react";
```

- [ ] **Step 6: Pass streaming props to ChatView**

Update the ChatView usage:

```typescript
        <ChatView
          messages={messages}
          streamingText={llm.streamingText}
          revealedText={revealedSentences.join(" ")}
          isStreamingTts={isStreamingTts}
          language={settings.language}
        />
```

- [ ] **Step 7: Remove old TTS voice change useEffect**

Remove the `settings.ttsVoice` useEffect that called `tts.loadVoice` with engine params (already partially cleaned up from chatterbox removal), and the auto-speak from `onComplete`.

- [ ] **Step 8: Verify TypeScript compiles**

Run: `cd /Users/ysh/proj/speak-easy && npx tsc --noEmit`
Expected: may have errors in ChatView.tsx (expected — updated in next task)

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire up streaming TTS pipeline in App with interruption and reveal"
```

---

### Task 9: Update `ChatView.tsx` for progressive text reveal

**Files:**

- Modify: `src/components/ChatView.tsx`

- [ ] **Step 1: Update the component props and display logic**

Update the interface and component:

```typescript
interface ChatViewProps {
  messages: Message[];
  streamingText: string;
  revealedText?: string;
  isStreamingTts?: boolean;
  language?: Language;
}

export function ChatView({
  messages,
  streamingText,
  revealedText,
  isStreamingTts,
  language,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streamingText, revealedText]);
```

Replace the streaming text display section (the `{streamingText && (...)}` block) with:

```typescript
      {/* Streaming TTS: show revealed text */}
      {isStreamingTts && revealedText && (
        <div className="flex justify-start">
          <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-md bg-[var(--bg-elevated)] text-[var(--text-primary)]">
            <p className="whitespace-pre-wrap">
              {revealedText}
              <span className="inline-block w-1.5 h-4 ml-1 bg-[var(--primary)] animate-pulse rounded-sm" />
            </p>
          </div>
        </div>
      )}

      {/* Fallback: streaming text without TTS */}
      {!isStreamingTts && streamingText && (
        <div className="flex justify-start">
          <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-md bg-[var(--bg-elevated)] text-[var(--text-primary)]">
            {streamingText}
            <span className="inline-block w-2 h-4 ml-1 bg-[var(--primary)] animate-pulse" />
          </div>
        </div>
      )}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/ysh/proj/speak-easy && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Verify Rust compiles too**

Run: `cd src-tauri && cargo check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/ChatView.tsx
git commit -m "feat: ChatView progressive text reveal during streaming TTS"
```

---

## Chunk 3: Integration Testing

### Task 10: Manual integration test

**Files:** none (manual testing)

- [ ] **Step 1: Build and run the app**

Run: `cd /Users/ysh/proj/speak-easy && npm run tauri dev`
Expected: app launches, setup wizard or main screen appears

- [ ] **Step 2: Test streaming TTS (happy path)**

1. Ensure LLM, Whisper, and Kokoro TTS are loaded (green indicators)
2. Type a message like "Tell me a short story about a cat. Make it three sentences."
3. Expected: text appears sentence-by-sentence in the chat as each sentence finishes playing. Audio plays without gaps between sentences.

- [ ] **Step 3: Test interruption**

1. While AI is speaking, press the mic button
2. Expected: audio stops immediately, whatever text was revealed stays in chat as a truncated message, mic starts recording

- [ ] **Step 4: Test fallback (TTS not loaded)**

1. If possible, test with TTS not loaded (skip TTS in setup wizard)
2. Type a message
3. Expected: text streams in real-time as before (no audio, no reveal delay)

- [ ] **Step 5: Test CJK languages**

1. Switch to Chinese or Japanese
2. Send a message
3. Expected: sentence boundaries detected correctly for CJK punctuation, audio plays per sentence

- [ ] **Step 6: Commit any fixes needed**

```bash
git add -A
git commit -m "fix: integration test fixes for streaming TTS"
```
