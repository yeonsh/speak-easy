use rusqlite::{Connection, params};
use serde::Serialize;

// ── scoring weights ──

const WEIGHT_WORDS: f32 = 0.35;
const WEIGHT_TURNS: f32 = 0.25;
const WEIGHT_COMPLEX: f32 = 0.20;
const WEIGHT_NATIVE: f32 = 0.0; // placeholder until STT tracking
const WEIGHT_QUICK: f32 = 0.15;
const WEIGHT_DURATION: f32 = 0.05;

// ── first-5-session absolute baselines ──

const BASE_WORD_COUNT: f32 = 50.0;
const BASE_TURN_COUNT: f32 = 5.0;
const BASE_COMPLEX: f32 = 2.0;
const BASE_NATIVE: f32 = 2.0;
const BASE_QUICK_RATIO: f32 = 0.3;
const BASE_DURATION: f32 = 300.0;

// ── types ──

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

// ── helper functions ──

fn complex_word_threshold(lang: &str) -> usize {
    match lang {
        "zh" | "ja" => 20,
        "ar" | "hi" | "tr" | "id" | "vi" | "ko" => 12,
        _ => 15,
    }
}

fn count_words(text: &str, lang: &str) -> usize {
    match lang {
        "zh" | "ja" => text.chars().filter(|c| !c.is_whitespace() && !c.is_ascii_punctuation()).count(),
        _ => text.split_whitespace().count(),
    }
}

fn has_connective(text: &str, lang: &str) -> bool {
    let lower = text.to_lowercase();
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
    // For zh/ja, check contains directly on the original text (no lowercasing needed for non-latin)
    let check_text = match lang {
        "zh" | "ja" | "ko" | "ar" | "hi" | "ru" => text,
        _ => &lower,
    };
    connectives.iter().any(|c| check_text.contains(c))
}

fn is_complex(text: &str, lang: &str) -> bool {
    count_words(text, lang) >= complex_word_threshold(lang) || has_connective(text, lang)
}

/// Detect if a user message is primarily in the native language rather than the target language.
/// Uses Unicode script/block detection to identify the dominant script of the text.
fn is_native_language_text(text: &str, target_lang: &str, native_lang: &str) -> bool {
    if target_lang == native_lang {
        return false;
    }
    let script = dominant_script(text);
    // Check if the dominant script matches the native language but not the target language
    let target_script = expected_script(target_lang);
    let native_script = expected_script(native_lang);
    if target_script == native_script {
        // Both languages use the same script (e.g., Spanish and French both Latin) — can't detect
        return false;
    }
    script == native_script && script != target_script
}

#[derive(Debug, PartialEq, Clone, Copy)]
enum Script {
    Latin,
    Hangul,
    Cjk,
    Hiragana,  // Japanese (hiragana/katakana)
    Cyrillic,
    Arabic,
    Devanagari,
    Thai,
    Other,
}

fn expected_script(lang: &str) -> Script {
    match lang {
        "en" | "es" | "fr" | "de" | "pt" | "it" | "tr" | "id" | "vi" | "pl" => Script::Latin,
        "ko" => Script::Hangul,
        "zh" => Script::Cjk,
        "ja" => Script::Hiragana,
        "ru" => Script::Cyrillic,
        "ar" => Script::Arabic,
        "hi" => Script::Devanagari,
        "th" => Script::Thai,
        _ => Script::Latin,
    }
}

fn char_script(c: char) -> Script {
    match c {
        '\u{AC00}'..='\u{D7AF}' | '\u{1100}'..='\u{11FF}' | '\u{3130}'..='\u{318F}' => Script::Hangul,
        '\u{4E00}'..='\u{9FFF}' | '\u{3400}'..='\u{4DBF}' | '\u{F900}'..='\u{FAFF}' => Script::Cjk,
        '\u{3040}'..='\u{309F}' | '\u{30A0}'..='\u{30FF}' | '\u{31F0}'..='\u{31FF}' => Script::Hiragana,
        '\u{0400}'..='\u{04FF}' => Script::Cyrillic,
        '\u{0600}'..='\u{06FF}' | '\u{0750}'..='\u{077F}' | '\u{FB50}'..='\u{FDFF}' | '\u{FE70}'..='\u{FEFF}' => Script::Arabic,
        '\u{0900}'..='\u{097F}' => Script::Devanagari,
        '\u{0E00}'..='\u{0E7F}' => Script::Thai,
        'A'..='Z' | 'a'..='z' | '\u{00C0}'..='\u{024F}' => Script::Latin,
        _ => Script::Other,
    }
}

