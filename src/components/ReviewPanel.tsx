import { useState, useEffect, useCallback } from "react";
import { invoke } from "../lib/backend";
import type { SessionSummary, LoadedMessage, ReviewItem, NativeLanguage, CefrLevel } from "../lib/types";
import { t } from "../lib/i18n";
import { CourageScore } from "./CourageScore";

interface ReviewPanelProps {
  session: SessionSummary;
  nativeLanguage: NativeLanguage;
  settings: { llmProvider: string; geminiApiKey: string; geminiModel: string; customEndpoint: string };
  onBack: () => void;
  onDelete: (id: string) => void;
  justEnded?: boolean;
  onCefrCalibrated?: (language: string, level: CefrLevel) => void;
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

export function ReviewPanel({ session, nativeLanguage, settings, onBack, onDelete, justEnded, onCefrCalibrated }: ReviewPanelProps) {
  const [messages, setMessages] = useState<LoadedMessage[]>([]);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [cefrAssessed, setCefrAssessed] = useState<CefrLevel | null>(null);

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
        customEndpoint: settings.customEndpoint,
      });
      setReview(items);
    } catch (e) {
      setReviewError(String(e));
    } finally {
      setReviewLoading(false);
    }
  }, [session.id, nativeLanguage, settings.llmProvider, settings.geminiApiKey, settings.geminiModel, settings.customEndpoint]);

  const loadCefrAssessment = useCallback(async () => {
    if (!justEnded) return;
    try {
      const level = await invoke<string>("assess_cefr_level", {
        sessionId: session.id,
        language: session.language,
        provider: settings.llmProvider,
        apiKey: settings.geminiApiKey,
        apiModel: settings.geminiModel,
        customEndpoint: settings.customEndpoint,
      });
      const cefrLevel = level as CefrLevel;
      setCefrAssessed(cefrLevel);
      onCefrCalibrated?.(session.language, cefrLevel);
    } catch (e) {
      console.error("CEFR assessment failed:", e);
    }
  }, [
    justEnded,
    session.id,
    session.language,
    settings.llmProvider,
    settings.geminiApiKey,
    settings.geminiModel,
    settings.customEndpoint,
    onCefrCalibrated,
  ]);

  useEffect(() => {
    invoke<LoadedMessage[]>("load_session_messages", { sessionId: session.id })
      .then(setMessages)
      .catch((e) => console.error("Failed to load messages:", e));
  }, [session.id]);

  useEffect(() => {
    loadReview();
    loadCefrAssessment();
  }, [loadReview, loadCefrAssessment]);

  const date = new Date(session.started_at * 1000);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const reviewBySeq = new Map<number, ReviewItem>();
  review?.forEach((r) => reviewBySeq.set(r.seq, r));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <button
          onClick={onBack}
          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors text-sm text-[var(--text-secondary)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="flex items-center gap-3 text-sm">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            session.mode === "scenario"
              ? "bg-purple-400/20 text-purple-300"
              : "bg-blue-400/20 text-blue-300"
          }`}>
            {session.mode === "scenario" ? "Scenario" : "Free Talk"}
          </span>
          <span className="text-[var(--text-secondary)]">{dateStr} {timeStr}</span>
          <span className="text-[var(--text-secondary)]">{session.msg_count} msgs</span>
          {cefrAssessed && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--primary)] text-[var(--text-bubble-user)] font-medium">
              {t("cefrAssessed", nativeLanguage)}: {cefrAssessed}
            </span>
          )}
        </div>
        <button
          onClick={() => onDelete(session.id)}
          className="text-xs px-2 py-1 rounded text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors"
        >
          {t("deleteSession", nativeLanguage)}
        </button>
      </div>

      {/* Courage Score */}
      <CourageScore
        sessionId={session.id}
        language={session.language}
        nativeLanguage={nativeLanguage}
      />

      {/* Conversation replay */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const reviewItem = isUser ? reviewBySeq.get(msg.seq) : undefined;
          const colorClass = reviewItem ? ERROR_COLORS[reviewItem.errorType] : "";

          return (
            <div key={msg.seq} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                  isUser
                    ? `bg-[var(--accent)]/20 text-[var(--text-primary)] ${reviewItem && reviewItem.errorType !== "none" ? `border-l-2 ${colorClass}` : ""}`
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                }`}
              >
                {msg.content}
              </div>

              {reviewItem && reviewItem.errorType !== "none" && (
                <div className={`max-w-[70%] mt-1.5 rounded-lg px-4 py-2 text-xs border-l-2 ${colorClass}`}>
                  <span className="font-medium">
                    {t(ERROR_LABEL_KEYS[reviewItem.errorType] as any, nativeLanguage)}
                  </span>
                  {reviewItem.corrected && (
                    <span className="ml-2 text-[var(--accent)]">{reviewItem.corrected}</span>
                  )}
                  {reviewItem.note && (
                    <p className="mt-1 text-[var(--text-secondary)]">{reviewItem.note}</p>
                  )}
                </div>
              )}

              {reviewItem && reviewItem.errorType === "none" && (
                <div className={`max-w-[70%] mt-1.5 rounded-lg px-4 py-1.5 text-xs border-l-2 ${ERROR_COLORS.none}`}>
                  {t("wellDone", nativeLanguage)}
                </div>
              )}
            </div>
          );
        })}

        {reviewLoading && (
          <div className="text-center py-8">
            <div className="inline-block w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[var(--text-secondary)] mt-3">{t("generating", nativeLanguage)}</p>
          </div>
        )}
        {reviewError && (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-red-400">{t("reviewFailed", nativeLanguage)}</p>
            <button
              onClick={loadReview}
              className="text-sm px-4 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--border)] transition-colors"
            >
              {t("retry", nativeLanguage)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
