use serde::{Deserialize, Serialize};
use std::os::raw::c_int;
use std::path::PathBuf;
use std::sync::Mutex;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub struct SttState {
    context: Mutex<Option<WhisperContext>>,
    model_path: Mutex<Option<PathBuf>>,
}

impl SttState {
    pub fn new() -> Self {
        Self {
            context: Mutex::new(None),
            model_path: Mutex::new(None),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptionResult {
    pub text: String,
    pub language: Option<String>,
}

fn find_whisper_model(model_size: &str) -> Result<PathBuf, String> {
    let models_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".speakeasy")
        .join("models");

    // Try common naming patterns for the requested size
    let candidates = [
        format!("ggml-{}.bin", model_size),
        format!("whisper-{}.bin", model_size),
        format!("ggml-model-whisper-{}.bin", model_size),
    ];

    for name in &candidates {
        let path = models_dir.join(name);
        if path.exists() {
            return Ok(path);
        }
    }

    // If requested size not found, try any available whisper model
    let fallback_sizes = ["small", "base", "medium", "large", "tiny"];
    for size in &fallback_sizes {
        if *size == model_size {
            continue;
        }
        let path = models_dir.join(format!("ggml-{}.bin", size));
        if path.exists() {
            return Ok(path);
        }
    }

    Err(format!(
        "No whisper model found in {}. Please download one from the setup wizard.",
        models_dir.display(),
    ))
}

#[tauri::command]
pub fn load_whisper_model(
    state: tauri::State<'_, SttState>,
    model_size: Option<String>,
    custom_path: Option<String>,
) -> Result<(), String> {
    let size = model_size.unwrap_or_else(|| "base".to_string());

    let path = match custom_path {
        Some(p) => PathBuf::from(p),
        None => find_whisper_model(&size)?,
    };

    if !path.exists() {
        return Err(format!("Model file not found: {}", path.display()));
    }

    let ctx = WhisperContext::new_with_params(
        path.to_str().ok_or("Invalid path encoding")?,
        WhisperContextParameters::default(),
    )
    .map_err(|e| format!("Failed to load whisper model: {}", e))?;

    *state.context.lock().unwrap() = Some(ctx);
    *state.model_path.lock().unwrap() = Some(path);

    Ok(())
}

#[tauri::command]
pub fn is_whisper_loaded(state: tauri::State<'_, SttState>) -> bool {
    state.context.lock().unwrap().is_some()
}

/// Transcribe audio forced to a specific language, returning text and average token probability.
fn transcribe_forced(ctx: &WhisperContext, audio_data: &[f32], lang: &str) -> Result<(String, f32), String> {
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some(lang));
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_single_segment(false);
    params.set_no_context(true);

    let mut state = ctx.create_state().map_err(|e| format!("Failed to create whisper state: {}", e))?;
    state.full(params, audio_data).map_err(|e| format!("Transcription failed: {}", e))?;

    let num_segments = state.full_n_segments().map_err(|e| format!("Failed to get segments: {}", e))?;
    let mut text = String::new();
    let mut total_prob = 0.0f32;
    let mut token_count = 0u32;

    for i in 0..num_segments {
        if let Ok(segment) = state.full_get_segment_text(i) {
            text.push_str(&segment);
        }
        if let Ok(n_tokens) = state.full_n_tokens(i) {
            for t in 0..n_tokens {
                if let Ok(p) = state.full_get_token_prob(i as c_int, t as c_int) {
                    total_prob += p;
                    token_count += 1;
                }
            }
        }
    }

    let avg_prob = if token_count > 0 { total_prob / token_count as f32 } else { 0.0 };
    Ok((text.trim().to_string(), avg_prob))
}

#[tauri::command]
pub fn transcribe_audio(
    state: tauri::State<'_, SttState>,
    audio_data: Vec<f32>,
    target_language: String,
    native_language: String,
) -> Result<TranscriptionResult, String> {
    let ctx_guard = state.context.lock().unwrap();
    let ctx = ctx_guard
        .as_ref()
        .ok_or("Whisper model not loaded. Call load_whisper_model first.")?;

    // Pass 1: transcribe forced to target language
    let (target_text, target_prob) = transcribe_forced(ctx, &audio_data, &target_language)?;

    // If target == native, no need for a second pass
    if target_language == native_language {
        return Ok(TranscriptionResult {
            text: target_text,
            language: Some(target_language),
        });
    }

    // Pass 2: transcribe forced to native language
    let (native_text, native_prob) = transcribe_forced(ctx, &audio_data, &native_language)?;

    // Pick the transcription with higher average token probability
    if native_prob > target_prob {
        Ok(TranscriptionResult {
            text: native_text,
            language: Some(native_language),
        })
    } else {
        Ok(TranscriptionResult {
            text: target_text,
            language: Some(target_language),
        })
    }
}

/// Convert WAV bytes (from frontend) to f32 samples at 16kHz mono
#[tauri::command]
pub fn decode_wav_to_samples(wav_bytes: Vec<u8>) -> Result<Vec<f32>, String> {
    let cursor = std::io::Cursor::new(wav_bytes);
    let reader = hound::WavReader::new(cursor).map_err(|e| format!("Invalid WAV data: {}", e))?;

    let spec = reader.spec();
    let sample_rate = spec.sample_rate;
    let channels = spec.channels as usize;

    // Read all samples as f32
    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let max_val = (1u32 << (spec.bits_per_sample - 1)) as f32;
            reader
                .into_samples::<i32>()
                .filter_map(|s| s.ok())
                .map(|s| s as f32 / max_val)
                .collect()
        }
        hound::SampleFormat::Float => reader
            .into_samples::<f32>()
            .filter_map(|s| s.ok())
            .collect(),
    };

    // Convert to mono if stereo
    let mono: Vec<f32> = if channels > 1 {
        samples
            .chunks(channels)
            .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
            .collect()
    } else {
        samples
    };

    // Resample to 16kHz if needed
    if sample_rate == 16000 {
        Ok(mono)
    } else {
        let ratio = 16000.0 / sample_rate as f64;
        let new_len = (mono.len() as f64 * ratio) as usize;
        let mut resampled = Vec::with_capacity(new_len);
        for i in 0..new_len {
            let src_idx = i as f64 / ratio;
            let idx = src_idx as usize;
            let frac = src_idx - idx as f64;
            let sample = if idx + 1 < mono.len() {
                mono[idx] * (1.0 - frac as f32) + mono[idx + 1] * frac as f32
            } else if idx < mono.len() {
                mono[idx]
            } else {
                0.0
            };
            resampled.push(sample);
        }
        Ok(resampled)
    }
}
