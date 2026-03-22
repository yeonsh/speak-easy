# OpenAI-Compatible LLM Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "OpenAI-compatible" LLM provider that connects to any external OpenAI-compatible API server (LM Studio, Ollama, vLLM, etc.) via a user-configured endpoint URL.

**Architecture:** Reuses the existing OpenAI SSE streaming protocol already implemented for the local llama-server. The only difference is the URL comes from user settings instead of the managed llama-server port. No subprocess management needed.

**Tech Stack:** Rust (Tauri backend), TypeScript/React (frontend), existing ureq HTTP client

---

### Task 1: Add settings fields (Rust backend)

**Files:**
- Modify: `src-tauri/src/settings.rs`

- [ ] **Step 1: Add `custom_endpoint` field to Settings struct**

In `src-tauri/src/settings.rs`, add after the `gemini_model` field:

```rust
#[serde(default = "default_custom_endpoint")]
pub custom_endpoint: String,
```

Add default function:

```rust
fn default_custom_endpoint() -> String { "http://localhost:1234".to_string() }
```

Add to `Default` impl:

```rust
custom_endpoint: default_custom_endpoint(),
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/settings.rs
git commit -m "feat: add custom_endpoint to backend settings"
```

---

### Task 2: Add TypeScript types and defaults

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update LlmProvider type and AppSettings**

In `src/lib/types.ts`:

Update `LlmProvider`:
```typescript
export type LlmProvider = "local" | "gemini" | "openai-compatible";
```

Add to `AppSettings` interface:
```typescript
customEndpoint: string;
```

Add to `DEFAULT_SETTINGS`:
```typescript
customEndpoint: "http://localhost:1234",
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add openai-compatible provider type and customEndpoint setting"
```

---

### Task 3: Add i18n string

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Add `openaiCompatible` i18n entry**

Add after the `localLlm` entry in `src/lib/i18n.ts`:

```typescript
openaiCompatible: {
  en: "OpenAI-Compatible", ko: "OpenAI 호환", es: "Compatible con OpenAI", fr: "Compatible OpenAI",
  zh: "OpenAI 兼容", ja: "OpenAI 互換", de: "OpenAI-kompatibel", pt: "Compatível com OpenAI",
  it: "Compatibile OpenAI", ru: "OpenAI-совместимый", ar: "متوافق مع OpenAI", hi: "OpenAI-संगत",
  tr: "OpenAI Uyumlu", id: "Kompatibel OpenAI", vi: "Tương thích OpenAI", pl: "Kompatybilny z OpenAI",
},
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "feat: add i18n strings for openai-compatible provider"
```

---

### Task 4: Update Sidebar UI

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Add provider option and endpoint input**

In `Sidebar.tsx`, in the LLM Provider `<select>`, add a third option after the Gemini option:

```tsx
<option value="openai-compatible">{t("openaiCompatible", settings.nativeLanguage)}</option>
```

After the `{settings.llmProvider === "gemini" && (...)}` block, add:

```tsx
{settings.llmProvider === "openai-compatible" && (
  <div className="mt-2 space-y-2">
    <input
      type="text"
      value={settings.customEndpoint}
      onChange={(e) =>
        onSettingsChange({ ...settings, customEndpoint: e.target.value })
      }
      placeholder="http://localhost:1234"
      className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono"
    />
    <p className="text-xs text-[var(--text-secondary)] opacity-60">
      LM Studio, Ollama, vLLM, etc.
    </p>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add openai-compatible provider UI with endpoint input"
```

---

### Task 5: Update frontend chat routing

**Files:**
- Modify: `src/hooks/useLlm.ts`
- Modify: `src/lib/backend.ts`

- [ ] **Step 1: Update sendChat type and useLlm routing**

In `src/lib/backend.ts`, update the `sendChat` function signature:

```typescript
export async function sendChat(
  provider: "local" | "gemini" | "openai-compatible",
  ...
```

In `src/hooks/useLlm.ts`, update the provider routing logic in `sendMessage`:

Replace:
```typescript
const chatProvider = (provider === "gemini" && apiKey) ? "gemini" : "local";
```

With:
```typescript
const chatProvider = provider === "gemini" ? "gemini" : "local";
```

