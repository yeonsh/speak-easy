import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChatView } from "./components/ChatView";
import { LanguageBar } from "./components/LanguageBar";
import { MicButton } from "./components/MicButton";
import { Sidebar } from "./components/Sidebar";
import { ServerStatus } from "./components/ServerStatus";
import { SetupWizard } from "./components/SetupWizard";
import { useLlm } from "./hooks/useLlm";
import { useStt } from "./hooks/useStt";
import { useTts } from "./hooks/useTts";
import { getSystemPrompt, getScenarioStarters } from "./lib/prompts";
import type {
  AppSettings,
  ConversationMode,
  Language,
  Message,
} from "./lib/types";
import { DEFAULT_SETTINGS } from "./lib/types";

function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesByLangRef = useRef<Record<string, Message[]>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showWizard, setShowWizard] = useState<boolean | null>(null);
  const [revealedSentences, setRevealedSentences] = useState<string[]>([]);
  const [isStreamingTts, setIsStreamingTts] = useState(false);
  const isStreamingTtsRef = useRef(false);
  const pendingFullTextRef = useRef<string | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});

  // Check if first launch
  useEffect(() => {
    invoke<{ has_whisper: boolean; has_llm: boolean; has_llama_server: boolean; has_tts: boolean; has_espeak: boolean }>(
      "check_setup_complete"
    ).then((s) => {
      setShowWizard(!s.has_llm || !s.has_llama_server || !s.has_tts);
    }).catch(() => {
      setShowWizard(false);
    });
  }, []);

  const llm = useLlm();
  const stt = useStt();
  const tts = useTts();

  // Auto-load LLM, STT, TTS when entering main screen
  useEffect(() => {
    if (showWizard !== false) return;

    if (!llm.isServerRunning && !llm.isServerStarting) {
      llm.startServer(undefined, settings.gpuLayers);
    }
    if (!stt.isModelLoaded) {
      stt.loadModel(settings.whisperModel);
    }
    if (!tts.isLoaded) {
      tts.loadVoice(settings.language, settings.ttsVoice !== "default" ? settings.ttsVoice : undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWizard]);

  // When TTS voice changes, reload the voice
  useEffect(() => {
    if (showWizard !== false) return;
    if (settings.ttsVoice === "default") return;

    tts.loadVoice(settings.language, settings.ttsVoice);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.ttsVoice]);

  // Wire up TTS chunk completion to reveal sentences
  useEffect(() => {
    tts.onChunkDone.current = (_index: number, text: string, done: boolean) => {
      if (text) {
        setRevealedSentences((prev) => [...prev, text]);
      }
      if (done) {
        // All audio finished — finalize message
        setIsStreamingTts(false);
        isStreamingTtsRef.current = false;
        const fullText = pendingFullTextRef.current;
        if (fullText) {
          const msg: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fullText,
            timestamp: Date.now(),
          };
          setMessages((msgs) => [...msgs, msg]);
          pendingFullTextRef.current = null;
        }
        setRevealedSentences([]);
      }
    };
  }, [tts.onChunkDone]);

  // Wire up LLM completion
  useEffect(() => {
    llm.onComplete.current = (fullText: string) => {
      if (tts.isLoaded && isStreamingTtsRef.current) {
        // TTS is streaming — wait for audio to finish before adding message
        pendingFullTextRef.current = fullText;
      } else {
        // No TTS — add message immediately (current behavior)
        const msg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: fullText,
          timestamp: Date.now(),
        };
        setMessages((msgs) => [...msgs, msg]);
      }
    };
  }, [llm.onComplete, tts.isLoaded]);

  // Auto-load TTS voice when language changes
  const handleLanguageChange = useCallback((lang: Language) => {
    setSettings((s) => {
      const key = `${s.language}:${s.mode}`;
      messagesByLangRef.current[key] = messages;
      if (tts.isLoaded) {
        tts.loadVoice(lang);
      }

      const newKey = `${lang}:${s.mode}`;
      const saved = messagesByLangRef.current[newKey];
      if (saved && saved.length > 0) {
        setMessages(saved);
      } else {
        setMessages([]);
      }

      return { ...s, language: lang };
    });
    tts.stop();
  }, [tts, messages]);

  const handleModeChange = useCallback((mode: ConversationMode) => {
    setSettings((s) => {
      // Save current messages under old key
      const oldKey = `${s.language}:${s.mode}`;
      messagesByLangRef.current[oldKey] = messages;

      // Restore saved messages for new mode, or start fresh
      const newKey = `${s.language}:${mode}`;
      const saved = messagesByLangRef.current[newKey];
      if (saved && saved.length > 0) {
        setMessages(saved);
      } else {
        setMessages([]);
      }

      return { ...s, mode };
    });
  }, [messages]);

  const handleClearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const handleScenarioSelect = useCallback((scenario: { description: string; opening: string }) => {
    setMessages([
      { id: crypto.randomUUID(), role: "system", content: scenario.description, timestamp: Date.now() },
      { id: crypto.randomUUID(), role: "assistant", content: scenario.opening, timestamp: Date.now() },
    ]);
    if (tts.isLoaded) {
      tts.speak(scenario.opening, settings.ttsSpeed, settings.language);
    }
  }, [tts, settings.ttsSpeed, settings.language]);

  const sendToLlm = useCallback(
    async (userText: string) => {
      // Cancel any previous generation and preserve revealed text
      if (currentRequestIdRef.current) {
        tts.stopStreaming();
        await invoke("cancel_generation", {
          requestId: currentRequestIdRef.current,
        }).catch(() => {});
        currentRequestIdRef.current = null;
      }

      // Commit any in-progress revealed text as a truncated message
      setRevealedSentences((prev) => {
        if (prev.length > 0) {
          const msg: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: prev.join(" "),
            timestamp: Date.now(),
          };
          setMessages((msgs) => [...msgs, msg]);
        }
        return [];
      });

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: userText,
        timestamp: Date.now(),
      };
      setMessages((msgs) => [...msgs, userMsg]);
      setIsStreamingTts(false);
      isStreamingTtsRef.current = false;
      pendingFullTextRef.current = null;

      const systemPrompt = getSystemPrompt(settings.language, settings.mode, settings.correctionsEnabled, settings.nativeLanguage);
      const allMessages = [
        { role: "system", content: systemPrompt },
        ...messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userText },
      ];

      try {
        // Generate requestId upfront so we can register TTS listener before
        // sending the message (avoids race where backend emits chunks before
        // the frontend listener is ready)
        const requestId = crypto.randomUUID();
        currentRequestIdRef.current = requestId;

        // Register TTS listener first if TTS is loaded
        if (tts.isLoaded) {
          setIsStreamingTts(true);
          isStreamingTtsRef.current = true;
          await tts.startStreaming(requestId);
        }

        await llm.sendMessage(
          allMessages,
          settings.llmTemperature,
          tts.isLoaded,
          settings.ttsSpeed,
          settings.language,
          requestId,
        );
      } catch (e) {
        const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `[Error: ${e}]`,
          timestamp: Date.now(),
        };
        setMessages((msgs) => [...msgs, errorMsg]);
      }
    },
    [messages, settings, llm, tts],
  );

  // Loading state
  if (showWizard === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (showWizard) {
    return <SetupWizard onComplete={() => setShowWizard(false)} />;
  }

  return (
    <div className="flex h-full">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        onClearChat={handleClearChat}
      />

      <div className="flex flex-col flex-1 h-full">
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>

          <LanguageBar
            selected={settings.language}
            onChange={handleLanguageChange}
          />

          <div className="flex items-center gap-2">
            <ModeSelector selected={settings.mode} onChange={handleModeChange} />
            <CorrectionsToggle
              enabled={settings.correctionsEnabled}
              onChange={(enabled) => setSettings((s) => ({ ...s, correctionsEnabled: enabled }))}
            />
          </div>
        </header>

        <ServerStatus
          isLlmRunning={llm.isServerRunning}
          isLlmStarting={llm.isServerStarting}
          isWhisperLoaded={stt.isModelLoaded}
          isTtsLoaded={tts.isLoaded}
          llmError={llm.serverError}
          sttError={stt.error}
          ttsError={tts.error}
          onStartLlm={() => llm.startServer(undefined, settings.gpuLayers)}
          onStopLlm={llm.stopServer}
          onLoadWhisper={() => stt.loadModel(settings.whisperModel)}
          onLoadTts={() => tts.loadVoice(settings.language)}
        />

        <ChatView
          messages={messages}
          streamingText={llm.streamingText}
          revealedText={revealedSentences.join(" ")}
          isStreamingTts={isStreamingTts}
          language={settings.language}
          scenarios={settings.mode === "scenario" ? getScenarioStarters(settings.language, settings.nativeLanguage) : undefined}
          onScenarioSelect={handleScenarioSelect}
          onReplay={(text) => {
            if (tts.isLoaded) {
              tts.speak(text, settings.ttsSpeed, settings.language);
            }
          }}
          onExplain={async (msgId, text) => {
            const result = await invoke<string>("explain_message", {
              text,
              language: settings.language,
              nativeLanguage: settings.nativeLanguage,
            });
            setExplanations((prev) => ({ ...prev, [msgId]: result }));
            return result;
          }}
          onSuggest={async (msgId, text) => {
            const result = await invoke<string>("suggest_responses", {
              text,
              language: settings.language,
              nativeLanguage: settings.nativeLanguage,
            });
            setSuggestions((prev) => ({ ...prev, [msgId]: result }));
            return result;
          }}
          explanations={explanations}
          suggestions={suggestions}
        />

        <footer className="flex items-center justify-center gap-4 p-6 border-t border-[var(--border)]">
          <MicButton
            isRecording={stt.isRecording}
            isProcessing={stt.isTranscribing || llm.isGenerating}
            onRecordStart={() => stt.startRecording()}
            onRecordStop={async () => {
              // Interrupt any playing TTS
              if (tts.isSpeaking && currentRequestIdRef.current) {
                tts.stopStreaming();
                await invoke("cancel_generation", {
                  requestId: currentRequestIdRef.current,
                }).catch(() => {});
                // Keep whatever text was already revealed as a truncated message
                if (revealedSentences.length > 0) {
                  const msg: Message = {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: revealedSentences.join(" "),
                    timestamp: Date.now(),
                  };
                  setMessages((msgs) => [...msgs, msg]);
                  setRevealedSentences([]);
                  setIsStreamingTts(false);
                  pendingFullTextRef.current = null;
                }
                currentRequestIdRef.current = null;
              }

              const text = await stt.stopAndTranscribe(settings.language);
              if (text) {
                sendToLlm(text);
              }
            }}
          />
          <TextInput
            disabled={!llm.isServerRunning || llm.isGenerating}
            onSubmit={sendToLlm}
          />
        </footer>
      </div>
    </div>
  );
}

