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
        );

        CREATE TABLE IF NOT EXISTS courage_scores (
            session_id        TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
            word_count        INTEGER NOT NULL DEFAULT 0,
            turn_count        INTEGER NOT NULL DEFAULT 0,
            native_switches   INTEGER NOT NULL DEFAULT 0,
            complex_attempts  INTEGER NOT NULL DEFAULT 0,
            quick_response_ratio REAL,
            duration_seconds  INTEGER NOT NULL DEFAULT 0,
            score             REAL NOT NULL DEFAULT 0.0,
            created_at        INTEGER NOT NULL DEFAULT (unixepoch())
        );"
    ).map_err(|e| e.to_string())
}

// ── save_session ──

#[derive(Debug, Deserialize)]
pub struct SavedMessage {
    pub role: String,
    pub content: String,
    pub seq: i64,
}

pub fn save_session_inner(
    db: &crate::dictionary::DictionaryDb,
    session_id: &str,
    language: &str,
    mode: &str,
    scenario_context: Option<&str>,
    messages: &[SavedMessage],
    started_at: i64,
) -> Result<(), String> {
    let user_count = messages.iter().filter(|m| m.role == "user").count();
    if user_count < 2 {
        eprintln!("[session] skipping save: only {} user messages", user_count);
        return Ok(());
    }

    let scenario_title = scenario_context.map(|ctx| {
        ctx.lines().next().unwrap_or("").to_string()
    });
    let msg_count = messages.len() as i64;

    db.with_conn(|conn| {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

        tx.execute(
            "INSERT INTO sessions (id, language, mode, scenario_context, scenario_title, msg_count, started_at, ended_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, unixepoch())
             ON CONFLICT(id) DO UPDATE SET ended_at = unixepoch(), msg_count = ?6",
            params![session_id, language, mode, scenario_context, scenario_title, msg_count, started_at],
        ).map_err(|e| e.to_string())?;

        tx.execute(
            "DELETE FROM session_messages WHERE session_id = ?1",
            params![session_id],
        ).map_err(|e| e.to_string())?;

        for msg in messages {
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

#[tauri::command]
pub async fn save_session(
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
    language: String,
    mode: String,
    scenario_context: Option<String>,
    messages: Vec<SavedMessage>,
    started_at: i64,
) -> Result<(), String> {
    save_session_inner(&db, &session_id, &language, &mode, scenario_context.as_deref(), &messages, started_at)
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

pub fn list_sessions_inner(
    db: &crate::dictionary::DictionaryDb,
    language: Option<&str>,
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

#[tauri::command]
pub async fn list_sessions(
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    language: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<SessionSummary>, String> {
    list_sessions_inner(&db, language.as_deref(), limit)
}

// ── load_session_messages ──

#[derive(Debug, Serialize)]
pub struct LoadedMessage {
    role: String,
    content: String,
    seq: i64,
}

pub fn load_session_messages_inner(
    db: &crate::dictionary::DictionaryDb,
    session_id: &str,
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

#[tauri::command]
pub async fn load_session_messages(
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
) -> Result<Vec<LoadedMessage>, String> {
    load_session_messages_inner(&db, &session_id)
}

// ── delete_session ──

pub fn delete_session_inner(
    db: &crate::dictionary::DictionaryDb,
    session_id: &str,
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

#[tauri::command]
pub async fn delete_session(
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
) -> Result<(), String> {
    delete_session_inner(&db, &session_id)
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

pub fn generate_review_inner(
    llm: &LlmState,
    db: &crate::dictionary::DictionaryDb,
    session_id: &str,
    native_language: &str,
    provider: Option<&str>,
    api_key: Option<&str>,
    api_model: Option<&str>,
    custom_endpoint: Option<&str>,
) -> Result<Vec<ReviewItem>, String> {
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
         - \"none\": no issues\n\n\
         IMPORTANT: If the student wrote in {native_name} instead of {target_name}, \
         this is intentional — the app allows students to use their native language to ask for translations. \
         Do NOT criticize or flag this as an error. Instead, set errorType to \"vocab\", \
         set \"corrected\" to the {target_name} translation of their {native_name} sentence, \
         and set \"note\" to a brief explanation in {native_name} of the translated sentence \
         (e.g. grammar points, useful vocabulary, or usage tips)."
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

    let port = *llm.port.lock().unwrap();
    let prov = provider.unwrap_or("local");
    let key = api_key.unwrap_or("");
    let model = api_model.unwrap_or("");

    eprintln!("[generate_review] session={}, provider={}, utterances={}", session_id, prov, user_utterances.len());

    let result = complete_with_provider(port, prov, key, model, &system_prompt, &user_prompt, 0.3, 4096, custom_endpoint)?;

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

#[tauri::command]
pub async fn generate_review(
    llm_state: tauri::State<'_, LlmState>,
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
    native_language: String,
    provider: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
    custom_endpoint: Option<String>,
) -> Result<Vec<ReviewItem>, String> {
    generate_review_inner(
        &llm_state, &db, &session_id, &native_language,
        provider.as_deref(), api_key.as_deref(), api_model.as_deref(),
        custom_endpoint.as_deref(),
    )
}

// ── assess_cefr_level ──

pub fn assess_cefr_level_inner(
    llm: &LlmState,
    db: &crate::dictionary::DictionaryDb,
    session_id: &str,
    language: &str,
    provider: Option<&str>,
    api_key: Option<&str>,
    api_model: Option<&str>,
    custom_endpoint: Option<&str>,
) -> Result<String, String> {
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

    let target_name = lang_name(language);
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

    let port = *llm.port.lock().unwrap();
    let result = complete_with_provider(
        port,
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
        Ok("B1".to_string())
    }
}

#[tauri::command]
pub async fn assess_cefr_level(
    llm_state: tauri::State<'_, LlmState>,
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

// ── courage score ──

pub fn calculate_courage_score_inner(
    db: &crate::dictionary::DictionaryDb,
    session_id: &str,
    native_language: &str,
    response_gaps_ms: &Option<Vec<i64>>,
) -> Result<crate::courage::CourageMetrics, String> {
    db.with_conn(|conn| {
        let (language, started_at, ended_at): (String, i64, Option<i64>) = conn.query_row(
            "SELECT language, started_at, ended_at FROM sessions WHERE id = ?1",
            params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).map_err(|e| format!("Session not found: {}", e))?;

        let duration = ended_at.unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64
        }) - started_at;

        let mut stmt = conn.prepare(
            "SELECT role, content FROM session_messages WHERE session_id = ?1 ORDER BY seq ASC"
        ).map_err(|e| e.to_string())?;
        let messages: Vec<(String, String)> = stmt.query_map(params![session_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

        if messages.is_empty() {
            return Err("No messages in session".to_string());
        }

        let mut metrics = crate::courage::compute_metrics(&messages, &language, native_language, duration, response_gaps_ms);
        crate::courage::calculate_and_store(conn, session_id, &language, &mut metrics)?;
        eprintln!("[courage] calculated score {:.1} for session {}", metrics.score, session_id);
        Ok(metrics)
    })
}

#[tauri::command]
pub async fn calculate_courage_score(
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
    native_language: String,
    response_gaps_ms: Option<Vec<i64>>,
) -> Result<crate::courage::CourageMetrics, String> {
    calculate_courage_score_inner(&db, &session_id, &native_language, &response_gaps_ms)
}

pub fn get_courage_history_inner(
    db: &crate::dictionary::DictionaryDb,
    session_id: &str,
    language: &str,
) -> Result<Option<crate::courage::CourageHistory>, String> {
    db.with_conn(|conn| {
        crate::courage::load_history(conn, session_id, language)
    })
}

#[tauri::command]
pub async fn get_courage_history(
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
    language: String,
) -> Result<Option<crate::courage::CourageHistory>, String> {
    get_courage_history_inner(&db, &session_id, &language)
}
