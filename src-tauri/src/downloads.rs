use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Clone)]
pub struct DownloadProgress {
    pub id: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub stage: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub size_bytes: u64,
    pub url: String,
    pub dest_dir: String,
    pub filename: String,
}

fn models_dir() -> Result<PathBuf, String> {
    let dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".speakeasy")
        .join("models");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn voices_dir() -> Result<PathBuf, String> {
    let dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".speakeasy")
        .join("voices");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn get_available_models() -> Vec<ModelInfo> {
    vec![
        // Whisper STT models
        ModelInfo {
            id: "whisper-base".to_string(),
            name: "Whisper Base (multilingual)".to_string(),
            size_bytes: 147_951_465,
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
                .to_string(),
            dest_dir: "models".to_string(),
            filename: "ggml-base.bin".to_string(),
        },
        ModelInfo {
            id: "whisper-small".to_string(),
            name: "Whisper Small (better accuracy)".to_string(),
            size_bytes: 487_601_967,
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
                .to_string(),
            dest_dir: "models".to_string(),
            filename: "ggml-small.bin".to_string(),
        },
        // Piper TTS voices — each voice has an .onnx model and .onnx.json config
        // English
        ModelInfo {
            id: "voice-en-onnx".to_string(),
            name: "English voice (Amy, medium)".to_string(),
            size_bytes: 63_201_685,
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx"
                .to_string(),
            dest_dir: "voices".to_string(),
            filename: "en_US-amy-medium.onnx".to_string(),
        },
        ModelInfo {
            id: "voice-en-json".to_string(),
            name: "English voice config".to_string(),
            size_bytes: 5_000,
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json"
                .to_string(),
            dest_dir: "voices".to_string(),
            filename: "en_US-amy-medium.onnx.json".to_string(),
        },
        // Spanish
        ModelInfo {
            id: "voice-es-onnx".to_string(),
            name: "Spanish voice (Davefx, medium)".to_string(),
            size_bytes: 63_201_685,
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx"
                .to_string(),
            dest_dir: "voices".to_string(),
            filename: "es_ES-davefx-medium.onnx".to_string(),
        },
        ModelInfo {
            id: "voice-es-json".to_string(),
            name: "Spanish voice config".to_string(),
            size_bytes: 5_000,
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json"
                .to_string(),
            dest_dir: "voices".to_string(),
            filename: "es_ES-davefx-medium.onnx.json".to_string(),
        },
        // Chinese
        ModelInfo {
            id: "voice-zh-onnx".to_string(),
            name: "Chinese voice (Huayan, medium)".to_string(),
            size_bytes: 63_201_685,
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx"
                .to_string(),
            dest_dir: "voices".to_string(),
            filename: "zh_CN-huayan-medium.onnx".to_string(),
        },
        ModelInfo {
            id: "voice-zh-json".to_string(),
            name: "Chinese voice config".to_string(),
            size_bytes: 5_000,
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx.json"
                .to_string(),
            dest_dir: "voices".to_string(),
            filename: "zh_CN-huayan-medium.onnx.json".to_string(),
        },
        // German
        ModelInfo {
            id: "voice-de-onnx".to_string(),
            name: "German voice (Thorsten, medium)".to_string(),
            size_bytes: 63_201_685,
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx"
                .to_string(),
            dest_dir: "voices".to_string(),
            filename: "de_DE-thorsten-medium.onnx".to_string(),
        },
        ModelInfo {
            id: "voice-de-json".to_string(),
            name: "German voice config".to_string(),
            size_bytes: 5_000,
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json"
                .to_string(),
            dest_dir: "voices".to_string(),
            filename: "de_DE-thorsten-medium.onnx.json".to_string(),
        },
        // Japanese
        ModelInfo {
            id: "voice-ja-onnx".to_string(),
            name: "Japanese voice (Takumi, medium)".to_string(),
            size_bytes: 63_201_685,
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ja/ja_JP/takumi/medium/ja_JP-takumi-medium.onnx"
                .to_string(),
            dest_dir: "voices".to_string(),
            filename: "ja_JP-takumi-medium.onnx".to_string(),
        },
        ModelInfo {
            id: "voice-ja-json".to_string(),
            name: "Japanese voice config".to_string(),
            size_bytes: 5_000,
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ja/ja_JP/takumi/medium/ja_JP-takumi-medium.onnx.json"
                .to_string(),
            dest_dir: "voices".to_string(),
            filename: "ja_JP-takumi-medium.onnx.json".to_string(),
        },
    ]
}

