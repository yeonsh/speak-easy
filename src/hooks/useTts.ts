import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Language } from "../lib/types";

const DEFAULT_VOICES: Record<Language, string> = {
  en: "af_heart",
  es: "ef_dora",
  zh: "zf_xiaobei",
  de: "df_anna",
  ja: "jf_alpha",
};

interface UseTtsReturn {
  isLoaded: boolean;
  isSpeaking: boolean;
  error: string | null;
  loadVoice: (language: Language, voiceName?: string) => Promise<void>;
  speak: (text: string, speed?: number) => Promise<void>;
  stop: () => void;
  availableVoices: string[];
  refreshVoices: () => Promise<void>;
}

export function useTts(): UseTtsReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const refreshVoices = useCallback(async () => {
    try {
      const voices = await invoke<string[]>("list_voices");
      setAvailableVoices(voices);
    } catch (e) {
      setError(`Failed to list voices: ${e}`);
    }
  }, []);

  const loadVoice = useCallback(
    async (language: Language, voiceName?: string) => {
      setError(null);
      const resolvedVoice = voiceName || DEFAULT_VOICES[language];

      if (!resolvedVoice) {
        setError(`No TTS voice available for ${language}`);
        setIsLoaded(false);
        return;
      }

      try {
        await invoke("load_tts_voice", {
          voiceName: resolvedVoice,
        });
        setIsLoaded(true);
        await refreshVoices();
      } catch (e) {
        setError(`Failed to load voice: ${e}`);
        setIsLoaded(false);
      }
    },
    [refreshVoices],
  );

  const speak = useCallback(async (text: string, speed?: number) => {
    setError(null);
    setIsSpeaking(true);

    try {
      const result = await invoke<{ sample_rate: number; samples: number[] }>(
        "synthesize_speech",
        {
          text,
          speed: speed ?? null,
        },
      );

      if (result.samples.length === 0) {
        setIsSpeaking(false);
        return;
      }

      // Play audio via Web Audio API
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;

      const audioBuffer = ctx.createBuffer(
        1,
        result.samples.length,
        result.sample_rate,
      );
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < result.samples.length; i++) {
        channelData[i] = result.samples[i];
      }

      // Stop any currently playing audio
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          // ignore
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setIsSpeaking(false);
        sourceRef.current = null;
      };
      sourceRef.current = source;
      source.start();
    } catch (e) {
      setError(`TTS failed: ${e}`);
      setIsSpeaking(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // ignore
      }
      sourceRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  return {
    isLoaded,
    isSpeaking,
    error,
    loadVoice,
    speak,
    stop,
    availableVoices,
    refreshVoices,
  };
}
