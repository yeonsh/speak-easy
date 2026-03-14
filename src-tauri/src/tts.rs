use ort::session::Session;
use ort::value::Tensor;
use serde::Serialize;
use std::collections::HashMap;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct TtsState {
    session: Mutex<Option<Session>>,
    voices: Mutex<Option<VoicesData>>,
    loaded_voice_name: Mutex<Option<String>>,
    voice_embedding: Mutex<Option<Vec<Vec<f32>>>>,
}

impl TtsState {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(None),
            voices: Mutex::new(None),
            loaded_voice_name: Mutex::new(None),
            voice_embedding: Mutex::new(None),
        }
    }
}

/// Parsed voices.bin (NumPy .npz format)
struct VoicesData {
    voices: HashMap<String, Vec<Vec<f32>>>,
}

const KOKORO_SAMPLE_RATE: u32 = 24000;
const MAX_PHONEME_LENGTH: usize = 510;

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

/// Build Kokoro vocabulary: phoneme character → token ID
fn kokoro_vocab() -> HashMap<String, i64> {
    let mut v = HashMap::new();
    let entries: &[(&str, i64)] = &[
        (";", 1), (":", 2), (",", 3), (".", 4), ("!", 5), ("?", 6),
        ("\u{2014}", 9), ("\u{2026}", 10), ("\"", 11), ("(", 12), (")", 13),
        ("\u{201C}", 14), ("\u{201D}", 15), (" ", 16), ("\u{0303}", 17),
        ("ʣ", 18), ("ʥ", 19), ("ʦ", 20), ("ʨ", 21), ("ᵝ", 22), ("\u{AB67}", 23),
        ("A", 24), ("I", 25), ("O", 31), ("Q", 33), ("S", 35), ("T", 36),
        ("W", 39), ("Y", 41), ("ᵊ", 42),
        ("a", 43), ("b", 44), ("c", 45), ("d", 46), ("e", 47), ("f", 48),
        ("h", 50), ("i", 51), ("j", 52), ("k", 53), ("l", 54), ("m", 55),
        ("n", 56), ("o", 57), ("p", 58), ("q", 59), ("r", 60), ("s", 61),
        ("t", 62), ("u", 63), ("v", 64), ("w", 65), ("x", 66), ("y", 67),
        ("z", 68),
        ("ɑ", 69), ("ɐ", 70), ("ɒ", 71), ("æ", 72), ("β", 75), ("ɔ", 76),
        ("ɕ", 77), ("ç", 78), ("ɖ", 80), ("ð", 81), ("ʤ", 82), ("ə", 83),
        ("ɚ", 85), ("ɛ", 86), ("ɜ", 87), ("ɟ", 90), ("ɡ", 92), ("ɥ", 99),
        ("ɨ", 101), ("ɪ", 102), ("ʝ", 103), ("ɯ", 110), ("ɰ", 111),
        ("ŋ", 112), ("ɳ", 113), ("ɲ", 114), ("ɴ", 115), ("ø", 116),
        ("ɸ", 118), ("θ", 119), ("œ", 120), ("ɹ", 123), ("ɾ", 125),
        ("ɻ", 126), ("ʁ", 128), ("ɽ", 129), ("ʂ", 130), ("ʃ", 131),
        ("ʈ", 132), ("ʧ", 133), ("ʊ", 135), ("ʋ", 136), ("ʌ", 138),
        ("ɣ", 139), ("ɤ", 140), ("χ", 142), ("ʎ", 143), ("ʒ", 147),
        ("ʔ", 148),
        ("ˈ", 156), ("ˌ", 157), ("ː", 158), ("ʰ", 162), ("ʲ", 164),
        ("↓", 169), ("→", 171), ("↗", 172), ("↘", 173), ("ᵻ", 177),
    ];
    for (k, id) in entries {
        v.insert(k.to_string(), *id);
    }
    v
}

