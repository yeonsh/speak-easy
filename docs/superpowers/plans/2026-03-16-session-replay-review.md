# Session Replay + Correction Notes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save conversation sessions automatically and let users replay them with LLM-generated correction notes per utterance.

**Architecture:** New `session.rs` Rust module with 5 Tauri commands (save/list/load/review/delete). Sessions stored in existing `dictionary.db` (3 new tables). Frontend saves sessions on language/mode/scenario change and app close. Sidebar gets a "Past Sessions" section with session list and review panel. Correction notes are lazy-generated via LLM on first view.

**Tech Stack:** Rust (rusqlite, serde_json, ureq), React 19, TypeScript, Tailwind CSS v4, Tauri 2

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/session.rs` | Create | All session DB operations + generate_review |
| `src-tauri/src/dictionary.rs` | Modify | Call `session::init_tables` + `PRAGMA foreign_keys` + `with_conn` |
| `src-tauri/src/chat.rs` | Modify (1 line) | Make `lang_name` `pub(crate)` |
| `src-tauri/src/lib.rs` | Modify | Add `mod session;` + register 5 commands |
| `src-tauri/capabilities/default.json` | Modify | Add window lifecycle permission |
| `src/lib/types.ts` | Modify | Add `SessionSummary`, `ReviewItem`, `SavedMessage`, `LoadedMessage` |
| `src/lib/i18n.ts` | Modify | Add ~14 i18n keys for session UI |
| `src/App.tsx` | Modify | Session ID tracking, `messagesRef`, save triggers, window close handler |
| `src/components/Sidebar.tsx` | Modify | Add session list section |
| `src/components/ReviewPanel.tsx` | Create | Session detail view with replay + correction notes |

---

## Chunk 1: Rust Backend

### Task 1: Create `session.rs` with table initialization + wire into `dictionary.rs`

**Files:**
- Create: `src-tauri/src/session.rs`
- Modify: `src-tauri/src/dictionary.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `session.rs` with `init_tables`**

```rust
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use crate::llm::LlmState;
use crate::chat::{complete_with_provider, lang_name};

/// Initialize session-related tables in the dictionary DB.
pub fn init_tables(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
            id               TEXT PRIMARY KEY,
            language         TEXT NOT NULL,
            mode             TEXT NOT NULL,
            scenario_context TEXT,
            scenario_title   TEXT,
            started_at       INTEGER NOT NULL DEFAULT (unixepoch()),
            ended_at         INTEGER,
            msg_count        INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS session_messages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            role       TEXT NOT NULL,
            content    TEXT NOT NULL,
            seq        INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS session_reviews (
            session_id  TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
            review_json TEXT NOT NULL,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );"
    ).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Add `with_conn` and `PRAGMA foreign_keys` to `dictionary.rs`**

In `src-tauri/src/dictionary.rs`, add `with_conn` method to `DictionaryDb` impl block (after `put`):

```rust
pub fn with_conn<F, T>(&self, f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let conn = self.conn.lock().map_err(|e| e.to_string())?;
    f(&conn)
}
```

In the `open()` method, after `Connection::open(&db_path)` (line 17) and before the `CREATE TABLE IF NOT EXISTS lookups` block, add:

```rust
conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;
```

After the lookups table creation (line 29, before `Ok(Self ...)`), add:

```rust
crate::session::init_tables(&conn)?;
```

- [ ] **Step 3: Add `mod session;` to `lib.rs`**

After line 10 (`mod tts;`):

```rust
mod session;
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/ysh/proj/speak-easy/src-tauri && cargo check 2>&1 | tail -5`
Expected: compilation succeeds (warnings about unused imports OK for now)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/session.rs src-tauri/src/dictionary.rs src-tauri/src/lib.rs
git commit -m "feat(session): add session tables schema and init_tables"
```

---

### Task 2: Implement `save_session` command

**Files:**
- Modify: `src-tauri/src/session.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add serde types and `save_session` to `session.rs`**

Append to `session.rs`:

```rust
#[derive(Debug, Deserialize)]
pub struct SavedMessage {
    role: String,
    content: String,
    seq: i64,
}

