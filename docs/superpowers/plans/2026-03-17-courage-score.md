# Speaking Courage Score Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Speaking Courage Score" feature that measures how bravely users speak (volume, complexity, response speed) — independent of accuracy — and displays trend-based feedback in the session review screen.

**Architecture:** Rust backend calculates courage scores from session message data + frontend-collected timing info, stores them in a new `courage_scores` SQLite table. Frontend collects TTS-done → mic-start response gaps during conversation, passes them to `save_session`. A new `CourageScore` React component renders a sparkline graph + 2×3 metric card grid at the top of ReviewPanel.

**Tech Stack:** Rust (rusqlite, serde), TypeScript/React, Tailwind CSS v4, SVG sparkline (no chart library)

---

### Task 1: DB Schema — `courage_scores` Table + Migration

**Files:**
- Modify: `src-tauri/src/session.rs:7-34` (add table in `init_tables`)

- [ ] **Step 1: Add `courage_scores` table to `init_tables`**

Add after the `session_reviews` CREATE TABLE in `init_tables`:

```rust
// In init_tables, append to the execute_batch string:
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
);
```

- [ ] **Step 2: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/session.rs
git commit -m "feat(courage): add courage_scores table schema"
```

---

### Task 2: Courage Score Calculation Logic (Rust)

**Files:**
- Create: `src-tauri/src/courage.rs` — all calculation logic isolated here
- Modify: `src-tauri/src/lib.rs:4` — add `mod courage;`

- [ ] **Step 1: Create `src-tauri/src/courage.rs` with types and helpers**

```rust
use rusqlite::{Connection, params};
use serde::Serialize;

/// Per-language word count thresholds for "complex" sentences
fn complex_word_threshold(lang: &str) -> usize {
    match lang {
        "zh" | "ja" => 20, // character count
        "ar" | "hi" | "tr" | "id" | "vi" | "ko" => 12,
        _ => 15, // en, es, fr, de, pt, it, ru, pl
    }
}

/// Count words (or characters for CJK)
fn count_words(text: &str, lang: &str) -> usize {
    match lang {
        "zh" | "ja" => text.chars().filter(|c| !c.is_whitespace()).count(),
        _ => text.split_whitespace().count(),
    }
}

/// Check if text contains connective words indicating complex structure
fn has_connective(text: &str, lang: &str) -> bool {
    let connectives: &[&str] = match lang {
        "en" => &["because", "although", "however", "therefore", "which", "that", "if", "when", "while", "but"],
        "es" => &["porque", "aunque", "sin embargo", "por eso", "pero", "cuando", "si", "que", "mientras"],
        "fr" => &["parce que", "bien que", "cependant", "donc", "mais", "quand", "si", "que", "pendant"],
        "zh" => &["因为", "虽然", "但是", "所以", "如果", "当", "而且", "然后"],
        "ja" => &["から", "けれど", "しかし", "だから", "もし", "とき", "ながら", "そして", "でも"],
        "de" => &["weil", "obwohl", "jedoch", "deshalb", "aber", "wenn", "während", "dass"],
        "ko" => &["왜냐하면", "비록", "하지만", "그래서", "만약", "때", "그리고", "그런데", "그러나"],
        "pt" => &["porque", "embora", "no entanto", "portanto", "mas", "quando", "se", "que"],
        "it" => &["perché", "sebbene", "tuttavia", "quindi", "ma", "quando", "se", "che"],
        "ru" => &["потому что", "хотя", "однако", "поэтому", "но", "когда", "если", "что"],
        "ar" => &["لأن", "رغم", "لكن", "لذلك", "إذا", "عندما", "بينما"],
        "hi" => &["क्योंकि", "हालांकि", "लेकिन", "इसलिए", "अगर", "जब", "और"],
        "tr" => &["çünkü", "rağmen", "ancak", "bu yüzden", "ama", "eğer", "iken"],
        "id" => &["karena", "meskipun", "namun", "oleh karena itu", "tetapi", "jika", "ketika"],
        "vi" => &["vì", "mặc dù", "tuy nhiên", "do đó", "nhưng", "nếu", "khi"],
        "pl" => &["ponieważ", "chociaż", "jednak", "dlatego", "ale", "jeśli", "kiedy"],
        _ => &["because", "but", "however", "therefore", "if", "when", "although"],
    };
    let lower = text.to_lowercase();
    connectives.iter().any(|c| lower.contains(c))
}

/// Check if a user utterance counts as "complex"
fn is_complex(text: &str, lang: &str) -> bool {
    let word_count = count_words(text, lang);
    let threshold = complex_word_threshold(lang);
    word_count >= threshold || has_connective(text, lang)
}

// ── Scoring ──

const WEIGHT_WORDS: f32 = 0.35;
const WEIGHT_TURNS: f32 = 0.25;
const WEIGHT_COMPLEX: f32 = 0.20;
const WEIGHT_NATIVE: f32 = 0.0;  // placeholder until STT language detection is tracked per-message
const WEIGHT_QUICK: f32 = 0.15;
const WEIGHT_DURATION: f32 = 0.05;

// First-5-session absolute baselines
const BASE_WORD_COUNT: f32 = 50.0;
const BASE_TURN_COUNT: f32 = 5.0;
const BASE_COMPLEX: f32 = 2.0;
const BASE_NATIVE: f32 = 2.0;
const BASE_QUICK_RATIO: f32 = 0.3;
const BASE_DURATION: f32 = 300.0;

