import { useState, useCallback, useRef, useEffect } from "react";
import { invoke, listen, sendChat } from "../lib/backend";

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
    provider?: string,
    apiKey?: string,
    apiModel?: string,
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
  const unlistenRef = useRef<(() => void) | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // Listen for server ready event
    let unlisten: (() => void) | undefined;
    listen<boolean>("llm-ready", () => {
      setIsServerRunning(true);
      setIsServerStarting(false);
      startTimeRef.current = null;
    }).then((u) => {
      unlisten = u;
    });

    // Also check backend state on mount (handles hot-reload where server is already running)
    invoke<boolean>("is_llm_running").then((running) => {
      if (running) {
        setIsServerRunning(true);
        setIsServerStarting(false);
      }
    }).catch(() => {});

    return () => {
      unlisten?.();
    };
  }, []);

  // Startup timeout: if still "starting" after 30s, stop and report error
  useEffect(() => {
    if (!isServerStarting) return;
    if (!startTimeRef.current) startTimeRef.current = Date.now();

    const timer = setTimeout(() => {
      if (isServerStarting && !isServerRunning) {
        invoke("stop_llm_server").catch(() => {});
        setIsServerStarting(false);
        setServerError("LLM server startup timed out. Try restarting.");
        startTimeRef.current = null;
      }
    }, 30000);

    return () => clearTimeout(timer);
  }, [isServerStarting, isServerRunning]);

  const startServer = useCallback(
    async (modelPath?: string, gpuLayers?: number) => {
      setIsServerStarting(true);
      setServerError(null);
      startTimeRef.current = Date.now();
      try {
        await invoke("start_llm_server", {
          modelPath: modelPath ?? null,
          gpuLayers: gpuLayers ?? null,
        });
      } catch (e) {
        setServerError(String(e));
        setIsServerStarting(false);
        startTimeRef.current = null;
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
      provider?: string,
      apiKey?: string,
      apiModel?: string,
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
        const chatProvider = (provider === "gemini" && apiKey) ? "gemini" : "local";
        await sendChat(chatProvider, requestId, messages, {
          temperature: temperature ?? null,
          ttsEnabled: ttsEnabled ?? false,
          ttsSpeed: ttsSpeed ?? null,
          language: language ?? null,
          ...(chatProvider === "gemini" ? { apiKey, model: apiModel ?? null } : {}),
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
