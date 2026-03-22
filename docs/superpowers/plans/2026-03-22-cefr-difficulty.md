# CEFR-Based Difficulty Adjustment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-language CEFR level (A1–C2) selection, real-time client-side heuristic adjustment, system prompt integration, and post-session LLM calibration to SpeakEasy.

**Architecture:** `cefrLevels: Record<Language, CefrLevel>` in AppSettings holds the persisted per-language baseline. `effectiveCefrLevel` in App.tsx is a runtime-only state that starts from the baseline and is nudged by `cefrHeuristic.ts` during conversation. After a session ends, `assess_cefr_level` (new Rust command) sends conversation to LLM and saves the result as the new baseline.

**Tech Stack:** TypeScript/React 19, Tauri 2, Rust (serde_json, rusqlite), existing `complete_with_provider` pattern in `session.rs`.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/types.ts` | Modify | Add `CefrLevel` type; `cefrLevels` field in `AppSettings`; update `DEFAULT_SETTINGS` |
| `src/lib/cefrHeuristic.ts` | Create | Client heuristic: scores user messages → nudge level |
| `src/lib/prompts.ts` | Modify | `CEFR_GUIDELINES` constant; add `cefrLevel` param to `getSystemPrompt` |
| `src/lib/i18n.ts` | Modify | Add `cefrLevel` + `cefrAssessed` translation keys |
| `src/App.tsx` | Modify | `effectiveCefrLevel` state; heuristic call; updated `getSystemPrompt` call; calibration callback |
| `src/components/Sidebar.tsx` | Modify | CEFR level `<SettingGroup>` selector |
| `src/components/ReviewPanel.tsx` | Modify | `assess_cefr_level` invoke; `onCefrCalibrated` prop |
| `src-tauri/src/settings.rs` | Modify | `cefr_levels: HashMap<String, String>` field |
| `src-tauri/src/session.rs` | Modify | `assess_cefr_level` command (inner + tauri wrapper) |
| `src-tauri/src/lib.rs` | Modify | Register `session::assess_cefr_level` |

---

## Task 1: Add `CefrLevel` type and `cefrLevels` to AppSettings

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `CefrLevel` type and update `AppSettings`**

In `src/lib/types.ts`, after `export type LlmProvider`:

```typescript
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
```

Add to `AppSettings` interface (after `customEndpoint`):
```typescript
cefrLevels: Record<Language, CefrLevel>;
```

- [ ] **Step 2: Update `DEFAULT_SETTINGS`**

Do NOT replace the entire object — only add the `cefrLevels` field inside the existing `DEFAULT_SETTINGS`. Find the closing `};` of `DEFAULT_SETTINGS` and insert before it:

```typescript
  cefrLevels: {
    en: "B1", es: "B1", fr: "B1", zh: "B1", ja: "B1",
    de: "B1", ko: "B1", pt: "B1", it: "B1", ru: "B1",
    ar: "B1", hi: "B1", tr: "B1", id: "B1", vi: "B1", pl: "B1",
  },
```

Also add a trailing comma after the last existing field (`customEndpoint: "http://localhost:1234"`) if one is not already present.

- [ ] **Step 3: Type-check**

```bash
cd /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang && npx tsc --noEmit
```

Expected: no new errors (some may already exist from missing param — that's fine, will be fixed in later tasks).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(cefr): add CefrLevel type and cefrLevels to AppSettings"
```

---

## Task 2: Create `cefrHeuristic.ts`