#[tauri::command]
pub async fn save_session(
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
    language: String,
    mode: String,
    scenario_context: Option<String>,
    messages: Vec<SavedMessage>,
) -> Result<(), String> {
    let user_count = messages.iter().filter(|m| m.role == "user").count();
    if user_count < 2 {
        eprintln!("[session] skipping save: only {} user messages", user_count);
        return Ok(());
    }

    let scenario_title = scenario_context.as_ref().map(|ctx| {
        ctx.lines().next().unwrap_or("").to_string()
    });
    let msg_count = messages.len() as i64;

    db.with_conn(|conn| {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

        // Upsert session metadata
        // On conflict: only update ended_at and msg_count (language/mode/scenario are immutable per session)
        tx.execute(
            "INSERT INTO sessions (id, language, mode, scenario_context, scenario_title, msg_count, ended_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, unixepoch())
             ON CONFLICT(id) DO UPDATE SET ended_at = unixepoch(), msg_count = ?6",
            params![session_id, language, mode, scenario_context, scenario_title, msg_count],
        ).map_err(|e| e.to_string())?;

        // Replace messages (idempotent re-save)
        tx.execute(
            "DELETE FROM session_messages WHERE session_id = ?1",
            params![session_id],
        ).map_err(|e| e.to_string())?;

        for msg in &messages {
            tx.execute(
                "INSERT INTO session_messages (session_id, role, content, seq)
                 VALUES (?1, ?2, ?3, ?4)",
                params![session_id, msg.role, msg.content, msg.seq],
            ).map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        eprintln!("[session] saved session {} ({} msgs, {} user)", session_id, msg_count, user_count);
        Ok(())
    })
}
```

- [ ] **Step 2: Register in `lib.rs`**

Add to `generate_handler![]` (after the gemini commands):

```rust
session::save_session,
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/ysh/proj/speak-easy/src-tauri && cargo check 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/session.rs src-tauri/src/lib.rs
git commit -m "feat(session): implement save_session with transaction"
```

---

### Task 3: Implement `list_sessions` and `load_session_messages`

**Files:**
- Modify: `src-tauri/src/session.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add query commands to `session.rs`**

Append to `session.rs`:

```rust
#[derive(Debug, Serialize)]
pub struct SessionSummary {
    id: String,
    language: String,
    mode: String,
    scenario_title: Option<String>,
    started_at: i64,
    msg_count: i64,
    has_review: bool,
}

#[tauri::command]
pub async fn list_sessions(
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    language: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<SessionSummary>, String> {
    db.with_conn(|conn| {
        let limit = limit.unwrap_or(50);
        let mut stmt = conn.prepare(
            "SELECT s.id, s.language, s.mode, s.scenario_title, s.started_at, s.msg_count,
                    EXISTS(SELECT 1 FROM session_reviews r WHERE r.session_id = s.id) as has_review
             FROM sessions s
             WHERE (?1 IS NULL OR s.language = ?1)
             ORDER BY s.started_at DESC
             LIMIT ?2"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map(params![language, limit], |row| {
            Ok(SessionSummary {
                id: row.get(0)?,
                language: row.get(1)?,
                mode: row.get(2)?,
                scenario_title: row.get(3)?,
                started_at: row.get(4)?,
                msg_count: row.get(5)?,
                has_review: row.get(6)?,
            })
        }).map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

#[derive(Debug, Serialize)]
pub struct LoadedMessage {
    role: String,
    content: String,
    seq: i64,
}

#[tauri::command]
pub async fn load_session_messages(
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
) -> Result<Vec<LoadedMessage>, String> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT role, content, seq FROM session_messages
             WHERE session_id = ?1 ORDER BY seq ASC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map(params![session_id], |row| {
            Ok(LoadedMessage {
                role: row.get(0)?,
                content: row.get(1)?,
                seq: row.get(2)?,
            })
        }).map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}
```

- [ ] **Step 2: Register both commands in `lib.rs`**

Add to `generate_handler![]`:

```rust
session::list_sessions,
session::load_session_messages,
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/ysh/proj/speak-easy/src-tauri && cargo check 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/session.rs src-tauri/src/lib.rs
git commit -m "feat(session): implement list_sessions and load_session_messages"
```

---

### Task 4: Implement `delete_session`

**Files:**
- Modify: `src-tauri/src/session.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `delete_session` to `session.rs`**

Append:

```rust
#[tauri::command]
pub async fn delete_session(
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
) -> Result<(), String> {
    db.with_conn(|conn| {
        conn.execute(
            "DELETE FROM sessions WHERE id = ?1",
            params![session_id],
        ).map_err(|e| e.to_string())?;
        eprintln!("[session] deleted session {}", session_id);
        Ok(())
    })
}
```

- [ ] **Step 2: Register in `lib.rs`**

Add to `generate_handler![]`:

```rust
session::delete_session,
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/ysh/proj/speak-easy/src-tauri && cargo check 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/session.rs src-tauri/src/lib.rs
git commit -m "feat(session): implement delete_session with cascade"
```

---

### Task 5: Implement `generate_review`

**Files:**
- Modify: `src-tauri/src/session.rs`
- Modify: `src-tauri/src/chat.rs` (1 line: make `lang_name` `pub(crate)`)
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Make `lang_name` accessible**

In `src-tauri/src/chat.rs` line 620, change:

```rust
fn lang_name(code: &str) -> &str {
```

to:

```rust
pub(crate) fn lang_name(code: &str) -> &str {
```

`complete_with_provider` is already `pub(crate)` — no change needed.

- [ ] **Step 2: Add `generate_review` to `session.rs`**

Append:

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct ReviewItem {
    seq: i64,
    original: String,
    corrected: Option<String>,
    note: Option<String>,
    #[serde(rename = "errorType")]
    error_type: String,
}

#[tauri::command]
pub async fn generate_review(
    llm_state: tauri::State<'_, LlmState>,
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
    native_language: String,
    provider: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
) -> Result<Vec<ReviewItem>, String> {
    // Check cache first
    let cached = db.with_conn(|conn| {
        match conn.query_row(
            "SELECT review_json FROM session_reviews WHERE session_id = ?1",
            params![session_id],
            |row| row.get::<_, String>(0),
        ) {
            Ok(json) => Ok(Some(json)),
            Err(_) => Ok(None),
        }
    })?;
    if let Some(json_str) = cached {
        let items: Vec<ReviewItem> = serde_json::from_str(&json_str)
            .map_err(|e| format!("Cache parse error: {}", e))?;
        return Ok(items);
    }

    // Load session metadata + messages
    let (language, mode, scenario_context, messages) = db.with_conn(|conn| {
        let (lang, mode, ctx): (String, String, Option<String>) = conn.query_row(
            "SELECT language, mode, scenario_context FROM sessions WHERE id = ?1",
            params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).map_err(|e| format!("Session not found: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT role, content, seq FROM session_messages
             WHERE session_id = ?1 ORDER BY seq ASC"
        ).map_err(|e| e.to_string())?;
        let msgs: Vec<(String, String, i64)> = stmt.query_map(params![session_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

        Ok((lang, mode, ctx, msgs))
    })?;

    let user_utterances: Vec<(i64, &str)> = messages.iter()
        .filter(|(role, _, _)| role == "user")
        .map(|(_, content, seq)| (*seq, content.as_str()))
        .collect();

    if user_utterances.is_empty() {
        return Ok(vec![]);
    }

    let native_name = lang_name(&native_language);
    let target_name = lang_name(&language);
    let is_scenario = mode == "scenario" && scenario_context.is_some();

    // Build error type enum conditionally — only include "situation" for scenario mode
    let error_types = if is_scenario {
        r#""grammar", "vocab", "naturalness", "situation", "none""#
    } else {
        r#""grammar", "vocab", "naturalness", "none""#
    };

    let mut system_prompt = format!(
        "You are a {target_name} language tutor reviewing a student's conversation. \
         The student's native language is {native_name}. \
         Review ONLY the student's utterances (marked with [seq:N]).\n\n\
         For each utterance, produce a JSON object with these fields:\n\
         - \"seq\": the sequence number\n\
         - \"original\": the student's exact text\n\
         - \"corrected\": the corrected version (null if no correction needed)\n\
         - \"note\": explanation in {native_name} of what was wrong (null if perfect)\n\
         - \"errorType\": one of {error_types}\n\n\
         Error types:\n\
         - \"grammar\": grammatical error\n\
         - \"vocab\": wrong word choice\n\
         - \"naturalness\": grammatically correct but unnatural for a native speaker\n\
         - \"none\": no issues"
    );

    if is_scenario {
        let ctx = scenario_context.as_ref().unwrap();
        system_prompt.push_str(&format!(
            "\n- \"situation\": grammatically correct but inappropriate for the scenario context below\n\n\
             Scenario context:\n{ctx}"
        ));
    }

    system_prompt.push_str(
        "\n\nReturn ONLY a JSON array of objects. No markdown fences, no explanation text."
    );

    // Build conversation context
    let mut user_prompt = String::from("Full conversation:\n\n");
    for (role, content, seq) in &messages {
        if role == "user" {
            user_prompt.push_str(&format!("[seq:{}] Student: {}\n", seq, content));
        } else if role == "assistant" {
            user_prompt.push_str(&format!("Tutor: {}\n", content));
        }
    }

    let port = *llm_state.port.lock().unwrap();
    let prov = provider.as_deref().unwrap_or("local");
    let key = api_key.as_deref().unwrap_or("");
    let model = api_model.as_deref().unwrap_or("");

    eprintln!("[generate_review] session={}, provider={}, utterances={}", session_id, prov, user_utterances.len());

    let result = complete_with_provider(port, prov, key, model, &system_prompt, &user_prompt, 0.3, 4096)?;

    // Parse JSON — strip markdown fences if present
    let trimmed = result.trim();
    let json_str = if trimmed.starts_with("```") {
        trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        trimmed
    };

    let items: Vec<ReviewItem> = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse review JSON: {}. Raw: {}", e, &result[..result.len().min(200)]))?;

    // Cache
    let cache_json = serde_json::to_string(&items).map_err(|e| e.to_string())?;
    db.with_conn(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO session_reviews (session_id, review_json) VALUES (?1, ?2)",
            params![session_id, cache_json],
        ).map_err(|e| e.to_string())?;
        Ok(())
    })?;

    eprintln!("[generate_review] generated {} review items for session {}", items.len(), session_id);
    Ok(items)
}
```

- [ ] **Step 3: Register in `lib.rs`**

Add to `generate_handler![]`:

```rust
session::generate_review,
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/ysh/proj/speak-easy/src-tauri && cargo check 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/session.rs src-tauri/src/chat.rs src-tauri/src/lib.rs
git commit -m "feat(session): implement generate_review with LLM correction notes"
```

---

## Chunk 2: Frontend Integration

### Task 6: Tauri capability + TypeScript types + i18n

**Files:**
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Add window lifecycle permission to capabilities**

In `src-tauri/capabilities/default.json`, add to the `permissions` array:

```json
"core:window:allow-close",
"core:window:allow-on-close-requested"
```

The full file becomes:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for SpeakEasy",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:event:default",
    "core:event:allow-listen",
    "core:event:allow-emit",
    "shell:allow-open",
    "core:window:allow-close",
    "core:window:allow-on-close-requested"
  ]
}
```