fn dominant_script(text: &str) -> Script {
    let mut counts = [0u32; 9]; // one per Script variant
    for c in text.chars() {
        let idx = match char_script(c) {
            Script::Latin => 0,
            Script::Hangul => 1,
            Script::Cjk => 2,
            Script::Hiragana => 3,
            Script::Cyrillic => 4,
            Script::Arabic => 5,
            Script::Devanagari => 6,
            Script::Thai => 7,
            Script::Other => 8,
        };
        counts[idx] += 1;
    }
    // Find the dominant script (excluding Other)
    let scripts = [
        Script::Latin, Script::Hangul, Script::Cjk, Script::Hiragana,
        Script::Cyrillic, Script::Arabic, Script::Devanagari, Script::Thai,
    ];
    scripts.iter()
        .max_by_key(|s| {
            let idx = match s {
                Script::Latin => 0, Script::Hangul => 1, Script::Cjk => 2, Script::Hiragana => 3,
                Script::Cyrillic => 4, Script::Arabic => 5, Script::Devanagari => 6, Script::Thai => 7,
                _ => 8,
            };
            counts[idx]
        })
        .copied()
        .unwrap_or(Script::Other)
}

// ── normalize ──

fn normalize(value: f32, baseline: f32) -> f32 {
    let ratio = if baseline > 0.0 { value / baseline } else { 1.0 };
    (ratio * 100.0).clamp(0.0, 150.0) / 150.0 * 100.0
}

fn normalize_inverse(value: f32, baseline: f32) -> f32 {
    let ratio = if baseline > 0.0 { value / baseline } else { 1.0 };
    let inverted = 2.0 - ratio;
    (inverted * 100.0).clamp(0.0, 200.0) / 200.0 * 100.0
}

// ── compute_metrics ──

pub fn compute_metrics(
    messages: &[(String, String)],
    language: &str,
    native_language: &str,
    duration_seconds: i64,
    response_gaps_ms: &Option<Vec<i64>>,
) -> CourageMetrics {
    let mut word_count: i64 = 0;
    let mut turn_count: i64 = 0;
    let mut complex_attempts: i64 = 0;
    let mut native_switches: i64 = 0;

    for (role, content) in messages {
        if role == "user" {
            turn_count += 1;
            word_count += count_words(content, language) as i64;
            if is_complex(content, language) {
                complex_attempts += 1;
            }
            if is_native_language_text(content, language, native_language) {
                native_switches += 1;
            }
        }
    }

    let quick_response_ratio = response_gaps_ms.as_ref().map(|gaps| {
        let valid: Vec<&i64> = gaps.iter().filter(|&&g| g > 0).collect();
        if valid.is_empty() {
            return 0.0;
        }
        let quick = valid.iter().filter(|&&&g| g <= 30000).count();
        quick as f64 / valid.len() as f64
    });

    CourageMetrics {
        word_count,
        turn_count,
        native_switches,
        complex_attempts,
        quick_response_ratio,
        duration_seconds,
        score: 0.0,
    }
}

// ── baselines ──

struct Baselines {
    word_count: f32,
    turn_count: f32,
    complex: f32,
    native: f32,
    quick_ratio: f32,
    duration: f32,
}

