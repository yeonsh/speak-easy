use rusqlite::{Connection, params};
use serde::Serialize;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct DictionaryDb {
    conn: Arc<Mutex<Connection>>,
}

#[derive(Debug, Serialize)]
pub struct VocabularyEntry {
    pub id: i64,
    pub word: String,
    pub definition: String,
    pub target_lang: String,
    pub native_lang: String,
    pub created_at: i64,
}

impl DictionaryDb {
    pub fn open() -> Result<Self, String> {
        let db_path = dirs::home_dir()
            .ok_or("Could not find home directory")?
            .join(".speakeasy")
            .join("dictionary.db");

        std::fs::create_dir_all(db_path.parent().unwrap()).map_err(|e| e.to_string())?;

        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

        conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS lookups (
                kind TEXT NOT NULL,
                key TEXT NOT NULL,
                target_lang TEXT NOT NULL,
                native_lang TEXT NOT NULL,
                result TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                PRIMARY KEY (kind, key, target_lang, native_lang)
            );"
        ).map_err(|e| e.to_string())?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS user_vocabulary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT NOT NULL,
                definition TEXT NOT NULL,
                target_lang TEXT NOT NULL,
                native_lang TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                UNIQUE (word, target_lang, native_lang)
            );"
        ).map_err(|e| e.to_string())?;

        crate::session::init_tables(&conn)?;

        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }

    pub fn with_conn<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        f(&conn)
    }

    pub fn get(&self, kind: &str, key: &str, target_lang: &str, native_lang: &str) -> Option<String> {
        let conn = self.conn.lock().ok()?;
        conn.query_row(
            "SELECT result FROM lookups WHERE kind = ?1 AND key = ?2 AND target_lang = ?3 AND native_lang = ?4",
            params![kind, key, target_lang, native_lang],
            |row| row.get(0),
        ).ok()
    }

    pub fn put(&self, kind: &str, key: &str, target_lang: &str, native_lang: &str, result: &str) {
        if let Ok(conn) = self.conn.lock() {
            let _ = conn.execute(
                "INSERT OR REPLACE INTO lookups (kind, key, target_lang, native_lang, result) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![kind, key, target_lang, native_lang, result],
            );
        }
    }
}

#[tauri::command]
pub fn add_vocabulary(
    db: tauri::State<'_, DictionaryDb>,
    word: String,
    definition: String,
    target_lang: String,
    native_lang: String,
) -> Result<(), String> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO user_vocabulary (word, definition, target_lang, native_lang) VALUES (?1, ?2, ?3, ?4)",
            params![word, definition, target_lang, native_lang],
        ).map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn list_vocabulary(
    db: tauri::State<'_, DictionaryDb>,
    target_lang: Option<String>,
) -> Result<Vec<VocabularyEntry>, String> {
    db.with_conn(|conn| {
        let mut entries = Vec::new();
        if let Some(lang) = target_lang {
            let mut stmt = conn.prepare(
                "SELECT id, word, definition, target_lang, native_lang, created_at FROM user_vocabulary WHERE target_lang = ?1 ORDER BY created_at DESC"
            ).map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![lang], |row| {
                Ok(VocabularyEntry {
                    id: row.get(0)?,
                    word: row.get(1)?,
                    definition: row.get(2)?,
                    target_lang: row.get(3)?,
                    native_lang: row.get(4)?,
                    created_at: row.get(5)?,
                })
            }).map_err(|e| e.to_string())?;
            for row in rows {
                entries.push(row.map_err(|e| e.to_string())?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, word, definition, target_lang, native_lang, created_at FROM user_vocabulary ORDER BY created_at DESC"
            ).map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |row| {
                Ok(VocabularyEntry {
                    id: row.get(0)?,
                    word: row.get(1)?,
                    definition: row.get(2)?,
                    target_lang: row.get(3)?,
                    native_lang: row.get(4)?,
                    created_at: row.get(5)?,
                })
            }).map_err(|e| e.to_string())?;
            for row in rows {
                entries.push(row.map_err(|e| e.to_string())?);
            }
        }
        Ok(entries)
    })
}

#[tauri::command]
pub fn delete_vocabulary(
    db: tauri::State<'_, DictionaryDb>,
    id: i64,
) -> Result<(), String> {
    db.with_conn(|conn| {
        conn.execute("DELETE FROM user_vocabulary WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}