Note: `openai-compatible` maps to `"local"` Tauri command (`send_chat_message`) since both use the same OpenAI SSE protocol. The backend distinguishes by checking the endpoint.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useLlm.ts src/lib/backend.ts
git commit -m "feat: route openai-compatible provider through local chat command"
```

---

### Task 6: Update Rust backend — streaming chat (Tauri command)

**Files:**
- Modify: `src-tauri/src/chat.rs`

- [ ] **Step 1: Add `custom_endpoint` param to `send_chat_message`**

In `src-tauri/src/chat.rs`, add `custom_endpoint: Option<String>` parameter to `send_chat_message`:

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
    language: Option<String>,
    custom_endpoint: Option<String>,
) -> Result<(), String> {
```

Replace the port check and URL construction at the top:

```rust
let url = if let Some(ref endpoint) = custom_endpoint {
    format!("{}/v1/chat/completions", endpoint.trim_end_matches('/'))
} else {
    let port = *state.port.lock().unwrap();
    if port == 0 {
        return Err("LLM server is not running".to_string());
    }
    format!("http://127.0.0.1:{}/v1/chat/completions", port)
};
```

Remove the old `let port = ...` and `if port == 0` check that preceded the URL construction.

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/chat.rs
git commit -m "feat: support custom endpoint URL in send_chat_message"
```

---

### Task 7: Update Rust backend — non-streaming completions

**Files:**
- Modify: `src-tauri/src/chat.rs`

- [ ] **Step 1: Add `custom_endpoint` to `complete_with_provider`**

Update `complete_with_provider` signature and the local branch:

```rust
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
```

- [ ] **Step 2: Update all callers of `complete_with_provider`**

Update every call site (`explain_message_inner`, `suggest_responses_inner`, `tutor_translate_inner`, `lookup_word_inner`) to pass the new `custom_endpoint` parameter. Each of these functions needs a new `custom_endpoint: Option<&str>` parameter, and their corresponding `#[tauri::command]` wrappers need `custom_endpoint: Option<String>`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/chat.rs
git commit -m "feat: support custom endpoint in complete_with_provider and all callers"
```

---

### Task 8: Update web.rs WebSocket chat handler

**Files:**
- Modify: `src-tauri/src/web.rs`

- [ ] **Step 1: Add `custom_endpoint` to WsChatSettings and handle_ws_chat**

Add `custom_endpoint: Option<String>` to the `WsChatSettings` struct, and update `handle_ws_chat` to use it when provider is `"openai-compatible"` or `"local"`:

In the SSE streaming branch (the `else` block that handles local), replace the URL construction:

```rust
let url = if let Some(ref endpoint) = settings.custom_endpoint {
    format!("{}/v1/chat/completions", endpoint.trim_end_matches('/'))
} else {
    if port == 0 {
        // error
    }
    format!("http://127.0.0.1:{}/v1/chat/completions", port)
};
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/web.rs
git commit -m "feat: support custom endpoint in web.rs chat handler"
```

---

### Task 9: Update frontend App.tsx to pass provider and endpoint

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Pass customEndpoint through the sendMessage call chain**

Find where `sendMessage` is called in `App.tsx` and ensure:
- When `llmProvider === "openai-compatible"`, pass `provider: "openai-compatible"` and include `customEndpoint` in the invocation args
- The Tauri `send_chat_message` command receives `custom_endpoint` parameter
- Similarly for `explain_message`, `suggest_responses`, `tutor_translate`, `lookup_word` — pass `customEndpoint` when provider is `openai-compatible`

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: pass customEndpoint from App.tsx to backend commands"
```

---

### Task 10: Update ServerStatus for openai-compatible

**Files:**
- Modify: `src/components/ServerStatus.tsx`

- [ ] **Step 1: Show ready status for openai-compatible without requiring local server**

When `llmProvider === "openai-compatible"`, the LLM status should show as ready (green) without needing a local llama-server to be running, similar to how Gemini works.

- [ ] **Step 2: Commit**

```bash
git add src/components/ServerStatus.tsx
git commit -m "feat: show ready status for openai-compatible provider"
```

---

### Task 11: Verify and test

- [ ] **Step 1: Run `npx tsc --noEmit`** to verify TypeScript compiles
- [ ] **Step 2: Run `cd src-tauri && cargo check`** to verify Rust compiles
- [ ] **Step 3: Manual test with LM Studio** if available
