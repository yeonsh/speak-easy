use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::process::{Child, Command};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

pub struct LlmState {
    process: Mutex<Option<Child>>,
    pub(crate) port: Mutex<u16>,
    pub(crate) cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl LlmState {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            port: Mutex::new(0),
            cancel_flags: Mutex::new(HashMap::new()),
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
    // Already running? Re-emit ready event so frontend can sync state after hot-reload.
    if is_llm_running(state.clone()) {
        let port = *state.port.lock().unwrap();
        let _ = app.emit("llm-ready", true);
        return Ok(port);
    }

    let model = match model_path {
        Some(p) => p,
        None => find_model_path()?,
    };

    let port = find_available_port()?;
    let n_gpu = gpu_layers.unwrap_or(-1);

    // Resolve llama-server: ~/.speakeasy/bin/ → bundled sidecar → PATH
    let program = resolve_llama_server(&app)?;

    // Set library search path to the directory containing llama-server
    // so it can find libllama.dylib and other shared libraries
    let program_dir = std::path::Path::new(&program)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut cmd = Command::new(&program);
    cmd.args([
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
        .stderr(std::process::Stdio::piped());

    if !program_dir.is_empty() {
        #[cfg(target_os = "macos")]
        cmd.env("DYLD_LIBRARY_PATH", &program_dir);
        #[cfg(target_os = "linux")]
        cmd.env("LD_LIBRARY_PATH", &program_dir);
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start llama-server ({}): {}", program, e))?;

    // Monitor stderr in background for startup readiness
    let stderr = child.stderr.take();
    let app_clone = app.clone();
    std::thread::spawn(move || {
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    eprintln!("[llama-server] {}", line);
                    let _ = app_clone.emit("llm-log", &line);
                    // "all slots are idle" indicates model is fully loaded and ready
                    if line.contains("all slots are idle") {
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

fn resolve_llama_server(app: &AppHandle) -> Result<String, String> {
    // 1. Check ~/.speakeasy/bin/
    if let Some(home) = dirs::home_dir() {
        let bin = home
            .join(".speakeasy")
            .join("bin")
            .join(llama_server_binary_name());
        if bin.exists() {
            return Ok(bin.to_string_lossy().to_string());
        }
    }

    // 2. Check bundled sidecar
    if let Ok(res_dir) = app.path().resource_dir() {
        let sidecar = res_dir.join("binaries").join(llama_server_binary_name());
        if sidecar.exists() {
            return Ok(sidecar.to_string_lossy().to_string());
        }
    }

    // 3. Fall back to PATH
    let output = std::process::Command::new("which")
        .arg("llama-server")
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    Err("llama-server not found. Download it from the setup wizard or install llama.cpp.".to_string())
}

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}