**Files:**
- Create: `src/lib/cefrHeuristic.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { CefrLevel, Language } from "./types";

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

// Connectives that signal B2+ complexity
const COMPLEX_CONNECTIVES = [
  "although", "however", "therefore", "moreover", "furthermore",
  "nevertheless", "consequently", "whereas", "despite", "unless",
  "though", "since", "because", "while", "whether",
  // Spanish
  "aunque", "sin embargo", "por lo tanto", "además", "mientras",
  // French
  "cependant", "néanmoins", "donc", "pourtant", "tandis",
  // German
  "obwohl", "jedoch", "daher", "außerdem", "trotzdem",
  // Japanese/Korean connectives (romanized, won't match CJK but harmless)
];

const CJK_LANGS: Language[] = ["zh", "ja", "ko"];

function isCjk(lang: Language): boolean {
  return CJK_LANGS.includes(lang);
}

function avgWordsPerSentence(text: string, lang: Language): number {
  const sentences = text.split(/[.!?。！？]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  const total = sentences.reduce((sum, s) => {
    return sum + (isCjk(lang) ? s.trim().length / 2 : s.trim().split(/\s+/).length);
  }, 0);
  return total / sentences.length;
}

function typeTokenRatio(text: string, lang: Language): number {
  // Skip TTR for CJK — per-character split inflates uniqueness artificially
  if (isCjk(lang)) return 0.5; // neutral score, no contribution
  const words = text.toLowerCase().split(/\s+/).filter((w) => /\w/.test(w));
  if (words.length < 5) return 0;
  const unique = new Set(words).size;
  return unique / words.length;
}

function connectiveScore(text: string): number {
  const lower = text.toLowerCase();
  const matches = COMPLEX_CONNECTIVES.filter((c) => lower.includes(c)).length;
  const sentences = text.split(/[.!?。！？]+/).filter((s) => s.trim().length > 0).length;
  return sentences > 0 ? matches / sentences : 0;
}

/**
 * Analyzes accumulated user messages and returns a nudged CEFR level.
 * Requires at least 5 messages to activate; returns currentLevel unchanged otherwise.
 */
export function estimateCefrAdjustment(
  userMessages: string[],
  currentLevel: CefrLevel,
  language: Language,
): CefrLevel {
  if (userMessages.length < 5) return currentLevel;

  const combined = userMessages.join(" ");

  const avgWords = avgWordsPerSentence(combined, language);
  const ttr = typeTokenRatio(combined, language);
  const connective = connectiveScore(combined);

  // Each metric scored 0–2
  const wordScore = avgWords < 5 ? 0 : avgWords < 12 ? 1 : 2;
  const ttrScore = ttr < 0.4 ? 0 : ttr < 0.6 ? 1 : 2;
  const connScore = connective < 0.1 ? 0 : connective < 0.3 ? 1 : 2;

  const total = wordScore + ttrScore + connScore;

  const idx = LEVELS.indexOf(currentLevel);
  if (total >= 5 && idx < LEVELS.length - 1) return LEVELS[idx + 1];
  if (total <= 1 && idx > 0) return LEVELS[idx - 1];
  return currentLevel;
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang && npx tsc --noEmit
```