- [ ] **Step 2: Add session types to `types.ts`**

Before `export const LANGUAGE_CONFIG`, append:

```typescript
export interface SessionSummary {
  id: string;
  language: string;
  mode: "free-talk" | "scenario";
  scenario_title: string | null;
  started_at: number;
  msg_count: number;
  has_review: boolean;
}

export interface SavedMessage {
  role: string;
  content: string;
  seq: number;
}

export interface ReviewItem {
  seq: number;
  original: string;
  corrected: string | null;
  note: string | null;
  errorType: "grammar" | "vocab" | "naturalness" | "situation" | "none";
}

export interface LoadedMessage {
  role: string;
  content: string;
  seq: number;
}
```

- [ ] **Step 3: Add i18n keys to `i18n.ts`**

Add to the `strings` object (before the closing `}`). Note: `freeTalk` already exists — do NOT duplicate it.

```typescript
pastSessions: {
  en: "Past Sessions", ko: "지난 대화", es: "Sesiones anteriores", fr: "Sessions passées",
  zh: "历史会话", ja: "過去のセッション", de: "Vergangene Sitzungen", pt: "Sessões anteriores",
  it: "Sessioni passate", ru: "Прошлые сессии", ar: "الجلسات السابقة", hi: "पिछले सत्र",
  tr: "Geçmiş oturumlar", id: "Sesi sebelumnya", vi: "Phiên trước", pl: "Poprzednie sesje",
},
correctionNotes: {
  en: "Correction Notes", ko: "교정 노트", es: "Notas de corrección", fr: "Notes de correction",
  zh: "纠正笔记", ja: "添削ノート", de: "Korrekturnotizen", pt: "Notas de correção",
  it: "Note di correzione", ru: "Заметки об ошибках", ar: "ملاحظات التصحيح", hi: "सुधार नोट्स",
  tr: "Düzeltme notları", id: "Catatan koreksi", vi: "Ghi chú sửa lỗi", pl: "Notatki korygujące",
},
noSessions: {
  en: "No sessions yet", ko: "저장된 대화가 없습니다", es: "Aún no hay sesiones", fr: "Pas encore de sessions",
  zh: "暂无会话", ja: "セッションなし", de: "Noch keine Sitzungen", pt: "Nenhuma sessão ainda",
  it: "Nessuna sessione", ru: "Сессий пока нет", ar: "لا توجد جلسات بعد", hi: "अभी तक कोई सत्र नहीं",
  tr: "Henüz oturum yok", id: "Belum ada sesi", vi: "Chưa có phiên nào", pl: "Brak sesji",
},
wellDone: {
  en: "Well done!", ko: "잘 말했어요!", es: "¡Bien hecho!", fr: "Bien dit !",
  zh: "说得好！", ja: "よく言えました！", de: "Gut gemacht!", pt: "Bem feito!",
  it: "Ben fatto!", ru: "Хорошо сказано!", ar: "أحسنت!", hi: "बहुत अच्छा!",
  tr: "Aferin!", id: "Bagus!", vi: "Giỏi lắm!", pl: "Dobrze powiedziane!",
},
generating: {
  en: "Generating...", ko: "생성 중...", es: "Generando...", fr: "Génération...",
  zh: "生成中...", ja: "生成中...", de: "Wird generiert...", pt: "Gerando...",
  it: "Generazione...", ru: "Генерация...", ar: "جارٍ الإنشاء...", hi: "उत्पन्न हो रहा है...",
  tr: "Oluşturuluyor...", id: "Menghasilkan...", vi: "Đang tạo...", pl: "Generowanie...",
},
reviewFailed: {
  en: "Failed to generate notes", ko: "교정 노트 생성 실패", es: "Error al generar notas", fr: "Échec de la génération",
  zh: "生成笔记失败", ja: "ノート生成に失敗", de: "Generierung fehlgeschlagen", pt: "Falha ao gerar notas",
  it: "Generazione fallita", ru: "Не удалось сгенерировать", ar: "فشل في إنشاء الملاحظات", hi: "नोट्स बनाने में विफल",
  tr: "Notlar oluşturulamadı", id: "Gagal membuat catatan", vi: "Tạo ghi chú thất bại", pl: "Nie udało się wygenerować",
},
retry: {
  en: "Retry", ko: "재시도", es: "Reintentar", fr: "Réessayer",
  zh: "重试", ja: "再試行", de: "Erneut versuchen", pt: "Tentar novamente",
  it: "Riprova", ru: "Повторить", ar: "إعادة المحاولة", hi: "पुनः प्रयास करें",
  tr: "Tekrar dene", id: "Coba lagi", vi: "Thử lại", pl: "Ponów",
},
deleteSession: {
  en: "Delete", ko: "삭제", es: "Eliminar", fr: "Supprimer",
  zh: "删除", ja: "削除", de: "Löschen", pt: "Excluir",
  it: "Elimina", ru: "Удалить", ar: "حذف", hi: "हटाएं",
  tr: "Sil", id: "Hapus", vi: "Xóa", pl: "Usuń",
},
errorGrammar: {
  en: "Grammar", ko: "문법", es: "Gramática", fr: "Grammaire",
  zh: "语法", ja: "文法", de: "Grammatik", pt: "Gramática",
  it: "Grammatica", ru: "Грамматика", ar: "قواعد", hi: "व्याकरण",
  tr: "Dilbilgisi", id: "Tata bahasa", vi: "Ngữ pháp", pl: "Gramatyka",
},
errorVocab: {
  en: "Vocabulary", ko: "어휘", es: "Vocabulario", fr: "Vocabulaire",
  zh: "词汇", ja: "語彙", de: "Wortschatz", pt: "Vocabulário",
  it: "Vocabolario", ru: "Словарь", ar: "مفردات", hi: "शब्दावली",
  tr: "Kelime", id: "Kosakata", vi: "Từ vựng", pl: "Słownictwo",
},
errorNaturalness: {
  en: "Naturalness", ko: "자연스러움", es: "Naturalidad", fr: "Naturel",
  zh: "自然度", ja: "自然さ", de: "Natürlichkeit", pt: "Naturalidade",
  it: "Naturalezza", ru: "Естественность", ar: "طبيعية", hi: "स्वाभाविकता",
  tr: "Doğallık", id: "Kealamian", vi: "Tự nhiên", pl: "Naturalność",
},
errorSituation: {
  en: "Situation", ko: "상황 적합성", es: "Situación", fr: "Situation",
  zh: "情境", ja: "状況", de: "Situation", pt: "Situação",
  it: "Situazione", ru: "Ситуация", ar: "الموقف", hi: "स्थिति",
  tr: "Durum", id: "Situasi", vi: "Tình huống", pl: "Sytuacja",
},
```