#[tauri::command]
pub fn get_installed_models() -> Result<Vec<String>, String> {
    let mut installed = Vec::new();

    let mdir = models_dir()?;
    if let Ok(entries) = fs::read_dir(&mdir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                installed.push(name.to_string());
            }
        }
    }

    let vdir = voices_dir()?;
    if let Ok(entries) = fs::read_dir(&vdir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                installed.push(format!("voices/{}", name));
            }
        }
    }

    Ok(installed)
}

#[tauri::command]
pub fn check_setup_complete() -> Result<SetupStatus, String> {
    let mdir = models_dir()?;
    let vdir = voices_dir()?;

    let has_whisper = mdir.join("ggml-base.bin").exists() || mdir.join("ggml-small.bin").exists();
    let has_llm = fs::read_dir(&mdir)
        .map(|entries| {
            entries
                .flatten()
                .any(|e| e.path().extension().is_some_and(|ext| ext == "gguf"))
        })
        .unwrap_or(false);
    let has_tts = fs::read_dir(&vdir)
        .map(|entries| {
            entries
                .flatten()
                .any(|e| e.path().extension().is_some_and(|ext| ext == "onnx"))
        })
        .unwrap_or(false);

    // Check if llama-server is available
    let has_llama_server = which_llama_server();

    Ok(SetupStatus {
        has_whisper,
        has_llm,
        has_tts,
        has_llama_server,
        models_dir: mdir.to_string_lossy().to_string(),
        voices_dir: vdir.to_string_lossy().to_string(),
    })
}

#[derive(Debug, Serialize, Clone)]
pub struct SetupStatus {
    pub has_whisper: bool,
    pub has_llm: bool,
    pub has_tts: bool,
    pub has_llama_server: bool,
    pub models_dir: String,
    pub voices_dir: String,
}

fn which_llama_server() -> bool {
    std::process::Command::new("which")
        .arg("llama-server")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn download_file(app: AppHandle, url: String, dest_dir: String, filename: String, download_id: String) -> Result<(), String> {
    let base_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".speakeasy")
        .join(&dest_dir);
    fs::create_dir_all(&base_dir).map_err(|e| e.to_string())?;

    let dest_path = base_dir.join(&filename);
    let temp_path = base_dir.join(format!("{}.part", filename));

    // Resume support: check if partial download exists
    let mut downloaded: u64 = 0;
    if temp_path.exists() {
        downloaded = fs::metadata(&temp_path)
            .map(|m| m.len())
            .unwrap_or(0);
    }

    let id = download_id.clone();
    let app_clone = app.clone();

    std::thread::spawn(move || {
        let result = download_with_progress(&app_clone, &url, &temp_path, &dest_path, downloaded, &id);
        match result {
            Ok(()) => {
                let _ = app_clone.emit(
                    &format!("download-complete-{}", id),
                    true,
                );
            }
            Err(e) => {
                let _ = app_clone.emit(
                    &format!("download-error-{}", id),
                    e,
                );
            }
        }
    });

    Ok(())
}

fn download_with_progress(
    app: &AppHandle,
    url: &str,
    temp_path: &std::path::Path,
    dest_path: &std::path::Path,
    resume_from: u64,
    download_id: &str,
) -> Result<(), String> {
    let mut builder = ureq::get(url);

    if resume_from > 0 {
        builder = builder.header("Range", &format!("bytes={}-", resume_from));
    }

    let response = builder.call().map_err(|e| format!("Download failed: {}", e))?;

    let total = response
        .headers()
        .get("Content-Length")
        .and_then(|v| v.to_str().ok()?.parse::<u64>().ok())
        .map(|cl| cl + resume_from);

    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(temp_path)
        .map_err(|e| e.to_string())?;

    let mut reader = response.into_body().into_reader();
    let mut buf = [0u8; 65536];
    let mut downloaded = resume_from;
    let mut last_emit = std::time::Instant::now();

    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        downloaded += n as u64;

        // Emit progress every 200ms
        if last_emit.elapsed().as_millis() >= 200 {
            let _ = app.emit(
                &format!("download-progress-{}", download_id),
                DownloadProgress {
                    id: download_id.to_string(),
                    downloaded,
                    total,
                    stage: "downloading".to_string(),
                },
            );
            last_emit = std::time::Instant::now();
        }
    }

    file.flush().map_err(|e| e.to_string())?;
    drop(file);

    // Move temp file to final destination
    fs::rename(temp_path, dest_path).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_model(dest_dir: String, filename: String) -> Result<(), String> {
    let path = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".speakeasy")
        .join(&dest_dir)
        .join(&filename);

    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_models_folder() -> Result<(), String> {
    let dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".speakeasy");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    open::that(&dir).map_err(|e| e.to_string())
}