fn get_baselines(conn: &Connection, language: &str, exclude_session: &str) -> Baselines {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM courage_scores cs
             JOIN sessions s ON s.id = cs.session_id
             WHERE s.language = ?1 AND cs.session_id != ?2",
            params![language, exclude_session],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if count < 5 {
        return Baselines {
            word_count: BASE_WORD_COUNT,
            turn_count: BASE_TURN_COUNT,
            complex: BASE_COMPLEX,
            native: BASE_NATIVE,
            quick_ratio: BASE_QUICK_RATIO,
            duration: BASE_DURATION,
        };
    }

    let result = conn.query_row(
        "SELECT AVG(word_count), AVG(turn_count), AVG(complex_attempts),
                AVG(native_switches), AVG(quick_response_ratio), AVG(duration_seconds)
         FROM (
             SELECT cs.word_count, cs.turn_count, cs.complex_attempts,
                    cs.native_switches, cs.quick_response_ratio, cs.duration_seconds
             FROM courage_scores cs
             JOIN sessions s ON s.id = cs.session_id
             WHERE s.language = ?1 AND cs.session_id != ?2
             ORDER BY cs.created_at DESC
             LIMIT 10
         )",
        params![language, exclude_session],
        |row| {
            Ok(Baselines {
                word_count: row.get::<_, f64>(0).unwrap_or(BASE_WORD_COUNT as f64) as f32,
                turn_count: row.get::<_, f64>(1).unwrap_or(BASE_TURN_COUNT as f64) as f32,
                complex: row.get::<_, f64>(2).unwrap_or(BASE_COMPLEX as f64) as f32,
                native: row.get::<_, f64>(3).unwrap_or(BASE_NATIVE as f64) as f32,
                quick_ratio: row.get::<_, f64>(4).unwrap_or(BASE_QUICK_RATIO as f64) as f32,
                duration: row.get::<_, f64>(5).unwrap_or(BASE_DURATION as f64) as f32,
            })
        },
    );

    result.unwrap_or(Baselines {
        word_count: BASE_WORD_COUNT,
        turn_count: BASE_TURN_COUNT,
        complex: BASE_COMPLEX,
        native: BASE_NATIVE,
        quick_ratio: BASE_QUICK_RATIO,
        duration: BASE_DURATION,
    })
}

// ── calculate_and_store ──