fn normalize(value: f32, baseline: f32) -> f32 {
    let ratio = if baseline > 0.0 { value / baseline } else { 1.0 };
    (ratio * 100.0).clamp(0.0, 150.0) / 150.0 * 100.0
}

fn normalize_inverse(value: f32, baseline: f32) -> f32 {
    let ratio = if baseline > 0.0 { value / baseline } else { 1.0 };
    let inverted = 2.0 - ratio;
    (inverted * 100.0).clamp(0.0, 200.0) / 200.0 * 100.0
}

#[derive(Debug, Serialize, Clone)]
pub struct CourageMetrics {
    pub word_count: i64,
    pub turn_count: i64,
    pub native_switches: i64,
    pub complex_attempts: i64,
    pub quick_response_ratio: Option<f64>,
    pub duration_seconds: i64,
    pub score: f64,
}

#[derive(Debug, Serialize)]
pub struct CourageHistory {
    pub current: CourageMetrics,
    pub previous: Option<CourageMetrics>,
    pub history: Vec<CourageHistoryEntry>,
}

#[derive(Debug, Serialize)]
pub struct CourageHistoryEntry {
    pub session_id: String,
    pub score: f64,
    pub started_at: i64,
}

/// Extract raw metrics from session messages.
/// `response_gaps_ms`: optional array of (gap_ms) for each user turn after an assistant turn.
/// `native_language`: the user's native language code.
pub fn compute_metrics(
    messages: &[(String, String)], // (role, content)
    language: &str,
    native_language: &str,
    duration_seconds: i64,
    response_gaps_ms: &Option<Vec<i64>>,
) -> CourageMetrics {
    let user_messages: Vec<&str> = messages.iter()
        .filter(|(role, _)| role == "user")
        .map(|(_, content)| content.as_str())
        .collect();

    let word_count: usize = user_messages.iter()
        .map(|t| count_words(t, language))
        .sum();

    let turn_count = user_messages.len();

    // Detect native language switches: simple heuristic —
    // if native_language != language, we check if the text looks like it's mostly
    // in the native language. For simplicity, we count messages where the STT
    // would have detected native language. Since we don't have STT language detection
    // data stored per-message, we approximate: if the message contains mostly
    // characters from the native language script, count it.
    // For now, native_switches = 0 (will be passed from frontend in future).
    // The spec says to use STT detection — we'll accept it as a parameter.
    let native_switches: i64 = 0; // Placeholder — see Task 3 for frontend tracking

    let complex_attempts: usize = user_messages.iter()
        .filter(|t| is_complex(t, language))
        .count();

    let quick_response_ratio = response_gaps_ms.as_ref().map(|gaps| {
        if gaps.is_empty() {
            return None;
        }
        // All gaps represent assistant→user turn pairs.
        // gap ≤ 30s = "quick response", gap > 30s = "slow/away" (excluded from both num & denom)
        let valid: Vec<&i64> = gaps.iter().filter(|&&g| g > 0).collect();
        if valid.is_empty() {
            return None;
        }
        let total = valid.len();
        let quick = valid.iter().filter(|&&&g| g <= 30_000).count();
        Some(quick as f64 / total as f64)
    }).flatten();

    // Score will be computed after we get baselines
    CourageMetrics {
        word_count: word_count as i64,
        turn_count: turn_count as i64,
        native_switches,
        complex_attempts: complex_attempts as i64,
        quick_response_ratio,
        duration_seconds,
        score: 0.0, // placeholder, computed in calculate_score
    }
}

/// Get baselines from recent sessions (up to 10). If < 5 sessions, use absolute baselines.
fn get_baselines(conn: &Connection, language: &str, exclude_session: &str) -> (f32, f32, f32, f32, f32, f32) {
    let mut stmt = conn.prepare(
        "SELECT word_count, turn_count, native_switches, complex_attempts,
                quick_response_ratio, duration_seconds
         FROM courage_scores cs
         JOIN sessions s ON cs.session_id = s.id
         WHERE s.language = ?1 AND cs.session_id != ?2
         ORDER BY s.started_at DESC
         LIMIT 10"
    ).unwrap();

    let rows: Vec<(f32, f32, f32, f32, Option<f64>, f32)> = stmt.query_map(
        params![language, exclude_session],
        |row| Ok((
            row.get::<_, i64>(0)? as f32,
            row.get::<_, i64>(1)? as f32,
            row.get::<_, i64>(2)? as f32,
            row.get::<_, i64>(3)? as f32,
            row.get::<_, Option<f64>>(4)?,
            row.get::<_, i64>(5)? as f32,
        ))
    ).unwrap().filter_map(|r| r.ok()).collect();

    let n = rows.len();
    if n < 5 {
        return (BASE_WORD_COUNT, BASE_TURN_COUNT, BASE_NATIVE, BASE_COMPLEX, BASE_QUICK_RATIO, BASE_DURATION);
    }

    let avg = |f: fn(&(f32, f32, f32, f32, Option<f64>, f32)) -> f32| -> f32 {
        rows.iter().map(f).sum::<f32>() / n as f32
    };

    let avg_quick = {
        let valid: Vec<f64> = rows.iter().filter_map(|r| r.4).collect();
        if valid.is_empty() { BASE_QUICK_RATIO } else { valid.iter().sum::<f64>() as f32 / valid.len() as f32 }
    };

    (
        avg(|r| r.0).max(1.0),  // word_count
        avg(|r| r.1).max(1.0),  // turn_count
        avg(|r| r.2).max(0.1),  // native_switches
        avg(|r| r.3).max(1.0),  // complex_attempts
        avg_quick.max(0.01),     // quick_response_ratio
        avg(|r| r.5).max(1.0),  // duration_seconds
    )
}

