# CEFR-Based Difficulty Adjustment — Design Spec

**Date:** 2026-03-22
**Status:** Approved

---

## Overview

Add CEFR (A1–C2) difficulty levels to SpeakEasy with three layers:
1. **Manual setting** — per-language selector in Sidebar, default B1
2. **Runtime heuristic** — client-side estimation nudges effective level during conversation
3. **Post-session LLM calibration** — accurate CEFR assessment after session, saved as next session's baseline

---

## Data Model

### New type (`types.ts`)
```typescript
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
```

### `AppSettings` additions
```typescript
cefrLevels: Record<Language, CefrLevel>;  // persisted baseline per language, default B1
```

`DEFAULT_SETTINGS`: all 16 languages → `"B1"`

### Runtime state (App.tsx only, not persisted)
```typescript
effectiveCefrLevel: CefrLevel  // starts = cefrLevels[language], nudged by heuristic
```

---

## System Prompt Integration (`prompts.ts`)

### Signature change
```typescript
export function getSystemPrompt(
  language: Language,
  mode: ConversationMode,
  correctionsEnabled: boolean,
  nativeLanguage: NativeLanguage,
  cefrLevel: CefrLevel,          // new
): string
```

### `CEFR_GUIDELINES` constant
| Level | Vocabulary | Response Length | Grammar |
|-------|-----------|-----------------|---------|
| A1 | ~500 most common words | 1 short sentence | Present simple, basic nouns/verbs only |
| A2 | ~1,500 words | 1–2 simple sentences | Past simple, simple questions |
| B1 | ~3,500 words | 2–3 sentences, simple connectors | Present perfect, basic conditionals |
| B2 | ~8,000 words | 3–4 sentences, varied structure | Passive, reported speech, conditionals |
| C1 | natural register | 4–5 sentences, complex | Full grammar range, some idioms |
| C2 | native-like | unrestricted | All structures, idioms, nuance |

Inserted into system prompt `base` string after current learner instruction.

---

## Client Heuristic (`lib/cefrHeuristic.ts`)

### Function signature
```typescript
export function estimateCefrAdjustment(
  userMessages: string[],
  currentLevel: CefrLevel,
  language: Language,
): CefrLevel
```

### Metrics (requires ≥5 user messages to activate)
- **Avg words/sentence** — sentence boundary split on `.!?`
- **Type-token ratio (TTR)** — unique words / total words
- **Connective usage** — count of subordinating conjunctions (because, although, however, therefore, etc.) normalized by sentence count

### Scoring → level nudge
Each metric returns a score 0–2. Sum → compare to thresholds:
- Sum ≥ 4.5: nudge up one level (cap C2)
- Sum ≤ 1.5: nudge down one level (floor A1)
- Otherwise: no change

CJK languages (zh, ja, ko): use character count instead of word count for length metric.

### Usage in App.tsx
- Called after each user message, when `messages.filter(user).length >= 5`
- `effectiveCefrLevel` updated in state
- Reset to `settings.cefrLevels[language]` on language change or session start

---

## Settings UI (`Sidebar.tsx`)

New `<SettingGroup>` for current language's CEFR level, placed after nativeLanguage selector:

```
[학습 레벨 (en)]   B1 ▾
```

Select options: A1, A2, B1, B2, C1, C2
On change: `onSettingsChange({ ...settings, cefrLevels: { ...settings.cefrLevels, [settings.language]: value } })`

Also update `effectiveCefrLevel` in App.tsx when user manually changes level.

---

## Post-Session LLM Calibration

### Rust command: `assess_cefr_level` (`chat.rs`)
```rust
#[tauri::command]
async fn assess_cefr_level(
    session_id: String,
    language: String,
    provider: String,
    api_key: String,
    api_model: String,
    custom_endpoint: String,
    // ...state
) -> Result<String, String>
```

Loads session messages from SQLite, sends to LLM with a focused prompt:
> "Review the following language learner's messages in [language]. Respond with ONLY one of: A1, A2, B1, B2, C1, C2 — the CEFR level that best describes their proficiency based on vocabulary range, sentence complexity, and grammar accuracy."

Returns: single CEFR level string.

### ReviewPanel.tsx changes
- Accept new prop: `onCefrCalibrated: (language: string, level: CefrLevel) => void`
- Invoke `assess_cefr_level` concurrently with `generate_review`
- On success: call `onCefrCalibrated`
- Show assessed level in review header: `"Assessed level: B2"`

### App.tsx changes
- Pass `onCefrCalibrated` to `ReviewPanel`
- On callback: update `settings.cefrLevels[session.language]` → triggers `save_settings`

---

## Rust Backend (`settings.rs`)

Add field to `AppSettings` struct:
```rust
#[serde(default = "default_cefr_levels")]
cefr_levels: HashMap<String, String>,
```

`default_cefr_levels()` returns all 16 language codes mapped to `"B1"`.

---

## i18n (`i18n.ts`)

New keys: `cefrLevel`, `cefrAssessed`

---

## File Change Summary

| File | Change |
|------|--------|
| `src/lib/types.ts` | `CefrLevel` type; `cefrLevels` in `AppSettings`; defaults |
| `src/lib/prompts.ts` | `CEFR_GUIDELINES`; `cefrLevel` param in `getSystemPrompt` |
| `src/lib/cefrHeuristic.ts` | New file — heuristic logic |
| `src/App.tsx` | `effectiveCefrLevel` state; heuristic call; calibration callback |
| `src/components/Sidebar.tsx` | CEFR level `<SettingGroup>` |
| `src/components/ReviewPanel.tsx` | `assess_cefr_level` call; `onCefrCalibrated` prop |
| `src/lib/i18n.ts` | `cefrLevel`, `cefrAssessed` keys |
| `src-tauri/src/settings.rs` | `cefr_levels` HashMap field |
| `src-tauri/src/chat.rs` | `assess_cefr_level` command |
| `src-tauri/src/lib.rs` | Register new command |
