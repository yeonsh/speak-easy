import { useState, useEffect } from "react";
import { invoke, listen, isTauri } from "../lib/backend";
import type { AppSettings, Language, LlmProvider, NativeLanguage, TtsEngine } from "../lib/types";
import { LANGUAGE_CONFIG } from "../lib/types";
import { t } from "../lib/i18n";

interface LocalModel {
  filename: string;
  size_bytes: number;
}

interface ModelInfo {
  id: string;
  name: string;
  size_bytes: number;
  url: string;
  dest_dir: string;
  filename: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)}GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)}MB`;
  return `${(bytes / 1e3).toFixed(0)}KB`;
}

// Voice name prefix → language mapping
const VOICE_LANG_PREFIX: Record<string, { lang: Language; label: string }> = {
  a: { lang: "en", label: "English (US)" },
  b: { lang: "en", label: "English (UK)" },
  e: { lang: "es", label: "Spanish" },
  f: { lang: "fr", label: "French" },
  h: { lang: "en", label: "Hindi" },
  i: { lang: "en", label: "Italian" },
  j: { lang: "ja", label: "Japanese" },
  p: { lang: "en", label: "Portuguese" },
  z: { lang: "zh", label: "Chinese" },
};

function voiceDisplayName(name: string, engine: TtsEngine): string {
  if (engine === "edge") {
    // Edge voice names like "en-US-JennyNeural"
    const parts = name.split("-");
    if (parts.length >= 3) {
      const voiceName = parts.slice(2).join("-").replace("Neural", "");
      const locale = `${parts[0]}-${parts[1]}`;
      return `${voiceName} (${locale})`;
    }
    return name;
  }
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
  onOpenSetup?: () => void;
  onPreviewVoice?: (voiceName: string) => void;
  onModelChange?: (modelPath: string) => void;
}

export function Sidebar({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onClearChat,
  onOpenSetup,
  onPreviewVoice,
  onModelChange,
}: SidebarProps) {
  const [voices, setVoices] = useState<string[]>([]);
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [downloading, setDownloading] = useState<{ id: string; progress: number; total: number | null } | null>(null);
  const [geminiModels, setGeminiModels] = useState<{ id: string; name: string }[]>([]);
  const [geminiModelsLoading, setGeminiModelsLoading] = useState(false);

  const refreshModels = () => {
    invoke<LocalModel[]>("list_llm_models").then(setLocalModels).catch(() => {});
  };

  useEffect(() => {
    if (isOpen) {
      invoke<string[]>("list_voices").then(setVoices).catch(() => {});
      refreshModels();
      invoke<ModelInfo[]>("get_available_models").then((all) => {
        setAvailableModels(all.filter((m) => m.id.startsWith("llm-")));
      }).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && settings.llmProvider === "gemini" && settings.geminiApiKey) {
      setGeminiModelsLoading(true);
      invoke<{ id: string; name: string }[]>("list_gemini_models", { apiKey: settings.geminiApiKey })
        .then(setGeminiModels)
        .catch(() => setGeminiModels([]))
        .finally(() => setGeminiModelsLoading(false));
    }
  }, [isOpen, settings.llmProvider, settings.geminiApiKey]);

  const downloadModel = async (model: ModelInfo) => {
    if (!isTauri) return;
    const downloadId = `llm-download-${Date.now()}`;
    setDownloading({ id: downloadId, progress: 0, total: model.size_bytes });

    const unlisteners: (() => void)[] = [];
    unlisteners.push(await listen<{ downloaded: number; total: number | null }>(`download-progress-${downloadId}`, (e) => {
      setDownloading((prev) => prev ? { ...prev, progress: e.payload.downloaded, total: e.payload.total ?? prev.total } : null);
    }));
    unlisteners.push(await listen<string>(`download-complete-${downloadId}`, () => {
      setDownloading(null);
      unlisteners.forEach((u) => u());
      refreshModels();
      // Auto-select the downloaded model
      onSettingsChange({ ...settings, llmModel: model.filename });
      onModelChange?.(model.filename);
    }));
    unlisteners.push(await listen<string>(`download-error-${downloadId}`, () => {
      setDownloading(null);
      unlisteners.forEach((u) => u());
    }));

    invoke("download_file", {
      url: model.url,
      destDir: model.dest_dir,
      filename: model.filename,
      downloadId,
    }).catch(() => {
      setDownloading(null);
      unlisteners.forEach((u) => u());
    });
  };

  // Filter voices for the current language
  const filteredVoices = settings.ttsEngine === "edge"
    ? voices.filter((v) => {
        const langMap: Record<Language, string[]> = {
          en: ["en-"],
          es: ["es-"],
          fr: ["fr-"],
          zh: ["zh-"],
          ja: ["ja-"],
          de: ["de-"],
          ko: ["ko-"],
          pt: ["pt-"],
          it: ["it-"],
          ru: ["ru-"],
          ar: ["ar-"],
          hi: ["hi-"],
          tr: ["tr-"],
          id: ["id-"],
          vi: ["vi-"],
          pl: ["pl-"],
        };
        const prefixes = langMap[settings.language] ?? [];
        return prefixes.some((p) => v.startsWith(p));
      })
    : (() => {
        const langPrefixes = Object.entries(VOICE_LANG_PREFIX)
          .filter(([, v]) => v.lang === settings.language)
          .map(([k]) => k);
        return voices.filter((v) => langPrefixes.includes(v[0]));
      })();

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      <div className="fixed left-0 top-0 bottom-0 w-80 bg-[var(--bg-surface)] z-50 p-6 overflow-y-auto border-r border-[var(--border)]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">{t("settings", settings.nativeLanguage)}</h2>
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
          <SettingGroup label={t("nativeLanguage", settings.nativeLanguage)}>
            <select
              value={settings.nativeLanguage}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  nativeLanguage: e.target.value as NativeLanguage,
                })
              }
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              {(Object.entries(LANGUAGE_CONFIG) as [NativeLanguage, { name: string; nativeName: string }][]).map(([code, cfg]) => (
                <option key={code} value={code}>
                  {cfg.nativeName} ({cfg.name})
                </option>
              ))}
            </select>
          </SettingGroup>

          <SettingGroup label={t("llmTemperature", settings.nativeLanguage)}>
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

          <SettingGroup label={t("llmModel", settings.nativeLanguage)}>
            {/* Local models */}
            {localModels.length > 0 && (
              <select
                value={settings.llmModel || localModels[0]?.filename || ""}
                onChange={(e) => {
                  const filename = e.target.value;
                  onSettingsChange({ ...settings, llmModel: filename });
                  onModelChange?.(filename);
                }}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              >
                {localModels.map((m) => (
                  <option key={m.filename} value={m.filename}>
                    {m.filename} ({formatSize(m.size_bytes)})
                  </option>
                ))}
              </select>
            )}
            {localModels.length === 0 && !downloading && (
              <p className="text-xs text-[var(--text-secondary)] italic">{t("noModelsInstalled", settings.nativeLanguage)}</p>
            )}

            {/* Download progress */}
            {downloading && (
              <div className="mt-2">
                <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--primary)] transition-all duration-300"
                    style={{ width: `${downloading.total ? (downloading.progress / downloading.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {formatSize(downloading.progress)} / {downloading.total ? formatSize(downloading.total) : "..."}
                </p>
              </div>
            )}

            {/* Downloadable models */}
            {!downloading && availableModels.filter((m) => !localModels.some((l) => l.filename === m.filename)).length > 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-[var(--text-secondary)]">{t("downloadableModels", settings.nativeLanguage)}</p>
                {availableModels
                  .filter((m) => !localModels.some((l) => l.filename === m.filename))
                  .map((m) => (
                    <button
                      key={m.id}
                      onClick={() => downloadModel(m)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors text-sm"
                    >
                      <span className="truncate">{m.name}</span>
                      <span className="text-xs text-[var(--text-secondary)] shrink-0 ml-2">{formatSize(m.size_bytes)}</span>
                    </button>
                  ))}
              </div>
            )}
          </SettingGroup>

          <SettingGroup label={t("llmProvider", settings.nativeLanguage)}>
            <select
              value={settings.llmProvider}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  llmProvider: e.target.value as LlmProvider,
                })
              }
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="local">{t("localLlm", settings.nativeLanguage)}</option>
              <option value="gemini">Gemini</option>
              <option value="openai-compatible">{t("openaiCompatible", settings.nativeLanguage)}</option>
            </select>

            {settings.llmProvider === "gemini" && (
              <div className="mt-2 space-y-2">
                <input
                  type="password"
                  value={settings.geminiApiKey}
                  onChange={(e) =>
                    onSettingsChange({ ...settings, geminiApiKey: e.target.value })
                  }
                  placeholder="Gemini API Key"
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                />
                <select
                  value={settings.geminiModel}
                  onChange={(e) =>
                    onSettingsChange({ ...settings, geminiModel: e.target.value })
                  }
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                  disabled={geminiModelsLoading}
                >
                  {geminiModels.length > 0 ? (
                    geminiModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))
                  ) : (
                    <option value={settings.geminiModel}>{settings.geminiModel}</option>
                  )}
                </select>
              </div>
            )}

            {settings.llmProvider === "openai-compatible" && (
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  value={settings.customEndpoint}
                  onChange={(e) =>
                    onSettingsChange({ ...settings, customEndpoint: e.target.value })
                  }
                  placeholder="http://localhost:1234"
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono"
                />
                <p className="text-xs text-[var(--text-secondary)] opacity-60">
                  LM Studio, Ollama, vLLM, etc.
                </p>
              </div>
            )}
          </SettingGroup>

          <SettingGroup label={t("ttsEngine", settings.nativeLanguage)}>
            <select
              value={settings.ttsEngine}
              onChange={(e) => {
                const eng = e.target.value as TtsEngine;
                const kokoroLangs = ["en", "es", "fr", "zh", "ja"];
                const lang = eng === "kokoro" && !kokoroLangs.includes(settings.language)
                  ? "en" as Language
                  : settings.language;
                onSettingsChange({
                  ...settings,
                  ttsEngine: eng,
                  ttsVoice: "default",
                  language: lang,
                });
              }}
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="edge">{t("edgeTtsOnline", settings.nativeLanguage)}</option>
              <option value="kokoro">{t("kokoroOffline", settings.nativeLanguage)}</option>
            </select>
            <p className="text-xs text-[var(--text-secondary)] mt-1 opacity-60">
              {settings.ttsEngine === "edge"
                ? "EN, ES, FR, ZH, JA, DE, KO, PT, IT, RU, AR, HI, TR, ID, VI, PL"
                : "EN, ES, FR, ZH, JA"}
            </p>
          </SettingGroup>

          <SettingGroup label={t("ttsSpeed", settings.nativeLanguage)}>
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
            <SettingGroup label={t("voice", settings.nativeLanguage)}>
              <select
                value={settings.ttsVoice}
                onChange={(e) => {
                  const voice = e.target.value;
                  onSettingsChange({ ...settings, ttsVoice: voice });
                  onPreviewVoice?.(voice);
                }}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              >
                {filteredVoices.map((v) => (
                  <option key={v} value={v}>
                    {voiceDisplayName(v, settings.ttsEngine)}
                  </option>
                ))}
              </select>
            </SettingGroup>
          )}

          <SettingGroup label={t("whisperModel", settings.nativeLanguage)}>
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

          <div className="pt-4 border-t border-[var(--border)] space-y-2">
            <button
              onClick={onClearChat}
              className="w-full px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm"
            >
              {t("clearConversation", settings.nativeLanguage)}
            </button>
            {onOpenSetup && (
              <button
                onClick={onOpenSetup}
                className="w-full px-4 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors text-sm"
              >
                {t("setupWizard", settings.nativeLanguage)}
              </button>
            )}
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