/// Parse NumPy .npz voices file
/// The .npz format is a zip of .npy files, each named <voice_name>.npy
fn load_voices_npz(path: &PathBuf) -> Result<VoicesData, String> {
    use std::io::Read;

    let file = std::fs::File::open(path).map_err(|e| format!("Failed to open voices file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Failed to read voices archive: {}", e))?;

    let mut voices = HashMap::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("Failed to read archive entry: {}", e))?;
        let name = entry.name().trim_end_matches(".npy").to_string();

        let mut data = Vec::new();
        entry.read_to_end(&mut data).map_err(|e| format!("Failed to read voice data: {}", e))?;

        // Parse .npy format: 10-byte magic + header, then raw float32 data
        // Shape is [MAX_PHONEME_LENGTH, STYLE_DIM] = [510, 256]
        if let Some(float_data) = parse_npy_f32(&data) {
            // Reshape into [510][256]
            let style_dim = 256;
            let rows = float_data.len() / style_dim;
            let mut matrix = Vec::with_capacity(rows);
            for r in 0..rows {
                let start = r * style_dim;
                let end = start + style_dim;
                if end <= float_data.len() {
                    matrix.push(float_data[start..end].to_vec());
                }
            }
            voices.insert(name, matrix);
        }
    }

    eprintln!("[tts] Loaded {} voices from {:?}", voices.len(), path);
    Ok(VoicesData { voices })
}

/// Parse a .npy file and extract f32 data
fn parse_npy_f32(data: &[u8]) -> Option<Vec<f32>> {
    // NumPy .npy format:
    // 6 bytes magic: \x93NUMPY
    // 1 byte major version
    // 1 byte minor version
    // 2 bytes (v1) or 4 bytes (v2) header length
    // Then ASCII header (Python dict string)
    // Then raw data

    if data.len() < 10 || &data[..6] != b"\x93NUMPY" {
        return None;
    }

    let major = data[6];
    let header_len = if major >= 2 {
        if data.len() < 12 { return None; }
        u32::from_le_bytes([data[8], data[9], data[10], data[11]]) as usize
    } else {
        u16::from_le_bytes([data[8], data[9]]) as usize
    };

    let data_offset = if major >= 2 { 12 + header_len } else { 10 + header_len };

    if data_offset >= data.len() {
        return None;
    }

    let raw = &data[data_offset..];
    let num_floats = raw.len() / 4;
    let mut floats = Vec::with_capacity(num_floats);

    for i in 0..num_floats {
        let offset = i * 4;
        let bytes = [raw[offset], raw[offset + 1], raw[offset + 2], raw[offset + 3]];
        floats.push(f32::from_le_bytes(bytes));
    }

    Some(floats)
}

#[tauri::command]
pub fn load_tts_voice(
    state: tauri::State<'_, TtsState>,
    voice_name: String,
) -> Result<(), String> {
    let dir = voices_dir()?;

    // Load ONNX model if not already loaded
    if state.session.lock().unwrap().is_none() {
        let model_path = dir.join("kokoro-v1.0.onnx");
        if !model_path.exists() {
            return Err("Kokoro model not found. Download it from the setup wizard.".to_string());
        }

        let session = Session::builder()
            .map_err(|e| format!("Failed to create ONNX session builder: {}", e))?
            .with_intra_threads(4)
            .map_err(|e| format!("Failed to set threads: {}", e))?
            .commit_from_file(&model_path)
            .map_err(|e| format!("Failed to load Kokoro model: {}", e))?;

        *state.session.lock().unwrap() = Some(session);
    }

    // Load voices data if not already loaded
    if state.voices.lock().unwrap().is_none() {
        let voices_path = dir.join("voices-v1.0.bin");
        if !voices_path.exists() {
            return Err("Voices file not found. Download it from the setup wizard.".to_string());
        }

        let voices = load_voices_npz(&voices_path)?;
        *state.voices.lock().unwrap() = Some(voices);
    }

    // Select the voice embedding
    let voices_guard = state.voices.lock().unwrap();
    let voices_data = voices_guard.as_ref().unwrap();

    if !voices_data.voices.contains_key(&voice_name) {
        // Try to find a matching voice
        let available: Vec<&String> = voices_data.voices.keys().collect();
        return Err(format!(
            "Voice '{}' not found. Available voices: {:?}",
            voice_name,
            &available[..available.len().min(10)]
        ));
    }

    let embedding = voices_data.voices[&voice_name].clone();
    *state.voice_embedding.lock().unwrap() = Some(embedding);
    *state.loaded_voice_name.lock().unwrap() = Some(voice_name);

    Ok(())
}

