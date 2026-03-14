# SpeakEasy

A fully offline desktop app for practicing foreign languages with AI. Speak, listen, and get corrections — all on-device, no cloud services needed.

Supports **English, Spanish, Chinese, German, and Japanese** with three practice modes: Free Talk, Scenario Role-Play, and Correction Focus.

## Architecture

Built with [Tauri 2](https://v2.tauri.app/) (Rust backend + React frontend) and three embedded AI engines:

| Engine | Purpose | Technology |
|--------|---------|------------|
| **STT** | Speech-to-text | [whisper.cpp](https://github.com/ggerganov/whisper.cpp) via `whisper-rs` |
| **LLM** | Conversation | [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server` sidecar) |
| **TTS** | Text-to-speech | [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) via ONNX runtime |

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

# Run in development mode
npm run tauri dev
```

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
  lib/                        # Types, per-language prompts
src-tauri/src/                # Rust backend
  lib.rs                      # Tauri command registration
  llm.rs                      # llama-server lifecycle management
  chat.rs                     # Streaming chat completions (SSE)
  stt.rs                      # Whisper transcription
  tts.rs                      # Kokoro TTS via ONNX runtime
  downloads.rs                # Model download with progress events
  settings.rs                 # Settings persistence
```

## Data Directories

| Path | Contents |
|------|----------|
| `~/.speakeasy/models/` | Whisper models (`.bin`) and LLM models (`.gguf`) |
| `~/.speakeasy/voices/` | Kokoro TTS model (`kokoro-v1.0.onnx`) and voice pack (`voices-v1.0.bin`) |
| `~/.speakeasy/bin/` | Downloaded `llama-server` binary |
| `~/.speakeasy/settings.json` | User preferences |

## License

See [LICENSE](LICENSE).
