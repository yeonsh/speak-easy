export type Language = "en" | "es" | "fr" | "zh" | "ja";

export type ConversationMode = "free-talk" | "scenario";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  corrections?: Correction[];
}

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}

export interface AppSettings {
  language: Language;
  mode: ConversationMode;
  correctionsEnabled: boolean;
  llmTemperature: number;
  ttsSpeed: number;
  ttsVoice: string;
  gpuLayers: number;
  whisperModel: "base" | "small";
}

export const LANGUAGE_CONFIG: Record<
  Language,
  { name: string; flag: string; nativeName: string }
> = {
  en: { name: "English", flag: "🇺🇸", nativeName: "English" },
  es: { name: "Spanish", flag: "🇪🇸", nativeName: "Español" },
  fr: { name: "French", flag: "🇫🇷", nativeName: "Français" },
  zh: { name: "Chinese", flag: "🇨🇳", nativeName: "中文" },
  ja: { name: "Japanese", flag: "🇯🇵", nativeName: "日本語" },
};

export const DEFAULT_SETTINGS: AppSettings = {
  language: "en",
  mode: "free-talk",
  correctionsEnabled: false,
  llmTemperature: 0.7,
  ttsSpeed: 1.0,
  ttsVoice: "default",
  gpuLayers: -1,
  whisperModel: "base",
};