#[tauri::command]
pub fn is_tts_loaded(
    state: tauri::State<'_, TtsState>,
) -> bool {
    state.session.lock().unwrap().is_some() && state.voice_embedding.lock().unwrap().is_some()
}

#[tauri::command]
pub fn list_voices() -> Result<Vec<String>, String> {
    let dir = voices_dir()?;
    let voices_path = dir.join("voices-v1.0.bin");

    if !voices_path.exists() {
        return Ok(vec![]);
    }

    let voices = load_voices_npz(&voices_path)?;
    let mut names: Vec<String> = voices.voices.keys().cloned().collect();
    names.sort();
    Ok(names)
}

/// Clean text for TTS: strip emojis, replace fullwidth CJK punctuation with
/// ASCII equivalents so eSpeak can use them for prosody/intonation.
pub(crate) fn clean_for_tts(text: &str) -> String {
    text.chars()
        .filter_map(|c| {
            let cp = c as u32;
            // Strip emojis
            if matches!(
                cp,
                0x200D
                | 0x20E3
                | 0xFE00..=0xFE0F
                | 0x1F1E0..=0x1F1FF
                | 0x1F300..=0x1F9FF
                | 0x1FA00..=0x1FAFF
                | 0x2600..=0x26FF
                | 0x2700..=0x27BF
                | 0xE0020..=0xE007F
            ) {
                return None;
            }
            // Replace CJK punctuation with ASCII equivalents (preserves prosody)
            match cp {
                0x3002 => Some('.'),  // 。→ .
                0xFF01 => Some('!'),  // ！→ !
                0xFF1F => Some('?'),  // ？→ ?
                0xFF0C => Some(','),  // ，→ ,
                0x300C | 0x300D | 0x300E | 0x300F => None, // 「」『』 strip
                0xFF08 | 0xFF09 => None, // （） strip
                _ => Some(c),
            }
        })
        .collect()
}

/// Core synthesis function callable from any thread with access to TtsState.
pub fn synthesize_text(state: &TtsState, text: &str, speed: f32, lang: &str) -> Result<TtsResult, String> {
    let mut session_guard = state.session.lock().unwrap();
    let session = session_guard
        .as_mut()
        .ok_or("TTS not loaded. Call load_tts_voice first.")?;

    let embedding_guard = state.voice_embedding.lock().unwrap();
    let voice_matrix = embedding_guard
        .as_ref()
        .ok_or("No voice selected.")?;

    let vocab = kokoro_vocab();

    // Clean text for TTS: replace CJK punctuation with ASCII equivalents,
    // strip emojis and brackets that eSpeak reads literally
    let cleaned = clean_for_tts(text);
    let preview: String = cleaned.chars().take(40).collect();
    eprintln!("[tts] Synthesizing lang={} text={}", lang, preview);
    let phonemes = espeak_phonemize(&cleaned, lang);
    eprintln!("[tts] Phonemes: {}", phonemes);

    let mut tokens: Vec<i64> = Vec::new();
    for ch in phonemes.chars() {
        let key = ch.to_string();
        if let Some(&id) = vocab.get(&key) {
            tokens.push(id);
        }
    }

    if tokens.is_empty() {
        return Ok(TtsResult {
            sample_rate: KOKORO_SAMPLE_RATE,
            samples: vec![],
        });
    }

    if tokens.len() > MAX_PHONEME_LENGTH {
        tokens.truncate(MAX_PHONEME_LENGTH);
    }

    let token_len = tokens.len();
    let style: Vec<f32> = if token_len < voice_matrix.len() {
        voice_matrix[token_len].clone()
    } else {
        voice_matrix[voice_matrix.len() - 1].clone()
    };

    let mut padded: Vec<i64> = Vec::with_capacity(tokens.len() + 2);
    padded.push(0);
    padded.extend(&tokens);
    padded.push(0);

    let padded_len = padded.len();

    let input_tensor = Tensor::from_array(([1, padded_len], padded))
        .map_err(|e| format!("Failed to create input tensor: {}", e))?;

    let style_dim = style.len();
    let style_tensor = Tensor::from_array(([1_usize, style_dim], style))
        .map_err(|e| format!("Failed to create style tensor: {}", e))?;

    let speed_tensor = Tensor::from_array(([1_usize], vec![speed]))
        .map_err(|e| format!("Failed to create speed tensor: {}", e))?;

    let outputs = session
        .run(ort::inputs!["tokens" => input_tensor, "style" => style_tensor, "speed" => speed_tensor])
        .map_err(|e| format!("TTS inference failed: {}", e))?;

    let output = &outputs[0];
    let audio_tensor = output
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("Failed to extract audio tensor: {}", e))?;

    let samples: Vec<f32> = audio_tensor.1.iter().copied().collect();

    Ok(TtsResult {
        sample_rate: KOKORO_SAMPLE_RATE,
        samples,
    })
}