/// Calculate final score with baselines and store in DB.
pub fn calculate_and_store(
    conn: &Connection,
    session_id: &str,
    language: &str,
    metrics: &mut CourageMetrics,
) -> Result<f64, String> {
    let (b_words, b_turns, b_native, b_complex, b_quick, b_duration) =
        get_baselines(conn, language, session_id);

    let word_score = normalize(metrics.word_count as f32, b_words);
    let turn_score = normalize(metrics.turn_count as f32, b_turns);
    let complex_score = normalize(metrics.complex_attempts as f32, b_complex);
    let native_score = normalize_inverse(metrics.native_switches as f32, b_native);
    let quick_score = metrics.quick_response_ratio
        .map(|r| normalize(r as f32, b_quick))
        .unwrap_or(50.0); // neutral if no data
    let duration_score = normalize(metrics.duration_seconds as f32, b_duration);

    let score = (word_score * WEIGHT_WORDS)
        + (turn_score * WEIGHT_TURNS)
        + (complex_score * WEIGHT_COMPLEX)
        + (native_score * WEIGHT_NATIVE)
        + (quick_score * WEIGHT_QUICK)
        + (duration_score * WEIGHT_DURATION);

    metrics.score = score as f64;

    conn.execute(
        "INSERT OR REPLACE INTO courage_scores
         (session_id, word_count, turn_count, native_switches, complex_attempts,
          quick_response_ratio, duration_seconds, score)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            session_id,
            metrics.word_count,
            metrics.turn_count,
            metrics.native_switches,
            metrics.complex_attempts,
            metrics.quick_response_ratio,
            metrics.duration_seconds,
            metrics.score,
        ],
    ).map_err(|e| e.to_string())?;

    Ok(metrics.score)
}

/// Load a single session's courage metrics by session_id.
fn load_metrics(conn: &Connection, session_id: &str) -> Option<CourageMetrics> {
    conn.query_row(
        "SELECT word_count, turn_count, native_switches, complex_attempts,
                quick_response_ratio, duration_seconds, score
         FROM courage_scores WHERE session_id = ?1",
        params![session_id],
        |row| Ok(CourageMetrics {
            word_count: row.get(0)?,
            turn_count: row.get(1)?,
            native_switches: row.get(2)?,
            complex_attempts: row.get(3)?,
            quick_response_ratio: row.get(4)?,
            duration_seconds: row.get(5)?,
            score: row.get(6)?,
        }),
    ).ok()
}