- [ ] **Step 4: Verify TypeScript**

Run: `cd /Users/ysh/proj/speak-easy && npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/capabilities/default.json src/lib/types.ts src/lib/i18n.ts
git commit -m "feat(session): add capabilities, TypeScript types, and i18n strings"
```

---

### Task 7: Wire session saving in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

Uses `messagesRef` pattern (matching existing `settingsRef` at line 41) to avoid stale closures and unnecessary re-registrations.

- [ ] **Step 1: Add refs and import**

Add import at top of `App.tsx`:

```typescript
import { getCurrentWindow } from "@tauri-apps/api/window";
```

After line 42 (`settingsRef.current = settings;`), add:

```typescript
const messagesRef = useRef(messages);
messagesRef.current = messages;
const sessionIdRef = useRef(crypto.randomUUID());
const scenarioContextRef = useRef<string | null>(null);
```

- [ ] **Step 2: Create stable `saveCurrentSession` helper**

Add after the new refs, before the `useEffect` hooks:

```typescript
const saveCurrentSession = useCallback(async () => {
  const msgs = messagesRef.current;
  const userMsgs = msgs.filter((m) => m.role === "user");
  if (userMsgs.length < 2) return;

  const s = settingsRef.current;
  const savedMessages = msgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m, i) => ({ role: m.role, content: m.content, seq: i }));

  try {
    await invoke("save_session", {
      sessionId: sessionIdRef.current,
      language: s.language,
      mode: s.mode,
      scenarioContext: scenarioContextRef.current,
      messages: savedMessages,
    });
  } catch (e) {
    console.error("Failed to save session:", e);
  }
}, []); // stable — reads from refs
```