Expected: no errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/cefrHeuristic.ts
git commit -m "feat(cefr): add client-side CEFR heuristic estimator"
```

---

## Task 3: Add CEFR guidelines to `prompts.ts`

**Files:**
- Modify: `src/lib/prompts.ts`

- [ ] **Step 1: Add import and `CEFR_GUIDELINES` constant**

At the top of `prompts.ts`, update the import to include `CefrLevel`:

```typescript
import type { ConversationMode, Language, NativeLanguage, CefrLevel } from "./types";
```

After the `CORRECTION_FOCUS` object (around line 150), add:

```typescript
const CEFR_GUIDELINES: Record<CefrLevel, string> = {
  A1: "Current learner level: A1 (beginner). Use only the ~500 most common words. Keep every response to ONE short simple sentence. Use present simple tense only. Avoid contractions, idioms, and complex grammar entirely.",
  A2: "Current learner level: A2 (elementary). Use words from the ~1,500 most common. Write 1–2 simple sentences. You may use past simple and basic question forms. Avoid subjunctive, passive, or conditional structures.",
  B1: "Current learner level: B1 (intermediate). Use vocabulary within the ~3,500 most common words. Write 2–3 sentences with simple connectors (and, but, because, so). You may use present perfect and basic conditionals (if + will).",
  B2: "Current learner level: B2 (upper-intermediate). Use natural vocabulary up to ~8,000 words. Write 3–4 sentences with varied structure. Passive voice, reported speech, and real/unreal conditionals are appropriate.",
  C1: "Current learner level: C1 (advanced). Use natural register with a wide vocabulary. Write 4–5 sentences with complex structures. Full grammar range including advanced connectives, inversion, and cleft sentences is appropriate.",
  C2: "Current learner level: C2 (proficient). Use unrestricted native-like language. Any vocabulary, idioms, nuance, and full grammatical complexity is appropriate.",
};
```

- [ ] **Step 2: Update `getSystemPrompt` signature and body**

Find `export function getSystemPrompt(` at line 690. Add `cefrLevel: CefrLevel` parameter:

```typescript
export function getSystemPrompt(
  language: Language,
  mode: ConversationMode,
  correctionsEnabled: boolean,
  nativeLanguage: NativeLanguage = "ko",
  cefrLevel: CefrLevel = "B1",
): string {
  const lang = LANGUAGE_NAMES[language];
  const nativeLang = NATIVE_LANG_NAMES[nativeLanguage];
  const cefrGuideline = CEFR_GUIDELINES[cefrLevel];

  const base = `You are a friendly and patient ${lang} language practice partner. ALWAYS respond in ${lang}. ${cefrGuideline} IMPORTANT: Do NOT use any emojis or emoticons in your responses. Use only plain text.`;
```

Note: the original `base` string had "Keep responses concise (1-3 sentences)" and "Use vocabulary appropriate for an intermediate learner" — these are now handled by `cefrGuideline`, so remove those phrases from `base` and replace with `${cefrGuideline}` as shown above.

- [ ] **Step 3: Type-check**

```bash
cd /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang && npx tsc --noEmit
```

Expected: no new errors (App.tsx call site will now have a missing-arg warning — fix in Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/lib/prompts.ts
git commit -m "feat(cefr): add CEFR guidelines to system prompt"
```

---

## Task 4: Add translation keys to `i18n.ts`

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Find existing key structure**

The `t()` function in `i18n.ts` takes a key and `NativeLanguage`. Add two new keys: `cefrLevel` and `cefrAssessed`.

Look for the `llmTemperature` key block (around line 49) to understand the structure, then add after it:

```typescript
cefrLevel: {
  ko: "학습 레벨",
  en: "Learning Level",
  es: "Nivel de Aprendizaje",
  fr: "Niveau d'Apprentissage",
  zh: "学习级别",
  ja: "学習レベル",
  de: "Lernniveau",
  pt: "Nível de Aprendizado",
  it: "Livello di Apprendimento",
  ru: "Уровень обучения",
  ar: "مستوى التعلم",
  hi: "सीखने का स्तर",
  tr: "Öğrenme Seviyesi",
  id: "Tingkat Belajar",
  vi: "Cấp độ học",
  pl: "Poziom nauki",
},
cefrAssessed: {
  ko: "측정된 레벨",
  en: "Assessed Level",
  es: "Nivel evaluado",
  fr: "Niveau évalué",
  zh: "评估级别",
  ja: "評価レベル",
  de: "Bewertetes Niveau",
  pt: "Nível avaliado",
  it: "Livello valutato",
  ru: "Оценённый уровень",
  ar: "المستوى المُقيَّم",
  hi: "मूल्यांकित स्तर",
  tr: "Değerlendirilen Seviye",
  id: "Tingkat yang Dinilai",
  vi: "Cấp độ đánh giá",
  pl: "Oceniony poziom",
},
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "feat(cefr): add cefrLevel and cefrAssessed i18n keys"
```

---

## Task 5: Update `App.tsx` — effective level state, heuristic, prompt call

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports**

Add to the existing import block at the top:
```typescript
import { estimateCefrAdjustment } from "./lib/cefrHeuristic";
import type { CefrLevel } from "./lib/types";
```

- [ ] **Step 2: Add `effectiveCefrLevel` state**

Inside the `App()` function, after the existing state declarations (around line 43), add:

```typescript
const [effectiveCefrLevel, setEffectiveCefrLevel] = useState<CefrLevel>("B1");
const effectiveCefrRef = useRef<CefrLevel>("B1");
effectiveCefrRef.current = effectiveCefrLevel;
```

- [ ] **Step 3: Sync effective level when language or baseline changes**

Add a `useEffect` after the existing settings persistence effect (after line 114):

```typescript
// Sync effective CEFR level when language changes or baseline updated
useEffect(() => {
  const baseline = settings.cefrLevels?.[settings.language] ?? "B1";
  setEffectiveCefrLevel(baseline);
}, [settings.language, settings.cefrLevels]);
```

- [ ] **Step 4: Add heuristic after each user message**

In the `sendMessage` handler (around line 410, after `setMessages((msgs) => [...msgs, userMsg])`), add:

```typescript
// Run CEFR heuristic after accumulating enough user messages
const userMsgsSoFar = [...messages.filter((m) => m.role === "user"), userMsg];
if (userMsgsSoFar.length >= 5) {
  const nudged = estimateCefrAdjustment(
    userMsgsSoFar.map((m) => m.content),
    effectiveCefrRef.current,
    settings.language,
  );
  if (nudged !== effectiveCefrRef.current) {
    setEffectiveCefrLevel(nudged);
  }
}
```

- [ ] **Step 5: Pass `effectiveCefrLevel` to `getSystemPrompt`**

Find line 421:
```typescript
const systemPrompt = getSystemPrompt(settings.language, settings.mode, settings.correctionsEnabled, settings.nativeLanguage);
```

Replace with:
```typescript
const systemPrompt = getSystemPrompt(
  settings.language,
  settings.mode,
  settings.correctionsEnabled,
  settings.nativeLanguage,
  effectiveCefrRef.current,
);
```

- [ ] **Step 6: Reset effective level on session clear**

In `handleClearChat` (line 305) only — after `setMessages([])`, add:

```typescript
setEffectiveCefrLevel(settingsRef.current.cefrLevels?.[settingsRef.current.language] ?? "B1");
```

Note: `handleEndSession` does NOT call `setMessages([])` and transitions to the ReviewPanel — no reset needed there. Language-change resets are already handled by the `useEffect` in Step 3.

- [ ] **Step 7: Add `onCefrCalibrated` callback**

Add a callback function after `handleClearChat`:

```typescript
const handleCefrCalibrated = useCallback((language: string, level: CefrLevel) => {
  setSettings((s) => ({
    ...s,
    cefrLevels: { ...s.cefrLevels, [language as Language]: level },
  }));
}, []);
```

- [ ] **Step 8: Pass `justEnded` and callback to ReviewPanel**

Find the `<ReviewPanel` JSX (around line 582). Add both new props:
```typescript
justEnded={selectedSession?.id === sessionIdRef.current}
onCefrCalibrated={handleCefrCalibrated}
```

Note: `handleEndSession` sets `selectedSession` to the ended session and then rotates `sessionIdRef.current` to a new UUID. So at render time, `selectedSession.id` will equal the *old* session ID (the one that just ended), not the new `sessionIdRef.current`. Instead, track the ended session ID explicitly by adding a `justEndedSessionIdRef`:

```typescript
const justEndedSessionIdRef = useRef<string | null>(null);
```

In `handleEndSession`, before rotating the session ID (before `sessionIdRef.current = crypto.randomUUID()`), set:
```typescript
justEndedSessionIdRef.current = sessionIdRef.current;
```

Then pass the prop as:
```typescript
justEnded={selectedSession?.id === justEndedSessionIdRef.current}
```

In `handleClearChat` and on selecting a history session (`setSelectedSession`), clear it:
```typescript
justEndedSessionIdRef.current = null;
```

- [ ] **Step 9: Type-check**

```bash
cd /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang && npx tsc --noEmit
```

Expected: errors about `onCefrCalibrated` prop not existing on ReviewPanel — fix in Task 8.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx
git commit -m "feat(cefr): add effectiveCefrLevel state, heuristic, and calibration callback in App"
```

---

## Task 6: Add CEFR selector to `Sidebar.tsx`

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Add `CefrLevel` import**

Add `CefrLevel` to the existing type import:
```typescript
import type { AppSettings, Language, LlmProvider, NativeLanguage, TtsEngine, CefrLevel } from "../lib/types";
```

- [ ] **Step 2: Add CEFR level selector**

Find the nativeLanguage `<SettingGroup>` block (around line 203). Insert a new `<SettingGroup>` **after** the nativeLanguage group and **before** the llmTemperature group:

```tsx
<SettingGroup label={`${t("cefrLevel", settings.nativeLanguage)} (${settings.language.toUpperCase()})`}>
  <select
    value={settings.cefrLevels?.[settings.language] ?? "B1"}
    onChange={(e) =>
      onSettingsChange({
        ...settings,
        cefrLevels: {
          ...settings.cefrLevels,
          [settings.language]: e.target.value as CefrLevel,
        },
      })
    }
    className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
  >
    {(["A1", "A2", "B1", "B2", "C1", "C2"] as CefrLevel[]).map((level) => (
      <option key={level} value={level}>{level}</option>
    ))}
  </select>
</SettingGroup>
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(cefr): add per-language CEFR level selector in Sidebar"
```

---

## Task 7: Update Rust `settings.rs` — add `cefr_levels`

**Files:**
- Modify: `src-tauri/src/settings.rs`

- [ ] **Step 1: Add `cefr_levels` field to `Settings` struct**

Add after the `custom_endpoint` field:

```rust
#[serde(default = "default_cefr_levels")]
pub cefr_levels: std::collections::HashMap<String, String>,
```

- [ ] **Step 2: Add `default_cefr_levels` function**

After `fn default_custom_endpoint()`:

```rust
fn default_cefr_levels() -> std::collections::HashMap<String, String> {
    let langs = ["en", "es", "fr", "zh", "ja", "de", "ko", "pt",
                 "it", "ru", "ar", "hi", "tr", "id", "vi", "pl"];
    langs.iter().map(|l| (l.to_string(), "B1".to_string())).collect()
}
```

- [ ] **Step 3: Update `impl Default for Settings`**

In the `impl Default for Settings` block, add after `custom_endpoint: default_custom_endpoint(),`:
```rust
            cefr_levels: default_cefr_levels(),
```

- [ ] **Step 4: Cargo check**

```bash
cd /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang/src-tauri && cargo check
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/settings.rs
git commit -m "feat(cefr): add cefr_levels field to Rust Settings struct"
```

---

## Task 8: Add `assess_cefr_level` command to `session.rs`

**Files:**
- Modify: `src-tauri/src/session.rs`

- [ ] **Step 1: Add `assess_cefr_level_inner` function**

After the `generate_review` function (around line 420), add:

```rust
// ── assess_cefr_level ──

pub fn assess_cefr_level_inner(
    llm: &crate::llm::LlmState,
    db: &crate::dictionary::DictionaryDb,
    session_id: &str,
    language: &str,
    provider: Option<&str>,
    api_key: Option<&str>,
    api_model: Option<&str>,
    custom_endpoint: Option<&str>,
) -> Result<String, String> {
    // Load user messages from the session
    let messages = db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT content FROM session_messages
             WHERE session_id = ?1 AND role = 'user' ORDER BY seq ASC"
        ).map_err(|e| e.to_string())?;
        let msgs: Vec<String> = stmt.query_map(params![session_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(msgs)
    })?;

    if messages.is_empty() {
        return Ok("B1".to_string());
    }

    let target_name = crate::chat::lang_name(language);
    let numbered: String = messages.iter().enumerate()
        .map(|(i, m)| format!("[{}] {}", i + 1, m))
        .collect::<Vec<_>>()
        .join("\n");

    let system_prompt = format!(
        "You are a language proficiency assessor. \
         Review the following {target_name} learner messages and determine their CEFR level. \
         Consider vocabulary range, sentence complexity, grammar accuracy, and fluency. \
         Respond with ONLY a single token — one of: A1, A2, B1, B2, C1, C2. \
         No explanation, no punctuation, nothing else."
    );

    let result = crate::chat::complete_with_provider(
        *llm.port.lock().unwrap(),
        provider.unwrap_or("local"),
        api_key.unwrap_or(""),
        api_model.unwrap_or(""),
        &system_prompt,
        &numbered,
        0.1,
        16,
        custom_endpoint,
    )?;

    let level = result.trim().to_uppercase();
    let valid = ["A1", "A2", "B1", "B2", "C1", "C2"];
    if valid.contains(&level.as_str()) {
        Ok(level)
    } else {
        Ok("B1".to_string()) // fallback
    }
}

#[tauri::command]
pub async fn assess_cefr_level(
    llm_state: tauri::State<'_, crate::llm::LlmState>,
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
    language: String,
    provider: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
    custom_endpoint: Option<String>,
) -> Result<String, String> {
    assess_cefr_level_inner(
        &llm_state,
        &db,
        &session_id,
        &language,
        provider.as_deref(),
        api_key.as_deref(),
        api_model.as_deref(),
        custom_endpoint.as_deref(),
    )
}
```

- [ ] **Step 2: Confirm `complete_with_provider` visibility in `chat.rs`**

```bash
grep "complete_with_provider" /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang/src-tauri/src/chat.rs | head -3
```

The function is `pub(crate)` — this is sufficient for access from `session.rs` (same crate). No change needed. Only add `pub` (without `(crate)`) if your grep shows it is private (no `pub` at all).

- [ ] **Step 3: Cargo check**

```bash
cd /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang/src-tauri && cargo check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/session.rs
git commit -m "feat(cefr): add assess_cefr_level command to session.rs"
```

---

## Task 9: Register `assess_cefr_level` in `lib.rs`

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add command to the invoke handler**

Find `session::generate_review,` (line 124). Add after it:

```rust
session::assess_cefr_level,
```

- [ ] **Step 2: Cargo check**

```bash
cd /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang/src-tauri && cargo check
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(cefr): register assess_cefr_level in Tauri command handler"
```

---

## Task 10: Update `ReviewPanel.tsx` — CEFR assessment call

**Files:**
- Modify: `src/components/ReviewPanel.tsx`

- [ ] **Step 1: Add `CefrLevel` import, new prop and state**

Add `CefrLevel` to the type import line:
```typescript
import type { SessionSummary, LoadedMessage, ReviewItem, NativeLanguage, CefrLevel } from "../lib/types";
```

Update `ReviewPanelProps` interface — add:
```typescript
justEnded?: boolean;  // true only for the session that just ended, not for history browsing
onCefrCalibrated?: (language: string, level: CefrLevel) => void;
```

Update destructuring:
```typescript
export function ReviewPanel({ session, nativeLanguage, settings, onBack, onDelete, justEnded, onCefrCalibrated }: ReviewPanelProps)
```

Add state inside the component:
```typescript
const [cefrAssessed, setCefrAssessed] = useState<CefrLevel | null>(null);
```

- [ ] **Step 2: Add CEFR assessment call alongside `loadReview`**

After the `loadReview` function definition, add a new function. Use granular dependency array (not whole `settings` object) to avoid spurious re-runs:

```typescript
const loadCefrAssessment = useCallback(async () => {
  if (!justEnded) return; // only run for freshly ended sessions, not history browsing
  try {
    const level = await invoke<string>("assess_cefr_level", {
      sessionId: session.id,
      language: session.language,
      provider: settings.llmProvider,
      apiKey: settings.geminiApiKey,
      apiModel: settings.geminiModel,
      customEndpoint: settings.customEndpoint,
    });
    const cefrLevel = level as CefrLevel;
    setCefrAssessed(cefrLevel);
    onCefrCalibrated?.(session.language, cefrLevel);
  } catch (e) {
    console.error("CEFR assessment failed:", e);
  }
}, [
  justEnded,
  session.id,
  session.language,
  settings.llmProvider,
  settings.geminiApiKey,
  settings.geminiModel,
  settings.customEndpoint,
  onCefrCalibrated,
]);
```

- [ ] **Step 3: Fix `loadReview` dep array and fire assessment alongside review on mount**

The existing `loadReview` `useCallback` at line 54 is missing `settings.customEndpoint` from its dependency array. Fix it while you're here:

```typescript
const loadReview = useCallback(async () => {
  // ... existing body unchanged ...
}, [session.id, nativeLanguage, settings.llmProvider, settings.geminiApiKey, settings.geminiModel, settings.customEndpoint]);
```

Then find the `useEffect` that calls `loadReview()` (around line 62):
```typescript
useEffect(() => {
  loadReview();
}, [loadReview]);
```

Replace with:
```typescript
useEffect(() => {
  loadReview();
  loadCefrAssessment();
}, [loadReview, loadCefrAssessment]);
```

- [ ] **Step 4: Display assessed level in the review header**

In the ReviewPanel JSX header section, find where the date/time is shown (around line 67). After the date/time display, add:

```tsx
{cefrAssessed && (
  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--primary)] text-[var(--text-bubble-user)] font-medium">
    {t("cefrAssessed", nativeLanguage)}: {cefrAssessed}
  </span>
)}
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReviewPanel.tsx
git commit -m "feat(cefr): add CEFR assessment call and display in ReviewPanel"
```

---

## Task 11: Final verification

- [ ] **Step 1: Full TypeScript check**

```bash
cd /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Rust check**

```bash
cd /Users/ysh/proj/speak-easy/.claude/worktrees/sleepy-jang/src-tauri && cargo check
```

Expected: zero errors.

- [ ] **Step 3: Manual test checklist**

Run `npm run tauri dev` and verify:
- [ ] Sidebar shows "학습 레벨 (EN)" selector with A1–C2 options
- [ ] Changing language in LanguageBar shows different CEFR level (each language has its own)
- [ ] Changing level in Sidebar persists after app restart
- [ ] After 5+ user messages, `console.log` or DevTools confirms `effectiveCefrLevel` is being evaluated (add temporary log if needed)
- [ ] System prompt includes CEFR guideline text (check via network tab on gemini/openai-compatible, or llama-server logs)
- [ ] After ending a session and viewing ReviewPanel, "측정된 레벨: B1" badge appears
- [ ] Next session for same language starts with the calibrated level

- [ ] **Step 4: Commit any fixups**

```bash
git add -p  # stage only relevant changes
git commit -m "fix(cefr): fixups from final verification"
```