pub fn calculate_and_store(
    conn: &Connection,
    session_id: &str,
    language: &str,
    metrics: &mut CourageMetrics,
) -> Result<(), String> {
    if metrics.duration_seconds <= 0 {
        return Err("Session duration is zero".to_string());
    }

    let baselines = get_baselines(conn, language, session_id);

    let s_words = normalize(metrics.word_count as f32, baselines.word_count);
    let s_turns = normalize(metrics.turn_count as f32, baselines.turn_count);
    let s_complex = normalize(metrics.complex_attempts as f32, baselines.complex);
    let s_native = normalize_inverse(metrics.native_switches as f32, baselines.native);
    let s_quick = normalize(
        metrics.quick_response_ratio.unwrap_or(0.0) as f32,
        baselines.quick_ratio,
    );
    let s_duration = normalize(metrics.duration_seconds as f32, baselines.duration);

    let score = s_words * WEIGHT_WORDS
        + s_turns * WEIGHT_TURNS
        + s_complex * WEIGHT_COMPLEX
        + s_native * WEIGHT_NATIVE
        + s_quick * WEIGHT_QUICK
        + s_duration * WEIGHT_DURATION;

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
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── load_history ──

pub fn load_history(
    conn: &Connection,
    session_id: &str,
    language: &str,
) -> Result<Option<CourageHistory>, String> {
    // Load current session's metrics
    let current = match conn.query_row(
        "SELECT word_count, turn_count, native_switches, complex_attempts,
                quick_response_ratio, duration_seconds, score
         FROM courage_scores WHERE session_id = ?1",
        params![session_id],
        |row| {
            Ok(CourageMetrics {
                word_count: row.get(0)?,
                turn_count: row.get(1)?,
                native_switches: row.get(2)?,
                complex_attempts: row.get(3)?,
                quick_response_ratio: row.get(4)?,
                duration_seconds: row.get(5)?,
                score: row.get(6)?,
            })
        },
    ) {
        Ok(m) => m,
        Err(_) => return Ok(None),
    };

    // Load previous session's full metrics
    let previous = conn
        .query_row(
            "SELECT cs.word_count, cs.turn_count, cs.native_switches, cs.complex_attempts,
                    cs.quick_response_ratio, cs.duration_seconds, cs.score
             FROM courage_scores cs
             JOIN sessions s ON s.id = cs.session_id
             WHERE s.language = ?1 AND cs.session_id != ?2
             ORDER BY cs.created_at DESC
             LIMIT 1",
            params![language, session_id],
            |row| {
                Ok(CourageMetrics {
                    word_count: row.get(0)?,
                    turn_count: row.get(1)?,
                    native_switches: row.get(2)?,
                    complex_attempts: row.get(3)?,
                    quick_response_ratio: row.get(4)?,
                    duration_seconds: row.get(5)?,
                    score: row.get(6)?,
                })
            },
        )
        .ok();

    // Load last 10 history entries
    let mut stmt = conn
        .prepare(
            "SELECT cs.session_id, cs.score, s.started_at
             FROM courage_scores cs
             JOIN sessions s ON s.id = cs.session_id
             WHERE s.language = ?1
             ORDER BY s.started_at DESC
             LIMIT 10",
        )
        .map_err(|e| e.to_string())?;

    let history: Vec<CourageHistoryEntry> = stmt
        .query_map(params![language], |row| {
            Ok(CourageHistoryEntry {
                session_id: row.get(0)?,
                score: row.get(1)?,
                started_at: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Some(CourageHistory {
        current,
        previous,
        history,
    }))
}

// ── tests ──

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_words_english() {
        assert_eq!(count_words("hello world foo bar", "en"), 4);
        assert_eq!(count_words("I am learning Spanish", "en"), 4);
        assert_eq!(count_words("", "en"), 0);
    }

    #[test]
    fn test_count_words_chinese() {
        // "我喜欢学中文" = 6 characters
        assert_eq!(count_words("我喜欢学中文", "zh"), 6);
        // with spaces filtered out, "我 喜欢" = 3 non-whitespace chars
        assert_eq!(count_words("我 喜欢", "zh"), 3);
    }

    #[test]
    fn test_has_connective_en() {
        assert!(has_connective("I went because it was fun", "en"));
        assert!(has_connective("Although it rained, we went", "en"));
        assert!(!has_connective("I like apples", "en"));
    }

    #[test]
    fn test_has_connective_es() {
        assert!(has_connective("Fui porque era divertido", "es"));
        assert!(!has_connective("Me gustan las manzanas", "es"));
    }

    #[test]
    fn test_has_connective_zh() {
        assert!(has_connective("因为天气好所以我出门了", "zh"));
        assert!(!has_connective("我喜欢苹果", "zh"));
    }

    #[test]
    fn test_is_complex_by_length() {
        // 15 words for English threshold
        let long = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen";
        assert!(is_complex(long, "en"));
        let short = "hello world";
        assert!(!is_complex(short, "en"));
    }

    #[test]
    fn test_is_complex_by_connective() {
        assert!(is_complex("I went because I wanted to", "en"));
        assert!(!is_complex("I like cats", "en"));
    }

    #[test]
    fn test_normalize() {
        // value == baseline => ratio 1.0 => 100/150*100 = 66.67
        let result = normalize(50.0, 50.0);
        assert!((result - 66.67).abs() < 0.1);

        // value == 0 => 0
        assert_eq!(normalize(0.0, 50.0), 0.0);

        // value >> baseline => clamped at 150 => 100
        let result = normalize(500.0, 50.0);
        assert!((result - 100.0).abs() < 0.1);
    }

    #[test]
    fn test_normalize_inverse() {
        // value == baseline => ratio 1.0, inverted = 1.0 => 100/200*100 = 50
        let result = normalize_inverse(2.0, 2.0);
        assert!((result - 50.0).abs() < 0.1);

        // value == 0 => ratio 0, inverted = 2.0 => 200/200*100 = 100
        let result = normalize_inverse(0.0, 2.0);
        assert!((result - 100.0).abs() < 0.1);
    }

    #[test]
    fn test_compute_metrics_basic() {
        // "I went because I needed food" = 6 words, has connective => complex
        // "Yes it was fun too" = 5 words => not complex
        // total = 11 words, 2 turns, 1 complex
        let messages = vec![
            ("user".to_string(), "I went because I needed food".to_string()),
            ("assistant".to_string(), "That sounds great!".to_string()),
            ("user".to_string(), "Yes it was fun too".to_string()),
        ];
        let metrics = compute_metrics(&messages, "en", "ko", 120, &None);
        assert_eq!(metrics.word_count, 11);
        assert_eq!(metrics.turn_count, 2);
        assert_eq!(metrics.complex_attempts, 1);
    }

    #[test]
    fn test_compute_metrics_with_gaps() {
        let messages = vec![
            ("user".to_string(), "Hello there".to_string()),
            ("assistant".to_string(), "Hi!".to_string()),
            ("user".to_string(), "How are you".to_string()),
        ];
        let gaps = Some(vec![5000, 45000]);
        let metrics = compute_metrics(&messages, "en", "ko", 60, &gaps);
        // 5000 <= 30000 => quick; 45000 > 30000 => not quick
        // ratio = 1/2 = 0.5
        assert!((metrics.quick_response_ratio.unwrap() - 0.5).abs() < 0.01);
    }
}
