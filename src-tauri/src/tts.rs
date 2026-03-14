use ort::session::Session;
use ort::value::Tensor;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct TtsState {
    session: Mutex<Option<Session>>,
    config: Mutex<Option<PiperConfig>>,
    loaded_voice: Mutex<Option<String>>,
}

impl TtsState {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(None),
            config: Mutex::new(None),
            loaded_voice: Mutex::new(None),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PiperConfig {
    audio: PiperAudioConfig,
    phoneme_id_map: HashMap<String, Vec<Vec<i64>>>,
    #[serde(default = "default_sample_rate")]
    sample_rate: u32,
}

fn default_sample_rate() -> u32 {
    22050
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PiperAudioConfig {
    sample_rate: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct TtsResult {
    pub sample_rate: u32,
    pub samples: Vec<f32>,
}

fn voices_dir() -> Result<PathBuf, String> {
    let dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".speakeasy")
        .join("voices");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn find_voice_files(voice_name: &str) -> Result<(PathBuf, PathBuf), String> {
    let dir = voices_dir()?;

    // Try common patterns
    let onnx_candidates = [
        format!("{}.onnx", voice_name),
        format!("{}/{}.onnx", voice_name, voice_name),
    ];

    for candidate in &onnx_candidates {
        let onnx_path = dir.join(candidate);
        let json_path = onnx_path.with_extension("onnx.json");
        if onnx_path.exists() && json_path.exists() {
            return Ok((onnx_path, json_path));
        }
    }

    // Scan directory for any .onnx file matching the voice name prefix
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with(voice_name) && name.ends_with(".onnx") && !name.ends_with(".onnx.json") {
                    let json_path = path.with_extension("onnx.json");
                    if json_path.exists() {
                        return Ok((path, json_path));
                    }
                }
            }
        }
    }

    Err(format!(
        "Voice '{}' not found in {}. Place <name>.onnx and <name>.onnx.json files there.",
        voice_name,
        dir.display()
    ))
}

#[tauri::command]
pub fn load_tts_voice(
    state: tauri::State<'_, TtsState>,
    voice_name: String,
) -> Result<(), String> {
    // Skip if already loaded
    if let Some(ref loaded) = *state.loaded_voice.lock().unwrap() {
        if loaded == &voice_name {
            return Ok(());
        }
    }

    let (onnx_path, json_path) = find_voice_files(&voice_name)?;

    let config_data = std::fs::read_to_string(&json_path).map_err(|e| e.to_string())?;
    let config: PiperConfig =
        serde_json::from_str(&config_data).map_err(|e| format!("Invalid voice config: {}", e))?;

    let session = Session::builder()
        .map_err(|e| format!("Failed to create ONNX session builder: {}", e))?
        .with_intra_threads(4)
        .map_err(|e| format!("Failed to set threads: {}", e))?
        .commit_from_file(&onnx_path)
        .map_err(|e| format!("Failed to load ONNX model {}: {}", onnx_path.display(), e))?;

    *state.session.lock().unwrap() = Some(session);
    *state.config.lock().unwrap() = Some(config);
    *state.loaded_voice.lock().unwrap() = Some(voice_name);

    Ok(())
}

#[tauri::command]
pub fn is_tts_loaded(state: tauri::State<'_, TtsState>) -> bool {
    state.session.lock().unwrap().is_some()
}

#[tauri::command]
pub fn list_voices() -> Result<Vec<String>, String> {
    let dir = voices_dir()?;
    let mut voices = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.ends_with(".onnx") && !name.ends_with(".onnx.json") {
                    let voice_name = name.trim_end_matches(".onnx").to_string();
                    voices.push(voice_name);
                }
            }
        }
    }

    voices.sort();
    Ok(voices)
}

#[tauri::command]
pub fn synthesize_speech(
    state: tauri::State<'_, TtsState>,
    text: String,
    speed: Option<f32>,
) -> Result<TtsResult, String> {
    let mut session_guard = state.session.lock().unwrap();
    let session = session_guard
        .as_mut()
        .ok_or("TTS voice not loaded. Call load_tts_voice first.")?;

    let config_guard = state.config.lock().unwrap();
    let config = config_guard.as_ref().unwrap();

    let speed = speed.unwrap_or(1.0);
    let phoneme_ids = text_to_phoneme_ids(&text, &config.phoneme_id_map);

    if phoneme_ids.is_empty() {
        return Ok(TtsResult {
            sample_rate: config.audio.sample_rate,
            samples: vec![],
        });
    }

    let input_len = phoneme_ids.len();

    let input_tensor = Tensor::from_array(([1, input_len], phoneme_ids))
        .map_err(|e| format!("Failed to create input tensor: {}", e))?;

    let input_lengths_tensor = Tensor::from_array(([1], vec![input_len as i64]))
        .map_err(|e| format!("Failed to create lengths tensor: {}", e))?;

    let scales_tensor = Tensor::from_array(([3], vec![0.667f32, speed, 0.8f32]))
        .map_err(|e| format!("Failed to create scales tensor: {}", e))?;

    let outputs = session
        .run(ort::inputs![input_tensor, input_lengths_tensor, scales_tensor])
        .map_err(|e| format!("TTS inference failed: {}", e))?;

    // Extract audio from first output
    let output = &outputs[0];
    let audio_tensor = output
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("Failed to extract audio tensor: {}", e))?;

    let samples: Vec<f32> = audio_tensor.1.iter().copied().collect();

    Ok(TtsResult {
        sample_rate: config.audio.sample_rate,
        samples,
    })
}

/// Convert WAV samples to WAV bytes for playback in frontend
#[tauri::command]
pub fn samples_to_wav_bytes(samples: Vec<f32>, sample_rate: u32) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    {
        let cursor = Cursor::new(&mut buf);
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };
        let mut writer = hound::WavWriter::new(cursor, spec).map_err(|e| e.to_string())?;
        for sample in &samples {
            writer.write_sample(*sample).map_err(|e| e.to_string())?;
        }
        writer.finalize().map_err(|e| e.to_string())?;
    }
    Ok(buf)
}

/// Simple character-level phoneme mapping for Piper models.
/// Piper uses a phoneme_id_map that maps characters to sequences of phoneme IDs.
/// We add BOS/EOS markers (padding) around the sequence.
fn text_to_phoneme_ids(text: &str, phoneme_map: &HashMap<String, Vec<Vec<i64>>>) -> Vec<i64> {
    let mut ids = Vec::new();

    // Piper convention: pad id is 0, BOS
    ids.push(0);

    for ch in text.chars() {
        let key = ch.to_string();
        if let Some(sequences) = phoneme_map.get(&key) {
            for seq in sequences {
                ids.extend(seq);
                ids.push(0); // pad between phonemes
            }
        } else if ch == ' ' {
            // Space character — use the space mapping or just pad
            if let Some(sequences) = phoneme_map.get(" ") {
                for seq in sequences {
                    ids.extend(seq);
                    ids.push(0);
                }
            }
        }
        // Skip unmapped characters
    }

    ids
}
