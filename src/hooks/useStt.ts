import { useState, useCallback, useEffect } from "react";
import { invoke, transcribeAudio } from "../lib/backend";
import { useAudioRecorder } from "./useAudioRecorder";
import type { Language } from "../lib/types";

interface UseSttReturn {
  isModelLoaded: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  loadModel: (modelSize?: string) => Promise<void>;
  startRecording: () => Promise<void>;
  stopAndTranscribe: (targetLanguage: Language, nativeLanguage: Language) => Promise<{ text: string; language: string } | null>;
}

export function useStt(): UseSttReturn {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useAudioRecorder();

  // Check backend status on mount (model may already be loaded by desktop)
  useEffect(() => {
    invoke<boolean>("is_whisper_loaded").then((loaded) => {
      if (loaded) setIsModelLoaded(true);
    }).catch(() => {});
  }, []);

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
    async (targetLanguage: Language, nativeLanguage: Language): Promise<{ text: string; language: string } | null> => {
      setError(null);
      setIsTranscribing(true);

      try {
        const wavBuffer = await recorder.stopRecording();
        if (!wavBuffer) {
          setIsTranscribing(false);
          return null;
        }

        const result = await transcribeAudio(wavBuffer, targetLanguage, nativeLanguage);

        setIsTranscribing(false);
        return result.text ? { text: result.text, language: result.language ?? targetLanguage } : null;
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
