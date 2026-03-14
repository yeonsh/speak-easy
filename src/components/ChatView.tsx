import { useEffect, useRef } from "react";
import type { Language, Message } from "../lib/types";
import { LANGUAGE_CONFIG } from "../lib/types";

const EMPTY_HINTS: Record<Language, string> = {
  en: "Say \"Hello\" to start a conversation",
  es: "Di \"Hola\" para empezar",
  fr: "Dites \"Bonjour\" pour commencer",
  zh: '说"你好"开始对话',
  ja: "「こんにちは」と言って始めましょう",
};

interface ChatViewProps {
  messages: Message[];
  streamingText: string;
  revealedText?: string;
  isStreamingTts?: boolean;
  language?: Language;
}

export function ChatView({
  messages,
  streamingText,
  revealedText,
  isStreamingTts,
  language,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streamingText, revealedText]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
    >
      {messages.length === 0 && !streamingText && (
        <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)]">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="mb-4 opacity-40"
          >
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
          <p className="text-lg font-medium">Tap the mic to start speaking</p>
          <p className="text-sm mt-1">or type a message below</p>
          {language && (
            <p className="text-sm mt-3 text-[var(--primary)] opacity-70">
              {LANGUAGE_CONFIG[language].flag} {EMPTY_HINTS[language]}
            </p>
          )}
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {/* Streaming TTS: show revealed text */}
      {isStreamingTts && revealedText && (
        <div className="flex justify-start">
          <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-md bg-[var(--bg-elevated)] text-[var(--text-primary)]">
            <p className="whitespace-pre-wrap select-text">
              {revealedText}
              <span className="inline-block w-1.5 h-4 ml-1 bg-[var(--primary)] animate-pulse rounded-sm" />
            </p>
          </div>
        </div>
      )}

      {/* Fallback: streaming text without TTS */}
      {!isStreamingTts && streamingText && (
        <div className="flex justify-start">
          <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-md bg-[var(--bg-elevated)] text-[var(--text-primary)]">
            {streamingText}
            <span className="inline-block w-2 h-4 ml-1 bg-[var(--primary)] animate-pulse" />
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl ${
          isUser
            ? "bg-[var(--primary)] text-white rounded-br-md"
            : "bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-bl-md"
        }`}
      >
        <p className="whitespace-pre-wrap select-text">{message.content}</p>
        {message.corrections && message.corrections.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/20 space-y-1">
            {message.corrections.map((c, i) => (
              <div key={i} className="text-sm opacity-80">
                <span className="line-through">{c.original}</span>
                {" → "}
                <span className="font-semibold">{c.corrected}</span>
                <p className="text-xs opacity-60 mt-0.5">{c.explanation}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