- [ ] **Step 3: Replace `handleClearChat`**

```typescript
const handleClearChat = useCallback(async () => {
  await saveCurrentSession();
  sessionIdRef.current = crypto.randomUUID();
  scenarioContextRef.current = null;
  setMessages([]);
}, [saveCurrentSession]);
```

- [ ] **Step 4: Replace `handleLanguageChange`**

```typescript
const handleLanguageChange = useCallback((lang: Language) => {
  saveCurrentSession();
  sessionIdRef.current = crypto.randomUUID();
  scenarioContextRef.current = null;

  tts.stop();
  setMessages([]);
  setExplanations({});
  setSuggestions({});
  setRevealedSentences([]);
  setIsStreamingTts(false);
  isStreamingTtsRef.current = false;
  pendingFullTextRef.current = null;
  if (tts.isLoaded) {
    tts.loadVoice(lang, undefined, settings.ttsEngine);
  }
  setSettings((s) => ({ ...s, language: lang, ttsVoice: "default" }));
}, [tts, settings.ttsEngine, saveCurrentSession]);
```

- [ ] **Step 5: Replace `handleModeChange`**

```typescript
const handleModeChange = useCallback((mode: ConversationMode) => {
  saveCurrentSession();
  sessionIdRef.current = crypto.randomUUID();
  scenarioContextRef.current = null;

  setSettings((s) => {
    const oldKey = `${s.language}:${s.mode}`;
    messagesByLangRef.current[oldKey] = messagesRef.current;
    const newKey = `${s.language}:${mode}`;
    const saved = messagesByLangRef.current[newKey];
    if (saved && saved.length > 0) {
      setMessages(saved);
    } else {
      setMessages([]);
    }
    return { ...s, mode };
  });
}, [saveCurrentSession]);
```

