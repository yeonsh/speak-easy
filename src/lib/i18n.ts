import type { NativeLanguage } from "./types";

const strings = {
  // Header / Mode
  freeTalk: { en: "Free Talk", ko: "자유 대화" },
  scenario: { en: "Scenario", ko: "시나리오" },
  corrections: { en: "ABC", ko: "ABC" },
  correctionsOn: { en: "Corrections ON", ko: "교정 켜짐" },
  correctionsOff: { en: "Corrections OFF", ko: "교정 꺼짐" },

  // Sidebar
  settings: { en: "Settings", ko: "설정" },
  nativeLanguage: { en: "Native Language", ko: "모국어" },
  llmTemperature: { en: "LLM Temperature", ko: "LLM 온도" },
  ttsSpeed: { en: "TTS Speed", ko: "음성 속도" },
  ttsEngine: { en: "TTS Engine", ko: "음성 엔진" },
  edgeTtsOnline: { en: "Edge TTS (Online)", ko: "Edge TTS (온라인)" },
  kokoroOffline: { en: "Kokoro (Offline)", ko: "Kokoro (오프라인)" },
  voice: { en: "Voice", ko: "음성" },
  whisperModel: { en: "Whisper Model", ko: "Whisper 모델" },
  clearConversation: { en: "Clear Conversation", ko: "대화 초기화" },
  setupWizard: { en: "Setup Wizard", ko: "초기 설정" },
  modelManagement: { en: "Model Management", ko: "모델 관리" },
  modelManagementHint: {
    en: "Model download and management coming in Phase 5.",
    ko: "모델 다운로드 및 관리 기능은 Phase 5에서 추가됩니다.",
  },

  // Chat
  chooseScenario: { en: "Choose a scenario to practice", ko: "연습할 시나리오를 선택하세요" },
  changeScenario: { en: "Change Scenario", ko: "시나리오 변경" },
  tapMicToStart: { en: "Tap the mic to start speaking", ko: "마이크를 눌러 말하세요" },
  orTypeBelow: { en: "or type a message below", ko: "또는 아래에 메시지를 입력하세요" },

  // Text input
  typeMessage: { en: "Type a message...", ko: "메시지를 입력하세요..." },
  startServerFirst: { en: "Start the server first...", ko: "서버를 먼저 시작하세요..." },
  send: { en: "Send", ko: "전송" },

  // Status bar
  llmStarting: { en: "LLM starting", ko: "LLM 시작 중" },
  llmOff: { en: "LLM off", ko: "LLM 꺼짐" },
  sttOff: { en: "STT off", ko: "STT 꺼짐" },
  ttsOff: { en: "TTS off", ko: "TTS 꺼짐" },
  stop: { en: "stop", ko: "중지" },

  // Tooltips
  replay: { en: "Replay", ko: "다시 듣기" },
  translate: { en: "Translate", ko: "번역" },
  translating: { en: "Translating...", ko: "번역 중..." },
  translated: { en: "Translated", ko: "번역됨" },
  sampleResponses: { en: "Sample responses", ko: "응답 예시" },
  loading: { en: "Loading...", ko: "로딩 중..." },
  suggestionsShown: { en: "Suggestions shown", ko: "응답 예시 표시됨" },
} satisfies Record<string, Record<NativeLanguage, string>>;

export type I18nKey = keyof typeof strings;

export function t(key: I18nKey, lang: NativeLanguage): string {
  return strings[key][lang] ?? strings[key].en;
}
