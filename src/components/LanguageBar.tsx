import { LANGUAGE_CONFIG, type Language } from "../lib/types";

interface LanguageBarProps {
  selected: Language;
  onChange: (lang: Language) => void;
}

export function LanguageBar({ selected, onChange }: LanguageBarProps) {
  const languages = Object.entries(LANGUAGE_CONFIG) as [Language, typeof LANGUAGE_CONFIG["en"]][];

  return (
    <div className="flex gap-1 bg-[var(--bg-surface)] rounded-lg p-1">
      {languages.map(([code, config]) => (
        <button
          key={code}
          onClick={() => onChange(code)}
          className={`px-3 py-1 rounded-md text-sm transition-colors ${
            selected === code
              ? "bg-[var(--primary)] text-white"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {config.flag} {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
