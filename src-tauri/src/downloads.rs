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
        // LLM GGUF models
        ModelInfo {
            id: "llm-qwen3-4b".to_string(),
            name: "Qwen3 4B (quick start)".to_string(),
            size_bytes: 2_700_000_000,
            url: "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf"
                .to_string(),
            dest_dir: "models".to_string(),
            filename: "Qwen3-4B-Q4_K_M.gguf".to_string(),
        },
        ModelInfo {
            id: "llm-qwen3-30b".to_string(),
            name: "Qwen3 30B-A3B MoE (full quality)".to_string(),
            size_bytes: 17_300_000_000,
            url: "https://huggingface.co/Qwen/Qwen3-30B-A3B-GGUF/resolve/main/Qwen3-30B-A3B-Q4_K_M.gguf"
                .to_string(),
            dest_dir: "models".to_string(),
            filename: "Qwen3-30B-A3B-Q4_K_M.gguf".to_string(),
        },
        // Kokoro TTS — single model + voices file covers all languages
        ModelInfo {
            id: "kokoro-model".to_string(),
            name: "Kokoro TTS model (all languages)".to_string(),
            size_bytes: 325_000_000,
            url: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
                .to_string(),
            dest_dir: "voices".to_string(),
            filename: "kokoro-v1.0.onnx".to_string(),
        },
        ModelInfo {
            id: "kokoro-voices".to_string(),
            name: "Kokoro voice pack (50+ voices)".to_string(),
            size_bytes: 28_000_000,
            url: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
                .to_string(),
            dest_dir: "voices".to_string(),
            filename: "voices-v1.0.bin".to_string(),
        },
    ]
}

#[derive(Debug, Serialize, Clone)]
pub struct LocalModel {
    pub filename: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn list_llm_models() -> Result<Vec<LocalModel>, String> {
    let mdir = models_dir()?;
    let mut models = Vec::new();
    if let Ok(entries) = fs::read_dir(&mdir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "gguf") {
                if let (Some(name), Ok(meta)) = (path.file_name(), fs::metadata(&path)) {
                    models.push(LocalModel {
                        filename: name.to_string_lossy().to_string(),
                        size_bytes: meta.len(),
                    });
                }
            }
        }
    }
    models.sort_by(|a, b| a.filename.cmp(&b.filename));
    Ok(models)
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
    let has_tts = vdir.join("kokoro-v1.0.onnx").exists() && vdir.join("voices-v1.0.bin").exists();

    // Check if llama-server is available
    let has_llama_server = which_llama_server();
    let has_espeak = check_espeak_available();

    Ok(SetupStatus {
        has_whisper,
        has_llm,
        has_tts,
        has_llama_server,
        has_espeak,
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
    pub has_espeak: bool,
    pub models_dir: String,
    pub voices_dir: String,
}

fn bin_dir() -> Result<PathBuf, String> {
    let dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".speakeasy")
        .join("bin");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn which_llama_server() -> bool {
    // Check ~/.speakeasy/bin/ first
    if let Ok(dir) = bin_dir() {
        let bin = dir.join(llama_binary_name());
        if bin.exists() {
            return true;
        }
    }
    // Fall back to PATH
    std::process::Command::new("which")
        .arg("llama-server")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn llama_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "llama-server.exe"
    } else {
        "llama-server"
    }
}

/// Returns the URL for the llama-server binary matching the current platform.
/// Uses the official llama.cpp GitHub releases.
#[tauri::command]
pub fn get_llama_server_info() -> Result<ModelInfo, String> {
    let (os, arch) = (std::env::consts::OS, std::env::consts::ARCH);

    // llama.cpp release artifacts: .tar.gz for macOS/Linux, .zip for Windows
    let release_tag = "b8329";
    let base = format!(
        "https://github.com/ggml-org/llama.cpp/releases/download/{}",
        release_tag
    );

    let (artifact, size_est) = match (os, arch) {
        ("macos", "aarch64") => (
            format!("llama-{}-bin-macos-arm64.tar.gz", release_tag),
            45_000_000u64,
        ),
        ("macos", "x86_64") => (
            format!("llama-{}-bin-macos-x64.tar.gz", release_tag),
            42_000_000,
        ),
        ("linux", "x86_64") => (
            format!("llama-{}-bin-ubuntu-x64.tar.gz", release_tag),
            50_000_000,
        ),
        ("windows", "x86_64") => (
            format!("llama-{}-bin-win-cpu-x64.zip", release_tag),
            55_000_000,
        ),
        _ => return Err(format!("Unsupported platform: {}-{}", os, arch)),
    };

    Ok(ModelInfo {
        id: "llama-server".to_string(),
        name: format!("llama-server ({}-{})", os, arch),
        size_bytes: size_est,
        url: format!("{}/{}", base, artifact),
        dest_dir: "bin".to_string(),
        filename: artifact,
    })
}

