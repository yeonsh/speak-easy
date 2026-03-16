import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionSummary, LoadedMessage, ReviewItem, NativeLanguage } from "../lib/types";
import { t } from "../lib/i18n";

interface ReviewPanelProps {
  session: SessionSummary;
  nativeLanguage: NativeLanguage;
  settings: { llmProvider: string; geminiApiKey: string; geminiModel: string };
  onBack: () => void;
  onDelete: (id: string) => void;
}

const ERROR_COLORS: Record<string, string> = {
  grammar: "border-red-400 bg-red-400/10",
  vocab: "border-orange-400 bg-orange-400/10",
  naturalness: "border-yellow-400 bg-yellow-400/10",
  situation: "border-purple-400 bg-purple-400/10",
  none: "border-emerald-400 bg-emerald-400/10",
};

const ERROR_LABEL_KEYS: Record<string, string> = {
  grammar: "errorGrammar",
  vocab: "errorVocab",
  naturalness: "errorNaturalness",
  situation: "errorSituation",
};

export function ReviewPanel({ session, nativeLanguage, settings, onBack, onDelete }: ReviewPanelProps) {
  const [messages, setMessages] = useState<LoadedMessage[]>([]);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const loadReview = useCallback(async () => {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const items = await invoke<ReviewItem[]>("generate_review", {
        sessionId: session.id,
        nativeLanguage,
        provider: settings.llmProvider,
        apiKey: settings.geminiApiKey,
        apiModel: settings.geminiModel,
      });
      setReview(items);
    } catch (e) {
      setReviewError(String(e));
    } finally {
      setReviewLoading(false);
    }
  }, [session.id, nativeLanguage, settings.llmProvider, settings.geminiApiKey, settings.geminiModel]);

  useEffect(() => {
    invoke<LoadedMessage[]>("load_session_messages", { sessionId: session.id })
      .then(setMessages)
      .catch((e) => console.error("Failed to load messages:", e));
  }, [session.id]);

  useEffect(() => {
    loadReview();
  }, [loadReview]);

  const date = new Date(session.started_at * 1000);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const reviewBySeq = new Map<number, ReviewItem>();
  review?.forEach((r) => reviewBySeq.set(r.seq, r));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-xs text-[var(--text-secondary)]">{dateStr} {timeStr}</span>
        <button
          onClick={() => onDelete(session.id)}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          {t("deleteSession", nativeLanguage)}
        </button>
      </div>

      {/* Conversation Replay + Inline Notes */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const reviewItem = isUser ? reviewBySeq.get(msg.seq) : undefined;
          const colorClass = reviewItem ? ERROR_COLORS[reviewItem.errorType] : "";

          return (
            <div key={msg.seq} className={`text-sm ${isUser ? "text-right" : "text-left"}`}>
              <div
                className={`inline-block max-w-[85%] rounded-lg px-3 py-2 ${
                  isUser
                    ? `bg-[var(--accent)]/20 text-[var(--text-primary)] ${reviewItem && reviewItem.errorType !== "none" ? `border-l-2 ${colorClass}` : ""}`
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                }`}
              >
                {msg.content}
              </div>

              {reviewItem && reviewItem.errorType !== "none" && (
                <div className={`inline-block max-w-[85%] mt-1 rounded px-3 py-1.5 text-xs border-l-2 ${colorClass}`}>
                  <span className="font-medium">
                    {t(ERROR_LABEL_KEYS[reviewItem.errorType] as any, nativeLanguage)}
                  </span>
                  {reviewItem.corrected && (
                    <span className="ml-2 text-[var(--accent)]">{reviewItem.corrected}</span>
                  )}
                  {reviewItem.note && (
                    <p className="mt-0.5 text-[var(--text-secondary)]">{reviewItem.note}</p>
                  )}
                </div>
              )}

              {reviewItem && reviewItem.errorType === "none" && (
                <div className={`inline-block max-w-[85%] mt-1 rounded px-3 py-1 text-xs border-l-2 ${ERROR_COLORS.none}`}>
                  {t("wellDone", nativeLanguage)}
                </div>
              )}
            </div>
          );
        })}

        {reviewLoading && (
          <div className="text-center py-4">
            <div className="inline-block w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-[var(--text-secondary)] mt-2">{t("generating", nativeLanguage)}</p>
          </div>
        )}
        {reviewError && (
          <div className="text-center py-4 space-y-2">
            <p className="text-xs text-red-400">{t("reviewFailed", nativeLanguage)}</p>
            <button
              onClick={loadReview}
              className="text-xs px-3 py-1 rounded bg-[var(--bg-elevated)] hover:bg-[var(--border)] transition-colors"
            >
              {t("retry", nativeLanguage)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
