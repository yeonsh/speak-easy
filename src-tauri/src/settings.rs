use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub language: String,
    pub mode: String,
    pub llm_temperature: f32,
    pub tts_speed: f32,
    pub tts_voice: String,
    pub gpu_layers: i32,
    pub whisper_model: String,
    #[serde(default)]
    pub llm_provider: String,
    #[serde(default)]
    pub gemini_api_key: String,
    #[serde(default = "default_gemini_model")]
    pub gemini_model: String,
}

fn default_gemini_model() -> String {
    "gemini-2.5-flash".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "en".to_string(),
            mode: "free-talk".to_string(),
            llm_temperature: 0.7,
            tts_speed: 1.0,
            tts_voice: "default".to_string(),
            gpu_layers: -1,
            whisper_model: "base".to_string(),
            llm_provider: "local".to_string(),
            gemini_api_key: String::new(),
            gemini_model: "gemini-2.5-flash".to_string(),
        }
    }
}

fn settings_path() -> Result<PathBuf, String> {
    let dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".speakeasy");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

pub fn load_settings() -> Result<Settings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

pub fn save_settings(settings: &Settings) -> Result<(), String> {
    let path = settings_path()?;
    let data = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}