/// Load courage history for a language (last 10 sessions + current + previous metrics).
pub fn load_history(
    conn: &Connection,
    session_id: &str,
    language: &str,
) -> Result<Option<CourageHistory>, String> {
    let current = match load_metrics(conn, session_id) {
        Some(m) => m,
        None => return Ok(None),
    };

    // Load history entries (including current, newest first)
    let mut stmt = conn.prepare(
        "SELECT cs.session_id, cs.score, s.started_at
         FROM courage_scores cs
         JOIN sessions s ON cs.session_id = s.id
         WHERE s.language = ?1
         ORDER BY s.started_at DESC
         LIMIT 10"
    ).map_err(|e| e.to_string())?;

    let history: Vec<CourageHistoryEntry> = stmt.query_map(
        params![language],
        |row| Ok(CourageHistoryEntry {
            session_id: row.get(0)?,
            score: row.get(1)?,
            started_at: row.get(2)?,
        }),
    ).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    // Load previous session's full metrics (for per-card comparison)
    let previous = if history.len() >= 2 {
        let prev_id = &history[1].session_id; // index 0 = current, 1 = previous
        load_metrics(conn, prev_id)
    } else {
        None
    };

    Ok(Some(CourageHistory { current, previous, history }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_words_english() {
        assert_eq!(count_words("hello world", "en"), 2);
        assert_eq!(count_words("this is a longer sentence with more words", "en"), 8);
    }

    #[test]
    fn test_count_words_chinese() {
        assert_eq!(count_words("你好世界", "zh"), 4);
        assert_eq!(count_words("这是一个测试", "zh"), 6);
    }

    #[test]
    fn test_has_connective() {
        assert!(has_connective("I went because it was fun", "en"));
        assert!(has_connective("porque me gusta", "es"));
        assert!(!has_connective("hello world", "en"));
        assert!(has_connective("因为我喜欢", "zh"));
    }

    #[test]
    fn test_is_complex_by_length() {
        let long_en = "this is a very long sentence that has more than fifteen words in it for testing";
        assert!(is_complex(long_en, "en"));
        assert!(!is_complex("short sentence", "en"));
    }

    #[test]
    fn test_is_complex_by_connective() {
        assert!(is_complex("I like it because it's good", "en")); // has "because"
    }

    #[test]
    fn test_normalize() {
        // At baseline → ~66.7
        assert!((normalize(50.0, 50.0) - 66.67).abs() < 0.1);
        // Double baseline → 100.0 (clamped at 150%)
        assert!((normalize(100.0, 50.0) - 88.89).abs() < 0.1);
        // Zero → 0
        assert_eq!(normalize(0.0, 50.0), 0.0);
    }

    #[test]
    fn test_normalize_inverse() {
        // At baseline → 50.0
        assert_eq!(normalize_inverse(2.0, 2.0), 50.0);
        // Zero switches → 100.0
        assert_eq!(normalize_inverse(0.0, 2.0), 100.0);
        // Double switches → 0.0
        assert_eq!(normalize_inverse(4.0, 2.0), 0.0);
    }

    #[test]
    fn test_compute_metrics_basic() {
        let messages = vec![
            ("user".to_string(), "hello how are you".to_string()),
            ("assistant".to_string(), "I'm fine thanks".to_string()),
            ("user".to_string(), "that is great because I was worried".to_string()),
        ];
        let m = compute_metrics(&messages, "en", "ko", 120, &None);
        assert_eq!(m.turn_count, 2);
        assert_eq!(m.word_count, 11); // 4 + 7
        assert_eq!(m.complex_attempts, 1); // second has "because"
        assert!(m.quick_response_ratio.is_none());
    }

    #[test]
    fn test_compute_metrics_with_gaps() {
        let messages = vec![
            ("user".to_string(), "hello".to_string()),
            ("assistant".to_string(), "hi".to_string()),
            ("user".to_string(), "how are you".to_string()),
        ];
        // One quick (5s), one slow (45s) → ratio = 1/2
        let gaps = Some(vec![5000, 45000]);
        let m = compute_metrics(&messages, "en", "ko", 60, &gaps);
        assert_eq!(m.quick_response_ratio, Some(0.5));
    }
}
```

- [ ] **Step 2: Add `mod courage;` to `lib.rs`**

In `src-tauri/src/lib.rs`, add `mod courage;` after `mod session;` (line 12).

- [ ] **Step 3: Run tests**

Run: `cd src-tauri && cargo test courage`
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/courage.rs src-tauri/src/lib.rs
git commit -m "feat(courage): add courage score calculation logic with tests"
```

---

### Task 3: Tauri Commands — `calculate_courage_score` + `get_courage_history`

**Files:**
- Modify: `src-tauri/src/session.rs` — add two new Tauri commands
- Modify: `src-tauri/src/lib.rs:56-99` — register new commands

- [ ] **Step 1: Add `calculate_courage_score` command to `session.rs`**

Append to the end of `session.rs`:

```rust
// ── courage score ──

#[tauri::command]
pub async fn calculate_courage_score(
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
    native_language: String,
    response_gaps_ms: Option<Vec<i64>>,
) -> Result<crate::courage::CourageMetrics, String> {
    db.with_conn(|conn| {
        // Load session metadata
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

        // Load messages
        let mut stmt = conn.prepare(
            "SELECT role, content FROM session_messages
             WHERE session_id = ?1 ORDER BY seq ASC"
        ).map_err(|e| e.to_string())?;
        let messages: Vec<(String, String)> = stmt.query_map(
            params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        if messages.is_empty() {
            return Err("No messages in session".to_string());
        }

        let mut metrics = crate::courage::compute_metrics(
            &messages, &language, &native_language, duration, &response_gaps_ms,
        );

        crate::courage::calculate_and_store(conn, &session_id, &language, &mut metrics)?;

        eprintln!("[courage] calculated score {:.1} for session {}", metrics.score, session_id);
        Ok(metrics)
    })
}

#[tauri::command]
pub async fn get_courage_history(
    db: tauri::State<'_, crate::dictionary::DictionaryDb>,
    session_id: String,
    language: String,
) -> Result<Option<crate::courage::CourageHistory>, String> {
    db.with_conn(|conn| {
        crate::courage::load_history(conn, &session_id, &language)
    })
}
```

- [ ] **Step 2: Register commands in `lib.rs`**

Add after `session::generate_review,` (line 98):

```rust
session::calculate_courage_score,
session::get_courage_history,
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: compiles successfully

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/session.rs src-tauri/src/lib.rs
git commit -m "feat(courage): add Tauri commands for courage score calculation and history"
```

---

### Task 4: Frontend Timing Collection — Response Gap Tracking

**Files:**
- Modify: `src/App.tsx` — track `ttsDoneAt`/`micStartAt`, pass gaps to `save_session`

- [ ] **Step 1: Add timing refs in App component**

After `const explainCacheRef = useRef<Record<string, string>>({});` (line 53), add:

```typescript
const ttsDoneAtRef = useRef<number | null>(null);
const responseGapsRef = useRef<number[]>([]);
```

- [ ] **Step 2: Record TTS completion timestamp**

In the `tts.onChunkDone.current` callback (around line 166), when `done` is true, record the timestamp. Add right after `isStreamingTtsRef.current = false;` (line 173):

```typescript
ttsDoneAtRef.current = Date.now();
```

- [ ] **Step 3: Record mic start timestamp and compute gap**

In the `onRecordStop` handler's mic start (the `onRecordStart` callback, line 606), wrap the `stt.startRecording()` call:

```typescript
onRecordStart={() => {
  const micStartAt = Date.now();
  if (ttsDoneAtRef.current) {
    const gap = micStartAt - ttsDoneAtRef.current;
    if (gap > 0 && gap <= 30000) {
      responseGapsRef.current.push(gap);
    }
    ttsDoneAtRef.current = null;
  }
  stt.startRecording();
}}
```

- [ ] **Step 4: Pass response gaps to `save_session` and reset on new session**

Modify `saveCurrentSession` to include response gaps:

```typescript
const saveCurrentSession = useCallback(async () => {
  const msgs = messagesRef.current;
  const userMsgs = msgs.filter((m) => m.role === "user");
  if (userMsgs.length < 2) return;

  const s = settingsRef.current;
  const savedMessages = msgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m, i) => ({ role: m.role, content: m.content, seq: i }));

  const gaps = responseGapsRef.current.length > 0 ? [...responseGapsRef.current] : null;

  try {
    await invoke("save_session", {
      sessionId: sessionIdRef.current,
      language: s.language,
      mode: s.mode,
      scenarioContext: scenarioContextRef.current,
      messages: savedMessages,
    });

    // Calculate courage score after saving session
    await invoke("calculate_courage_score", {
      sessionId: sessionIdRef.current,
      nativeLanguage: s.nativeLanguage,
      responseGapsMs: gaps,
    }).catch((e: unknown) => console.error("Courage score calc failed:", e));
  } catch (e) {
    console.error("Failed to save session:", e);
  }
}, []);
```

Also, in every place where `sessionIdRef.current = crypto.randomUUID()` (new session), reset the timing refs:

```typescript
responseGapsRef.current = [];
ttsDoneAtRef.current = null;
```

There are 4 locations:
- `handleLanguageChange` (line 219)
- `handleModeChange` (line 239)
- `handleClearChat` (line 259)
- `handleScenarioSelect` (line 266)

- [ ] **Step 5: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(courage): collect response timing gaps and trigger score calculation on save"
```

---

### Task 5: TypeScript Types + i18n Keys

**Files:**
- Modify: `src/lib/types.ts` — add courage types
- Modify: `src/lib/i18n.ts` — add courage i18n keys

- [ ] **Step 1: Add courage types to `types.ts`**

Append after `LoadedMessage` interface (after line 71):

```typescript
export interface CourageMetrics {
  word_count: number;
  turn_count: number;
  native_switches: number;
  complex_attempts: number;
  quick_response_ratio: number | null;
  duration_seconds: number;
  score: number;
}

export interface CourageHistoryEntry {
  session_id: string;
  score: number;
  started_at: number;
}

export interface CourageHistory {
  current: CourageMetrics;
  previous: CourageMetrics | null;
  history: CourageHistoryEntry[];
}
```

- [ ] **Step 2: Add courage i18n keys to `i18n.ts`**

Add before the closing `} satisfies Record<...>` (before line 382):

```typescript
  // Courage Score
  courageScore: {
    en: "Speaking Courage", ko: "Speaking Courage", es: "Speaking Courage", fr: "Speaking Courage",
    zh: "Speaking Courage", ja: "Speaking Courage", de: "Speaking Courage", pt: "Speaking Courage",
    it: "Speaking Courage", ru: "Speaking Courage", ar: "Speaking Courage", hi: "Speaking Courage",
    tr: "Speaking Courage", id: "Speaking Courage", vi: "Speaking Courage", pl: "Speaking Courage",
  },
  courageTodaySession: {
    en: "Today's Session", ko: "오늘 세션", es: "Sesión de hoy", fr: "Session du jour",
    zh: "今日会话", ja: "今日のセッション", de: "Heutige Sitzung", pt: "Sessão de hoje",
    it: "Sessione di oggi", ru: "Сегодняшняя сессия", ar: "جلسة اليوم", hi: "आज का सत्र",
    tr: "Bugünün oturumu", id: "Sesi hari ini", vi: "Phiên hôm nay", pl: "Dzisiejsza sesja",
  },
  courageSessionsAgo: {
    en: "10 sessions ago", ko: "10세션 전", es: "Hace 10 sesiones", fr: "Il y a 10 sessions",
    zh: "10次前", ja: "10回前", de: "Vor 10 Sitzungen", pt: "10 sessões atrás",
    it: "10 sessioni fa", ru: "10 сессий назад", ar: "قبل 10 جلسات", hi: "10 सत्र पहले",
    tr: "10 oturum önce", id: "10 sesi lalu", vi: "10 phiên trước", pl: "10 sesji temu",
  },
  courageToday: {
    en: "Today", ko: "오늘", es: "Hoy", fr: "Aujourd'hui",
    zh: "今天", ja: "今日", de: "Heute", pt: "Hoje",
    it: "Oggi", ru: "Сегодня", ar: "اليوم", hi: "आज",
    tr: "Bugün", id: "Hari ini", vi: "Hôm nay", pl: "Dziś",
  },
  courageWords: {
    en: "Words spoken", ko: "발화 단어", es: "Palabras dichas", fr: "Mots prononcés",
    zh: "发言词数", ja: "発話単語", de: "Gesprochene Wörter", pt: "Palavras faladas",
    it: "Parole dette", ru: "Произнесённые слова", ar: "كلمات منطوقة", hi: "बोले गए शब्द",
    tr: "Söylenen kelimeler", id: "Kata diucapkan", vi: "Từ đã nói", pl: "Wypowiedziane słowa",
  },
  courageTurns: {
    en: "Speaking turns", ko: "발화 턴", es: "Turnos de habla", fr: "Tours de parole",
    zh: "发言轮次", ja: "発話ターン", de: "Sprechrunden", pt: "Turnos de fala",
    it: "Turni di parola", ru: "Реплики", ar: "أدوار التحدث", hi: "बोलने की बारी",
    tr: "Konuşma turları", id: "Giliran bicara", vi: "Lượt nói", pl: "Tury mówienia",
  },
  courageComplex: {
    en: "Complex sentences", ko: "복잡한 문장", es: "Oraciones complejas", fr: "Phrases complexes",
    zh: "复杂句", ja: "複雑な文", de: "Komplexe Sätze", pt: "Frases complexas",
    it: "Frasi complesse", ru: "Сложные предложения", ar: "جمل معقدة", hi: "जटिल वाक्य",
    tr: "Karmaşık cümleler", id: "Kalimat kompleks", vi: "Câu phức tạp", pl: "Złożone zdania",
  },
  courageNativeSwitches: {
    en: "L1 switches", ko: "모국어 전환", es: "Cambios a L1", fr: "Changements L1",
    zh: "母语切换", ja: "母語切替", de: "L1-Wechsel", pt: "Trocas L1",
    it: "Cambi L1", ru: "Переходы на L1", ar: "تبديلات L1", hi: "L1 स्विच",
    tr: "L1 geçişleri", id: "Ganti L1", vi: "Chuyển L1", pl: "Zmiany L1",
  },
  courageQuickResponse: {
    en: "Quick response", ko: "바로 응답", es: "Respuesta rápida", fr: "Réponse rapide",
    zh: "快速回应", ja: "即答率", de: "Schnelle Antwort", pt: "Resposta rápida",
    it: "Risposta rapida", ru: "Быстрый ответ", ar: "استجابة سريعة", hi: "त्वरित उत्तर",
    tr: "Hızlı yanıt", id: "Respons cepat", vi: "Phản hồi nhanh", pl: "Szybka odpowiedź",
  },
  courageDuration: {
    en: "Session time", ko: "세션 시간", es: "Tiempo de sesión", fr: "Durée de session",
    zh: "会话时长", ja: "セッション時間", de: "Sitzungsdauer", pt: "Tempo de sessão",
    it: "Durata sessione", ru: "Время сессии", ar: "وقت الجلسة", hi: "सत्र समय",
    tr: "Oturum süresi", id: "Waktu sesi", vi: "Thời gian phiên", pl: "Czas sesji",
  },
  couragePrevLabel: {
    en: "prev", ko: "지난번", es: "anterior", fr: "précédent",
    zh: "上次", ja: "前回", de: "vorher", pt: "anterior",
    it: "precedente", ru: "пред.", ar: "السابقة", hi: "पिछला",
    tr: "önceki", id: "sebelumnya", vi: "trước", pl: "poprz.",
  },
  courageVsPrev: {
    en: "vs last session", ko: "지난 세션 대비", es: "vs sesión anterior", fr: "vs session précédente",
    zh: "vs上次", ja: "vs前回", de: "vs letzte Sitzung", pt: "vs sessão anterior",
    it: "vs sessione precedente", ru: "vs пред. сессия", ar: "مقارنة بالسابقة", hi: "vs पिछला सत्र",
    tr: "vs önceki oturum", id: "vs sesi sebelumnya", vi: "vs phiên trước", pl: "vs poprzednia sesja",
  },
  courageVsAvg: {
    en: "vs 10-session avg", ko: "10세션 평균 대비", es: "vs promedio 10", fr: "vs moy. 10 sessions",
    zh: "vs10次平均", ja: "vs10回平均", de: "vs 10-Sitzungen-Ø", pt: "vs média 10 sessões",
    it: "vs media 10 sessioni", ru: "vs ср. 10 сессий", ar: "مقارنة بمتوسط 10", hi: "vs 10-सत्र औसत",
    tr: "vs 10 ort.", id: "vs rata-rata 10", vi: "vs TB 10 phiên", pl: "vs śr. 10 sesji",
  },
  courageFirstSession: {
    en: "First session! Trends start from the next one.",
    ko: "첫 번째 세션입니다. 다음 세션부터 추세를 볼 수 있어요.",
    es: "¡Primera sesión! Las tendencias comienzan a partir de la siguiente.",
    fr: "Première session ! Les tendances commenceront à la prochaine.",
    zh: "第一次会话！下次开始显示趋势。",
    ja: "最初のセッションです！次回からトレンドが表示されます。",
    de: "Erste Sitzung! Trends ab der nächsten.",
    pt: "Primeira sessão! Tendências a partir da próxima.",
    it: "Prima sessione! Le tendenze iniziano dalla prossima.",
    ru: "Первая сессия! Тренды появятся со следующей.",
    ar: "الجلسة الأولى! ستظهر الاتجاهات من الجلسة التالية.",
    hi: "पहला सत्र! अगले से रुझान दिखेंगे।",
    tr: "İlk oturum! Trendler bir sonrakinden başlayacak.",
    id: "Sesi pertama! Tren mulai dari sesi berikutnya.",
    vi: "Phiên đầu tiên! Xu hướng bắt đầu từ phiên tiếp theo.",
    pl: "Pierwsza sesja! Trendy od następnej.",
  },
  courageGoodJob: {
    en: "Nice!", ko: "좋았어요", es: "¡Bien!", fr: "Bien !",
    zh: "不错！", ja: "いいね！", de: "Gut!", pt: "Bom!",
    it: "Bene!", ru: "Хорошо!", ar: "!جيد", hi: "अच्छा!",
    tr: "Güzel!", id: "Bagus!", vi: "Tốt!", pl: "Dobrze!",
  },
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/i18n.ts
git commit -m "feat(courage): add TypeScript types and i18n keys for courage score"
```

---

### Task 6: CourageScore UI Component

**Files:**
- Create: `src/components/CourageScore.tsx` — sparkline + metric cards

- [ ] **Step 1: Create `CourageScore.tsx`**

The component matches the UI mockup: title bar with subtitle, sparkline with axis labels and "오늘" dot label, delta percentage badges, and a 2×3 metric card grid where each card shows the current value, label, and a comparison line showing the previous session's value with a directional arrow.

```tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CourageHistory, CourageMetrics, NativeLanguage } from "../lib/types";
import { t } from "../lib/i18n";

