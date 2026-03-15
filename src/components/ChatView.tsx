import { useCallback, useEffect, useRef, useState } from "react";
import type { Language, Message, NativeLanguage } from "../lib/types";
import { LANGUAGE_CONFIG } from "../lib/types";
import type { ScenarioStarter } from "../lib/prompts";
import { t } from "../lib/i18n";

/** Parse numbered suggestion responses like "1. Hola\n(한국어: Hi)\n\n2. Buenos días\n(한국어: Good morning)" */
function parseSuggestions(text: string): { target: string; translation: string }[] {
  const items: { target: string; translation: string }[] = [];
  // Split by numbered prefix: "1. ", "2. ", etc.
  const parts = text.split(/\d+\.\s+/).filter(Boolean);
  for (const part of parts) {
    const lines = part.trim().split("\n").filter(Boolean);
    const target = lines[0]?.trim() || "";
    // Translation line is usually in parentheses: (한국어: ...)
    const transLine = lines.find((l) => /^\(/.test(l.trim()));
    const translation = transLine?.trim().replace(/^\(|\)$/g, "") || "";
    if (target) items.push({ target, translation });
  }
  return items.length > 0 ? items : [{ target: text, translation: "" }];
}

const EMPTY_HINTS: Record<Language, string> = {
  en: "Say \"Hello\" to start a conversation",
  es: "Di \"Hola\" para empezar",
  fr: "Dites \"Bonjour\" pour commencer",
  zh: '说"你好"开始对话',
  ja: "「こんにちは」と言って始めましょう",
  de: "Sagen Sie \"Hallo\" um zu starten",
  ko: "\"안녕하세요\"라고 말해보세요",
  pt: "Diga \"Olá\" para começar",
  it: "Di \"Ciao\" per iniziare",
  ru: "Скажите \"Привет\" чтобы начать",
  ar: "قل \"مرحبا\" للبدء",
  hi: "बातचीत शुरू करने के लिए \"नमस्ते\" कहें",
  tr: "Başlamak için \"Merhaba\" deyin",
  id: "Katakan \"Halo\" untuk memulai",
  vi: "Nói \"Xin chào\" để bắt đầu",
  pl: "Powiedz \"Cześć\" aby zacząć",
};

interface ChatViewProps {
  messages: Message[];
  streamingText: string;
  revealedText?: string;
  isStreamingTts?: boolean;
  language?: Language;
  nativeLanguage?: NativeLanguage;
  scenarios?: ScenarioStarter[];
  onScenarioSelect?: (scenario: ScenarioStarter | null) => void;
  playingText?: string | null;
  onReplay?: (text: string) => void;
  onExplain?: (msgId: string, text: string) => Promise<string>;
  onSuggest?: (msgId: string, text: string) => Promise<string>;
  onLookupWord?: (word: string, sentence: string) => Promise<string>;
  explanations?: Record<string, string>;
  suggestions?: Record<string, string>;
}

export function ChatView({
  messages,
  streamingText,
  revealedText,
  isStreamingTts,
  language,
  nativeLanguage = "ko",
  scenarios,
  onScenarioSelect,
  playingText,
  onReplay,
  onExplain,
  onSuggest,
  onLookupWord,
  explanations,
  suggestions,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [wordPopup, setWordPopup] = useState<{
    word: string;
    definition: string | null;
    isLoading: boolean;
    position: { x: number; y: number };
  } | null>(null);

  const handleWordClick = useCallback(async (word: string, sentence: string, rect: DOMRect) => {
    if (!onLookupWord) return;

    // Position popup below the word
    const x = Math.min(rect.left, window.innerWidth - 280);
    const y = rect.bottom + 8;

    setWordPopup({ word, definition: null, isLoading: true, position: { x, y } });

    try {
      const def = await onLookupWord(word, sentence);
      console.log("[lookup_word] result:", JSON.stringify(def));
      setWordPopup((prev) => prev ? { ...prev, definition: def || null, isLoading: false } : null);
    } catch (e) {
      console.error("[lookup_word] error:", e);
      setWordPopup((prev) => prev ? { ...prev, definition: null, isLoading: false } : null);
    }
  }, [onLookupWord]);

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
      {messages.length === 0 && !streamingText && scenarios && scenarios.length > 0 && onScenarioSelect ? (
        <div className="flex flex-col h-full">
          <p className="text-sm text-[var(--text-secondary)] mb-3 text-center">{t("chooseScenario", nativeLanguage)}</p>
          <div className="flex-1 overflow-y-auto space-y-2">
            {scenarios.map((s, i) => (
              <button
                key={i}
                onClick={() => onScenarioSelect(s)}
                className="w-full text-left px-4 py-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <p className="text-sm text-[var(--text-primary)]">{s.description}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">{s.opening}</p>
              </button>
            ))}
          </div>
        </div>
      ) : messages.length === 0 && !streamingText ? (
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
          <p className="text-lg font-medium">{t("tapMicToStart", nativeLanguage)}</p>
          <p className="text-sm mt-1">{t("orTypeBelow", nativeLanguage)}</p>
          {language && (
            <p className="text-sm mt-3 text-[var(--primary)] opacity-70">
              {LANGUAGE_CONFIG[language].flag} {EMPTY_HINTS[language]}
            </p>
          )}
        </div>
      ) : null}

      {messages.length > 0 && scenarios && onScenarioSelect && (
        <div className="flex justify-center">
          <button
            onClick={() => onScenarioSelect(null)}
            className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border)] transition-colors"
          >
            {t("changeScenario", nativeLanguage)}
          </button>
        </div>
      )}

      {messages.map((msg) => msg.role === "tutor" ? (
        <div key={msg.id} className="flex justify-start">
          <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-md bg-teal-500/10 border border-teal-500/25 text-[var(--text-primary)]">
            <p className="text-xs font-medium text-teal-400 mb-1">{t("tutorHint", nativeLanguage)}</p>
            <WordClickableText text={msg.content} onWordClick={handleWordClick} onReplay={onReplay} />
            {msg.tutorTarget && onReplay && (
              <div className="flex gap-1 mt-1.5">
                <PlayButton text={msg.tutorTarget} playingText={playingText} onReplay={onReplay} nativeLanguage={nativeLanguage} className="hover:bg-teal-500/20" />
                <CopyButton text={msg.content} nativeLanguage={nativeLanguage} />
              </div>
            )}
          </div>
        </div>
      ) : msg.role === "system" ? (
        <div key={msg.id} className="flex justify-center">
          <div className="px-4 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text-secondary)] text-center max-w-[85%]">
            {msg.content}
          </div>
        </div>
      ) : (
        <MessageBubble
          key={msg.id}
          message={msg}
          nativeLanguage={nativeLanguage}
          playingText={playingText}
          onReplay={onReplay}
          onExplain={onExplain}
          onSuggest={onSuggest}
          onWordClick={handleWordClick}
          explanation={explanations?.[msg.id]}
          suggestion={suggestions?.[msg.id]}
        />
      ))}

      {/* Streaming TTS: show revealed text */}
      {isStreamingTts && revealedText && (
        <div className="flex justify-start">
          <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-md bg-[var(--bg-elevated)] text-[var(--text-primary)]">
            <p className="whitespace-pre-wrap">
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

      {wordPopup && (
        <WordPopup
          word={wordPopup.word}
          definition={wordPopup.definition}
          isLoading={wordPopup.isLoading}
          position={wordPopup.position}
          onClose={() => setWordPopup(null)}
          onReplay={onReplay}
          playingText={playingText}
        />
      )}
    </div>
  );
}

function WordClickableText({
  text,
  onWordClick,
  className,
  onReplay,
}: {
  text: string;
  onWordClick?: (word: string, sentence: string, rect: DOMRect) => void;
  className?: string;
  onReplay?: (text: string) => void;
}) {
  const containerRef = useRef<HTMLParagraphElement>(null);
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  const [selectionPopup, setSelectionPopup] = useState<{
    text: string;
    position: { x: number; y: number };
  } | null>(null);

  // Split text into tokens: CJK characters individually, other words by spaces
  const tokens = text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]|[^\s\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+|\s+/g) || [text];

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    setSelectionPopup(null);
  };

  const handleMouseUp = () => {
    const sel = window.getSelection();
    const selectedText = sel?.toString().trim();
    if (selectedText && selectedText.length > 0 && sel && !sel.isCollapsed) {
      // It's a drag selection — show lookup button
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionPopup({
        text: selectedText,
        position: {
          x: Math.min(rect.left + rect.width / 2 - 14, window.innerWidth - 40),
          y: rect.top - 36,
        },
      });
      mouseDownPos.current = null;
      return;
    }
    mouseDownPos.current = null;
  };

  const handleWordMouseUp = (e: React.MouseEvent, token: string) => {
    // Only fire single-word lookup if it was a click (not a drag)
    const sel = window.getSelection();
    const selectedText = sel?.toString().trim();
    if (selectedText && selectedText.length > 1) return; // drag selection, handled by container

    const down = mouseDownPos.current;
    if (!down) return;
    const dx = Math.abs(e.clientX - down.x);
    const dy = Math.abs(e.clientY - down.y);
    if (dx > 5 || dy > 5) return; // dragged

    if (onWordClick) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const cleanWord = token.replace(/^[.,;:!?¿¡。、！？，；：\u201c\u201d\u2018\u2019「」『』（）\-\u2014…]+|[.,;:!?¿¡。、！？，；：\u201c\u201d\u2018\u2019「」『』（）\-\u2014…]+$/g, "");
      if (cleanWord) onWordClick(cleanWord, text, rect);
    }
  };

  // Dismiss selection popup on click outside
  useEffect(() => {
    if (!selectionPopup) return;
    const dismiss = () => setSelectionPopup(null);
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [selectionPopup]);

  return (
    <div className="relative">
      <p
        ref={containerRef}
        className={`whitespace-pre-wrap select-text ${className || ""}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {tokens.map((token, i) => {
          if (/^\s+$/.test(token) || /^[.,;:!?¿¡。、！？，；：\u201c\u201d\u2018\u2019「」『』（）\-\u2014…]+$/.test(token)) {
            return <span key={i}>{token}</span>;
          }
          return (
            <span
              key={i}
              onMouseUp={(e) => { e.stopPropagation(); handleWordMouseUp(e, token); handleMouseUp(); }}
              className="cursor-pointer hover:bg-[var(--primary)]/20 hover:rounded px-[1px] transition-colors"
            >
              {token}
            </span>
          );
        })}
      </p>
      {selectionPopup && (
        <div
          className="fixed z-[101] flex gap-1"
          style={{ left: selectionPopup.position.x, top: selectionPopup.position.y }}
        >
          <button
            className="bg-[var(--primary)] text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (onWordClick) {
                const el = containerRef.current;
                const rect = el ? el.getBoundingClientRect() : new DOMRect(selectionPopup.position.x, selectionPopup.position.y + 36, 100, 20);
                onWordClick(selectionPopup.text, text, rect);
              }
              setSelectionPopup(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
          {onReplay && (
            <button
              className="bg-[var(--primary)] text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onReplay(selectionPopup.text);
                setSelectionPopup(null);
                window.getSelection()?.removeAllRanges();
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function WordPopup({
  word,
  definition,
  isLoading,
  position,
  onClose,
  onReplay,
  playingText,
}: {
  word: string;
  definition: string | null;
  isLoading: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onReplay?: (text: string) => void;
  playingText?: string | null;
}) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const isPlaying = playingText === word;

  return (
    <div
      ref={popupRef}
      className="fixed z-[100] max-w-xs bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-lg px-4 py-3"
      style={{ left: position.x, top: position.y }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-xs font-bold text-[var(--primary)]">{word}</p>
        {onReplay && (
          <button
            onClick={() => onReplay(word)}
            className="p-0.5 rounded hover:bg-[var(--primary)]/20 transition-colors"
          >
            {isPlaying ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--primary)]">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--primary)]">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </div>
      ) : definition ? (
        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{definition}</p>
      ) : (
        <p className="text-sm text-[var(--text-secondary)] italic">—</p>
      )}
    </div>
  );
}

function PlayButton({ text, playingText, onReplay, nativeLanguage, className }: {
  text: string;
  playingText?: string | null;
  onReplay: (text: string) => void;
  nativeLanguage: NativeLanguage;
  className?: string;
}) {
  const isPlaying = playingText === text;
  return (
    <button
      onClick={() => onReplay(text)}
      className={`p-1 rounded transition-colors ${className || "hover:bg-black/10"} ${isPlaying ? "opacity-90 text-[var(--primary)]" : "opacity-40 hover:opacity-80"}`}
      title={t("replay", nativeLanguage)}
    >
      {isPlaying ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="4" width="6" height="16" rx="1" />
          <rect x="14" y="4" width="6" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      )}
    </button>
  );
}

function CopyButton({ text, nativeLanguage, light }: { text: string; nativeLanguage: NativeLanguage; light?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className={`p-1 rounded transition-colors ${light ? "hover:bg-white/20" : "hover:bg-black/10"} opacity-40 hover:opacity-80`}
      title={copied ? t("copied", nativeLanguage) : t("copy", nativeLanguage)}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function MessageBubble({
  message,
  nativeLanguage = "ko",
  playingText,
  onReplay,
  onExplain,
  onSuggest,
  onWordClick,
  explanation,
  suggestion,
}: {
  message: Message;
  nativeLanguage?: NativeLanguage;
  playingText?: string | null;
  onReplay?: (text: string) => void;
  onExplain?: (msgId: string, text: string) => Promise<string>;
  onSuggest?: (msgId: string, text: string) => Promise<string>;
  onWordClick?: (word: string, sentence: string, rect: DOMRect) => void;
  explanation?: string;
  suggestion?: string;
}) {
  const isUser = message.role === "user";
  const [isExplaining, setIsExplaining] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const handleExplain = async () => {
    if (!onExplain || isExplaining || explanation) return;
    setIsExplaining(true);
    try {
      await onExplain(message.id, message.content);
    } finally {
      setIsExplaining(false);
    }
  };

  const handleSuggest = async () => {
    if (!onSuggest || isSuggesting || suggestion) return;
    setIsSuggesting(true);
    try {
      await onSuggest(message.id, message.content);
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl ${
          isUser
            ? "bg-[var(--primary)] text-white rounded-br-md"
            : "bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-bl-md"
        }`}
      >
        <WordClickableText text={message.content} onWordClick={onWordClick} onReplay={onReplay} />
        {isUser && onReplay && (
          <div className="flex gap-1 mt-1.5">
            <PlayButton text={message.content} playingText={playingText} onReplay={onReplay} nativeLanguage={nativeLanguage} className="hover:bg-white/20" />
            <CopyButton text={message.content} nativeLanguage={nativeLanguage} light />
          </div>
        )}
        {!isUser && (onReplay || onExplain || onSuggest) && (
          <div className="flex gap-1 mt-1.5">
            {onReplay && (
              <PlayButton text={message.content} playingText={playingText} onReplay={onReplay} nativeLanguage={nativeLanguage} />
            )}
            {onExplain && (
              <button
                onClick={handleExplain}
                disabled={isExplaining || !!explanation}
                className={`p-1 rounded transition-colors ${
                  explanation ? "opacity-80" : "opacity-40 hover:opacity-80 hover:bg-black/10"
                }`}
                title={isExplaining ? t("translating", nativeLanguage) : explanation ? t("translated", nativeLanguage) : t("translate", nativeLanguage)}
              >
                {isExplaining ? (
                  <div className="w-[14px] h-[14px] border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 8 6 6" />
                    <path d="m4 14 6-6 2-3" />
                    <path d="M2 5h12" />
                    <path d="M7 2h1" />
                    <path d="m22 22-5-10-5 10" />
                    <path d="M14 18h6" />
                  </svg>
                )}
              </button>
            )}
            {onSuggest && (
              <button
                onClick={handleSuggest}
                disabled={isSuggesting || !!suggestion}
                className={`p-1 rounded transition-colors ${
                  suggestion ? "opacity-80" : "opacity-40 hover:opacity-80 hover:bg-black/10"
                }`}
                title={isSuggesting ? t("loading", nativeLanguage) : suggestion ? t("suggestionsShown", nativeLanguage) : t("sampleResponses", nativeLanguage)}
              >
                {isSuggesting ? (
                  <div className="w-[14px] h-[14px] border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                )}
              </button>
            )}
            <CopyButton text={message.content} nativeLanguage={nativeLanguage} />
          </div>
        )}
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
      {explanation && (
        <div className="max-w-[80%] mt-1 px-4 py-3 rounded-2xl rounded-tl-md bg-violet-500/10 border border-violet-500/20 text-sm text-[var(--text-primary)]">
          {explanation}
        </div>
      )}
      {suggestion && (
        <div className="max-w-[80%] mt-1 px-4 py-3 rounded-2xl rounded-tl-md bg-amber-500/10 border border-amber-500/20 text-[var(--text-primary)] space-y-3">
          {parseSuggestions(suggestion).map((item, i) => (
            <div key={i}>
              <div className="flex items-start gap-1.5">
                {onReplay && (
                  <PlayButton text={item.target} playingText={playingText} onReplay={onReplay} nativeLanguage={nativeLanguage} className="mt-0.5 !p-0.5 hover:bg-black/10 shrink-0" />
                )}
                <WordClickableText text={item.target} onWordClick={onWordClick} onReplay={onReplay} className="font-medium" />
              </div>
              {item.translation && (
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 ml-5">{item.translation}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
