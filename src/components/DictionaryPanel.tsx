import { useState, useEffect } from "react";
import { invoke } from "../lib/backend";
import type { VocabularyEntry, Language, NativeLanguage } from "../lib/types";
import { LANGUAGE_CONFIG } from "../lib/types";
import { t } from "../lib/i18n";

interface DictionaryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  nativeLanguage: NativeLanguage;
  onPlayWord?: (text: string, lang: Language) => void;
}

export function DictionaryPanel({
  isOpen,
  onClose,
  language,
  nativeLanguage,
  onPlayWord,
}: DictionaryPanelProps) {
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [filterLang, setFilterLang] = useState<Language | "all">(language);
  const [playingId, setPlayingId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadEntries();
    }
  }, [isOpen, filterLang]);

  const loadEntries = () => {
    invoke<VocabularyEntry[]>("list_vocabulary", {
      targetLang: filterLang === "all" ? null : filterLang,
    })
      .then(setEntries)
      .catch(() => {});
  };

  const handleDelete = (id: number) => {
    invoke("delete_vocabulary", { id }).then(() => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }).catch(() => {});
  };

  const handlePlay = (entry: VocabularyEntry) => {
    setPlayingId(entry.id);
    onPlayWord?.(entry.word, entry.target_lang as Language);
    setTimeout(() => setPlayingId(null), 2000);
  };

  const langOptions = Object.entries(LANGUAGE_CONFIG) as [Language, { name: string; nativeName: string; flag: string }][];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-80 bg-[var(--bg-surface)] border-l border-[var(--border)] z-50 transform transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            {t("dictionary", nativeLanguage)}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Language filter */}
        <div className="px-4 py-2 border-b border-[var(--border)] flex gap-1.5 overflow-x-auto">
          <button
            onClick={() => setFilterLang("all")}
            className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
              filterLang === "all"
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t("allLanguages", nativeLanguage)}
          </button>
          {langOptions.map(([code, cfg]) => (
            <button
              key={code}
              onClick={() => setFilterLang(code)}
              className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                filterLang === code
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {cfg.flag}
            </button>
          ))}
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto" style={{ height: "calc(100% - 90px)" }}>
          {entries.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] text-center py-8 opacity-60">
              {t("emptyDictionary", nativeLanguage)}
            </p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {entries.map((entry) => (
                <div key={entry.id} className="px-4 py-3 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-[var(--primary)] brightness-125">
                          {entry.word}
                        </span>
                        {filterLang === "all" && (
                          <span className="text-[10px] text-[var(--text-secondary)] opacity-50">
                            {entry.target_lang.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap line-clamp-3">
                        {entry.definition}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handlePlay(entry)}
                        className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
                        title="Play"
                      >
                        {playingId === entry.id ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--primary)]">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)] hover:text-red-400">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
