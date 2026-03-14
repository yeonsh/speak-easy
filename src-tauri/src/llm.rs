use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub struct LlmState {
    process: Mutex<Option<Child>>,
    pub(crate) port: Mutex<u16>,
}

impl LlmState {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            port: Mutex::new(0),
        }
    }
}

impl Drop for LlmState {
    fn drop(&mut self) {
        if let Ok(mut proc) = self.process.lock() {
            if let Some(ref mut child) = *proc {
                let _ = child.kill();
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

fn find_available_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    Ok(port)
}

fn find_model_path() -> Result<String, String> {
    let models_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".speakeasy")
        .join("models");

    if !models_dir.exists() {
        return Err("Models directory does not exist. Please download a model first.".to_string());
    }

    // Find first .gguf file
    let entries = std::fs::read_dir(&models_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if let Some(ext) = path.extension() {
            if ext == "gguf" {
                return Ok(path.to_string_lossy().to_string());
            }
        }
    }

    Err(format!(
        "No .gguf model found in {}. Please download a model first.",
        models_dir.display()
    ))
}

#[tauri::command]
pub fn get_llm_port(state: tauri::State<'_, LlmState>) -> u16 {
    *state.port.lock().unwrap()
}

#[tauri::command]
pub fn is_llm_running(state: tauri::State<'_, LlmState>) -> bool {
    let mut proc = state.process.lock().unwrap();
    match *proc {
        Some(ref mut child) => match child.try_wait() {
            Ok(Some(_)) => {
                *proc = None;
                false
            }
            Ok(None) => true,
            Err(_) => false,
        },
        None => false,
    }
}

#[tauri::command]
pub fn start_llm_server(
    app: AppHandle,
    state: tauri::State<'_, LlmState>,
    model_path: Option<String>,
    gpu_layers: Option<i32>,
) -> Result<u16, String> {
    // Already running?
    if is_llm_running(state.clone()) {
        return Ok(*state.port.lock().unwrap());
    }

    let model = match model_path {
        Some(p) => p,
        None => find_model_path()?,
    };

    let port = find_available_port()?;
    let n_gpu = gpu_layers.unwrap_or(-1);

    // Resolve sidecar binary path
    let sidecar_path = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("binaries")
        .join(llama_server_binary_name());

    // Fall back to PATH if sidecar not bundled
    let program = if sidecar_path.exists() {
        sidecar_path.to_string_lossy().to_string()
    } else {
        "llama-server".to_string()
    };

    let mut child = Command::new(&program)
        .args([
            "--model",
            &model,
            "--port",
            &port.to_string(),
            "--host",
            "127.0.0.1",
            "--n-gpu-layers",
            &n_gpu.to_string(),
            "--ctx-size",
            "4096",
            "--threads",
            &num_cpus().to_string(),
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start llama-server ({}): {}", program, e))?;

    // Monitor stderr in background for startup readiness
    let stderr = child.stderr.take();
    let app_clone = app.clone();
    std::thread::spawn(move || {
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let _ = app_clone.emit("llm-log", &line);
                    if line.contains("server is listening") {
                        let _ = app_clone.emit("llm-ready", true);
                    }
                }
            }
        }
    });

    *state.port.lock().unwrap() = port;
    *state.process.lock().unwrap() = Some(child);

    Ok(port)
}

#[tauri::command]
pub fn stop_llm_server(state: tauri::State<'_, LlmState>) -> Result<(), String> {
    let mut proc = state.process.lock().unwrap();
    if let Some(ref mut child) = *proc {
        child.kill().map_err(|e| e.to_string())?;
        child.wait().map_err(|e| e.to_string())?;
    }
    *proc = None;
    *state.port.lock().unwrap() = 0;
    Ok(())
}

fn llama_server_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "llama-server.exe"
    } else {
        "llama-server"
    }
}

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}
