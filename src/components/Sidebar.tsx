import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, Language } from "../lib/types";

// Voice name prefix → language mapping
const VOICE_LANG_PREFIX: Record<string, { lang: Language; label: string }> = {
  a: { lang: "en", label: "English (US)" },
  b: { lang: "en", label: "English (UK)" },
  e: { lang: "es", label: "Spanish" },
  f: { lang: "de", label: "French" },
  h: { lang: "en", label: "Hindi" },
  i: { lang: "en", label: "Italian" },
  j: { lang: "ja", label: "Japanese" },
  p: { lang: "en", label: "Portuguese" },
  z: { lang: "zh", label: "Chinese" },
};

function voiceDisplayName(name: string): string {
  const gender = name[1] === "f" ? "Female" : "Male";
  const voiceName = name.slice(3); // e.g. "heart", "adam"
  const prefix = VOICE_LANG_PREFIX[name[0]];
  const lang = prefix?.label ?? "";
  return `${voiceName} (${lang}, ${gender})`;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onClearChat: () => void;
}

export function Sidebar({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onClearChat,
}: SidebarProps) {
  const [voices, setVoices] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      invoke<string[]>("list_voices").then(setVoices).catch(() => {});
    }
  }, [isOpen]);

  // Filter voices for the current language
  const langPrefixes = Object.entries(VOICE_LANG_PREFIX)
    .filter(([, v]) => v.lang === settings.language)
    .map(([k]) => k);
  const filteredVoices = voices.filter((v) => langPrefixes.includes(v[0]));

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      <div className="fixed left-0 top-0 bottom-0 w-80 bg-[var(--bg-surface)] z-50 p-6 overflow-y-auto border-r border-[var(--border)]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
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
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          <SettingGroup label="LLM Temperature">
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.1"
              value={settings.llmTemperature}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  llmTemperature: parseFloat(e.target.value),
                })
              }
              className="w-full"
            />
            <span className="text-sm text-[var(--text-secondary)]">
              {settings.llmTemperature.toFixed(1)}
            </span>
          </SettingGroup>

          <SettingGroup label="TTS Speed">
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={settings.ttsSpeed}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  ttsSpeed: parseFloat(e.target.value),
                })
              }
              className="w-full"
            />
            <span className="text-sm text-[var(--text-secondary)]">
              {settings.ttsSpeed.toFixed(1)}x
            </span>
          </SettingGroup>

          {filteredVoices.length > 0 && (
            <SettingGroup label="Voice">
              <select
                value={settings.ttsVoice}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    ttsVoice: e.target.value,
                  })
                }
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              >
                {filteredVoices.map((v) => (
                  <option key={v} value={v}>
                    {voiceDisplayName(v)}
                  </option>
                ))}
              </select>
            </SettingGroup>
          )}

          <SettingGroup label="Whisper Model">
            <select
              value={settings.whisperModel}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  whisperModel: e.target.value as "base" | "small",
                })
              }
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="base">Base (~150MB)</option>
              <option value="small">Small (~500MB)</option>
            </select>
          </SettingGroup>

          <div className="pt-4 border-t border-[var(--border)]">
            <button
              onClick={onClearChat}
              className="w-full px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm"
            >
              Clear Conversation
            </button>
          </div>

          <div className="pt-4 border-t border-[var(--border)]">
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
              Model Management
            </h3>
            <p className="text-xs text-[var(--text-secondary)] opacity-60">
              Model download and management coming in Phase 5.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function SettingGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}
