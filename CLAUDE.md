# SpeakEasy

Offline language practice desktop app built with Tauri 2 + React 19 + TypeScript. Supports 16 languages with three embedded AI engines (STT, LLM, TTS) and gamified learning through "Speaking Courage" metrics.

## Commands

- `npm run dev` — Start Vite dev server (frontend only, port 1420)
- `npm run tauri dev` — Start full Tauri app in dev mode
- `npm run build` — Build frontend (runs `tsc && vite build`)
- `npx tsc --noEmit` — Type-check TypeScript
- `cd src-tauri && cargo check` — Check Rust compilation

## Project Structure

```
src/                              # React frontend (TypeScript, Tailwind CSS v4)
├── App.tsx                       # Main orchestrator: state, conversation modes, TTS streaming
├── main.tsx                      # React root mounting
├── styles/app.css                # Tailwind v4 + CSS custom properties for theming
├── components/
│   ├── ChatView.tsx              # Message rendering, streaming, word lookup, scenario selection
│   ├── SetupWizard.tsx           # Model download/installation flow with progress
│   ├── Sidebar.tsx               # Settings: language, LLM/STT/TTS config, voice preview
│   ├── CourageScore.tsx          # Gamification dashboard: courage metrics and trends
│   ├── SessionHistoryPanel.tsx   # Session browsing and selection
│   ├── ReviewPanel.tsx           # Post-session review with corrections
│   ├── ServerStatus.tsx          # Bottom status bar (LLM/STT/TTS readiness)
│   ├── LanguageBar.tsx           # Language selector with emoji flags
│   └── MicButton.tsx             # Animated mic button with recording state
├── hooks/
│   ├── useLlm.ts                # LLM state: server lifecycle, streaming chat, provider switching
│   ├── useStt.ts                # Whisper model loading, audio transcription
│   ├── useTts.ts                # TTS streaming via Web Audio Worklet, voice management
│   └── useAudioRecorder.ts      # WebM→WAV conversion, mic input at 16kHz
└── lib/
    ├── types.ts                  # Complete type system (Language, Message, AppSettings, etc.)
    ├── prompts.ts                # Per-language system prompts and 20+ scenario starters
    └── i18n.ts                   # i18n strings for all 16 languages

src-tauri/                        # Rust backend (Tauri 2)
├── Cargo.toml                    # whisper-rs, ort, rusqlite, ureq, msedge-tts, etc.
├── tauri.conf.json               # App config: 720×720 window, shell plugin
└── src/
    ├── lib.rs                    # Tauri command registration (~50 commands) and state setup
    ├── main.rs                   # Entry point
    ├── llm.rs                    # llama-server subprocess management, auto port discovery
    ├── chat.rs                   # SSE streaming from llama-server, Gemini API, TTS chunk coordination
    ├── stt.rs                    # whisper-rs wrapper, language detection, audio padding
    ├── tts.rs                    # Kokoro TTS (offline ONNX) + Edge TTS (online fallback)
    ├── gemini.rs                 # Gemini API wrapper: streaming completions, word lookup
    ├── session.rs                # SQLite persistence: sessions, messages, reviews
    ├── courage.rs                # Speaking courage scoring algorithm and trend analysis
    ├── downloads.rs              # Model manifest, download with progress events
    ├── edge_tts.rs               # msedge-tts streaming wrapper
    ├── dictionary.rs             # SQLite schema initialization
    └── settings.rs               # Settings persistence (~/.speakeasy/settings.json)
```

## Architecture

### Three Embedded Engines

1. **STT**: whisper.cpp via `whisper-rs` — models (base/small .bin) in `~/.speakeasy/models/`
2. **LLM**: `llama-server` sidecar (PATH or bundled) — GGUF models (Qwen3 4B/30B) in `~/.speakeasy/models/`
3. **TTS**: Kokoro via ONNX runtime (`ort`, offline) or Edge TTS (online fallback) — voices (.onnx + .npz embeddings) in `~/.speakeasy/voices/`

### LLM Providers

- **local**: llama-server sidecar with GGUF models
- **gemini**: Google Gemini API (requires API key)

### Data Flow

**LLM streaming**: `sendMessage()` → invoke `send_chat_message` → llama-server SSE → `chat-stream-{requestId}` events → frontend accumulates streaming text → TTS picks up sentence-chunked audio

**STT pipeline**: mic → WebM chunks → WAV conversion → `decode_wav_to_samples` → `transcribe_audio` (Whisper) → text + detected language → native language mismatch triggers tutor mode

**TTS streaming**: Backend synthesizes sentences → `tts-chunk-{requestId}` events → Web Audio Worklet plays audio → sentences revealed as audio completes

### Conversation Modes

- **free-talk**: Open conversation with optional corrections
- **scenario**: Role-play scenarios (20+ per language: restaurant, job interview, doctor, etc.)
- **tutor mode** (auto-triggered): When STT detects user spoke in native language instead of target language

### Speaking Courage Scoring

Weighted algorithm: word count (35%), turn count (25%), complex sentence ratio (20%), quick response ratio (15%), session duration (5%). CJK-aware word counting and connective-based complexity detection. Tracks trends vs last session and 10-session averages.

## Key Conventions

### Frontend

- **Naming**: camelCase for TypeScript
- **Ref-based async coordination**: `sessionIdRef`, `pendingFullTextRef`, `explainCacheRef` for cross-render-cycle state
- **Event listener cleanup**: `useRef<UnlistenFn>` patterns in hooks to prevent memory leaks
- **Per-language message isolation**: `messagesByLangRef` stores history per language:mode combo
- **Theming**: CSS custom properties (`var(--primary)`, `var(--text-bubble-user)`) with light/dark mode support
- **TypeScript strict mode**: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` enabled

### Backend

- **Naming**: snake_case for Rust
- **Error handling**: `Result<T, String>` for all Tauri commands
- **State management**: Atomic state per module (`LlmState`, `SttState`, `TtsState`, `DictionaryDb`) via Tauri managed state
- **Streaming protocol**: SSE from llama-server parsed line-by-line, sentence boundary detection via `SentenceBuffer` (CJK-aware)
- **Language codes**: Two-letter ISO 639-1 ("en", "es", "zh", "ja", "de", etc.)
- **File paths**: All user data under `~/.speakeasy/` (models, voices, settings, SQLite db)
- **Model formats**: GGUF for LLM, .bin for Whisper, .onnx + .npz for Kokoro TTS

## Languages

16 supported languages — English, Spanish, Chinese, German, Japanese, French, Italian, Portuguese, Korean, Arabic, Hindi, Turkish, Vietnamese, Thai, Indonesian, Russian — each with per-language system prompts, grammar focus areas, whisper language codes, and TTS voice mappings.

## Dependencies

### Frontend (npm)
- @tauri-apps/api 2.x, @tauri-apps/plugin-shell 2.x
- React 19, react-markdown
- Tailwind CSS 4, Vite 6, TypeScript 5.9

### Backend (Rust/Cargo)
- tauri 2, tauri-plugin-shell 2
- whisper-rs 0.14 (Whisper STT)
- ort 2.0 (ONNX runtime for Kokoro TTS)
- rusqlite 0.31 (bundled SQLite for sessions/courage)
- ureq 3 (HTTP client)
- msedge-tts 0.2 (Edge TTS fallback)
- zip 2 (model archive extraction)
- minimp3 0.5 (audio decoding)
