use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

#[derive(Clone)]
pub struct SttState {
    context: Arc<Mutex<Option<WhisperContext>>>,
    model_path: Arc<Mutex<Option<PathBuf>>>,
}

impl SttState {
    pub fn new() -> Self {
        Self {
            context: Arc::new(Mutex::new(None)),
            model_path: Arc::new(Mutex::new(None)),
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

pub fn load_whisper_model_inner(
    state: &SttState,
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
pub fn load_whisper_model(
    state: tauri::State<'_, SttState>,
    model_size: Option<String>,
    custom_path: Option<String>,
) -> Result<(), String> {
    load_whisper_model_inner(&state, model_size, custom_path)
}

pub fn is_whisper_loaded_inner(state: &SttState) -> bool {
    state.context.lock().unwrap().is_some()
}

#[tauri::command]
pub fn is_whisper_loaded(state: tauri::State<'_, SttState>) -> bool {
    is_whisper_loaded_inner(&state)
}

pub fn transcribe_audio_inner(
    state: &SttState,
    audio_data: Vec<f32>,
    target_language: &str,
    native_language: &str,
) -> Result<TranscriptionResult, String> {
    // Pad with silence to at least 1.1s (17600 samples at 16kHz)
    // Whisper's mel spectrogram trims edges, so 16000 samples still reports <1000ms
    let min_samples = 17600;
    let audio_data = if audio_data.len() < min_samples {
        eprintln!("[stt] Padding audio from {} to {} samples", audio_data.len(), min_samples);
        let mut padded = audio_data;
        padded.resize(min_samples, 0.0);
        padded
    } else {
        audio_data
    };
    eprintln!("[stt] transcribe_audio: {} samples ({}ms)", audio_data.len(), audio_data.len() * 1000 / 16000);

    let ctx_guard = state.context.lock().unwrap();
    let ctx = ctx_guard
        .as_ref()
        .ok_or("Whisper model not loaded. Call load_whisper_model first.")?;

    // Detect which language was spoken using Whisper's built-in language detection.
    // This is fast (encoder-only, no full transcription) and returns per-language probabilities.
    let chosen_lang = if target_language == native_language {
        target_language.to_string()
    } else {
        let mut detect_state = ctx.create_state()
            .map_err(|e| format!("Failed to create whisper state: {}", e))?;

        // Compute mel spectrogram, then detect language probabilities
        detect_state.pcm_to_mel(&audio_data, 1)
            .map_err(|e| format!("Failed to compute mel spectrogram: {}", e))?;
        let (_best_id, lang_probs) = detect_state.lang_detect(0, 1)
            .map_err(|e| format!("Language detection failed: {}", e))?;

        let target_id = whisper_rs::get_lang_id(&target_language);
        let native_id = whisper_rs::get_lang_id(&native_language);

        let target_prob = target_id
            .and_then(|id| lang_probs.get(id as usize).copied())
            .unwrap_or(0.0);
        let native_prob = native_id
            .and_then(|id| lang_probs.get(id as usize).copied())
            .unwrap_or(0.0);

        eprintln!(
            "[stt] Language detection: target({})={:.3}, native({})={:.3}",
            target_language, target_prob, native_language, native_prob
        );

        // Strongly bias toward target language (the language being practiced).
        // Only switch to native if detection is very confident — native must be
        // at least 2x the target probability AND above 0.5 absolute threshold.
        // This prevents short/ambiguous utterances from being mistakenly
        // "translated" into the native language by Whisper.
        if native_prob > target_prob * 2.0 && native_prob > 0.5 {
            eprintln!("[stt] Detected native language: {}", native_language);
            native_language.to_string()
        } else {
            eprintln!("[stt] Using target language: {}", target_language);
            target_language.to_string()
        }
    };

    // Transcribe with the detected language
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some(&chosen_lang));
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_single_segment(false);
    params.set_no_context(true);

    let mut wh_state = ctx.create_state()
        .map_err(|e| format!("Failed to create whisper state: {}", e))?;
    wh_state.full(params, &audio_data)
        .map_err(|e| format!("Transcription failed: {}", e))?;

    let num_segments = wh_state.full_n_segments()
        .map_err(|e| format!("Failed to get segments: {}", e))?;
    let mut text = String::new();
    for i in 0..num_segments {
        if let Ok(segment) = wh_state.full_get_segment_text(i) {
            text.push_str(&segment);
        }
    }

    Ok(TranscriptionResult {
        text: text.trim().to_string(),
        language: Some(chosen_lang),
    })
}

#[tauri::command]
pub fn transcribe_audio(
    state: tauri::State<'_, SttState>,
    audio_data: Vec<f32>,
    target_language: String,
    native_language: String,
) -> Result<TranscriptionResult, String> {
    transcribe_audio_inner(&state, audio_data, &target_language, &native_language)
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
