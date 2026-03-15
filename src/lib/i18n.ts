import type { NativeLanguage } from "./types";

const strings = {
  // Header / Mode
  freeTalk: {
    en: "Free Talk", ko: "자유 대화", es: "Conversación libre", fr: "Discussion libre",
    zh: "自由对话", ja: "フリートーク", de: "Freies Gespräch", pt: "Conversa livre",
    it: "Conversazione libera", ru: "Свободный разговор", ar: "محادثة حرة", hi: "मुक्त बातचीत",
    tr: "Serbest Konuşma", id: "Bicara Bebas", vi: "Nói chuyện tự do", pl: "Swobodna rozmowa",
  },
  scenario: {
    en: "Scenario", ko: "시나리오", es: "Escenario", fr: "Scénario",
    zh: "场景", ja: "シナリオ", de: "Szenario", pt: "Cenário",
    it: "Scenario", ru: "Сценарий", ar: "سيناريو", hi: "परिदृश्य",
    tr: "Senaryo", id: "Skenario", vi: "Tình huống", pl: "Scenariusz",
  },
  corrections: {
    en: "ABC", ko: "ABC", es: "ABC", fr: "ABC",
    zh: "ABC", ja: "ABC", de: "ABC", pt: "ABC",
    it: "ABC", ru: "ABC", ar: "ABC", hi: "ABC",
    tr: "ABC", id: "ABC", vi: "ABC", pl: "ABC",
  },
  correctionsOn: {
    en: "Corrections ON", ko: "교정 켜짐", es: "Correcciones activadas", fr: "Corrections activées",
    zh: "纠正已开启", ja: "修正オン", de: "Korrekturen AN", pt: "Correções ativadas",
    it: "Correzioni attive", ru: "Исправления вкл.", ar: "التصحيحات مفعّلة", hi: "सुधार चालू",
    tr: "Düzeltmeler AÇIK", id: "Koreksi AKTIF", vi: "Sửa lỗi BẬT", pl: "Korekty WŁ.",
  },
  correctionsOff: {
    en: "Corrections OFF", ko: "교정 꺼짐", es: "Correcciones desactivadas", fr: "Corrections désactivées",
    zh: "纠正已关闭", ja: "修正オフ", de: "Korrekturen AUS", pt: "Correções desativadas",
    it: "Correzioni disattive", ru: "Исправления выкл.", ar: "التصحيحات معطّلة", hi: "सुधार बंद",
    tr: "Düzeltmeler KAPALI", id: "Koreksi NONAKTIF", vi: "Sửa lỗi TẮT", pl: "Korekty WYŁ.",
  },

  // Sidebar
  settings: {
    en: "Settings", ko: "설정", es: "Ajustes", fr: "Paramètres",
    zh: "设置", ja: "設定", de: "Einstellungen", pt: "Configurações",
    it: "Impostazioni", ru: "Настройки", ar: "الإعدادات", hi: "सेटिंग्स",
    tr: "Ayarlar", id: "Pengaturan", vi: "Cài đặt", pl: "Ustawienia",
  },
  nativeLanguage: {
    en: "Native Language", ko: "모국어", es: "Idioma nativo", fr: "Langue maternelle",
    zh: "母语", ja: "母国語", de: "Muttersprache", pt: "Idioma nativo",
    it: "Lingua madre", ru: "Родной язык", ar: "اللغة الأم", hi: "मातृभाषा",
    tr: "Ana dil", id: "Bahasa ibu", vi: "Tiếng mẹ đẻ", pl: "Język ojczysty",
  },
  llmTemperature: {
    en: "LLM Temperature", ko: "LLM 온도", es: "Temperatura del LLM", fr: "Température du LLM",
    zh: "LLM 温度", ja: "LLM 温度", de: "LLM-Temperatur", pt: "Temperatura do LLM",
    it: "Temperatura LLM", ru: "Температура LLM", ar: "حرارة LLM", hi: "LLM तापमान",
    tr: "LLM Sıcaklığı", id: "Suhu LLM", vi: "Nhiệt độ LLM", pl: "Temperatura LLM",
  },
  ttsSpeed: {
    en: "TTS Speed", ko: "음성 속도", es: "Velocidad de TTS", fr: "Vitesse TTS",
    zh: "TTS 语速", ja: "TTS 速度", de: "TTS-Geschwindigkeit", pt: "Velocidade do TTS",
    it: "Velocità TTS", ru: "Скорость TTS", ar: "سرعة TTS", hi: "TTS गति",
    tr: "TTS Hızı", id: "Kecepatan TTS", vi: "Tốc độ TTS", pl: "Szybkość TTS",
  },
  ttsEngine: {
    en: "TTS Engine", ko: "음성 엔진", es: "Motor de TTS", fr: "Moteur TTS",
    zh: "TTS 引擎", ja: "TTS エンジン", de: "TTS-Engine", pt: "Motor TTS",
    it: "Motore TTS", ru: "Движок TTS", ar: "محرك TTS", hi: "TTS इंजन",
    tr: "TTS Motoru", id: "Mesin TTS", vi: "Bộ máy TTS", pl: "Silnik TTS",
  },
  edgeTtsOnline: {
    en: "Edge TTS (Online)", ko: "Edge TTS (온라인)", es: "Edge TTS (en línea)", fr: "Edge TTS (en ligne)",
    zh: "Edge TTS (在线)", ja: "Edge TTS (オンライン)", de: "Edge TTS (Online)", pt: "Edge TTS (online)",
    it: "Edge TTS (online)", ru: "Edge TTS (онлайн)", ar: "Edge TTS (متصل)", hi: "Edge TTS (ऑनलाइन)",
    tr: "Edge TTS (Çevrimiçi)", id: "Edge TTS (Daring)", vi: "Edge TTS (Trực tuyến)", pl: "Edge TTS (Online)",
  },
  kokoroOffline: {
    en: "Kokoro (Offline)", ko: "Kokoro (오프라인)", es: "Kokoro (sin conexión)", fr: "Kokoro (hors ligne)",
    zh: "Kokoro (离线)", ja: "Kokoro (オフライン)", de: "Kokoro (Offline)", pt: "Kokoro (offline)",
    it: "Kokoro (offline)", ru: "Kokoro (офлайн)", ar: "Kokoro (غير متصل)", hi: "Kokoro (ऑफ़लाइन)",
    tr: "Kokoro (Çevrimdışı)", id: "Kokoro (Luring)", vi: "Kokoro (Ngoại tuyến)", pl: "Kokoro (Offline)",
  },
  voice: {
    en: "Voice", ko: "음성", es: "Voz", fr: "Voix",
    zh: "语音", ja: "音声", de: "Stimme", pt: "Voz",
    it: "Voce", ru: "Голос", ar: "الصوت", hi: "आवाज़",
    tr: "Ses", id: "Suara", vi: "Giọng nói", pl: "Głos",
  },
  whisperModel: {
    en: "Whisper Model", ko: "Whisper 모델", es: "Modelo Whisper", fr: "Modèle Whisper",
    zh: "Whisper 模型", ja: "Whisper モデル", de: "Whisper-Modell", pt: "Modelo Whisper",
    it: "Modello Whisper", ru: "Модель Whisper", ar: "نموذج Whisper", hi: "Whisper मॉडल",
    tr: "Whisper Modeli", id: "Model Whisper", vi: "Mô hình Whisper", pl: "Model Whisper",
  },
  clearConversation: {
    en: "Clear Conversation", ko: "대화 초기화", es: "Borrar conversación", fr: "Effacer la conversation",
    zh: "清除对话", ja: "会話をクリア", de: "Gespräch löschen", pt: "Limpar conversa",
    it: "Cancella conversazione", ru: "Очистить диалог", ar: "مسح المحادثة", hi: "बातचीत साफ़ करें",
    tr: "Sohbeti temizle", id: "Hapus percakapan", vi: "Xóa cuộc trò chuyện", pl: "Wyczyść rozmowę",
  },
  setupWizard: {
    en: "Setup Wizard", ko: "초기 설정", es: "Asistente de configuración", fr: "Assistant de configuration",
    zh: "设置向导", ja: "セットアップウィザード", de: "Einrichtungsassistent", pt: "Assistente de configuração",
    it: "Configurazione guidata", ru: "Мастер настройки", ar: "معالج الإعداد", hi: "सेटअप विज़ार्ड",
    tr: "Kurulum sihirbazı", id: "Panduan pengaturan", vi: "Trình hướng dẫn cài đặt", pl: "Kreator konfiguracji",
  },
  modelManagement: {
    en: "Model Management", ko: "모델 관리", es: "Gestión de modelos", fr: "Gestion des modèles",
    zh: "模型管理", ja: "モデル管理", de: "Modellverwaltung", pt: "Gerenciamento de modelos",
    it: "Gestione modelli", ru: "Управление моделями", ar: "إدارة النماذج", hi: "मॉडल प्रबंधन",
    tr: "Model yönetimi", id: "Manajemen model", vi: "Quản lý mô hình", pl: "Zarządzanie modelami",
  },
  modelManagementHint: {
    en: "Model download and management coming in Phase 5.",
    ko: "모델 다운로드 및 관리 기능은 Phase 5에서 추가됩니다.",
    es: "Descarga y gestión de modelos disponible en la Fase 5.",
    fr: "Téléchargement et gestion des modèles prévus en Phase 5.",
    zh: "模型下载与管理将在第5阶段推出。",
    ja: "モデルのダウンロードと管理はフェーズ5で追加予定です。",
    de: "Modell-Download und -Verwaltung folgen in Phase 5.",
    pt: "Download e gerenciamento de modelos na Fase 5.",
    it: "Download e gestione dei modelli in arrivo nella Fase 5.",
    ru: "Загрузка и управление моделями появятся в Фазе 5.",
    ar: "تحميل وإدارة النماذج قادمة في المرحلة 5.",
    hi: "मॉडल डाउनलोड और प्रबंधन चरण 5 में आ रहा है।",
    tr: "Model indirme ve yönetimi Aşama 5'te gelecek.",
    id: "Unduhan dan manajemen model hadir di Fase 5.",
    vi: "Tải và quản lý mô hình sẽ có trong Giai đoạn 5.",
    pl: "Pobieranie i zarządzanie modelami pojawi się w Fazie 5.",
  },

  // Chat
  chooseScenario: {
    en: "Choose a scenario to practice", ko: "연습할 시나리오를 선택하세요",
    es: "Elige un escenario para practicar", fr: "Choisissez un scénario pour pratiquer",
    zh: "选择一个练习场景", ja: "練習するシナリオを選んでください",
    de: "Wähle ein Szenario zum Üben", pt: "Escolha um cenário para praticar",
    it: "Scegli uno scenario per esercitarti", ru: "Выберите сценарий для практики",
    ar: "اختر سيناريو للتدريب", hi: "अभ्यास के लिए एक परिदृश्य चुनें",
    tr: "Pratik yapmak için bir senaryo seçin", id: "Pilih skenario untuk berlatih",
    vi: "Chọn một tình huống để luyện tập", pl: "Wybierz scenariusz do ćwiczeń",
  },
  changeScenario: {
    en: "Change Scenario", ko: "시나리오 변경", es: "Cambiar escenario", fr: "Changer de scénario",
    zh: "更改场景", ja: "シナリオを変更", de: "Szenario wechseln", pt: "Mudar cenário",
    it: "Cambia scenario", ru: "Сменить сценарий", ar: "تغيير السيناريو", hi: "परिदृश्य बदलें",
    tr: "Senaryoyu değiştir", id: "Ganti skenario", vi: "Đổi tình huống", pl: "Zmień scenariusz",
  },
  tapMicToStart: {
    en: "Tap the mic to start speaking", ko: "마이크를 눌러 말하세요",
    es: "Toca el micrófono para hablar", fr: "Appuyez sur le micro pour parler",
    zh: "点击麦克风开始说话", ja: "マイクをタップして話し始めてください",
    de: "Tippe auf das Mikrofon, um zu sprechen", pt: "Toque no microfone para falar",
    it: "Tocca il microfono per parlare", ru: "Нажмите на микрофон, чтобы говорить",
    ar: "اضغط على الميكروفون لبدء التحدث", hi: "बोलने के लिए माइक दबाएं",
    tr: "Konuşmaya başlamak için mikrofona dokunun", id: "Ketuk mikrofon untuk mulai berbicara",
    vi: "Nhấn micro để bắt đầu nói", pl: "Dotknij mikrofonu, aby mówić",
  },
  orTypeBelow: {
    en: "or type a message below", ko: "또는 아래에 메시지를 입력하세요",
    es: "o escribe un mensaje abajo", fr: "ou tapez un message ci-dessous",
    zh: "或在下方输入消息", ja: "または下にメッセージを入力してください",
    de: "oder schreibe unten eine Nachricht", pt: "ou digite uma mensagem abaixo",
    it: "o scrivi un messaggio qui sotto", ru: "или введите сообщение ниже",
    ar: "أو اكتب رسالة أدناه", hi: "या नीचे संदेश टाइप करें",
    tr: "veya aşağıya bir mesaj yazın", id: "atau ketik pesan di bawah",
    vi: "hoặc nhập tin nhắn bên dưới", pl: "lub wpisz wiadomość poniżej",
  },

  // Text input
  typeMessage: {
    en: "Type a message...", ko: "메시지를 입력하세요...",
    es: "Escribe un mensaje...", fr: "Tapez un message...",
    zh: "输入消息...", ja: "メッセージを入力...",
    de: "Nachricht eingeben...", pt: "Digite uma mensagem...",
    it: "Scrivi un messaggio...", ru: "Введите сообщение...",
    ar: "...اكتب رسالة", hi: "संदेश टाइप करें...",
    tr: "Bir mesaj yazın...", id: "Ketik pesan...",
    vi: "Nhập tin nhắn...", pl: "Wpisz wiadomość...",
  },
  startServerFirst: {
    en: "Start the server first...", ko: "서버를 먼저 시작하세요...",
    es: "Inicia el servidor primero...", fr: "Démarrez le serveur d'abord...",
    zh: "请先启动服务器...", ja: "まずサーバーを起動してください...",
    de: "Starte zuerst den Server...", pt: "Inicie o servidor primeiro...",
    it: "Avvia prima il server...", ru: "Сначала запустите сервер...",
    ar: "...ابدأ الخادم أولاً", hi: "पहले सर्वर शुरू करें...",
    tr: "Önce sunucuyu başlatın...", id: "Mulai server terlebih dahulu...",
    vi: "Khởi động máy chủ trước...", pl: "Najpierw uruchom serwer...",
  },
  send: {
    en: "Send", ko: "전송", es: "Enviar", fr: "Envoyer",
    zh: "发送", ja: "送信", de: "Senden", pt: "Enviar",
    it: "Invia", ru: "Отправить", ar: "إرسال", hi: "भेजें",
    tr: "Gönder", id: "Kirim", vi: "Gửi", pl: "Wyślij",
  },

  // Status bar
  llmStarting: {
    en: "LLM starting", ko: "LLM 시작 중", es: "LLM iniciando", fr: "LLM en cours de démarrage",
    zh: "LLM 启动中", ja: "LLM 起動中", de: "LLM startet", pt: "LLM iniciando",
    it: "LLM in avvio", ru: "LLM запускается", ar: "LLM يبدأ", hi: "LLM शुरू हो रहा है",
    tr: "LLM başlatılıyor", id: "LLM memulai", vi: "LLM đang khởi động", pl: "LLM uruchamia się",
  },
  llmOff: {
    en: "LLM off", ko: "LLM 꺼짐", es: "LLM apagado", fr: "LLM éteint",
    zh: "LLM 已关闭", ja: "LLM オフ", de: "LLM aus", pt: "LLM desligado",
    it: "LLM spento", ru: "LLM выкл.", ar: "LLM مطفأ", hi: "LLM बंद",
    tr: "LLM kapalı", id: "LLM mati", vi: "LLM tắt", pl: "LLM wył.",
  },
  sttOff: {
    en: "STT off", ko: "STT 꺼짐", es: "STT apagado", fr: "STT éteint",
    zh: "STT 已关闭", ja: "STT オフ", de: "STT aus", pt: "STT desligado",
    it: "STT spento", ru: "STT выкл.", ar: "STT مطفأ", hi: "STT बंद",
    tr: "STT kapalı", id: "STT mati", vi: "STT tắt", pl: "STT wył.",
  },
  ttsOff: {
    en: "TTS off", ko: "TTS 꺼짐", es: "TTS apagado", fr: "TTS éteint",
    zh: "TTS 已关闭", ja: "TTS オフ", de: "TTS aus", pt: "TTS desligado",
    it: "TTS spento", ru: "TTS выкл.", ar: "TTS مطفأ", hi: "TTS बंद",
    tr: "TTS kapalı", id: "TTS mati", vi: "TTS tắt", pl: "TTS wył.",
  },
  stop: {
    en: "stop", ko: "중지", es: "detener", fr: "arrêter",
    zh: "停止", ja: "停止", de: "stopp", pt: "parar",
    it: "ferma", ru: "стоп", ar: "إيقاف", hi: "रोकें",
    tr: "durdur", id: "berhenti", vi: "dừng", pl: "stop",
  },

  // Tooltips
  replay: {
    en: "Replay", ko: "다시 듣기", es: "Repetir", fr: "Rejouer",
    zh: "重播", ja: "リプレイ", de: "Wiedergabe", pt: "Repetir",
    it: "Riascolta", ru: "Воспроизвести", ar: "إعادة", hi: "दोबारा सुनें",
    tr: "Tekrar oynat", id: "Putar ulang", vi: "Phát lại", pl: "Odtwórz ponownie",
  },
  translate: {
    en: "Translate", ko: "번역", es: "Traducir", fr: "Traduire",
    zh: "翻译", ja: "翻訳", de: "Übersetzen", pt: "Traduzir",
    it: "Traduci", ru: "Перевести", ar: "ترجمة", hi: "अनुवाद",
    tr: "Çevir", id: "Terjemahkan", vi: "Dịch", pl: "Przetłumacz",
  },
  translating: {
    en: "Translating...", ko: "번역 중...", es: "Traduciendo...", fr: "Traduction en cours...",
    zh: "翻译中...", ja: "翻訳中...", de: "Übersetze...", pt: "Traduzindo...",
    it: "Traduzione in corso...", ru: "Перевод...", ar: "...جارٍ الترجمة", hi: "अनुवाद हो रहा है...",
    tr: "Çevriliyor...", id: "Menerjemahkan...", vi: "Đang dịch...", pl: "Tłumaczenie...",
  },
  translated: {
    en: "Translated", ko: "번역됨", es: "Traducido", fr: "Traduit",
    zh: "已翻译", ja: "翻訳済み", de: "Übersetzt", pt: "Traduzido",
    it: "Tradotto", ru: "Переведено", ar: "مترجم", hi: "अनुवादित",
    tr: "Çevrildi", id: "Diterjemahkan", vi: "Đã dịch", pl: "Przetłumaczono",
  },
  sampleResponses: {
    en: "Sample responses", ko: "응답 예시", es: "Respuestas de ejemplo", fr: "Exemples de réponses",
    zh: "示例回复", ja: "回答例", de: "Beispielantworten", pt: "Respostas de exemplo",
    it: "Risposte di esempio", ru: "Примеры ответов", ar: "ردود نموذجية", hi: "नमूना उत्तर",
    tr: "Örnek yanıtlar", id: "Contoh respons", vi: "Câu trả lời mẫu", pl: "Przykładowe odpowiedzi",
  },
  loading: {
    en: "Loading...", ko: "로딩 중...", es: "Cargando...", fr: "Chargement...",
    zh: "加载中...", ja: "読み込み中...", de: "Laden...", pt: "Carregando...",
    it: "Caricamento...", ru: "Загрузка...", ar: "...جارٍ التحميل", hi: "लोड हो रहा है...",
    tr: "Yükleniyor...", id: "Memuat...", vi: "Đang tải...", pl: "Ładowanie...",
  },
  suggestionsShown: {
    en: "Suggestions shown", ko: "응답 예시 표시됨", es: "Sugerencias mostradas", fr: "Suggestions affichées",
    zh: "建议已显示", ja: "候補を表示中", de: "Vorschläge angezeigt", pt: "Sugestões exibidas",
    it: "Suggerimenti mostrati", ru: "Подсказки показаны", ar: "تم عرض الاقتراحات", hi: "सुझाव दिखाए गए",
    tr: "Öneriler gösterildi", id: "Saran ditampilkan", vi: "Gợi ý đã hiển thị", pl: "Sugestie wyświetlone",
  },
  // Copy
  copy: {
    en: "Copy", ko: "복사", es: "Copiar", fr: "Copier",
    zh: "复制", ja: "コピー", de: "Kopieren", pt: "Copiar",
    it: "Copia", ru: "Копировать", ar: "نسخ", hi: "कॉपी",
    tr: "Kopyala", id: "Salin", vi: "Sao chép", pl: "Kopiuj",
  },
  copied: {
    en: "Copied!", ko: "복사됨!", es: "¡Copiado!", fr: "Copié !",
    zh: "已复制！", ja: "コピーしました！", de: "Kopiert!", pt: "Copiado!",
    it: "Copiato!", ru: "Скопировано!", ar: "تم النسخ!", hi: "कॉपी हो गया!",
    tr: "Kopyalandı!", id: "Disalin!", vi: "Đã sao chép!", pl: "Skopiowano!",
  },

  // Tutor
  tutorHint: {
    en: "Try saying:", ko: "이렇게 말해보세요:", es: "Intenta decir:", fr: "Essayez de dire :",
    zh: "试着说：", ja: "こう言ってみましょう：", de: "Versuchen Sie zu sagen:", pt: "Tente dizer:",
    it: "Prova a dire:", ru: "Попробуйте сказать:", ar: "حاول أن تقول:", hi: "ऐसे कहने की कोशिश करें:",
    tr: "Şöyle söylemeyi deneyin:", id: "Coba katakan:", vi: "Hãy thử nói:", pl: "Spróbuj powiedzieć:",
  },
} satisfies Record<string, Record<NativeLanguage, string>>;

export type I18nKey = keyof typeof strings;

export function t(key: I18nKey, lang: NativeLanguage): string {
  return strings[key][lang] ?? strings[key].en;
}
