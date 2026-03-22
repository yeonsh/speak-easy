# SpeakEasy

A desktop app for practicing foreign languages with AI. Speak, listen, and get corrections — with offline-first design and optional cloud TTS for higher quality voices. Includes a built-in web server for remote access via Tailscale or local network.

Supports **16 languages** — English, Spanish, French, Chinese, Japanese, German, Korean, Portuguese (BR), Italian, Russian, Arabic, Hindi, Turkish, Indonesian, Vietnamese, and Polish — with two practice modes (Free Talk and Scenario Role-Play) and an optional Corrections toggle. The entire interface is localized in all 16 languages.

## Features

- **Free Talk** — open conversation practice in the target language
- **Scenario Mode** — 20+ real-world situations per language (cafe, hotel, dentist, etc.) with scenario picker
- **Native Language** — choose any of the 16 supported languages as your native language; all UI, corrections, translations, and scenario descriptions adapt accordingly
- **Corrections Toggle** — enable in either mode to get grammar/meaning feedback in your native language
- **Replay** — re-listen to any message (yours or the assistant's) via TTS
- **Translate** — one-tap translation of assistant messages into your native language, pre-fetched during TTS playback for instant display
- **Word Lookup** — click any target-language word for instant dictionary lookup; select multiple words for contextual explanation with grammar and examples
- **Personal Dictionary** — save looked-up words to your dictionary; browse by language, replay pronunciation, and delete entries
- **Sample Responses** — get 2 suggested replies with native language translations
- **AI Tutor** — speak in your native language to get translations into the target language
- **CEFR Difficulty** — set your proficiency level (A1–C2) per language; AI adapts vocabulary and grammar complexity accordingly
- **Speaking Courage** — gamified scoring that tracks word count, turn count, complexity, and response speed across sessions
- **External LLM** — use Gemini API or any OpenAI-compatible endpoint as an alternative to local LLM
- **Dual TTS Engine** — Edge TTS (online, high quality) or Kokoro (offline, fully private); switchable in settings
- **Web Interface** — access from any device on your network via built-in Axum web server (port 3456); ideal for remote practice over Tailscale
- **Streaming TTS** — sentence-by-sentence audio with natural pauses between sentences
- **Voice Preview** — hear a sample phrase when selecting a voice in settings
- **Language Reset** — switching practice language resets conversation and returns to the initial screen
- **UI Localization** — interface language follows your native language setting (all 16 languages)
- **Japanese/Chinese support** — MeCab-based kanji-to-kana conversion, CJK punctuation handling

## Architecture

Built with [Tauri 2](https://v2.tauri.app/) (Rust backend + React frontend) and three embedded AI engines:

| Engine | Purpose | Technology |
|--------|---------|------------|
| **STT** | Speech-to-text | [whisper.cpp](https://github.com/ggerganov/whisper.cpp) via `whisper-rs` (bilingual detection) |
| **LLM** | Conversation | [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server` sidecar) or [Gemini API](https://ai.google.dev/) |
| **TTS** | Text-to-speech | [Edge TTS](https://github.com/BreakingOnTheEdge/msedge-tts) (online) or [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (offline) |
| **Web** | Remote access | [Axum](https://github.com/tokio-rs/axum) HTTP/WebSocket server with shared state |
| **Dictionary** | Word lookup cache + personal vocabulary | SQLite via `rusqlite` |

## Prerequisites

- **Rust** (1.70+): https://rustup.rs
- **Node.js** (18+): https://nodejs.org
- **espeak-ng** — required for Kokoro TTS phonemization (the setup wizard can install it automatically):
  - macOS: `brew install espeak-ng`
  - Windows: downloaded automatically from the [official release](https://github.com/espeak-ng/espeak-ng/releases)
  - Linux: `sudo apt install espeak-ng` or equivalent
- **Tauri 2 system dependencies**:
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux)
  - Windows: See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#windows)

## Getting Started

```bash
# Clone the repo
git clone https://github.com/yeonsh/speak-easy.git
cd speak-easy

# Install dependencies
npm install

# Run in development mode (desktop + web server)
npm run serve
```

This builds the frontend and starts the Tauri app with an embedded web server on port 3456.

### Remote Access via Tailscale

1. Install [Tailscale](https://tailscale.com/) on both machines
2. Run `npm run serve` on your home machine
3. Access `http://<tailscale-ip>:3456` from any device on your tailnet

The web interface shares all state with the desktop app — models load once and are available to both interfaces. The web server port is configurable via `SPEAKEASY_WEB_PORT` environment variable.

On first launch, the **setup wizard** will guide you through downloading all required models:

1. **Whisper model** (~150 MB) — for speech recognition
2. **llama-server binary** (~45 MB) — the LLM inference engine
3. **GGUF language model** — pick one:
   - Qwen3 4B (~2.5 GB) — fast, good for casual practice
   - Qwen3 30B-A3B (~17 GB) — higher quality conversations
4. **espeak-ng** — phonemizer for TTS (auto-install via Homebrew on macOS or MSI on Windows)
5. **Kokoro TTS** — two files covering all languages:
   - Kokoro model (~325 MB) — the neural TTS engine
   - Voice pack (~28 MB) — 50+ voices across all supported languages

Everything downloads with one click. All files are stored in `~/.speakeasy/`.

## Building for Production

```bash
npm run tauri build
```

The output is in `src-tauri/target/release/bundle/`.

## Project Structure

```
src/                          # React frontend
  components/                 # UI: ChatView, MicButton, SetupWizard, etc.
  hooks/                      # useLlm, useStt, useTts, useAudioRecorder
  lib/                        # Types, per-language prompts, i18n, backend adapter
src-tauri/src/                # Rust backend
  lib.rs                      # Tauri command registration
  llm.rs                      # llama-server lifecycle management
  chat.rs                     # Streaming chat + TTS pipeline, explain/suggest/lookup commands
  gemini.rs                   # Gemini API integration (streaming + non-streaming)
  dictionary.rs               # SQLite dictionary cache + personal vocabulary store
  courage.rs                  # Speaking courage scoring algorithm and trend analysis
  session.rs                  # Session persistence and review generation
  stt.rs                      # Whisper transcription with bilingual detection
  tts.rs                      # TTS engine dispatch (Kokoro/Edge), text cleaning, sentence splitting
  edge_tts.rs                 # Edge TTS via msedge-tts (online)
  downloads.rs                # Model download with progress events
  settings.rs                 # Settings persistence
  web.rs                      # Axum web server (REST API, WebSocket, static files)
  event_bus.rs                # Broadcast channel for Tauri-to-WebSocket event bridging
```

## Data Directories

| Path | Contents |
|------|----------|
| `~/.speakeasy/models/` | Whisper models (`.bin`) and LLM models (`.gguf`) |
| `~/.speakeasy/voices/` | Kokoro TTS model (`kokoro-v1.0.onnx`) and voice pack (`voices-v1.0.bin`) |
| `~/.speakeasy/bin/` | Downloaded `llama-server` binary |
| `~/.speakeasy/settings.json` | User preferences (persisted across sessions) |
| `~/.speakeasy/dictionary.db` | SQLite cache for word lookups, personal vocabulary, sessions, and courage scores |

## License

See [LICENSE](LICENSE).
