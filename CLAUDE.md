# SpeakEasy

Offline language practice desktop app built with Tauri 2 + React + TypeScript.

## Project Structure

- `src/` — React frontend (TypeScript, Tailwind CSS v4)
- `src/components/` — UI components (ChatView, MicButton, LanguageBar, Sidebar, ServerStatus, SetupWizard)
- `src/hooks/` — React hooks (useLlm, useStt, useTts, useAudioRecorder)
- `src/lib/` — Types, prompts, shared utilities
- `src-tauri/` — Rust backend (Tauri 2)
- `src-tauri/src/lib.rs` — Tauri commands registration and app entry
- `src-tauri/src/llm.rs` — llama-server sidecar management
- `src-tauri/src/chat.rs` — Streaming chat completions via SSE
- `src-tauri/src/stt.rs` — Whisper speech-to-text (whisper-rs)
- `src-tauri/src/tts.rs` — Piper text-to-speech (ONNX via ort)
- `src-tauri/src/downloads.rs` — Model download with progress events
- `src-tauri/src/settings.rs` — Settings persistence (~/.speakeasy/settings.json)

## Commands

- `npm run dev` — Start Vite dev server (frontend only)
- `npm run tauri dev` — Start full Tauri app in dev mode
- `npm run build` — Build frontend
- `npx tsc --noEmit` — Type-check TypeScript
- `cd src-tauri && cargo check` — Check Rust compilation

## Architecture

Three embedded engines:
1. **STT**: whisper.cpp via `whisper-rs` — models in `~/.speakeasy/models/`
2. **LLM**: `llama-server` sidecar (PATH or bundled) — GGUF models in `~/.speakeasy/models/`
3. **TTS**: Piper via ONNX runtime (`ort`) — voices in `~/.speakeasy/voices/`

## Languages

English, Spanish, Chinese, German, Japanese — each with per-language system prompts and whisper/TTS voice mappings.
