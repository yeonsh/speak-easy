import type { CefrLevel, Language } from "./types";

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

// Connectives that signal B2+ complexity
const COMPLEX_CONNECTIVES = [
  "although", "however", "therefore", "moreover", "furthermore",
  "nevertheless", "consequently", "whereas", "despite", "unless",
  "though", "since", "because", "while", "whether",
  // Spanish
  "aunque", "sin embargo", "por lo tanto", "además", "mientras",
  // French
  "cependant", "néanmoins", "donc", "pourtant", "tandis",
  // German
  "obwohl", "jedoch", "daher", "außerdem", "trotzdem",
];

const CJK_LANGS: Language[] = ["zh", "ja", "ko"];

function isCjk(lang: Language): boolean {
  return CJK_LANGS.includes(lang);
}

function avgWordsPerSentence(text: string, lang: Language): number {
  const sentences = text.split(/[.!?。！？]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  const total = sentences.reduce((sum, s) => {
    return sum + (isCjk(lang) ? s.trim().length / 2 : s.trim().split(/\s+/).length);
  }, 0);
  return total / sentences.length;
}

function typeTokenRatio(text: string, lang: Language): number {
  // Skip TTR for CJK — per-character split inflates uniqueness artificially
  if (isCjk(lang)) return 0.5; // neutral score, no contribution
  const words = text.toLowerCase().split(/\s+/).filter((w) => /\w/.test(w));
  if (words.length < 5) return 0;
  const unique = new Set(words).size;
  return unique / words.length;
}

function connectiveScore(text: string): number {
  const lower = text.toLowerCase();
  const matches = COMPLEX_CONNECTIVES.filter((c) => lower.includes(c)).length;
  const sentences = text.split(/[.!?。！？]+/).filter((s) => s.trim().length > 0).length;
  return sentences > 0 ? matches / sentences : 0;
}

/**
 * Analyzes accumulated user messages and returns a nudged CEFR level.
 * Requires at least 5 messages to activate; returns currentLevel unchanged otherwise.
 */
export function estimateCefrAdjustment(
  userMessages: string[],
  currentLevel: CefrLevel,
  language: Language,
): CefrLevel {
  if (userMessages.length < 5) return currentLevel;

  const combined = userMessages.join(" ");

  const avgWords = avgWordsPerSentence(combined, language);
  const ttr = typeTokenRatio(combined, language);
  const connective = connectiveScore(combined);

  // Each metric scored 0–2
  const wordScore = avgWords < 5 ? 0 : avgWords < 12 ? 1 : 2;
  const ttrScore = ttr < 0.4 ? 0 : ttr < 0.6 ? 1 : 2;
  const connScore = connective < 0.1 ? 0 : connective < 0.3 ? 1 : 2;

  const total = wordScore + ttrScore + connScore;

  const idx = LEVELS.indexOf(currentLevel);
  if (total >= 5 && idx < LEVELS.length - 1) return LEVELS[idx + 1];
  if (total <= 1 && idx > 0) return LEVELS[idx - 1];
  return currentLevel;
}
