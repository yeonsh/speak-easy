use rusqlite::{Connection, params};
use std::sync::Mutex;

pub struct DictionaryDb {
    conn: Mutex<Connection>,
}

impl DictionaryDb {
    pub fn open() -> Result<Self, String> {
        let db_path = dirs::home_dir()
            .ok_or("Could not find home directory")?
            .join(".speakeasy")
            .join("dictionary.db");

        std::fs::create_dir_all(db_path.parent().unwrap()).map_err(|e| e.to_string())?;

        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

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

        Ok(Self { conn: Mutex::new(conn) })
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
