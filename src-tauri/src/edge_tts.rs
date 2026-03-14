use crate::tts::TtsResult;
use minimp3::{Decoder as Mp3Decoder, Frame};
use std::io::Cursor;

const EDGE_SAMPLE_RATE: u32 = 24000;

/// Default Edge TTS voice per language
pub fn default_voice(lang: &str) -> &'static str {
    match lang {
        "en" => "en-US-JennyNeural",
        "es" => "es-ES-ElviraNeural",
        "fr" => "fr-FR-DeniseNeural",
        "zh" => "zh-CN-XiaoxiaoNeural",
        "ja" => "ja-JP-NanamiNeural",
        _ => "en-US-JennyNeural",
    }
}

/// Decode MP3 bytes to f32 samples
fn decode_mp3(mp3_bytes: &[u8]) -> Result<(Vec<f32>, u32), String> {
    let mut decoder = Mp3Decoder::new(Cursor::new(mp3_bytes));
    let mut samples = Vec::new();
    let mut sample_rate = EDGE_SAMPLE_RATE;

    loop {
        match decoder.next_frame() {
            Ok(Frame {
                data,
                sample_rate: sr,
                channels,
                ..
            }) => {
                sample_rate = sr as u32;
                if channels == 1 {
                    samples.extend(data.iter().map(|s| *s as f32 / 32768.0));
                } else {
                    // Downmix to mono
                    for chunk in data.chunks(channels as usize) {
                        let avg =
                            chunk.iter().map(|s| *s as f32).sum::<f32>() / channels as f32 / 32768.0;
                        samples.push(avg);
                    }
                }
            }
            Err(minimp3::Error::Eof) => break,
            Err(e) => return Err(format!("MP3 decode error: {:?}", e)),
        }
    }

    Ok((samples, sample_rate))
}

/// Synthesize text using Edge TTS (sync, blocks on network)
pub fn synthesize(text: &str, voice_name: &str, speed: f32) -> Result<TtsResult, String> {
    use msedge_tts::tts::client::connect;
    use msedge_tts::voice::get_voices_list;

    if text.trim().is_empty() {
        return Ok(TtsResult {
            sample_rate: EDGE_SAMPLE_RATE,
            samples: vec![],
        });
    }

    let preview: String = text.chars().take(40).collect();
    eprintln!("[edge-tts] Synthesizing voice={} text={}", voice_name, preview);

    // Get voice list and find matching voice
    let voices =
        get_voices_list().map_err(|e| format!("Edge TTS: failed to get voice list: {}", e))?;

    let voice_str = Some(voice_name.to_string());
    let voice = voices
        .iter()
        .find(|v| v.short_name == voice_str || v.name == voice_name)
        .ok_or_else(|| format!("Edge TTS: voice '{}' not found", voice_name))?;

    let mut config = msedge_tts::tts::SpeechConfig::from(voice);
    // Set speech rate: speed 1.0 → 0, 1.5 → 50, 0.5 → -50
    config.rate = ((speed - 1.0) * 100.0).round() as i32;

    let mut tts =
        connect().map_err(|e| format!("Edge TTS: connection failed: {}", e))?;

    let audio = tts
        .synthesize(text, &config)
        .map_err(|e| format!("Edge TTS: synthesis failed: {}", e))?;

    let (samples, sample_rate) = decode_mp3(&audio.audio_bytes)?;

    eprintln!(
        "[edge-tts] Got {} samples at {}Hz",
        samples.len(),
        sample_rate
    );

    Ok(TtsResult {
        sample_rate,
        samples,
    })
}

/// Get available Edge TTS voices (sync, blocks on network)
pub fn get_voices() -> Result<Vec<String>, String> {
    use msedge_tts::voice::get_voices_list;

    let voices =
        get_voices_list().map_err(|e| format!("Edge TTS: failed to get voice list: {}", e))?;

    let mut names: Vec<String> = voices
        .iter()
        .filter_map(|v| v.short_name.as_ref())
        .filter(|name| name.ends_with("Neural"))
        .cloned()
        .collect();
    names.sort();
    Ok(names)
}
