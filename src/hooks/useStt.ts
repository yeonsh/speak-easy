import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAudioRecorder } from "./useAudioRecorder";
import type { Language } from "../lib/types";

const LANGUAGE_WHISPER_CODES: Record<Language, string> = {
  en: "en",
  es: "es",
  zh: "zh",
  de: "de",
  ja: "ja",
};

interface UseSttReturn {
  isModelLoaded: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  loadModel: (modelSize?: string) => Promise<void>;
  startRecording: () => Promise<void>;
  stopAndTranscribe: (language: Language) => Promise<string | null>;
}

export function useStt(): UseSttReturn {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useAudioRecorder();

  const loadModel = useCallback(async (modelSize?: string) => {
    try {
      setError(null);
      await invoke("load_whisper_model", {
        modelSize: modelSize ?? "base",
        customPath: null,
      });
      setIsModelLoaded(true);
    } catch (e) {
      setError(`Failed to load whisper model: ${e}`);
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    await recorder.startRecording();
  }, [recorder]);

  const stopAndTranscribe = useCallback(
    async (language: Language): Promise<string | null> => {
      setError(null);
      setIsTranscribing(true);

      try {
        const wavBuffer = await recorder.stopRecording();
        if (!wavBuffer) {
          setIsTranscribing(false);
          return null;
        }

        // Send WAV bytes to Rust for decoding and transcription
        const wavBytes = Array.from(new Uint8Array(wavBuffer));

        const samples = await invoke<number[]>("decode_wav_to_samples", {
          wavBytes,
        });

        if (samples.length === 0) {
          setIsTranscribing(false);
          setError("No audio captured");
          return null;
        }

        const result = await invoke<{ text: string; language: string | null }>(
          "transcribe_audio",
          {
            audioData: samples,
            language: LANGUAGE_WHISPER_CODES[language],
          },
        );

        setIsTranscribing(false);
        return result.text || null;
      } catch (e) {
        setError(`Transcription failed: ${e}`);
        setIsTranscribing(false);
        return null;
      }
    },
    [recorder],
  );

  return {
    isModelLoaded,
    isRecording: recorder.isRecording,
    isTranscribing,
    error: error || recorder.error,
    loadModel,
    startRecording,
    stopAndTranscribe,
  };
}
