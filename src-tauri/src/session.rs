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

// ── save_session ──

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

        // On conflict: only update ended_at and msg_count (language/mode/scenario are immutable per session)
        tx.execute(
            "INSERT INTO sessions (id, language, mode, scenario_context, scenario_title, msg_count, ended_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, unixepoch())
             ON CONFLICT(id) DO UPDATE SET ended_at = unixepoch(), msg_count = ?6",
            params![session_id, language, mode, scenario_context, scenario_title, msg_count],
        ).map_err(|e| e.to_string())?;

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

// ── list_sessions ──

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

// ── load_session_messages ──

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

// ── delete_session ──

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

// ── generate_review ──

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
    // Check cache
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