/// After downloading the zip, extract llama-server binary from it
#[tauri::command]
pub fn extract_llama_server() -> Result<(), String> {
    let dir = bin_dir()?;

    // Find the archive file (.tar.gz or .zip)
    let archive_path = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .find(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.ends_with(".tar.gz") || name.ends_with(".zip")
        })
        .map(|e| e.path())
        .ok_or("No archive file found in bin directory")?;

    let archive_name = archive_path.to_string_lossy().to_string();

    if archive_name.ends_with(".tar.gz") {
        // Extract tar.gz: flatten directory structure with --strip-components=1
        let output = std::process::Command::new("tar")
            .args(["xzf"])
            .arg(&archive_path)
            .arg("--strip-components=1")
            .arg("-C")
            .arg(dir.to_str().unwrap())
            .output()
            .map_err(|e| format!("Failed to run tar: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Failed to extract llama-server from tar.gz: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    } else {
        // Extract zip
        let output = std::process::Command::new("unzip")
            .args(["-o", "-j"])
            .arg(&archive_path)
            .arg("-d")
            .arg(dir.to_str().unwrap())
            .output()
            .map_err(|e| format!("Failed to run unzip: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Failed to extract llama-server from zip: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }

    // Make executables and shared libs usable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let mut perms = fs::metadata(&path)
                        .map_err(|e| e.to_string())?
                        .permissions();
                    perms.set_mode(0o755);
                    fs::set_permissions(&path, perms).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    // Clean up archive
    let _ = fs::remove_file(&archive_path);

    Ok(())
}

/// Get the resolved path to llama-server (bin dir or PATH)
#[tauri::command]
pub fn get_llama_server_path() -> Result<String, String> {
    // Check ~/.speakeasy/bin/ first
    if let Ok(dir) = bin_dir() {
        let bin = dir.join(llama_binary_name());
        if bin.exists() {
            return Ok(bin.to_string_lossy().to_string());
        }
    }
    // Fall back to PATH
    let output = std::process::Command::new("which")
        .arg("llama-server")
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err("llama-server not found".to_string())
    }
}

#[tauri::command]
pub fn download_file(app: AppHandle, url: String, dest_dir: String, filename: String, download_id: String) -> Result<(), String> {
    eprintln!("[download_file] Called: id={}, url={}, dest_dir={}, filename={}", download_id, url, dest_dir, filename);
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
    use std::time::Duration;

    let tls_config = ureq::tls::TlsConfig::builder()
        .provider(ureq::tls::TlsProvider::NativeTls)
        .build();
    let agent = ureq::Agent::config_builder()
        .timeout_global(None)
        .timeout_connect(Some(Duration::from_secs(30)))
        .tls_config(tls_config)
        .build()
        .new_agent();

    let mut request = agent.get(url)
        .header("User-Agent", "SpeakEasy/0.1.0");

    if resume_from > 0 {
        request = request.header("Range", &format!("bytes={}-", resume_from));
    }

    eprintln!("[download] Starting: {} -> {}", url, temp_path.display());

    let response = match request.call() {
        Ok(r) => {
            eprintln!("[download] Connected, status: {}", r.status());
            r
        }
        Err(e) => {
            eprintln!("[download] Connection failed: {}", e);
            return Err(format!("Download failed: {}", e));
        }
    };

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

fn check_espeak_available() -> bool {
    for prog in &["espeak-ng", "espeak"] {
        if let Ok(output) = std::process::Command::new(prog)
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
        {
            if output.success() {
                return true;
            }
        }
    }
    false
}

#[tauri::command]
pub fn is_espeak_installed() -> bool {
    check_espeak_available()
}

/// Install espeak-ng using the system package manager.
/// macOS: `brew install espeak-ng`
/// Windows: downloads the official installer MSI and runs it silently.
#[tauri::command]
pub fn install_espeak(app: AppHandle) -> Result<(), String> {
    let os = std::env::consts::OS;

    std::thread::spawn(move || {
        let result = match os {
            "macos" => install_espeak_macos(),
            "windows" => install_espeak_windows(),
            _ => Err(format!("Automatic install not supported on {}. Please install espeak-ng manually.", os)),
        };

        match result {
            Ok(()) => {
                let _ = app.emit("espeak-install-complete", true);
            }
            Err(e) => {
                let _ = app.emit("espeak-install-error", e);
            }
        }
    });

    Ok(())
}

fn install_espeak_macos() -> Result<(), String> {
    // Check if brew is available
    let has_brew = std::process::Command::new("which")
        .arg("brew")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !has_brew {
        return Err("Homebrew is not installed. Please install Homebrew first (https://brew.sh) or install espeak-ng manually.".to_string());
    }

    let output = std::process::Command::new("brew")
        .args(["install", "espeak-ng"])
        .output()
        .map_err(|e| format!("Failed to run brew: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "brew install espeak-ng failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

fn install_espeak_windows() -> Result<(), String> {
    // Download the espeak-ng MSI installer
    let msi_url = "https://github.com/espeak-ng/espeak-ng/releases/download/1.51/espeak-ng-X64.msi";
    let temp_dir = std::env::temp_dir();
    let msi_path = temp_dir.join("espeak-ng-X64.msi");

    // Download using ureq
    use std::time::Duration;
    let tls_config = ureq::tls::TlsConfig::builder()
        .provider(ureq::tls::TlsProvider::NativeTls)
        .build();
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(300)))
        .timeout_connect(Some(Duration::from_secs(30)))
        .tls_config(tls_config)
        .build()
        .new_agent();

    let response = agent.get(msi_url)
        .header("User-Agent", "SpeakEasy/0.1.0")
        .call()
        .map_err(|e| format!("Failed to download espeak-ng installer: {}", e))?;

    let mut file = std::fs::File::create(&msi_path)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut reader = response.into_body().into_reader();
    std::io::copy(&mut reader, &mut file)
        .map_err(|e| format!("Failed to write installer: {}", e))?;

    // Run MSI installer silently
    let output = std::process::Command::new("msiexec")
        .args(["/i", &msi_path.to_string_lossy(), "/quiet", "/norestart"])
        .output()
        .map_err(|e| format!("Failed to run installer: {}", e))?;

    // Clean up
    let _ = std::fs::remove_file(&msi_path);

    if !output.status.success() {
        return Err(format!(
            "espeak-ng installer failed (exit code {:?}). Try running as administrator.",
            output.status.code()
        ));
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
