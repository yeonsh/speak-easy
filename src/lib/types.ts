export type Language = "en" | "es" | "fr" | "zh" | "ja" | "de" | "ko" | "pt" | "it" | "ru" | "ar" | "hi" | "tr" | "id" | "vi" | "pl";

export type NativeLanguage = Language;

export type TtsEngine = "kokoro" | "edge";

export type LlmProvider = "local" | "gemini";

export type ConversationMode = "free-talk" | "scenario";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tutor";
  content: string;
  timestamp: number;
  corrections?: Correction[];
  tutorTarget?: string;
}

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}

export interface AppSettings {
  language: Language;
  nativeLanguage: NativeLanguage;
  mode: ConversationMode;
  correctionsEnabled: boolean;
  llmTemperature: number;
  ttsEngine: TtsEngine;
  ttsSpeed: number;
  ttsVoice: string;
  gpuLayers: number;
  whisperModel: "base" | "small";
  llmModel: string;
  llmProvider: LlmProvider;
  geminiApiKey: string;
  geminiModel: string;
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
  de: { name: "German", flag: "🇩🇪", nativeName: "Deutsch" },
  ko: { name: "Korean", flag: "🇰🇷", nativeName: "한국어" },
  pt: { name: "Portuguese", flag: "🇧🇷", nativeName: "Português" },
  it: { name: "Italian", flag: "🇮🇹", nativeName: "Italiano" },
  ru: { name: "Russian", flag: "🇷🇺", nativeName: "Русский" },
  ar: { name: "Arabic", flag: "🇸🇦", nativeName: "العربية" },
  hi: { name: "Hindi", flag: "🇮🇳", nativeName: "हिन्दी" },
  tr: { name: "Turkish", flag: "🇹🇷", nativeName: "Türkçe" },
  id: { name: "Indonesian", flag: "🇮🇩", nativeName: "Indonesia" },
  vi: { name: "Vietnamese", flag: "🇻🇳", nativeName: "Tiếng Việt" },
  pl: { name: "Polish", flag: "🇵🇱", nativeName: "Polski" },
};

export const DEFAULT_SETTINGS: AppSettings = {
  language: "en",
  nativeLanguage: "ko",
  mode: "free-talk",
  correctionsEnabled: false,
  llmTemperature: 0.7,
  ttsEngine: "edge",
  ttsSpeed: 1.0,
  ttsVoice: "default",
  gpuLayers: -1,
  whisperModel: "base",
  llmModel: "",
  llmProvider: "local",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
};