- [ ] **Step 6: Replace `handleScenarioSelect`**

```typescript
const handleScenarioSelect = useCallback((scenario: { description: string; opening: string } | null) => {
  saveCurrentSession();
  sessionIdRef.current = crypto.randomUUID();

  if (!scenario) {
    scenarioContextRef.current = null;
    tts.stop();
    setMessages([]);
    return;
  }
  scenarioContextRef.current = scenario.description;
  setMessages([
    { id: crypto.randomUUID(), role: "system", content: scenario.description, timestamp: Date.now() },
    { id: crypto.randomUUID(), role: "assistant", content: scenario.opening, timestamp: Date.now() },
  ]);
  if (tts.isLoaded) {
    tts.speak(scenario.opening, settings.ttsSpeed, settings.language);
  }
}, [tts, settings.ttsSpeed, settings.language, saveCurrentSession]);
```

- [ ] **Step 7: Add window close listener**

Add after other `useEffect` hooks:

```typescript
useEffect(() => {
  const unlisten = getCurrentWindow().onCloseRequested(async () => {
    await saveCurrentSession();
  });
  return () => { unlisten.then((f) => f()); };
}, [saveCurrentSession]); // saveCurrentSession is stable (empty deps), so this registers once
```

- [ ] **Step 8: Verify TypeScript**

Run: `cd /Users/ysh/proj/speak-easy && npx tsc --noEmit 2>&1 | tail -10`

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "feat(session): wire session saving into all reset/close handlers"
```

---

### Task 8: Create `ReviewPanel` component

**Files:**
- Create: `src/components/ReviewPanel.tsx`

- [ ] **Step 1: Create `ReviewPanel.tsx`**

```typescript
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionSummary, LoadedMessage, ReviewItem, NativeLanguage } from "../lib/types";
import { t } from "../lib/i18n";

interface ReviewPanelProps {
  session: SessionSummary;
  nativeLanguage: NativeLanguage;
  settings: { llmProvider: string; geminiApiKey: string; geminiModel: string };
  onBack: () => void;
  onDelete: (id: string) => void;
}

