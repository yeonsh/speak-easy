use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_native_language")]
    pub native_language: String,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default)]
    pub corrections_enabled: bool,
    #[serde(default = "default_temperature")]
    pub llm_temperature: f32,
    #[serde(default = "default_tts_engine")]
    pub tts_engine: String,
    #[serde(default = "default_tts_speed")]
    pub tts_speed: f32,
    #[serde(default = "default_tts_voice")]
    pub tts_voice: String,
    #[serde(default = "default_gpu_layers")]
    pub gpu_layers: i32,
    #[serde(default = "default_whisper_model")]
    pub whisper_model: String,
    #[serde(default)]
    pub llm_model: String,
    #[serde(default = "default_llm_provider")]
    pub llm_provider: String,
    #[serde(default)]
    pub gemini_api_key: String,
    #[serde(default = "default_gemini_model")]
    pub gemini_model: String,
}

fn default_language() -> String { "en".to_string() }
fn default_native_language() -> String { "ko".to_string() }
fn default_mode() -> String { "free-talk".to_string() }
fn default_temperature() -> f32 { 0.7 }
fn default_tts_engine() -> String { "edge".to_string() }
fn default_tts_speed() -> f32 { 1.0 }
fn default_tts_voice() -> String { "default".to_string() }
fn default_gpu_layers() -> i32 { -1 }
fn default_whisper_model() -> String { "base".to_string() }
fn default_llm_provider() -> String { "local".to_string() }
fn default_gemini_model() -> String { "gemini-2.5-flash".to_string() }

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: default_language(),
            native_language: default_native_language(),
            mode: default_mode(),
            corrections_enabled: false,
            llm_temperature: default_temperature(),
            tts_engine: default_tts_engine(),
            tts_speed: default_tts_speed(),
            tts_voice: default_tts_voice(),
            gpu_layers: default_gpu_layers(),
            whisper_model: default_whisper_model(),
            llm_model: String::new(),
            llm_provider: default_llm_provider(),
            gemini_api_key: String::new(),
            gemini_model: default_gemini_model(),
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
    // Use default values for any missing fields (handles old snake_case files gracefully)
    serde_json::from_str(&data).or_else(|_| Ok(Settings::default()))
}

pub fn save_settings(settings: &Settings) -> Result<(), String> {
    let path = settings_path()?;
    let data = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}
