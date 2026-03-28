# SpeakEasy - Agent Instruction Manual

Welcome, Agent. You are operating within the `speak-easy` repository—an offline language practice desktop app built with Tauri 2, React 19, and TypeScript. It supports 16 languages utilizing three embedded AI engines (STT, LLM, TTS) and features a gamified "Speaking Courage" metric.

This document defines your standard operating procedures, commands, architectural boundaries, and strict coding guidelines.

## 1. Build, Lint, and Test Commands

Before proposing changes, ensure the codebase builds and lints cleanly. Always verify your work.

### Frontend Commands (React/Vite/TypeScript)
- **Install Dependencies:** `npm install`
- **Start Dev Server (UI only):** `npm run dev` (Runs Vite on port 1420)
- **Type-Check (Strict):** `npx tsc --noEmit` (Run this after every frontend change)
- **Build Frontend:** `npm run build` (Runs `tsc && vite build`)
- **Build + Start Full App:** `npm run serve` (Build frontend, then start Tauri dev)
- **Preview Production Build:** `npm run preview`

### Backend Commands (Rust/Tauri)
- **Check Compilation:** `cd src-tauri && cargo check` (Run this after every backend change)
- **Lint Code (Strict):** `cd src-tauri && cargo clippy -- -D warnings`
- **Start Full App (Dev Mode):** `npm run tauri dev`
- **Build Full App (Release):** `npm run tauri build`

### Running Tests
If testing frameworks are introduced, standard commands apply.
- **Run All Rust Tests:** `cd src-tauri && cargo test`
- **Run a Single Rust Test:** `cd src-tauri && cargo test <test_name> -- --nocapture`
*(Note: Always use `--nocapture` when debugging a single test to view print statements and standard output.)*
- **Run Frontend Tests:** `npx vitest run` (If Vitest is configured)
- **Run a Single Frontend Test:** `npx vitest run -t "test name"`

---

## 2. Code Style & Conventions

Adhere strictly to the existing style and architecture. Mimic surrounding code structure.

### 2.1 Frontend (React 19, TypeScript, Tailwind CSS v4)
- **Naming Conventions:** 
  - `camelCase` for variables, functions, and files (e.g., `useLlm.ts`).
  - `PascalCase` for React components (e.g., `ChatView.tsx`).
  - `UPPER_SNAKE_CASE` for global constants.
- **State Management:** 
  - Use ref-based async coordination (`useRef`) for cross-render-cycle state (e.g., `sessionIdRef`, `pendingFullTextRef`, `explainCacheRef`).
  - Maintain per-language message isolation (e.g., `messagesByLangRef`).
- **Hooks & Event Listeners:** 
  - Strict cleanup is required to prevent memory leaks. Always use `useRef<UnlistenFn>` patterns for Tauri event listeners.
- **Styling:** 
  - Use Tailwind CSS v4 alongside CSS custom properties (`var(--primary)`, `var(--text-bubble-user)`) for light/dark mode theming.
  - Avoid inline styles.
- **TypeScript:** 
  - Strict mode is ON. Resolve all `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch` warnings. 
  - Do not use `any`; define strict interfaces/types in `src/lib/types.ts`.
- **Imports:** 
  - Group imports logically: React/external libraries first, then absolute imports, then relative paths.
- **Comments:** 
  - Only document "why" for complex orchestration logic. Do not explain "what" a standard React hook does.

### 2.2 Backend (Rust, Tauri 2)
- **Naming Conventions:** 
  - `snake_case` for functions, modules, and variables. 
  - `PascalCase` for Structs and Enums.
- **Error Handling:** 
  - Never `unwrap()` or `panic!()` in production code. 
  - Use `Result<T, String>` for all Tauri commands returning to the frontend. Map backend errors to user-friendly strings.
  - Bubble up errors properly using the `?` operator where applicable.
- **State Management:** 
  - Use atomic state per module via Tauri managed state (e.g., `LlmState`, `SttState`, `TtsState`, `DictionaryDb`).
  - In web mode, `WebState` aggregates these into a single Axum state struct shared across handlers.
  - Utilize `tokio::sync::Mutex` or `RwLock` carefully to prevent deadlocks.