const ERROR_COLORS: Record<string, string> = {
  grammar: "border-red-400 bg-red-400/10",
  vocab: "border-orange-400 bg-orange-400/10",
  naturalness: "border-yellow-400 bg-yellow-400/10",
  situation: "border-purple-400 bg-purple-400/10",
  none: "border-emerald-400 bg-emerald-400/10",
};

const ERROR_LABEL_KEYS: Record<string, string> = {
  grammar: "errorGrammar",
  vocab: "errorVocab",
  naturalness: "errorNaturalness",
  situation: "errorSituation",
};

export function ReviewPanel({ session, nativeLanguage, settings, onBack, onDelete }: ReviewPanelProps) {
  const [messages, setMessages] = useState<LoadedMessage[]>([]);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const loadReview = useCallback(async () => {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const items = await invoke<ReviewItem[]>("generate_review", {
        sessionId: session.id,
        nativeLanguage,
        provider: settings.llmProvider,
        apiKey: settings.geminiApiKey,
        apiModel: settings.geminiModel,
      });
      setReview(items);
    } catch (e) {
      setReviewError(String(e));
    } finally {
      setReviewLoading(false);
    }
  }, [session.id, nativeLanguage, settings.llmProvider, settings.geminiApiKey, settings.geminiModel]);

  useEffect(() => {
    invoke<LoadedMessage[]>("load_session_messages", { sessionId: session.id })
      .then(setMessages)
      .catch((e) => console.error("Failed to load messages:", e));
  }, [session.id]);

  useEffect(() => {
    loadReview();
  }, [loadReview]);

  const date = new Date(session.started_at * 1000);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const reviewBySeq = new Map<number, ReviewItem>();
  review?.forEach((r) => reviewBySeq.set(r.seq, r));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-xs text-[var(--text-secondary)]">{dateStr} {timeStr}</span>
        <button
          onClick={() => onDelete(session.id)}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          {t("deleteSession", nativeLanguage)}
        </button>
      </div>

      {/* Conversation Replay + Inline Notes */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const reviewItem = isUser ? reviewBySeq.get(msg.seq) : undefined;
          const colorClass = reviewItem ? ERROR_COLORS[reviewItem.errorType] : "";

          return (
            <div key={msg.seq} className={`text-sm ${isUser ? "text-right" : "text-left"}`}>
              <div
                className={`inline-block max-w-[85%] rounded-lg px-3 py-2 ${
                  isUser
                    ? `bg-[var(--accent)]/20 text-[var(--text-primary)] ${reviewItem && reviewItem.errorType !== "none" ? `border-l-2 ${colorClass}` : ""}`
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                }`}
              >
                {msg.content}
              </div>

              {reviewItem && reviewItem.errorType !== "none" && (
                <div className={`inline-block max-w-[85%] mt-1 rounded px-3 py-1.5 text-xs border-l-2 ${colorClass}`}>
                  <span className="font-medium">
                    {t(ERROR_LABEL_KEYS[reviewItem.errorType] as any, nativeLanguage)}
                  </span>
                  {reviewItem.corrected && (
                    <span className="ml-2 text-[var(--accent)]">{reviewItem.corrected}</span>
                  )}
                  {reviewItem.note && (
                    <p className="mt-0.5 text-[var(--text-secondary)]">{reviewItem.note}</p>
                  )}
                </div>
              )}

              {reviewItem && reviewItem.errorType === "none" && (
                <div className={`inline-block max-w-[85%] mt-1 rounded px-3 py-1 text-xs border-l-2 ${ERROR_COLORS.none}`}>
                  {t("wellDone", nativeLanguage)}
                </div>
              )}
            </div>
          );
        })}

        {reviewLoading && (
          <div className="text-center py-4">
            <div className="inline-block w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-[var(--text-secondary)] mt-2">{t("generating", nativeLanguage)}</p>
          </div>
        )}
        {reviewError && (
          <div className="text-center py-4 space-y-2">
            <p className="text-xs text-red-400">{t("reviewFailed", nativeLanguage)}</p>
            <button
              onClick={loadReview}
              className="text-xs px-3 py-1 rounded bg-[var(--bg-elevated)] hover:bg-[var(--border)] transition-colors"
            >
              {t("retry", nativeLanguage)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd /Users/ysh/proj/speak-easy && npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/components/ReviewPanel.tsx
git commit -m "feat(session): create ReviewPanel component with i18n error labels"
```

---

### Task 9: Add session list to `Sidebar.tsx`

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Add imports and state**

Add to imports at top of `Sidebar.tsx`:

```typescript
import type { SessionSummary } from "../lib/types";
import { ReviewPanel } from "./ReviewPanel";
```

(`t` from `../lib/i18n` should already be imported — verify and add if missing.)

Inside the `Sidebar` component, after the existing state declarations (after line 84), add:

```typescript
const [sessions, setSessions] = useState<SessionSummary[]>([]);
const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null);
const [showSessions, setShowSessions] = useState(false);
```

Add after `refreshModels`:

```typescript
const refreshSessions = () => {
  invoke<SessionSummary[]>("list_sessions", { language: settings.language })
    .then(setSessions)
    .catch(() => {});
};
```

- [ ] **Step 2: Add session refresh to existing useEffect**

Split into a separate useEffect for session refresh to avoid triggering model/voice refresh on language change:

After the existing `useEffect` (around line 91-95), add a new one:

```typescript
useEffect(() => {
  if (isOpen) {
    refreshSessions();
  }
}, [isOpen, settings.language]);
```

- [ ] **Step 3: Add session list UI before "Clear Conversation" button**

Before the `<div className="pt-4 border-t border-[var(--border)] space-y-2">` that contains the Clear Conversation button (around line 430), insert:

```typescript
{/* Past Sessions */}
<div className="pt-4 border-t border-[var(--border)]">
  <button
    onClick={() => { setShowSessions(!showSessions); setSelectedSession(null); }}
    className="flex items-center justify-between w-full text-sm font-medium text-[var(--text-secondary)] mb-2"
  >
    <span>{t("pastSessions", settings.nativeLanguage)}</span>
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={`transition-transform ${showSessions ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  </button>

  {showSessions && !selectedSession && (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {sessions.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)] text-center py-3">
          {t("noSessions", settings.nativeLanguage)}
        </p>
      ) : (
        sessions.map((s) => {
          const d = new Date(s.started_at * 1000);
          const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const timeStr = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
          return (
            <button
              key={s.id}
              onClick={() => setSelectedSession(s)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors text-xs"
            >
              <div className="flex items-center gap-2">
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  s.mode === "scenario"
                    ? "bg-purple-400/20 text-purple-300"
                    : "bg-blue-400/20 text-blue-300"
                }`}>
                  {s.mode === "scenario" ? "S" : "F"}
                </span>
                <span className="text-[var(--text-primary)] truncate">
                  {s.scenario_title || t("freeTalk", settings.nativeLanguage)}
                </span>
                {s.has_review && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 ml-auto" />
                )}
              </div>
              <div className="text-[var(--text-secondary)] mt-0.5 pl-6">
                {dateStr} {timeStr} · {s.msg_count} msgs
              </div>
            </button>
          );
        })
      )}
    </div>
  )}

  {showSessions && selectedSession && (
    <div className="h-96 border border-[var(--border)] rounded-lg overflow-hidden">
      <ReviewPanel
        session={selectedSession}
        nativeLanguage={settings.nativeLanguage}
        settings={{
          llmProvider: settings.llmProvider,
          geminiApiKey: settings.geminiApiKey,
          geminiModel: settings.geminiModel,
        }}
        onBack={() => setSelectedSession(null)}
        onDelete={async (id) => {
          try {
            await invoke("delete_session", { sessionId: id });
          } catch (e) {
            console.error("Failed to delete session:", e);
          }
          setSelectedSession(null);
          refreshSessions();
        }}
      />
    </div>
  )}
