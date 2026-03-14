import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface UseLlmReturn {
  isServerRunning: boolean;
  isServerStarting: boolean;
  serverError: string | null;
  startServer: (modelPath?: string, gpuLayers?: number) => Promise<void>;
  stopServer: () => Promise<void>;
  sendMessage: (
    messages: { role: string; content: string }[],
    temperature?: number,
    ttsEnabled?: boolean,
    ttsSpeed?: number,
    language?: string,
    requestId?: string,
  ) => Promise<string>;  // returns requestId
  streamingText: string;
  isGenerating: boolean;
  onComplete: React.MutableRefObject<((fullText: string) => void) | null>;
}

export function useLlm(): UseLlmReturn {
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [isServerStarting, setIsServerStarting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const onComplete = useRef<((fullText: string) => void) | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Listen for server ready event
    let unlisten: UnlistenFn | undefined;
    listen<boolean>("llm-ready", () => {
      setIsServerRunning(true);
      setIsServerStarting(false);
    }).then((u) => {
      unlisten = u;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const startServer = useCallback(
    async (modelPath?: string, gpuLayers?: number) => {
      setIsServerStarting(true);
      setServerError(null);
      try {
        await invoke("start_llm_server", {
          modelPath: modelPath ?? null,
          gpuLayers: gpuLayers ?? null,
        });
      } catch (e) {
        setServerError(String(e));
        setIsServerStarting(false);
      }
    },
    [],
  );

  const stopServer = useCallback(async () => {
    try {
      await invoke("stop_llm_server");
      setIsServerRunning(false);
    } catch (e) {
      setServerError(String(e));
    }
  }, []);

  const sendMessage = useCallback(
    async (
      messages: { role: string; content: string }[],
      temperature?: number,
      ttsEnabled?: boolean,
      ttsSpeed?: number,
      language?: string,
      externalRequestId?: string,
    ) => {
      // Clean up previous listener
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      const requestId = externalRequestId ?? crypto.randomUUID();
      currentRequestIdRef.current = requestId;
      setStreamingText("");
      setIsGenerating(true);

      let accumulated = "";

      // Set up stream listener before sending
      const unlisten = await listen<{ content: string; done: boolean }>(
        `chat-stream-${requestId}`,
        (event) => {
          if (event.payload.done) {
            setIsGenerating(false);
            setStreamingText("");
            currentRequestIdRef.current = null;
            onComplete.current?.(accumulated);
            unlistenRef.current?.();
            unlistenRef.current = null;
          } else {
            accumulated += event.payload.content;
            setStreamingText(accumulated);
          }
        },
      );
      unlistenRef.current = unlisten;

      try {
        await invoke("send_chat_message", {
          messages,
          temperature: temperature ?? null,
          requestId,
          ttsEnabled: ttsEnabled ?? false,
          ttsSpeed: ttsSpeed ?? null,
          language: language ?? null,
        });
      } catch (e) {
        currentRequestIdRef.current = null;
        setIsGenerating(false);
        setStreamingText("");
        unlisten();
        throw e;
      }

      return requestId;
    },
    [],
  );

  return {
    isServerRunning,
    isServerStarting,
    serverError,
    startServer,
    stopServer,
    sendMessage,
    streamingText,
    isGenerating,
    onComplete,
  };
}
