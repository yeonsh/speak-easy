use serde::{Deserialize, Serialize};
use std::path::PathBuf;

mod chat;
mod downloads;
mod llm;
mod settings;
mod stt;
mod tts;

#[derive(Debug, Serialize, Deserialize)]
pub struct AppState {
    pub models_dir: PathBuf,
    pub settings: settings::Settings,
}

#[tauri::command]
fn get_models_dir() -> Result<String, String> {
    let dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".speakeasy")
        .join("models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn check_model_exists(model_name: String) -> bool {
    dirs::home_dir()
        .map(|h| h.join(".speakeasy").join("models").join(&model_name).exists())
        .unwrap_or(false)
}

#[tauri::command]
fn get_settings() -> Result<settings::Settings, String> {
    settings::load_settings()
}

#[tauri::command]
fn save_settings(new_settings: settings::Settings) -> Result<(), String> {
    settings::save_settings(&new_settings)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(llm::LlmState::new())
        .manage(stt::SttState::new())
        .manage(tts::TtsState::new())
        .invoke_handler(tauri::generate_handler![
            get_models_dir,
            check_model_exists,
            get_settings,
            save_settings,
            llm::start_llm_server,
            llm::stop_llm_server,
            llm::is_llm_running,
            llm::get_llm_port,
            chat::send_chat_message,
            chat::cancel_generation,
            stt::load_whisper_model,
            stt::is_whisper_loaded,
            stt::transcribe_audio,
            stt::decode_wav_to_samples,
            tts::load_tts_voice,
            tts::is_tts_loaded,
            tts::list_voices,
            tts::synthesize_speech,
            tts::samples_to_wav_bytes,
            downloads::get_available_models,
            downloads::get_installed_models,
            downloads::check_setup_complete,
            downloads::download_file,
            downloads::delete_model,
            downloads::open_models_folder,
            downloads::get_llama_server_info,
            downloads::extract_llama_server,
            downloads::get_llama_server_path,
            downloads::is_espeak_installed,
            downloads::install_espeak,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