</div>
```

- [ ] **Step 4: Verify TypeScript**

Run: `cd /Users/ysh/proj/speak-easy && npx tsc --noEmit 2>&1 | tail -10`

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(session): add session list with mode badge and review panel to sidebar"
```

---

### Task 10: Manual integration testing

- [ ] **Step 1: Start the app**

Run: `cd /Users/ysh/proj/speak-easy && npm run tauri dev`

- [ ] **Step 2: Test session saving**

1. Have a conversation with 2+ user messages
2. Click "Clear Conversation"
3. Open sidebar → expand "Past Sessions" → saved session should appear

- [ ] **Step 3: Test session replay + correction notes**

1. Click a saved session
2. Verify messages load and display correctly
3. Verify correction notes generate (spinner → results)
4. Verify error type colors: grammar=red, vocab=orange, naturalness=yellow, situation=purple, none=green

- [ ] **Step 4: Test all save triggers**

- Clear chat → saves
- Change language → saves previous session
- Change mode → saves previous session
- Select new scenario → saves previous session
- Close window → saves (check DB: `sqlite3 ~/.speakeasy/dictionary.db "SELECT * FROM sessions"`)

- [ ] **Step 5: Test edge cases**

- Session with < 2 user messages → should NOT save
- Delete a session → confirm it disappears from list
- Review generation with LLM off → error message + retry button
- Gemini provider → verify review generation works

- [ ] **Step 6: Final polish commit if needed**

```bash
git add -u
git commit -m "fix(session): polish session replay and review panel"
```
