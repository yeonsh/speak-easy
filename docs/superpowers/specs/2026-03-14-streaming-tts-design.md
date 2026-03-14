# Streaming TTS Design

## Goal

Achieve near-realtime spoken AI responses by synthesizing and playing audio sentence-by-sentence as the LLM streams tokens, rather than waiting for the complete response. Text is hidden until its corresponding audio finishes playing (reveal-on-speak).

## Architecture

Sentence-chunked pipeline with Rust-side orchestration (Approach A). The existing LLM token streaming stays intact. A parallel TTS pipeline on the Rust side detects sentence boundaries, synthesizes each sentence independently, and emits audio chunks to the frontend. An AudioWorklet queues and plays chunks as they arrive, signaling per-chunk completion so the frontend can reveal text progressively.

## Data Flow

```
User sends message
       |
       v
[chat.rs] LLM SSE stream begins
       |
       ├──> emit("chat-stream-{id}", token)     ──> [Frontend] accumulates into hidden buffer
       |
       └──> feed token to SentenceBuffer
                    |
                    v (sentence complete)
            [TTS worker thread] synthesize_speech(sentence)
                    |
                    v
            emit("tts-chunk-{id}", { samples, sample_rate, index, text, done })
                    |
                    v
            [AudioWorklet] plays chunk, signals "chunk N done"
                    |
                    v
            [React] reveals sentence N in chat view
```

If TTS is not loaded, `chat-stream` events render text immediately (current behavior, unchanged).

## Rust Backend

### SentenceBuffer

A struct in `chat.rs` that accumulates LLM tokens and detects sentence boundaries.

- Splits on `.` `!` `?` followed by whitespace, uppercase letter, or end-of-stream.
- Also splits on CJK sentence-ending punctuation: `\u3002` (ideographic full stop), `\uFF01` (fullwidth exclamation), `\uFF1F` (fullwidth question mark).
- Handles edge cases: abbreviations (`Dr.`, `U.S.`), decimal numbers (`3.14`) — only splits when the character after punctuation is a space or uppercase letter, or it's end-of-stream.
- Max length threshold (~200 characters). If reached without a sentence boundary, flushes whatever it has. Prevents unbounded buffering.

### TTS Worker Thread

When `send_chat_message` starts:
1. A `std::sync::mpsc` channel is created (sender in SSE reader, receiver in TTS worker).
2. A TTS worker thread is spawned. It pulls sentences off the channel, calls the core synthesis function, and emits `tts-chunk-{requestId}` events.
3. Each event carries: `{ samples: Vec<f32>, sample_rate: u32, index: u32, text: String, done: bool }`.
4. When the LLM stream ends, a sentinel value is sent through the channel. The TTS worker synthesizes the final buffered sentence and emits the last chunk with `done: true`.

### Core Synthesis Function

The synthesis logic in `tts.rs` is extracted into a public function callable from the TTS worker thread — not just through Tauri command dispatch. Signature:

```rust
pub fn synthesize_text(state: &TtsState, text: &str, speed: f32) -> Result<TtsResult, String>
```

The existing `synthesize_speech` Tauri command becomes a thin wrapper around this function. No duplication.

**Threading notes:**
- The TTS worker thread obtains `Arc<TtsState>` via `app.state::<TtsState>()` (Tauri wraps managed state in `Arc` internally).
- Synthesis calls are serialized by the session mutex — one sentence at a time. This is correct for the pipeline: sentences are synthesized in order, and Kokoro is fast enough per sentence (~100-400ms) that serialization is not a bottleneck.
- Sample data in `tts-chunk` events is JSON-serialized. If profiling shows this is a bottleneck (a 3s sentence is ~72K floats), switch to Tauri's binary IPC channel in a follow-up.

### Cancellation

A new Tauri command: `cancel_generation(request_id: String)`.

An `AtomicBool` cancel flag is shared between the SSE reader and the TTS worker. When set:
- SSE reader stops reading and closes the HTTP connection.
- TTS worker drains the channel without synthesizing remaining sentences.
- A `tts-stop-{requestId}` event is emitted to the frontend.

The flag is stored in a `HashMap<String, Arc<AtomicBool>>` on `LlmState` (or a new shared state), keyed by request ID.

### Changes to `chat.rs`

The `send_chat_message` function gains:

- New parameters: `request_id: String`, `tts_enabled: Option<bool>`, `tts_speed: Option<f32>`.
- `SentenceBuffer` creation and token feeding.
- mpsc channel creation and TTS worker thread spawn.
- Cancel flag creation and storage.
- On each token: emit `chat-stream` event (unchanged) AND feed to `SentenceBuffer`.
- On sentence boundary: send sentence text through channel.
- On stream end: send sentinel. The SSE reader thread joins the TTS worker thread before exiting, ensuring all chunks are emitted before the thread terminates.

### Changes to `tts.rs`

- Extract `synthesize_text()` public function from `synthesize_speech` command.
- `synthesize_speech` command becomes a wrapper that calls `synthesize_text()`.
- No other changes. Voice loading, voice listing — all unchanged.

### Changes to `lib.rs`