interface CourageScoreProps {
  sessionId: string;
  language: string;
  nativeLanguage: NativeLanguage;
}

export function CourageScore({ sessionId, language, nativeLanguage }: CourageScoreProps) {
  const [data, setData] = useState<CourageHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    invoke<CourageHistory | null>("get_courage_history", { sessionId, language })
      .then((result) => setData(result ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [sessionId, language]);

  if (loading) {
    return (
      <div className="px-6 py-4 border-b border-[var(--border)]">
        <div className="h-6 w-40 bg-[var(--bg-elevated)] rounded animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const { current, previous, history } = data;
  const isFirstSession = history.length <= 1;

  // Score deltas (percentage change)
  const prevScore = history.length >= 2 ? history[1].score : null;
  const avgScore = history.length >= 2
    ? history.reduce((sum, h) => sum + h.score, 0) / history.length
    : null;
  const prevDelta = prevScore != null && prevScore > 0
    ? ((current.score - prevScore) / prevScore) * 100 : null;
  const avgDelta = avgScore != null && avgScore > 0
    ? ((current.score - avgScore) / avgScore) * 100 : null;

  return (
    <div className="px-6 py-5 border-b border-[var(--border)]">
      {/* Title: "Speaking Courage — 오늘 세션" */}
      <h3 className="text-sm font-medium text-[var(--text-primary)] mb-4">
        {t("courageScore", nativeLanguage)}
        <span className="text-[var(--text-secondary)] font-normal">
          {" — "}{t("courageTodaySession", nativeLanguage)}
        </span>
      </h3>

      {/* Sparkline graph with axis labels */}
      {!isFirstSession && history.length >= 2 && (
        <div className="mb-4">
          <Sparkline
            scores={history.map((h) => h.score).reverse()}
            nativeLanguage={nativeLanguage}
          />
        </div>
      )}

      {/* Delta badges: "지난 세션 대비 +23% ↑  10세션 평균 대비 +8% ↑" */}
      {!isFirstSession && (prevDelta != null || avgDelta != null) && (
        <div className="flex gap-6 mb-4 text-sm">
          {prevDelta != null && (
            <span className="text-[var(--text-secondary)]">
              {t("courageVsPrev", nativeLanguage)}{" "}
              <DeltaBadge value={prevDelta} />
            </span>
          )}
          {avgDelta != null && history.length >= 3 && (
            <span className="text-[var(--text-secondary)]">
              {t("courageVsAvg", nativeLanguage)}{" "}
              <DeltaBadge value={avgDelta} />
            </span>
          )}
        </div>
      )}

      {/* First session hint */}
      {isFirstSession && (
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          {t("courageFirstSession", nativeLanguage)}
        </p>
      )}

      {/* 2×3 Metric Cards */}
      <MetricGrid
        metrics={current}
        previous={previous}
        nativeLanguage={nativeLanguage}
      />
    </div>
  );
}

// ── Sparkline ──

function Sparkline({ scores, nativeLanguage }: { scores: number[]; nativeLanguage: NativeLanguage }) {
  if (scores.length < 2) return null;

  const width = 280;
  const height = 60;
  const padX = 8;
  const padY = 16; // extra top padding for "오늘" label

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  const points = scores.map((score, i) => {
    const x = padX + (i / (scores.length - 1)) * (width - 2 * padX);
    const y = padY + (1 - (score - min) / range) * (height - padY - 4);
    return { x, y };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const trending = scores[scores.length - 1] >= scores[0];
  const strokeColor = trending ? "var(--accent)" : "var(--text-secondary)";
  const last = points[points.length - 1];

  return (
    <div>
      <svg width={width} height={height + 20} className="w-full max-w-[280px]">
        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Small dots on each point */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y}
            r={i === points.length - 1 ? 4.5 : 2}
            fill={i === points.length - 1 ? strokeColor : "none"}
            stroke={i === points.length - 1 ? "none" : strokeColor}
            strokeWidth="1.5"
          />
        ))}
        {/* "오늘" label above last dot */}
        <text
          x={last.x} y={last.y - 8}
          textAnchor="middle"
          className="text-[10px] fill-[var(--accent)] font-medium"
        >
          {t("courageToday", nativeLanguage)}
        </text>
        {/* Axis labels */}
        <text
          x={padX} y={height + 14}
          className="text-[10px] fill-[var(--text-secondary)]"
        >
          {t("courageSessionsAgo", nativeLanguage)}
        </text>
        <text
          x={width - padX} y={height + 14}
          textAnchor="end"
          className="text-[10px] fill-[var(--text-secondary)]"
        >
          {t("courageToday", nativeLanguage)}
        </text>
      </svg>
    </div>
  );
}

// ── Delta Badge ──

function DeltaBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  const color = isPositive ? "text-emerald-400" : "text-[var(--text-secondary)]";
  const arrow = isPositive ? "\u2191" : "\u2193";
  return (
    <span className={`font-semibold ${color}`}>
      {isPositive ? "+" : ""}{value.toFixed(0)}% {arrow}
    </span>
  );
}

