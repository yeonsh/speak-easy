import { useState, useRef, useEffect } from "react";
import { LANGUAGE_CONFIG, type Language } from "../lib/types";

interface LanguageBarProps {
  selected: Language;
  onChange: (lang: Language) => void;
  availableLanguages?: Language[];
}

export function LanguageBar({ selected, onChange, availableLanguages }: LanguageBarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allLanguages = Object.entries(LANGUAGE_CONFIG) as [Language, typeof LANGUAGE_CONFIG["en"]][];
  const languages = availableLanguages
    ? allLanguages.filter(([code]) => availableLanguages.includes(code))
    : allLanguages;
  const current = LANGUAGE_CONFIG[selected];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border)] transition-colors"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="text-sm font-medium">{current.nativeName}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 py-1 min-w-[160px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-xl z-50 overflow-hidden">
          {languages.map(([code, config]) => (
            <button
              key={code}
              onClick={() => { onChange(code); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                selected === code
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
              }`}
            >
              <span className="text-base leading-none">{config.flag}</span>
              <span>{config.nativeName}</span>
              <span className="ml-auto text-xs opacity-60">{config.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