- **Streaming Protocol:**
  - Handle Server-Sent Events (SSE) from `llama-server` line-by-line.
  - Sentence boundary detection must use `SentenceBuffer` and be CJK-aware.
  - In web mode, streaming events go through `EventBus` (broadcast channel) → WebSocket to the client.
- **File System:** 
  - All user data (models, voices, settings, SQLite db) must be written to `~/.speakeasy/`. 
  - **Never** write user data to the project repository directory.
- **Language Codes:** 
  - Always use strict two-letter ISO 639-1 format (e.g., "en", "es", "zh", "ja").

---

## 3. Architecture & Data Flow

- **LLM Streaming:** `sendMessage()` (UI) → `send_chat_message` (Tauri command) → `llama-server` SSE → `chat-stream-{requestId}` events (Frontend) → Frontend accumulates text → TTS chunks audio.
- **STT Pipeline:** Mic input (WebM chunks) → WAV conversion → `decode_wav_to_samples` → `transcribe_audio` (Whisper) → Returns text + detected language. (Native language mismatch — via speech or text input — automatically triggers tutor mode).
- **TTS Streaming:** Backend synthesizes sentences via Kokoro TTS (ONNX, offline) or Edge TTS (online fallback) → `tts-chunk-{requestId}` events → Web Audio Worklet plays audio in sequence.

### Dual Runtime
- **Tauri mode** (default): Desktop app with native IPC via Tauri commands.
- **Web mode**: Axum HTTP/WebSocket server (`web.rs`) exposes the same backend over REST + WS, with `event_bus.rs` broadcasting streaming events. Frontend uses `backend.ts` to abstract the difference — `invoke()` and `listen()` work in both modes. Web server runs on port 3456 (configurable via `SPEAKEASY_WEB_PORT`).

### Embedded Engines Context
1. **STT:** `whisper.cpp` via `whisper-rs`. Models (base/small .bin) stored in `~/.speakeasy/models/`.
2. **LLM:** `llama-server` sidecar (local), Google Gemini API, or any OpenAI-compatible endpoint. GGUF models in `~/.speakeasy/models/`.
3. **TTS:** Kokoro ONNX offline or msedge-tts online fallback. Voices (.onnx + .npz) stored in `~/.speakeasy/voices/`.
4. **Data Persistence:** SQLite database via `rusqlite` for sessions, messages, and courage scoring.

---

## 4. Operational Rules for Agents

- **Git Commits:** 
  - Do NOT add "Co-Authored-By" lines in commit messages. 
  - Keep commit messages concise, focusing on the "why" rather than the "what".
- **Verification Loop:** 
  - After editing files, ALWAYS run the respective verification commands (`npx tsc --noEmit` for UI, `cd src-tauri && cargo check` for Rust) before considering the task complete.
- **Asset Fallbacks:** 
  - When creating new UI elements requiring assets, utilize standard Tailwind colors, simple geometric shapes, or standard HTML elements as placeholders to ensure a fully functional prototype.
- **Web Browsing for Research:** 
  - If you need to perform web browsing to look up documentation or QA a site, use the `/browse` skill from `gstack` (e.g., via the Task tool or terminal). 
  - **Never** use `mcp__claude-in-chrome__*` tools.
- **Tool Usage:** 
  - Utilize parallel tool calls (e.g., multiple `glob` or `grep` operations) to quickly understand the codebase structure before modifying it.
  - Always use absolute paths when utilizing file system tools like `read` or `write`. Construct paths by combining the repository root with the relative file path.
- **Proactiveness:** 
  - When fulfilling a request, complete reasonable, directly implied follow-up actions without asking permission, provided they are safe and adhere to conventions.

---
**Agent Directive:** Your primary goal is to safely and efficiently extend or fix this application. Fulfill the user's request thoroughly, but if an instruction implies a massive architectural shift not explicitly requested, stop and ask for clarification.