- Register `cancel_generation` command.

## Frontend AudioWorklet

### New file: `public/ttsChunkProcessor.js`

An AudioWorklet processor that:
- Maintains a FIFO queue of PCM sample buffers.
- In `process()`, reads samples from the queue into the output buffer at 24kHz (Kokoro's sample rate).
- When a chunk is fully consumed, posts `{ type: "chunkDone", index }` back to the main thread.
- Responds to `{ type: "clear" }` by emptying the queue and resetting state (for interruption).
- Outputs silence (zeros) when the queue is empty.

## Frontend Hooks

### Changes to `useTts.ts`

Remove:
- `speak()` function and the single-`AudioBufferSourceNode` playback approach.

Add:
- `AudioWorkletNode` created once (lazy-initialized on first use, reused across responses).
- `startStreaming(requestId: string)` — listens for `tts-chunk-{requestId}` events, feeds samples to the worklet via `port.postMessage`, tracks chunk metadata (index, text).
- `stopStreaming()` — sends `{ type: "clear" }` to the worklet, calls `cancel_generation`, cleans up event listeners.
- `onChunkDone: (index: number, text: string) => void` callback — fired when the AudioWorklet reports a chunk finished playing. Exposed so App.tsx can reveal sentences.
- `isSpeaking` state — true while chunks are queued or playing.

Keep unchanged:
- `loadVoice()`, `availableVoices`, `refreshVoices()`, `isLoaded`, `error`.

### Changes to `App.tsx`

New state:
- `revealedSentences: string[]` — sentences revealed as their audio finishes playing.
- `isStreamingTts: boolean` — whether a streaming TTS response is in progress.

Modified flow:
- `sendToLlm()`: after calling `llm.sendMessage()`, also calls `tts.startStreaming(requestId)` if TTS is loaded. Note: `useLlm` must expose the current `requestId` so App.tsx can pass it to `tts.startStreaming()` and `cancel_generation`.
- `onComplete` handler: no longer calls `tts.speak()`. Instead, it marks the LLM as done. The message is added to `messages[]` only after all audio chunks finish playing (or immediately if TTS is not loaded).
- `tts.onChunkDone(index, text)`: appends `text` to `revealedSentences`.
- When all chunks are done (`done: true` chunk finished playing): move `revealedSentences` into a final message in `messages[]`, clear streaming state.

Interruption (mic button press while AI is speaking):
1. `tts.stopStreaming()` — clears AudioWorklet queue.
2. `invoke("cancel_generation", { requestId })` — stops LLM and TTS worker.
3. Whatever text was already revealed is kept as a truncated message in chat.

Fallback (TTS not loaded):
- `streamingText` renders immediately as before. No AudioWorklet involvement. `onComplete` adds the message directly.

Sending new message while previous is playing:
- Same as interruption: stop current playback, cancel previous generation, start new one.

### Changes to `ChatView.tsx`

New props:
- `revealedText: string` — text revealed so far by TTS playback.
- `isStreaming: boolean` — whether streaming TTS is in progress.

Display logic for in-progress response:
- If TTS loaded and streaming: show `revealedText` with a pulsing `...` indicator.
- If TTS not loaded: show `streamingText` (current behavior).
- Once complete: message added to `messages[]`, `revealedText` and `streamingText` clear.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| TTS synthesis fails on a sentence | Log error, emit `tts-chunk` with empty samples but include the text — frontend reveals sentence immediately |
| LLM returns no punctuation (long run-on) | SentenceBuffer flushes at ~200 char threshold |
| Very short response (one word) | One sentence, one chunk — works naturally |
| Empty TTS result (whitespace/punctuation only) | Skip synthesis, reveal text immediately, advance to next sentence |
| Voice not loaded / TTS in error state | Entire streaming pipeline skipped, text renders via `streamingText` fallback |
| User sends new message while response plays | Treated as interruption: stop playback, cancel generation, start new |

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src-tauri/src/chat.rs` | Modify | SentenceBuffer, TTS worker thread, cancel_generation command, tts-chunk events |
| `src-tauri/src/tts.rs` | Modify | Extract `synthesize_text()` public function |
| `src-tauri/src/lib.rs` | Modify | Register `cancel_generation` command |
| `src/hooks/useLlm.ts` | Modify | Expose `currentRequestId` so App.tsx can pass it to streaming TTS and cancellation |
| `src/hooks/useTts.ts` | Modify | Replace speak() with startStreaming()/stopStreaming(), AudioWorklet lifecycle, onChunkDone |
| `src/App.tsx` | Modify | Wire up streaming TTS, revealedSentences state, interruption, fallback |
| `src/components/ChatView.tsx` | Modify | Accept revealedText/isStreaming props, conditional display |
| `public/ttsChunkProcessor.js` | Create | AudioWorklet: chunk queue, playback, per-chunk completion signaling |

## Dependencies

No new Rust crates. Uses `std::sync::mpsc` for the sentence channel and `std::sync::atomic::AtomicBool` for cancellation. Frontend uses the Web Audio API `AudioWorklet` (supported in all modern browsers and Tauri's WebView).