// ── Metric Card Grid ──

function MetricGrid({ metrics, previous, nativeLanguage }: {
  metrics: CourageMetrics;
  previous: CourageMetrics | null;
  nativeLanguage: NativeLanguage;
}) {
  const fmtDur = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const prevLabel = t("couragePrevLabel", nativeLanguage);

  interface CardDef {
    value: string;
    label: string;
    prevValue: string | null;  // previous session's value for comparison
    inverse?: boolean;         // true = lower is better (native_switches)
    special?: string;          // e.g. "좋았어요" badge
  }

  const cards: CardDef[] = [
    {
      value: String(metrics.word_count),
      label: t("courageWords", nativeLanguage),
      prevValue: previous ? String(previous.word_count) : null,
    },
    {
      value: String(metrics.turn_count),
      label: t("courageTurns", nativeLanguage),
      prevValue: previous ? String(previous.turn_count) : null,
    },
    {
      value: String(metrics.complex_attempts),
      label: t("courageComplex", nativeLanguage),
      prevValue: previous ? String(previous.complex_attempts) : null,
    },
    {
      value: String(metrics.native_switches),
      label: t("courageNativeSwitches", nativeLanguage),
      prevValue: previous ? String(previous.native_switches) : null,
      inverse: true,
      special: previous && metrics.native_switches < previous.native_switches
        ? t("courageGoodJob", nativeLanguage) : undefined,
    },
    {
      value: metrics.quick_response_ratio != null
        ? `${Math.round(metrics.quick_response_ratio * 100)}%`
        : "\u2014",
      label: t("courageQuickResponse", nativeLanguage),
      prevValue: previous?.quick_response_ratio != null
        ? `${Math.round(previous.quick_response_ratio * 100)}%`
        : null,
    },
    {
      value: fmtDur(metrics.duration_seconds),
      label: t("courageDuration", nativeLanguage),
      prevValue: previous ? fmtDur(previous.duration_seconds) : null,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((card) => {
        // Determine arrow direction for the delta line
        let arrow: string | null = null;
        if (card.prevValue != null) {
          const cur = parseFloat(card.value.replace(/[:%]/g, ""));
          const prev = parseFloat(card.prevValue.replace(/[:%]/g, ""));
          if (!isNaN(cur) && !isNaN(prev)) {
            if (cur > prev) arrow = card.inverse ? "\u2191" : "\u2191";
            else if (cur < prev) arrow = card.inverse ? "\u2193" : "\u2193";
            else arrow = "\u2014";
          }
        }

        // Arrow color: green for improvement, gray for regression (never red)
        const improved = arrow === "\u2191"
          ? !card.inverse  // ↑ is good unless inverse
          : arrow === "\u2193"
            ? !!card.inverse   // ↓ is good for inverse metrics
            : false;
        const arrowColor = improved
          ? "text-emerald-400"
          : "text-[var(--text-secondary)]";

        return (
          <div
            key={card.label}
            className="bg-[var(--bg-elevated)] rounded-lg px-3 py-2.5"
          >
            <div className="text-xl font-bold text-[var(--text-primary)] leading-tight">
              {card.value}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              {card.label}
            </div>
            {card.prevValue != null && (
              <div className={`text-[10px] mt-1 ${arrowColor} flex items-center gap-1`}>
                {arrow && <span>{arrow}</span>}
                <span>{prevLabel} {card.prevValue}</span>
                {card.special && (
                  <span className="text-emerald-400 font-medium ml-1">
                    {card.special}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/CourageScore.tsx
git commit -m "feat(courage): add CourageScore UI component with sparkline and metric cards"
```

---

### Task 7: Integrate CourageScore into ReviewPanel

**Files:**
- Modify: `src/components/ReviewPanel.tsx` — add CourageScore at top of review view

- [ ] **Step 1: Import CourageScore**

Add at top of `ReviewPanel.tsx`, after existing imports:

```typescript
import { CourageScore } from "./CourageScore";
```

- [ ] **Step 2: Add `language` to ReviewPanel props**

The ReviewPanel needs the session language. The `session` prop already has `session.language`. No prop change needed — we'll use `session.language`.

- [ ] **Step 3: Insert CourageScore component**

In the ReviewPanel return JSX, insert the CourageScore component after the header bar and before the conversation replay `div`. Between the closing `</div>` of the header (line 100) and the opening `<div className="flex-1 overflow-y-auto...">` (line 103):

```tsx
{/* Courage Score */}
<CourageScore
  sessionId={session.id}
  language={session.language}
  nativeLanguage={nativeLanguage}
/>
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Manual test**

Run: `npm run tauri dev`
1. Have a conversation (at least 2 user messages)
2. Switch language or clear chat (triggers session save + courage calculation)
3. Open session history, select the session
4. Verify: CourageScore section appears at top of review panel
5. Verify: metric cards show correct values
6. After 2+ sessions: verify sparkline graph appears

- [ ] **Step 6: Commit**

```bash
git add src/components/ReviewPanel.tsx
git commit -m "feat(courage): integrate courage score display into session review panel"
```

---

### Task 8: Final Polish — Edge Cases

**Files:**
- Modify: `src-tauri/src/courage.rs` — handle edge cases
- Modify: `src/components/CourageScore.tsx` — handle null/empty states

- [ ] **Step 1: Handle text-only sessions (no TTS)**

Already handled: `quick_response_ratio` is `null` when no gaps are collected. The UI shows "—" for null values.

- [ ] **Step 2: Handle zero-duration sessions**

In `courage.rs` `calculate_and_store`, if `duration_seconds <= 0`, skip calculation and return early:

```rust
// At the start of calculate_and_store:
if metrics.duration_seconds <= 0 {
    return Err("Session duration is zero".to_string());
}
```

- [ ] **Step 3: Verify compilation + tests**

Run: `cd src-tauri && cargo test courage && cargo check`
Expected: all pass

- [ ] **Step 4: Final commit**

```bash
git add src-tauri/src/courage.rs src/components/CourageScore.tsx
git commit -m "fix(courage): handle edge cases for zero-duration and text-only sessions"
```
