export type Language = "en" | "es" | "fr" | "zh" | "ja" | "de" | "ko" | "pt" | "it" | "ru" | "ar" | "hi" | "tr" | "id" | "vi" | "pl";

export type NativeLanguage = Language;

export type TtsEngine = "kokoro" | "edge";

export type LlmProvider = "local" | "gemini" | "openai-compatible";

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

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
  customEndpoint: string;
  cefrLevels: Record<Language, CefrLevel>;
}

export interface SessionSummary {
  id: string;
  language: string;
  mode: "free-talk" | "scenario";
  scenario_title: string | null;
  started_at: number;
  msg_count: number;
  has_review: boolean;
}

export interface SavedMessage {
  role: string;
  content: string;
  seq: number;
}

export interface ReviewItem {
  seq: number;
  original: string;
  corrected: string | null;
  note: string | null;
  errorType: "grammar" | "vocab" | "naturalness" | "situation" | "none";
}

export interface LoadedMessage {
  role: string;
  content: string;
  seq: number;
}

export interface CourageMetrics {
  word_count: number;
  turn_count: number;
  native_switches: number;
  complex_attempts: number;
  quick_response_ratio: number | null;
  duration_seconds: number;
  score: number;
}

export interface CourageHistoryEntry {
  session_id: string;
  score: number;
  started_at: number;
}

export interface CourageHistory {
  current: CourageMetrics;
  previous: CourageMetrics | null;
  history: CourageHistoryEntry[];
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
  customEndpoint: "http://localhost:1234",
  cefrLevels: {
    en: "B1", es: "B1", fr: "B1", zh: "B1", ja: "B1",
    de: "B1", ko: "B1", pt: "B1", it: "B1", ru: "B1",
    ar: "B1", hi: "B1", tr: "B1", id: "B1", vi: "B1", pl: "B1",
  },
};