function ModeSelector({
  selected,
  onChange,
}: {
  selected: ConversationMode;
  onChange: (mode: ConversationMode) => void;
}) {
  const modes: { value: ConversationMode; label: string }[] = [
    { value: "free-talk", label: "Free Talk" },
    { value: "scenario", label: "Scenario" },
  ];

  return (
    <div className="flex gap-1 bg-[var(--bg-surface)] rounded-lg p-1">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => onChange(mode.value)}
          className={`px-3 py-1 rounded-md text-sm transition-colors ${
            selected === mode.value
              ? "bg-[var(--primary)] text-white"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

function CorrectionsToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`px-3 py-1 rounded-md text-sm transition-colors ${
        enabled
          ? "bg-amber-500 text-white"
          : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      }`}
      title={enabled ? "Corrections ON" : "Corrections OFF"}
    >
      {enabled ? "ABC" : "ABC"}
    </button>
  );
}

function TextInput({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  };

  return (
    <div className="flex flex-1 max-w-md gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        disabled={disabled}
        placeholder={disabled ? "Start the server first..." : "Type a message..."}
        className="flex-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary)] disabled:opacity-50"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !text.trim()}
        className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm hover:bg-[var(--primary-hover)] disabled:opacity-50 transition-colors"
      >
        Send
      </button>
    </div>
  );
}

export default App;