#[tauri::command]
pub fn synthesize_speech(
    state: tauri::State<'_, TtsState>,
    text: String,
    speed: Option<f32>,
    language: Option<String>,
) -> Result<TtsResult, String> {
    synthesize_text(&state, &text, speed.unwrap_or(1.0), &language.unwrap_or_else(|| "en".to_string()))
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

fn espeak_lang_code(lang: &str) -> &str {
    match lang {
        "zh" => "cmn",
        other => other, // en, es, de, ja work as-is
    }
}

/// Use mecab to convert Japanese text (with kanji) to katakana readings.
/// Parses default MeCab output to extract per-word readings with spaces,
/// preserving word boundaries for better eSpeak prosody.
fn mecab_to_kana(text: &str) -> Option<String> {
    // Try multiple paths — GUI apps on macOS don't inherit shell PATH
    let programs = ["mecab", "/opt/homebrew/bin/mecab", "/usr/local/bin/mecab"];

    for prog in &programs {
        let result = std::process::Command::new(prog)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                if let Some(ref mut stdin) = child.stdin {
                    let _ = stdin.write_all(text.as_bytes());
                }
                child.wait_with_output()
            });

        match result {
            Ok(output) if output.status.success() => {
                let raw = String::from_utf8_lossy(&output.stdout);
                let mut words = Vec::new();
                for line in raw.lines() {
                    if line == "EOS" || line.is_empty() {
                        continue;
                    }
                    // Format: surface\tPOS,POS2,...,reading,pronunciation
                    let parts: Vec<&str> = line.splitn(2, '\t').collect();
                    if parts.len() == 2 {
                        let fields: Vec<&str> = parts[1].split(',').collect();
                        // Reading is typically the 8th field (index 7)
                        if fields.len() >= 8 && !fields[7].is_empty() {
                            words.push(fields[7].to_string());
                        } else {
                            // No reading available — use surface form
                            words.push(parts[0].to_string());
                        }
                    } else {
                        words.push(parts[0].to_string());
                    }
                }
                if !words.is_empty() {
                    let kana = words.join(" ");
                    eprintln!("[tts] mecab kana: {}", kana);
                    return Some(kana);
                }
            }
            _ => continue,
        }
    }

    eprintln!("[tts] WARNING: mecab not found, kanji will not be read correctly");
    None
}

/// Use espeak-ng to convert text to IPA phonemes
fn espeak_phonemize(text: &str, lang: &str) -> String {
    // For Japanese, convert kanji to katakana via mecab first
    let preprocessed;
    let input = if lang == "ja" {
        if let Some(kana) = mecab_to_kana(text) {
            preprocessed = kana;
            &preprocessed
        } else {
            text
        }
    } else {
        text
    };
    let programs = [
        "espeak-ng", "espeak",
        "/opt/homebrew/bin/espeak-ng", "/opt/homebrew/bin/espeak",
        "/usr/local/bin/espeak-ng", "/usr/local/bin/espeak",
    ];
    let voice = espeak_lang_code(lang);

    for prog in &programs {
        if let Ok(output) = std::process::Command::new(prog)
            .args(["--ipa=2", "-q", "-v", voice, "--stdin"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                if let Some(ref mut stdin) = child.stdin {
                    let _ = stdin.write_all(input.as_bytes());
                }
                child.wait_with_output()
            })
        {
            if output.status.success() {
                let result = String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .replace('\n', " ")
                    .replace("  ", " ");
                if !result.is_empty() {
                    return result;
                }
            }
        }
    }

    eprintln!("[tts] WARNING: espeak-ng not found");
    text.to_lowercase()
}
