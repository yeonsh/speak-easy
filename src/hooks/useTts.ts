import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Language } from "../lib/types";

const DEFAULT_VOICES: Record<Language, string> = {
  en: "af_heart",
  es: "ef_dora",
  zh: "zf_xiaobei",
  de: "df_anna",
  ja: "jf_alpha",
};

interface TtsChunkPayload {
  samples: number[];
  sample_rate: number;
  index: number;
  text: string;
  done: boolean;
}

interface UseTtsReturn {
  isLoaded: boolean;
  isSpeaking: boolean;
  error: string | null;
  loadVoice: (language: Language, voiceName?: string) => Promise<void>;
  startStreaming: (requestId: string) => Promise<void>;
  stopStreaming: () => void;
  stop: () => void;
  availableVoices: string[];
  refreshVoices: () => Promise<void>;
  onChunkDone: React.MutableRefObject<
    ((index: number, text: string, done: boolean) => void) | null
  >;
}

export function useTts(): UseTtsReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const workletReadyRef = useRef(false);
  const unlistenChunkRef = useRef<UnlistenFn | null>(null);
  const unlistenStopRef = useRef<UnlistenFn | null>(null);
  const chunkMetaRef = useRef<Map<number, string>>(new Map());
  const onChunkDone = useRef<
    ((index: number, text: string, done: boolean) => void) | null
  >(null);
  const doneReceivedRef = useRef(false);
  const lastDoneIndexRef = useRef<number>(-1);

  const ensureWorklet = useCallback(async () => {
    if (workletReadyRef.current && workletNodeRef.current) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    await ctx.audioWorklet.addModule("/ttsChunkProcessor.js");

    const node = new AudioWorkletNode(ctx, "tts-chunk-processor");
    node.port.onmessage = (event) => {
      if (event.data.type === "chunkDone") {
        const idx = event.data.index as number;
        const text = chunkMetaRef.current.get(idx) ?? "";
        const isDone = doneReceivedRef.current && idx === lastDoneIndexRef.current;
        onChunkDone.current?.(idx, text, isDone);
        chunkMetaRef.current.delete(idx);

        if (isDone) {
          setIsSpeaking(false);
        }
      }
    };
    node.connect(ctx.destination);
    workletNodeRef.current = node;
    workletReadyRef.current = true;
  }, []);

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
        await invoke("load_tts_voice", { voiceName: resolvedVoice });
        setIsLoaded(true);
        await refreshVoices();
      } catch (e) {
        setError(`Failed to load voice: ${e}`);
        setIsLoaded(false);
      }
    },
    [refreshVoices],
  );

  const startStreaming = useCallback(
    async (requestId: string) => {
      // Clean up any previous streaming
      if (unlistenChunkRef.current) {
        unlistenChunkRef.current();
        unlistenChunkRef.current = null;
      }
      if (unlistenStopRef.current) {
        unlistenStopRef.current();
        unlistenStopRef.current = null;
      }

      chunkMetaRef.current.clear();
      doneReceivedRef.current = false;
      lastDoneIndexRef.current = -1;

      await ensureWorklet();
      setIsSpeaking(true);
      setError(null);

      // Clear any old audio in the worklet
      workletNodeRef.current?.port.postMessage({ type: "clear" });

      // Listen for TTS chunks
      const unChunk = await listen<TtsChunkPayload>(
        `tts-chunk-${requestId}`,
        (event) => {
          const { samples, index, text, done } = event.payload;

          if (done) {
            // This is the final marker — no audio, just signals completion
            doneReceivedRef.current = true;
            // The last real chunk's index is index - 1
            // But if no chunks were sent, handle immediately
            if (chunkMetaRef.current.size === 0 && lastDoneIndexRef.current === -1) {
              setIsSpeaking(false);
              onChunkDone.current?.(-1, "", true);
            }
            return;
          }

          // Store text for this chunk index
          chunkMetaRef.current.set(index, text);
          lastDoneIndexRef.current = index;

          if (samples.length > 0) {
            // Convert to Float32Array and send to worklet
            const float32 = new Float32Array(samples);
            workletNodeRef.current?.port.postMessage(
              { type: "chunk", samples: float32, index },
              [float32.buffer],
            );
          } else {
            // Empty samples (synthesis failed) — reveal text immediately
            onChunkDone.current?.(index, text, doneReceivedRef.current && index === lastDoneIndexRef.current);
          }
        },
      );
      unlistenChunkRef.current = unChunk;

      // Listen for TTS stop (cancellation)
      const unStop = await listen<boolean>(`tts-stop-${requestId}`, () => {
        workletNodeRef.current?.port.postMessage({ type: "clear" });
        setIsSpeaking(false);
        cleanup();
      });
      unlistenStopRef.current = unStop;

      const cleanup = () => {
        unChunk();
        unStop();
        unlistenChunkRef.current = null;
        unlistenStopRef.current = null;
      };
    },
    [ensureWorklet],
  );

  const stopStreaming = useCallback(() => {
    // Clear worklet audio queue
    workletNodeRef.current?.port.postMessage({ type: "clear" });
    setIsSpeaking(false);

    // Clean up listeners
    if (unlistenChunkRef.current) {
      unlistenChunkRef.current();
      unlistenChunkRef.current = null;
    }
    if (unlistenStopRef.current) {
      unlistenStopRef.current();
      unlistenStopRef.current = null;
    }
    chunkMetaRef.current.clear();
  }, []);

  const stop = useCallback(() => {
    stopStreaming();
  }, [stopStreaming]);

  return {
    isLoaded,
    isSpeaking,
    error,
    loadVoice,
    startStreaming,
    stopStreaming,
    stop,
    availableVoices,
    refreshVoices,
    onChunkDone,
  };
}
