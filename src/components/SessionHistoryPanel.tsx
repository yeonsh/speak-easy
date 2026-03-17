import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionSummary, NativeLanguage, Language } from "../lib/types";
import { t } from "../lib/i18n";

interface SessionHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (session: SessionSummary) => void;
  language: Language;
  nativeLanguage: NativeLanguage;
}

export function SessionHistoryPanel({
  isOpen,
  onClose,
  onSelectSession,
  language,
  nativeLanguage,
}: SessionHistoryPanelProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    if (isOpen) {
      invoke<SessionSummary[]>("list_sessions", { language })
        .then(setSessions)
        .catch(() => {});
    }
  }, [isOpen, language]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-72 bg-[var(--bg-surface)] border-l border-[var(--border)] z-50 transform transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            {t("pastSessions", nativeLanguage)}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-49px)] p-3 space-y-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)] text-center py-8">
              {t("noSessions", nativeLanguage)}
            </p>
          ) : (
            sessions.map((s) => {
              const d = new Date(s.started_at * 1000);
              const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
              const timeStr = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
              return (
                <button
                  key={s.id}
                  onClick={() => onSelectSession(s)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        s.mode === "scenario"
                          ? "bg-purple-400/20 text-purple-300"
                          : "bg-blue-400/20 text-blue-300"
                      }`}
                    >
                      {s.mode === "scenario" ? "S" : "F"}
                    </span>
                    <span className="text-[var(--text-primary)] truncate">
                      {s.scenario_title || t("freeTalk", nativeLanguage)}
                    </span>
                    {s.has_review && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 ml-auto" />
                    )}
                  </div>
                  <div className="text-[var(--text-secondary)] mt-0.5 pl-6">
                    {dateStr} {timeStr} · {s.msg_count} msgs
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
