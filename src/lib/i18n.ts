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
  cefrLevel: {
    ko: "학습 레벨", en: "Learning Level", es: "Nivel de Aprendizaje", fr: "Niveau d'Apprentissage",
    zh: "学习级别", ja: "学習レベル", de: "Lernniveau", pt: "Nível de Aprendizado",
    it: "Livello di Apprendimento", ru: "Уровень обучения", ar: "مستوى التعلم", hi: "सीखने का स्तर",
    tr: "Öğrenme Seviyesi", id: "Tingkat Belajar", vi: "Cấp độ học", pl: "Poziom nauki",
  },
  cefrAssessed: {
    ko: "측정된 레벨", en: "Assessed Level", es: "Nivel evaluado", fr: "Niveau évalué",
    zh: "评估级别", ja: "評価レベル", de: "Bewertetes Niveau", pt: "Nível avaliado",
    it: "Livello valutato", ru: "Оценённый уровень", ar: "المستوى المُقيَّم", hi: "मूल्यांकित स्तर",
    tr: "Değerlendirilen Seviye", id: "Tingkat yang Dinilai", vi: "Cấp độ đánh giá", pl: "Oceniony poziom",
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
  llmModel: {
    en: "LLM Model", ko: "LLM 모델", es: "Modelo LLM", fr: "Modèle LLM",
    zh: "LLM 模型", ja: "LLMモデル", de: "LLM-Modell", pt: "Modelo LLM",
    it: "Modello LLM", ru: "Модель LLM", ar: "نموذج LLM", hi: "LLM मॉडल",
    tr: "LLM Modeli", id: "Model LLM", vi: "Mô hình LLM", pl: "Model LLM",
  },
  noModelsInstalled: {
    en: "No models installed", ko: "설치된 모델 없음", es: "Sin modelos instalados", fr: "Aucun modèle installé",
    zh: "未安装模型", ja: "モデル未インストール", de: "Keine Modelle installiert", pt: "Nenhum modelo instalado",
    it: "Nessun modello installato", ru: "Нет установленных моделей", ar: "لا توجد نماذج مثبتة", hi: "कोई मॉडल इंस्टॉल नहीं",
    tr: "Yüklü model yok", id: "Tidak ada model terpasang", vi: "Chưa cài mô hình", pl: "Brak zainstalowanych modeli",
  },
  downloadableModels: {
    en: "Download a model:", ko: "모델 다운로드:", es: "Descargar modelo:", fr: "Télécharger un modèle :",
    zh: "下载模型：", ja: "モデルをダウンロード：", de: "Modell herunterladen:", pt: "Baixar modelo:",
    it: "Scarica modello:", ru: "Скачать модель:", ar: "تحميل نموذج:", hi: "मॉडल डाउनलोड करें:",
    tr: "Model indir:", id: "Unduh model:", vi: "Tải mô hình:", pl: "Pobierz model:",
  },
  llmProvider: {
    en: "LLM Provider", ko: "LLM 제공자", es: "Proveedor de LLM", fr: "Fournisseur de LLM",
    zh: "LLM 提供商", ja: "LLM プロバイダー", de: "LLM-Anbieter", pt: "Provedor de LLM",
    it: "Provider LLM", ru: "Поставщик LLM", ar: "مزود LLM", hi: "LLM प्रदाता",
    tr: "LLM Sağlayıcı", id: "Penyedia LLM", vi: "Nhà cung cấp LLM", pl: "Dostawca LLM",
  },
  localLlm: {
    en: "Local (Built-in)", ko: "로컬 (내장)", es: "Local (integrado)", fr: "Local (intégré)",
    zh: "本地（内置）", ja: "ローカル（内蔵）", de: "Lokal (integriert)", pt: "Local (integrado)",
    it: "Locale (integrato)", ru: "Локальный (встроенный)", ar: "محلي (مدمج)", hi: "स्थानीय (अंतर्निहित)",
    tr: "Yerel (dahili)", id: "Lokal (bawaan)", vi: "Cục bộ (tích hợp)", pl: "Lokalny (wbudowany)",
  },
  openaiCompatible: {
    en: "OpenAI-Compatible", ko: "OpenAI 호환", es: "Compatible con OpenAI", fr: "Compatible OpenAI",
    zh: "OpenAI 兼容", ja: "OpenAI 互換", de: "OpenAI-kompatibel", pt: "Compatível com OpenAI",
    it: "Compatibile OpenAI", ru: "OpenAI-совместимый", ar: "متوافق مع OpenAI", hi: "OpenAI-संगत",
    tr: "OpenAI Uyumlu", id: "Kompatibel OpenAI", vi: "Tương thích OpenAI", pl: "Kompatybilny z OpenAI",
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

  endSession: {
    en: "End Session", ko: "세션 종료", es: "Finalizar sesión", fr: "Terminer la session",
    zh: "结束会话", ja: "セッション終了", de: "Sitzung beenden", pt: "Encerrar sessão",
    it: "Termina sessione", ru: "Завершить сессию", ar: "إنهاء الجلسة", hi: "सत्र समाप्त करें",
    tr: "Oturumu bitir", id: "Akhiri sesi", vi: "Kết thúc phiên", pl: "Zakończ sesję",
  },

  // Session Replay
  pastSessions: {
    en: "Past Sessions", ko: "지난 대화", es: "Sesiones anteriores", fr: "Sessions passées",
    zh: "历史会话", ja: "過去のセッション", de: "Vergangene Sitzungen", pt: "Sessões anteriores",
    it: "Sessioni passate", ru: "Прошлые сессии", ar: "الجلسات السابقة", hi: "पिछले सत्र",
    tr: "Geçmiş oturumlar", id: "Sesi sebelumnya", vi: "Phiên trước", pl: "Poprzednie sesje",
  },
  noSessions: {
    en: "No sessions yet", ko: "저장된 대화가 없습니다", es: "Aún no hay sesiones", fr: "Pas encore de sessions",
    zh: "暂无会话", ja: "セッションなし", de: "Noch keine Sitzungen", pt: "Nenhuma sessão ainda",
    it: "Nessuna sessione", ru: "Сессий пока нет", ar: "لا توجد جلسات بعد", hi: "अभी तक कोई सत्र नहीं",
    tr: "Henüz oturum yok", id: "Belum ada sesi", vi: "Chưa có phiên nào", pl: "Brak sesji",
  },
  wellDone: {
    en: "Well done!", ko: "잘 말했어요!", es: "¡Bien hecho!", fr: "Bien dit !",
    zh: "说得好！", ja: "よく言えました！", de: "Gut gemacht!", pt: "Bem feito!",
    it: "Ben fatto!", ru: "Хорошо сказано!", ar: "أحسنت!", hi: "बहुत अच्छा!",
    tr: "Aferin!", id: "Bagus!", vi: "Giỏi lắm!", pl: "Dobrze powiedziane!",
  },
  generating: {
    en: "Generating...", ko: "생성 중...", es: "Generando...", fr: "Génération...",
    zh: "生成中...", ja: "生成中...", de: "Wird generiert...", pt: "Gerando...",
    it: "Generazione...", ru: "Генерация...", ar: "جارٍ الإنشاء...", hi: "उत्पन्न हो रहा है...",
    tr: "Oluşturuluyor...", id: "Menghasilkan...", vi: "Đang tạo...", pl: "Generowanie...",
  },
  reviewFailed: {
    en: "Failed to generate notes", ko: "교정 노트 생성 실패", es: "Error al generar notas", fr: "Échec de la génération",
    zh: "生成笔记失败", ja: "ノート生成に失敗", de: "Generierung fehlgeschlagen", pt: "Falha ao gerar notas",
    it: "Generazione fallita", ru: "Не удалось сгенерировать", ar: "فشل في إنشاء الملاحظات", hi: "नोट्स बनाने में विफल",
    tr: "Notlar oluşturulamadı", id: "Gagal membuat catatan", vi: "Tạo ghi chú thất bại", pl: "Nie udało się wygenerować",
  },
  retry: {
    en: "Retry", ko: "재시도", es: "Reintentar", fr: "Réessayer",
    zh: "重试", ja: "再試行", de: "Erneut versuchen", pt: "Tentar novamente",
    it: "Riprova", ru: "Повторить", ar: "إعادة المحاولة", hi: "पुनः प्रयास करें",
    tr: "Tekrar dene", id: "Coba lagi", vi: "Thử lại", pl: "Ponów",
  },
  deleteSession: {
    en: "Delete", ko: "삭제", es: "Eliminar", fr: "Supprimer",
    zh: "删除", ja: "削除", de: "Löschen", pt: "Excluir",
    it: "Elimina", ru: "Удалить", ar: "حذف", hi: "हटाएं",
    tr: "Sil", id: "Hapus", vi: "Xóa", pl: "Usuń",
  },
  errorGrammar: {
    en: "Grammar", ko: "문법", es: "Gramática", fr: "Grammaire",
    zh: "语法", ja: "文法", de: "Grammatik", pt: "Gramática",
    it: "Grammatica", ru: "Грамматика", ar: "قواعد", hi: "व्याकरण",
    tr: "Dilbilgisi", id: "Tata bahasa", vi: "Ngữ pháp", pl: "Gramatyka",
  },
  errorVocab: {
    en: "Vocabulary", ko: "어휘", es: "Vocabulario", fr: "Vocabulaire",
    zh: "词汇", ja: "語彙", de: "Wortschatz", pt: "Vocabulário",
    it: "Vocabolario", ru: "Словарь", ar: "مفردات", hi: "शब्दावली",
    tr: "Kelime", id: "Kosakata", vi: "Từ vựng", pl: "Słownictwo",
  },
  errorNaturalness: {
    en: "Naturalness", ko: "자연스러움", es: "Naturalidad", fr: "Naturel",
    zh: "自然度", ja: "自然さ", de: "Natürlichkeit", pt: "Naturalidade",
    it: "Naturalezza", ru: "Естественность", ar: "طبيعية", hi: "स्वाभाविकता",
    tr: "Doğallık", id: "Kealamian", vi: "Tự nhiên", pl: "Naturalność",
  },
  errorSituation: {
    en: "Situation", ko: "상황 적합성", es: "Situación", fr: "Situation",
    zh: "情境", ja: "状況", de: "Situation", pt: "Situação",
    it: "Situazione", ru: "Ситуация", ar: "الموقف", hi: "स्थिति",
    tr: "Durum", id: "Situasi", vi: "Tình huống", pl: "Sytuacja",
  },

  // Tutor
  tutorHint: {
    en: "Try saying:", ko: "이렇게 말해보세요:", es: "Intenta decir:", fr: "Essayez de dire :",
    zh: "试着说：", ja: "こう言ってみましょう：", de: "Versuchen Sie zu sagen:", pt: "Tente dizer:",
    it: "Prova a dire:", ru: "Попробуйте сказать:", ar: "حاول أن تقول:", hi: "ऐसे कहने की कोशिश करें:",
    tr: "Şöyle söylemeyi deneyin:", id: "Coba katakan:", vi: "Hãy thử nói:", pl: "Spróbuj powiedzieć:",
  },

  // Courage Score
  courageScore: {
    en: "Speaking Courage", ko: "Speaking Courage", es: "Speaking Courage", fr: "Speaking Courage",
    zh: "Speaking Courage", ja: "Speaking Courage", de: "Speaking Courage", pt: "Speaking Courage",
    it: "Speaking Courage", ru: "Speaking Courage", ar: "Speaking Courage", hi: "Speaking Courage",
    tr: "Speaking Courage", id: "Speaking Courage", vi: "Speaking Courage", pl: "Speaking Courage",
  },
  courageTodaySession: {
    en: "Today's Session", ko: "오늘 세션", es: "Sesión de hoy", fr: "Session du jour",
    zh: "今日会话", ja: "今日のセッション", de: "Heutige Sitzung", pt: "Sessão de hoje",
    it: "Sessione di oggi", ru: "Сегодняшняя сессия", ar: "جلسة اليوم", hi: "आज का सत्र",
    tr: "Bugünün oturumu", id: "Sesi hari ini", vi: "Phiên hôm nay", pl: "Dzisiejsza sesja",
  },
  courageSessionsAgo: {
    en: "10 sessions ago", ko: "10세션 전", es: "Hace 10 sesiones", fr: "Il y a 10 sessions",
    zh: "10次前", ja: "10回前", de: "Vor 10 Sitzungen", pt: "10 sessões atrás",
    it: "10 sessioni fa", ru: "10 сессий назад", ar: "قبل 10 جلسات", hi: "10 सत्र पहले",
    tr: "10 oturum önce", id: "10 sesi lalu", vi: "10 phiên trước", pl: "10 sesji temu",
  },
  courageToday: {
    en: "Today", ko: "오늘", es: "Hoy", fr: "Aujourd'hui",
    zh: "今天", ja: "今日", de: "Heute", pt: "Hoje",
    it: "Oggi", ru: "Сегодня", ar: "اليوم", hi: "आज",
    tr: "Bugün", id: "Hari ini", vi: "Hôm nay", pl: "Dziś",
  },
  courageWords: {
    en: "Words spoken", ko: "발화 단어", es: "Palabras dichas", fr: "Mots prononcés",
    zh: "发言词数", ja: "発話単語", de: "Gesprochene Wörter", pt: "Palavras faladas",
    it: "Parole dette", ru: "Произнесённые слова", ar: "كلمات منطوقة", hi: "बोले गए शब्द",
    tr: "Söylenen kelimeler", id: "Kata diucapkan", vi: "Từ đã nói", pl: "Wypowiedziane słowa",
  },
  courageTurns: {
    en: "Speaking turns", ko: "발화 턴", es: "Turnos de habla", fr: "Tours de parole",
    zh: "发言轮次", ja: "発話ターン", de: "Sprechrunden", pt: "Turnos de fala",
    it: "Turni di parola", ru: "Реплики", ar: "أدوار التحدث", hi: "बोलने की बारी",
    tr: "Konuşma turları", id: "Giliran bicara", vi: "Lượt nói", pl: "Tury mówienia",
  },
  courageComplex: {
    en: "Complex sentences", ko: "복잡한 문장", es: "Oraciones complejas", fr: "Phrases complexes",
    zh: "复杂句", ja: "複雑な文", de: "Komplexe Sätze", pt: "Frases complexas",
    it: "Frasi complesse", ru: "Сложные предложения", ar: "جمل معقدة", hi: "जटिल वाक्य",
    tr: "Karmaşık cümleler", id: "Kalimat kompleks", vi: "Câu phức tạp", pl: "Złożone zdania",
  },
  courageNativeSwitches: {
    en: "L1 switches", ko: "모국어 전환", es: "Cambios a L1", fr: "Changements L1",
    zh: "母语切换", ja: "母語切替", de: "L1-Wechsel", pt: "Trocas L1",
    it: "Cambi L1", ru: "Переходы на L1", ar: "تبديلات L1", hi: "L1 स्विच",
    tr: "L1 geçişleri", id: "Ganti L1", vi: "Chuyển L1", pl: "Zmiany L1",
  },
  courageQuickResponse: {
    en: "Quick response", ko: "바로 응답", es: "Respuesta rápida", fr: "Réponse rapide",
    zh: "快速回应", ja: "即答率", de: "Schnelle Antwort", pt: "Resposta rápida",
    it: "Risposta rapida", ru: "Быстрый ответ", ar: "استجابة سريعة", hi: "त्वरित उत्तर",
    tr: "Hızlı yanıt", id: "Respons cepat", vi: "Phản hồi nhanh", pl: "Szybka odpowiedź",
  },
  courageDuration: {
    en: "Session time", ko: "세션 시간", es: "Tiempo de sesión", fr: "Durée de session",
    zh: "会话时长", ja: "セッション時間", de: "Sitzungsdauer", pt: "Tempo de sessão",
    it: "Durata sessione", ru: "Время сессии", ar: "وقت الجلسة", hi: "सत्र समय",
    tr: "Oturum süresi", id: "Waktu sesi", vi: "Thời gian phiên", pl: "Czas sesji",
  },
  couragePrevLabel: {
    en: "prev", ko: "지난번", es: "anterior", fr: "précédent",
    zh: "上次", ja: "前回", de: "vorher", pt: "anterior",
    it: "precedente", ru: "пред.", ar: "السابقة", hi: "पिछला",
    tr: "önceki", id: "sebelumnya", vi: "trước", pl: "poprz.",
  },
  courageVsPrev: {
    en: "vs last session", ko: "지난 세션 대비", es: "vs sesión anterior", fr: "vs session précédente",
    zh: "vs上次", ja: "vs前回", de: "vs letzte Sitzung", pt: "vs sessão anterior",
    it: "vs sessione precedente", ru: "vs пред. сессия", ar: "مقارنة بالسابقة", hi: "vs पिछला सत्र",
    tr: "vs önceki oturum", id: "vs sesi sebelumnya", vi: "vs phiên trước", pl: "vs poprzednia sesja",
  },
  courageVsAvg: {
    en: "vs 10-session avg", ko: "10세션 평균 대비", es: "vs promedio 10", fr: "vs moy. 10 sessions",
    zh: "vs10次平均", ja: "vs10回平均", de: "vs 10-Sitzungen-Ø", pt: "vs média 10 sessões",
    it: "vs media 10 sessioni", ru: "vs ср. 10 сессий", ar: "مقارنة بمتوسط 10", hi: "vs 10-सत्र औसत",
    tr: "vs 10 ort.", id: "vs rata-rata 10", vi: "vs TB 10 phiên", pl: "vs śr. 10 sesji",
  },
  courageFirstSession: {
    en: "First session! Trends start from the next one.",
    ko: "첫 번째 세션입니다. 다음 세션부터 추세를 볼 수 있어요.",
    es: "¡Primera sesión! Las tendencias comienzan a partir de la siguiente.",
    fr: "Première session ! Les tendances commenceront à la prochaine.",
    zh: "第一次会话！下次开始显示趋势。",
    ja: "最初のセッションです！次回からトレンドが表示されます。",
    de: "Erste Sitzung! Trends ab der nächsten.",
    pt: "Primeira sessão! Tendências a partir da próxima.",
    it: "Prima sessione! Le tendenze iniziano dalla prossima.",
    ru: "Первая сессия! Тренды появятся со следующей.",
    ar: "الجلسة الأولى! ستظهر الاتجاهات من الجلسة التالية.",
    hi: "पहला सत्र! अगले से रुझान दिखेंगे।",
    tr: "İlk oturum! Trendler bir sonrakinden başlayacak.",
    id: "Sesi pertama! Tren mulai dari sesi berikutnya.",
    vi: "Phiên đầu tiên! Xu hướng bắt đầu từ phiên tiếp theo.",
    pl: "Pierwsza sesja! Trendy od następnej.",
  },
  courageGoodJob: {
    en: "Nice!", ko: "좋았어요", es: "¡Bien!", fr: "Bien !",
    zh: "不错！", ja: "いいね！", de: "Gut!", pt: "Bom!",
    it: "Bene!", ru: "Хорошо!", ar: "!جيد", hi: "अच्छा!",
    tr: "Güzel!", id: "Bagus!", vi: "Tốt!", pl: "Dobrze!",
  },
} satisfies Record<string, Record<NativeLanguage, string>>;

export type I18nKey = keyof typeof strings;

export function t(key: I18nKey, lang: NativeLanguage): string {
  return strings[key][lang] ?? strings[key].en;
}
