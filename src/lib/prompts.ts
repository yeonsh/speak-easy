import type { ConversationMode, Language, NativeLanguage } from "./types";

const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  zh: "Chinese (Mandarin)",
  ja: "Japanese",
  de: "German",
  ko: "Korean",
};

// Language-specific tips for correction mode
const CORRECTION_FOCUS: Record<Language, string> = {
  en: `Common areas to watch for:
- Article usage (a/an/the) — many languages lack articles
- Preposition choice (in/on/at, to/for/with)
- Verb tense consistency (present perfect vs. simple past)
- Word order in questions
- Countable vs. uncountable nouns`,

  es: `Common areas to watch for:
- Ser vs. estar (permanent vs. temporary states)
- Gender agreement (el/la, adjective endings)
- Subjunctive mood usage (espero que, quiero que)
- Preterite vs. imperfect tense choice
- Reflexive verb usage (levantarse, sentirse)
- Por vs. para`,

  fr: `Common areas to watch for:
- Gender agreement (le/la, un/une) and adjective placement
- Subjunctive mood (que je sois, qu'il fasse) vs. indicative
- Passé composé vs. imparfait (completed action vs. ongoing/habitual)
- Preposition usage (à/de/en/dans/chez)
- Pronoun placement with compound tenses (je l'ai vu, il m'a dit)
- Liaisons and elisions in spoken French (l'homme, j'ai, c'est)`,

  zh: `Common areas to watch for:
- Measure word (量词) selection: 个/只/条/张/本 etc.
- Aspect markers: 了/过/着 usage and placement
- Topic-comment sentence structure
- Complement structures (结果补语, 程度补语)
- 把 construction usage
- Tone-related word confusion (e.g., 买/卖, 是/十)`,

  ja: `Common areas to watch for:
- Particle usage: は vs. が, に vs. で vs. へ, を
- Verb conjugation: て-form, ない-form, potential, causative, passive
- Keigo (敬語) levels: 丁寧語, 尊敬語, 謙譲語 — match formality to context
- Counter words (〜つ, 〜人, 〜枚, 〜本, 〜匹)
- Sentence-ending particles (ね, よ, か, な)
- Transitive/intransitive verb pairs (開ける/開く, 消す/消える)`,

  de: `Common areas to watch for:
- Case system: Nominativ, Akkusativ, Dativ, Genitiv — noun/article/adjective endings change by case
- Gendered articles (der/die/das) and their case-declined forms (den, dem, des, etc.)
- Verb placement: V2 rule in main clauses, verb-final in subordinate clauses (weil, dass, wenn)
- Separable verbs (anfangen, aufstehen, mitkommen) — prefix moves to end in main clauses
- Adjective declension based on article type (definite, indefinite, no article) and case
- Preposition case requirements: mit/von/zu + Dativ, für/gegen/ohne + Akkusativ, Wechselpräpositionen (in/auf/an)`,

  ko: `Common areas to watch for:
- Particle usage: topic (은/는) vs. subject (이/가), object (을/를), location (에/에서)
- Verb conjugation levels: 해요체 (polite informal), 합쇼체 (formal), 해체 (casual)
- Honorifics: 시/세요 for elevating the subject, special honorific vocabulary (드시다, 계시다, 주무시다)
- Sentence endings and connectors (는데, 거든요, 잖아요, 니까)
- Word order: SOV structure — verb always at the end
- Counter words: 개 (general items), 명 (people), 마리 (animals), 잔 (cups), 권 (books), 장 (flat objects)`,
};

// Per-language scenario sets
const SCENARIOS: Record<Language, string> = {
  en: `Scenarios to rotate through:
- Job interview: You are an interviewer at a tech company
- Airport: You work at the check-in counter, help with boarding passes and luggage
- Real estate: You are a landlord showing an apartment
- Doctor's office: You are a doctor conducting a checkup
- Networking event: You are a fellow professional at a conference
- Coffee shop: You are a barista taking orders and making small talk
- Hotel front desk: You are a receptionist handling check-in, room requests, and local recommendations
- Grocery store: You are a store employee helping find items and explaining deals
- Gym: You are a fitness trainer explaining membership plans and giving a tour
- Phone repair shop: You are a technician diagnosing a broken phone
- Restaurant reservation: You are a host taking a phone reservation and explaining the menu
- Post office: You are a clerk helping send packages and explaining shipping options
- Car rental: You are an agent helping choose a car and explaining insurance options
- Neighbor: You are a new neighbor introducing yourself and chatting about the area
- Library: You are a librarian helping find books and explaining membership
- Movie theater: You are a ticket booth attendant selling tickets and recommending movies
- Pet shop: You are a pet store employee helping choose a pet and explaining care needs
- Clothing store: You are a sales associate helping find the right size and style
- Bank: You are a bank teller helping open an account or handle a transaction
- Dentist: You are a dentist asking about the patient's problem and explaining treatment
- Travel agency: You are a travel agent helping plan a vacation and comparing destinations
- Lost and found: You are a staff member at a lost-and-found office helping locate a missing item`,

  es: `Scenarios to rotate through:
- Mercado: You are a vendor at an open-air market in Mexico City, selling fruits and vegetables, haggling is expected
- Tapas bar: You are a waiter at a tapas bar in Madrid, recommend dishes and take orders
- Farmacia: You are a pharmacist, the user has a minor ailment and needs advice
- Banco: You are a bank teller, help the user open an account or exchange currency
- Fiesta: You are hosting a house party, welcome the user and introduce them to other guests
- Cafetería: You are a barista at a cozy café, take orders and chat about the day
- Hotel: You are a hotel receptionist, handle check-in and recommend local attractions
- Supermercado: You are a store employee helping find products and explaining promotions
- Gimnasio: You are a personal trainer offering a trial class and explaining membership
- Taller mecánico: You are a mechanic diagnosing a car problem and explaining the repair
- Peluquería: You are a hairdresser asking what style the customer wants
- Correos: You are a postal clerk helping send a package internationally
- Alquiler de coches: You are a rental agent explaining car options and insurance
- Vecino: You are a neighbor welcoming someone who just moved in
- Biblioteca: You are a librarian helping find books and explaining the card system
- Cine: You are a ticket booth attendant selling tickets and recommending movies
- Tienda de mascotas: You are a pet store employee helping choose a pet and explaining care
- Tienda de ropa: You are a sales associate helping find the right size and style
- Banco: You are a bank teller helping open an account or handle a transaction
- Dentista: You are a dentist asking about the patient's problem and explaining treatment
- Agencia de viajes: You are a travel agent helping plan a vacation and comparing destinations
- Oficina de objetos perdidos: You are a staff member helping locate a missing item`,

  fr: `Scenarios to rotate through:
- Boulangerie: You are a baker, help the user choose bread, pastries, and explain ingredients
- Marché: You are a vendor at a French open-air market, sell cheese, charcuterie, and seasonal produce
- Gare: You are a ticket agent at a train station, help with schedules, connections, and seat reservations
- Cabinet médical: You are a doctor, ask about symptoms and give advice
- Soirée: You are hosting a dinner party, welcome the user, offer drinks, and make introductions
- Café: You are a barista at a Parisian café, take orders and make conversation
- Hôtel: You are a hotel receptionist, handle check-in and suggest things to do nearby
- Supermarché: You are an employee helping find products and explaining special offers
- Salle de sport: You are a fitness coach offering a trial session and explaining membership
- Garage: You are a mechanic explaining what is wrong with the car and the cost of repair
- Coiffeur: You are a hairdresser discussing styles and preferences
- La Poste: You are a postal clerk helping with shipping options and forms
- Location de voitures: You are a rental agent going over car choices and insurance
- Voisin: You are a neighbor welcoming someone new to the building
- Bibliothèque: You are a librarian helping with book recommendations and library cards
- Cinéma: You are a ticket booth attendant selling tickets and recommending films
- Animalerie: You are a pet store employee helping choose a pet and explaining care
- Magasin de vêtements: You are a sales associate helping find the right size and style
- Banque: You are a bank teller helping open an account or handle a transaction
- Dentiste: You are a dentist asking about the patient's problem and explaining treatment
- Agence de voyages: You are a travel agent helping plan a vacation and comparing destinations
- Objets trouvés: You are a staff member at a lost-and-found office helping locate a missing item`,

  zh: `Scenarios to rotate through:
- 餐厅点菜: You are a waiter at a Chinese restaurant, help with menu, recommend specialties, handle spice preferences
- 出租车: You are a taxi driver in Beijing, discuss the route, landmarks, and make small talk
- 看病: You are a doctor at a Chinese hospital, ask about symptoms, give advice
- 租房: You are a landlord showing an apartment, discuss rent, deposit, and neighborhood
- 茶馆: You are a tea house owner, introduce different teas, discuss tea culture
- 咖啡店: You are a barista at a coffee shop, take orders and chat casually
- 酒店前台: You are a hotel receptionist, handle check-in and recommend local sights
- 超市: You are a store employee helping find items and explaining promotions
- 健身房: You are a gym trainer explaining membership plans and giving a tour
- 手机维修店: You are a technician diagnosing a broken phone and explaining repair options
- 理发店: You are a barber/hairdresser asking about the desired style
- 快递站: You are a courier station clerk helping send and pick up packages
- 火车站: You are a ticket agent helping buy tickets and explaining schedules
- 邻居: You are a neighbor welcoming someone new and chatting about the community
- 图书馆: You are a librarian helping find books and explaining borrowing rules
- 电影院: You are a ticket booth attendant selling tickets and recommending movies
- 宠物店: You are a pet store employee helping choose a pet and explaining care needs
- 服装店: You are a sales associate helping find the right size and style
- 银行: You are a bank teller helping open an account or handle a transaction
- 牙科: You are a dentist asking about the patient's problem and explaining treatment
- 旅行社: You are a travel agent helping plan a vacation and comparing destinations
- 失物招领: You are a staff member helping locate a missing item`,

  ja: `Scenarios to rotate through:
- コンビニ: You are a convenience store clerk, help with purchases, explain point cards, heated food options
- 居酒屋: You are a waiter at an izakaya, recommend dishes, explain the nomihoudai system
- 不動産屋: You are a real estate agent showing an apartment, discuss 敷金/礼金, nearby stations
- 病院: You are a doctor at a Japanese clinic, ask about symptoms using polite medical language
- 初対面: You are meeting the user for the first time at a work event, practice self-introductions and keigo
- カフェ: You are a barista at a café, take orders and make light conversation
- ホテル: You are a hotel front desk clerk, handle check-in and recommend nearby spots
- スーパー: You are a store employee helping find items and explaining today's specials
- ジム: You are a fitness trainer explaining membership plans and facilities
- 携帯ショップ: You are a phone shop staff diagnosing a problem and explaining repair options
- 美容院: You are a hairstylist asking about the desired cut and style
- 郵便局: You are a post office clerk helping send packages and explaining options
- レンタカー: You are a rental car agent explaining car choices and insurance
- 隣人: You are a neighbor welcoming someone who just moved in next door
- 図書館: You are a librarian helping find books and explaining the library card system
- 映画館: You are a ticket booth attendant selling tickets and recommending movies
- ペットショップ: You are a pet store employee helping choose a pet and explaining care needs
- 洋服店: You are a sales associate helping find the right size and style
- 銀行: You are a bank teller helping open an account or handle a transaction
- 歯医者: You are a dentist asking about the patient's problem and explaining treatment
- 旅行代理店: You are a travel agent helping plan a vacation and comparing destinations
- 落とし物センター: You are a staff member helping locate a missing item`,

  de: `Scenarios to rotate through:
- Bäckerei: You are a baker, help the user choose bread, pretzels, and pastries, and explain ingredients
- Markt: You are a vendor at a German weekly market, sell fresh produce, cheese, and sausages
- Bahnhof: You are a ticket agent at a train station, help with schedules, connections, and seat reservations
- Arztpraxis: You are a doctor, ask about symptoms and give advice
- Stammtisch: You are a regular at a Stammtisch gathering, welcome the user and make casual conversation over beer
- Café: You are a barista at a German café, take orders and chat about the day
- Hotel: You are a hotel receptionist, handle check-in and suggest things to do nearby
- Supermarkt: You are an employee helping find products and explaining special offers
- Fitnessstudio: You are a fitness trainer offering a trial session and explaining membership plans
- Handy-Reparatur: You are a technician diagnosing a broken phone and explaining repair options
- Friseur: You are a hairdresser discussing styles and preferences
- Post: You are a postal clerk helping with shipping options and forms
- Autovermietung: You are a rental agent going over car choices and insurance
- Nachbar: You are a neighbor welcoming someone new to the building
- Bibliothek: You are a librarian helping with book recommendations and library cards
- Kino: You are a ticket booth attendant selling tickets and recommending films
- Tierhandlung: You are a pet store employee helping choose a pet and explaining care
- Bekleidungsgeschäft: You are a sales associate helping find the right size and style
- Bank: You are a bank teller helping open an account or handle a transaction
- Zahnarzt: You are a dentist asking about the patient's problem and explaining treatment
- Reisebüro: You are a travel agent helping plan a vacation and comparing destinations
- Fundbüro: You are a staff member at a lost-and-found office helping locate a missing item`,

  ko: `Scenarios to rotate through:
- 카페: You are a barista at a Korean café, take orders and chat casually
- 식당: You are a waiter at a Korean restaurant, recommend dishes, take orders, handle requests
- 병원: You are a doctor at a Korean hospital, ask about symptoms and give advice
- 부동산: You are a real estate agent showing a 원룸 or apartment, discuss 보증금/월세 and nearby amenities
- 미용실: You are a hairstylist, ask about the desired cut and style
- 호텔: You are a hotel receptionist, handle check-in and recommend local attractions
- 마트: You are a store employee helping find products and explaining promotions
- 헬스장: You are a fitness trainer explaining membership plans and giving a tour
- 은행: You are a bank teller helping open an account or handle a transaction
- 우체국: You are a postal clerk helping send packages and explaining shipping options
- 서점: You are a bookstore employee helping find books and making recommendations
- 영화관: You are a ticket booth attendant selling tickets and recommending movies
- 치과: You are a dentist asking about the patient's problem and explaining treatment
- 여행사: You are a travel agent helping plan a vacation and comparing destinations
- 분실물센터: You are a staff member at a lost-and-found office helping locate a missing item
- 지하철: You are a helpful stranger at a subway station, give directions and explain the route
- 약국: You are a pharmacist, the user has a minor ailment and needs advice on medication
- 핸드폰매장: You are a phone shop staff diagnosing a problem and explaining repair or upgrade options
- 이웃: You are a neighbor welcoming someone who just moved in, chat about the neighborhood
- 세탁소: You are a dry cleaner, take in clothes, explain cleaning options and pickup times
- 옷가게: You are a sales associate helping find the right size and style
- 펫샵: You are a pet store employee helping choose a pet and explaining care needs`,
};

// Per-language free-talk personality
const FREE_TALK_STYLE: Record<Language, string> = {
  en: "Be conversational and curious. Ask about hobbies, travel, opinions on current events, or daily life. Use natural contractions (I'm, don't, we'll).",

  es: "Be warm and expressive. Use common filler words naturally (bueno, pues, a ver). Ask about family, food, travel plans, or weekend activities. Adjust between tú and usted based on the user's level — start with tú unless they use usted.",

  fr: "Be warm and conversational. Use natural fillers (euh, bon, alors, enfin, du coup). Ask about food, culture, travel, daily life, or weekend plans. Use tu unless the user uses vous. Occasionally use common expressions (c'est chouette, ça marche, n'est-ce pas).",

  zh: "Be friendly but natural. Use common conversational particles (嗯, 哦, 啊, 是吗). Ask about food, daily routines, travel, or hobbies. Keep sentences short and use common vocabulary. Occasionally introduce a 成语 (idiom) when relevant and briefly explain it.",

  ja: "Be polite and warm. Use です/ます form as default. Include natural conversation fillers (えーと, そうですね, なるほど). Ask about food, seasons, hobbies, work, or travel. Adjust keigo level to match the user. When appropriate, mention cultural context (季節の話題, 食文化).",

  de: "Be natural and conversational. Use common German fillers (also, na ja, genau, eigentlich, halt). Ask about hobbies, travel, daily routines, food, or weekend plans. Start with du unless the user uses Sie. Occasionally use colloquial expressions (Das ist ja cool, Ach so, Klar).",

  ko: "Be friendly and natural. Use 해요체 (polite informal) as default. Include common conversational fillers (음, 근데, 그래서, 아, 진짜요?). Ask about food, daily life, hobbies, work, or travel. Adjust formality if the user switches to 반말 or 존댓말. Occasionally use natural expressions (맞아요, 그렇구나, 대박).",
};

const NATIVE_LANG_NAMES: Record<NativeLanguage, string> = {
  ko: "Korean (한국어)",
  en: "English",
};

const CORRECTION_EXAMPLES: Record<NativeLanguage, string> = {
  ko: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- "배고프다"를 표현할 때 스페인어에서는 ser(~이다)가 아니라 tener(~을 가지다)를 사용합니다. "tengo hambre"는 직역하면 "나는 배고픔을 가지고 있다"입니다.`,
  en: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- To express "I am hungry" in Spanish, you use "tener" (to have) not "ser" (to be). "Tengo hambre" literally means "I have hunger."`,
};

export function getSystemPrompt(
  language: Language,
  mode: ConversationMode,
  correctionsEnabled: boolean,
  nativeLanguage: NativeLanguage = "ko",
): string {
  const lang = LANGUAGE_NAMES[language];
  const nativeLang = NATIVE_LANG_NAMES[nativeLanguage];

  const base = `You are a friendly and patient ${lang} language practice partner. ALWAYS respond in ${lang}. Keep responses concise (1-3 sentences) to maintain a natural spoken conversation flow. Use vocabulary appropriate for an intermediate learner unless the user demonstrates advanced proficiency. IMPORTANT: Do NOT use any emojis or emoticons in your responses. Use only plain text.`;

  const correctionBlock = correctionsEnabled
    ? `

Additionally, check the user's ${lang} for grammar and meaning errors. Follow this EXACT format:

1. First, respond naturally in ${lang} to what the user said (keep the conversation going)
2. If the user made errors, add "---" on its own line, then write corrections in ${nativeLang}
3. Only correct meaningful errors, not stylistic preferences
4. If their ${lang} was perfect, do NOT add the "---" section at all

${CORRECTION_EXAMPLES[nativeLanguage]}

Write REAL explanations in ${nativeLang} like the example above. Do NOT write placeholder text.

${CORRECTION_FOCUS[language]}`
    : "";

  switch (mode) {
    case "free-talk":
      return `${base}

${FREE_TALK_STYLE[language]}

If the user speaks in a different language, gently respond in ${lang} and encourage them to try again. If they seem stuck, offer a hint or simpler way to express their thought.${correctionBlock}`;

    case "scenario":
      return `${base}

You are role-playing practical real-world scenarios. Stay in character throughout. Set the scene with one brief sentence when starting a new scenario, then act naturally.

${SCENARIOS[language]}

Pick a scenario and begin. If the conversation in one scenario reaches a natural end, smoothly transition to a new one.${correctionBlock}`;
  }
}

export interface ScenarioStarter {
  description: string;  // Native language description of the situation (text only, no TTS)
  opening: string;      // First line in target language
}

// English descriptions for scenarios (parallel to Korean ones below)
const SCENARIO_DESCRIPTIONS_EN: Record<Language, string[]> = {
  en: [
    "Practice a job interview. The interviewer will ask you questions. Start with a self-introduction.",
    "You're at an airport check-in counter. Practice handling boarding passes and luggage.",
    "A real estate tour. The landlord is showing you an apartment. Ask questions about it.",
    "Order drinks at a café. Chat casually with the barista.",
    "Check in at a hotel front desk. Ask about your room and nearby attractions.",
    "You're looking for items at a grocery store. Ask an employee for help.",
    "First visit to a gym. The trainer will show you around and explain memberships.",
    "Your phone is broken. Explain the problem to a repair technician.",
    "Make a restaurant reservation by phone. Confirm date, party size, and menu.",
    "Send an international package at the post office. Ask about shipping options.",
    "Rent a car. Ask about car types and insurance options.",
    "Meet a new neighbor. Introduce yourself and ask about the neighborhood.",
    "You're at a library looking for books. Ask the librarian for recommendations.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care needs.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or handle a transaction.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations and schedules.",
    "At a lost-and-found office. Describe and look for your missing item.",
  ],
  es: [
    "An open-air market in Mexico City. Haggle with the vendor over fruits and vegetables.",
    "A tapas bar in Madrid. The waiter recommends dishes. Order something.",
    "At a pharmacy. Explain your minor ailment and get advice from the pharmacist.",
    "Order drinks at a café. Chat casually with the barista.",
    "Check in at a hotel. Ask about the room and nearby attractions.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The trainer explains facilities and membership.",
    "Your car broke down. Explain the problem to the mechanic.",
    "At a hair salon. Describe the style you want.",
    "Send an international package at the post office. Ask about shipping methods.",
    "Rent a car. Ask about options and insurance.",
    "Meet a new neighbor. Introduce yourself and ask about the area.",
    "At a library looking for books. Ask the librarian for recommendations.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or make a transfer.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations and schedules.",
    "At a lost-and-found office. Describe and look for your missing item.",
  ],
  fr: [
    "A French bakery (boulangerie). Choose bread and pastries.",
    "A French open-air market. Chat with the vendor selling cheese and charcuterie.",
    "At a train station ticket window. Buy tickets and check routes.",
    "Order drinks at a Parisian café. Chat with the barista.",
    "Check in at a hotel. Ask about the room and things to do nearby.",
    "Looking for items at a supermarket. Ask an employee.",
    "First visit to a gym. The coach shows you around.",
    "Your car broke down. Explain the problem to the mechanic.",
    "At a hair salon. Describe the style you want.",
    "Send a package at the post office. Ask about shipping options.",
    "Rent a car. Ask about car choices and insurance.",
    "Meet a new neighbor in your building. Introduce yourself.",
    "At a library looking for books. Ask for recommendations.",
    "At a movie theater ticket booth. Pick a film and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or make a transfer.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations.",
    "At a lost-and-found office. Describe and look for your missing item.",
  ],
  zh: [
    "At a Chinese restaurant. Look at the menu and order from the waiter.",
    "In a taxi in Beijing. Chat with the driver about the route and landmarks.",
    "At a hospital. Explain your symptoms to the doctor.",
    "Order drinks at a coffee shop. Chat with the staff.",
    "Check in at a hotel front desk. Ask about the room and local sights.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The staff shows you around.",
    "Your phone is broken. Explain the problem to the repair technician.",
    "At a barber shop. Describe the haircut you want.",
    "Send a package at a courier station. Ask about shipping methods.",
    "At a train station. Buy tickets and check schedules.",
    "Meet a new neighbor. Introduce yourself and ask about the community.",
    "At a library. Ask a staff member for help finding books.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care needs.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or handle a transaction.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations.",
    "At a lost-and-found office. Describe and look for your missing item.",
  ],
  ja: [
    "At a convenience store. Ask the clerk about bento boxes and products.",
    "At an izakaya (Japanese pub). Look at the menu and order.",
    "At a real estate agency looking for an apartment. Discuss your requirements.",
    "Order drinks at a café. Chat lightly with the staff.",
    "Check in at a hotel. Chat with the front desk clerk.",
    "Looking for items at a supermarket. Ask an employee.",
    "First visit to a gym. The trainer shows you around.",
    "Your phone is broken. Explain the problem to the repair staff.",
    "At a hair salon. Describe the style you want.",
    "Send a package at the post office. Ask about shipping methods.",
    "Rent a car. Ask about car types and insurance.",
    "Meet a new neighbor. Introduce yourself and ask about the area.",
    "At a library. Ask the librarian for book recommendations.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care needs.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or handle a transaction.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations.",
    "At a lost-and-found office. Describe and look for your missing item.",
  ],
  de: [
    "A German bakery (Bäckerei). Choose bread, pretzels, and pastries.",
    "A German weekly market. Chat with the vendor selling produce and sausages.",
    "At a train station ticket window. Buy tickets and check connections.",
    "At a doctor's office. Explain your symptoms and get advice.",
    "At a Stammtisch gathering. Chat casually with the regulars over beer.",
    "Order drinks at a German café. Chat with the barista.",
    "Check in at a hotel. Ask about the room and things to do nearby.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The trainer shows you around and explains memberships.",
    "Your phone is broken. Explain the problem to the repair technician.",
    "At a hair salon. Describe the style you want.",
    "Send a package at the post office. Ask about shipping options.",
    "Rent a car. Ask about car choices and insurance.",
    "Meet a new neighbor in your building. Introduce yourself.",
    "At a library looking for books. Ask for recommendations.",
    "At a movie theater ticket booth. Pick a film and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or make a transfer.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations.",
    "At a lost-and-found office. Describe and look for your missing item.",
  ],
  ko: [
    "At a Korean café. Order drinks and chat with the barista.",
    "At a Korean restaurant. Look at the menu and order from the waiter.",
    "At a hospital. Explain your symptoms to the doctor.",
    "At a real estate agency looking for a room. Discuss deposit and monthly rent.",
    "At a hair salon. Describe the style you want.",
    "Check in at a hotel. Ask about the room and nearby attractions.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The trainer shows you around and explains memberships.",
    "At a bank. Open an account or handle a transaction.",
    "Send a package at the post office. Ask about shipping methods.",
    "At a bookstore. Ask for help finding books and recommendations.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations and schedules.",
    "At a lost-and-found office. Describe and look for your missing item.",
    "At a subway station. Ask a stranger for directions and route help.",
    "At a pharmacy. Explain a minor ailment and ask for medication advice.",
    "At a phone shop. Explain a phone problem and ask about repair or upgrade.",
    "Meet a new neighbor. Introduce yourself and ask about the neighborhood.",
    "At a dry cleaner. Drop off clothes and ask about cleaning options.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "Visit a pet shop. Choose a pet and ask about care needs.",
  ],
};

export function getScenarioStarters(language: Language, nativeLanguage: NativeLanguage = "ko"): ScenarioStarter[] {
  // Korean descriptions (original)
  const descriptionsKo: Record<Language, string[]> = {
    en: [
      "취업 면접 연습입니다. 면접관이 질문을 합니다. 자기소개부터 시작해보세요.",
      "공항 체크인 카운터입니다. 탑승권과 수하물 관련 대화를 연습합니다.",
      "부동산 투어입니다. 집주인이 아파트를 보여주고 있습니다. 궁금한 점을 물어보세요.",
      "카페에서 음료를 주문합니다. 바리스타와 가벼운 대화를 나눠보세요.",
      "호텔 프론트에서 체크인을 합니다. 방 요청이나 주변 관광지를 물어보세요.",
      "마트에서 물건을 찾고 있습니다. 직원에게 도움을 요청해보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설을 안내하고 회원권을 설명합니다.",
      "휴대폰이 고장났습니다. 수리 기사에게 증상을 설명해보세요.",
      "레스토랑에 전화로 예약을 합니다. 날짜, 인원, 메뉴를 확인해보세요.",
      "우체국에서 해외로 소포를 보냅니다. 배송 옵션을 확인해보세요.",
      "렌터카 업체에서 차를 빌립니다. 차종과 보험에 대해 물어보세요.",
      "새로 이사 온 이웃을 만났습니다. 자기소개를 하고 동네에 대해 물어보세요.",
      "도서관에서 책을 찾고 있습니다. 사서에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
    ],
    es: [
      "멕시코시티의 야외 시장입니다. 과일과 채소를 파는 상인과 흥정하며 대화해보세요.",
      "마드리드의 타파스 바입니다. 웨이터가 추천 메뉴를 소개합니다. 주문해보세요.",
      "약국에 왔습니다. 약사에게 증상을 설명하고 약을 구매해보세요.",
      "카페에서 음료를 주문합니다. 바리스타와 가볍게 대화해보세요.",
      "호텔에 체크인합니다. 방 상태와 주변 관광지를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 도움을 요청해보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설과 회원권을 설명합니다.",
      "자동차가 고장났습니다. 정비사에게 문제를 설명해보세요.",
      "미용실에 왔습니다. 원하는 스타일을 설명해보세요.",
      "우체국에서 해외로 소포를 보냅니다. 배송 방법을 물어보세요.",
      "렌터카 업체에서 차를 빌립니다. 옵션과 보험을 확인해보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네에 대해 물어보세요.",
      "도서관에서 책을 찾고 있습니다. 사서에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
    ],
    fr: [
      "프랑스 빵집(불랑제리)입니다. 빵과 페이스트리를 골라보세요.",
      "프랑스 야외 시장입니다. 치즈와 샤르퀴트리를 파는 상인과 대화해보세요.",
      "기차역 매표소입니다. 표를 사고 노선을 확인해보세요.",
      "파리의 카페에서 음료를 주문합니다. 바리스타와 대화해보세요.",
      "호텔에 체크인합니다. 방 상태와 주변 볼거리를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 코치가 시설을 안내합니다.",
      "자동차가 고장났습니다. 정비사에게 문제를 설명해보세요.",
      "미용실에 왔습니다. 원하는 스타일을 설명해보세요.",
      "우체국에서 소포를 보냅니다. 배송 옵션을 확인해보세요.",
      "렌터카에서 차를 빌립니다. 차종과 보험을 물어보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네를 물어보세요.",
      "도서관에서 책을 찾고 있습니다. 사서에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
    ],
    zh: [
      "중국 식당에 왔습니다. 웨이터에게 메뉴를 보고 주문해보세요.",
      "베이징에서 택시를 탔습니다. 기사와 목적지, 경로에 대해 이야기해보세요.",
      "병원에 왔습니다. 의사에게 증상을 설명해보세요.",
      "카페에서 음료를 주문합니다. 직원과 대화해보세요.",
      "호텔 프론트에서 체크인합니다. 방과 주변 관광지를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 직원이 시설을 안내합니다.",
      "휴대폰이 고장났습니다. 수리 기사에게 문제를 설명해보세요.",
      "이발소에 왔습니다. 원하는 스타일을 말해보세요.",
      "택배를 보내러 왔습니다. 배송 방법을 물어보세요.",
      "기차역에서 표를 삽니다. 시간과 좌석을 확인해보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네에 대해 물어보세요.",
      "도서관에서 책을 찾고 있습니다. 직원에게 도움을 요청해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
    ],
    ja: [
      "편의점에 왔습니다. 점원에게 도시락이나 상품에 대해 물어보세요.",
      "이자카야(일본식 선술집)에 왔습니다. 메뉴를 보고 주문해보세요.",
      "부동산에서 방을 찾고 있습니다. 조건을 말하고 물어보세요.",
      "카페에서 음료를 주문합니다. 점원과 가볍게 대화해보세요.",
      "호텔에 체크인합니다. 프론트 직원과 대화해보세요.",
      "슈퍼에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설을 안내합니다.",
      "휴대폰이 고장났습니다. 수리 직원에게 증상을 설명해보세요.",
      "미용실에 왔습니다. 원하는 스타일을 설명해보세요.",
      "우체국에서 소포를 보냅니다. 배송 방법을 확인해보세요.",
      "렌터카에서 차를 빌립니다. 차종과 보험을 물어보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네에 대해 물어보세요.",
      "도서관에서 책을 찾고 있습니다. 사서에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
    ],
    de: [
      "독일 빵집(Bäckerei)입니다. 빵, 프레첼, 페이스트리를 골라보세요.",
      "독일 주간 시장입니다. 농산물과 소시지를 파는 상인과 대화해보세요.",
      "기차역 매표소입니다. 표를 사고 환승을 확인해보세요.",
      "병원에 왔습니다. 의사에게 증상을 설명해보세요.",
      "슈탐티쉬(Stammtisch) 모임입니다. 맥주를 마시며 사람들과 대화해보세요.",
      "독일 카페에서 음료를 주문합니다. 바리스타와 대화해보세요.",
      "호텔에 체크인합니다. 방 상태와 주변 볼거리를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설과 회원권을 안내합니다.",
      "휴대폰이 고장났습니다. 수리 기사에게 문제를 설명해보세요.",
      "미용실에 왔습니다. 원하는 스타일을 설명해보세요.",
      "우체국에서 소포를 보냅니다. 배송 옵션을 확인해보세요.",
      "렌터카에서 차를 빌립니다. 차종과 보험을 물어보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네를 물어보세요.",
      "도서관에서 책을 찾고 있습니다. 사서에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터(Fundbüro)에 왔습니다. 잃어버린 물건을 찾아보세요.",
    ],
    ko: [
      "카페에 왔습니다. 음료를 주문하고 바리스타와 대화해보세요.",
      "한국 식당에 왔습니다. 메뉴를 보고 주문해보세요.",
      "병원에 왔습니다. 의사에게 증상을 설명해보세요.",
      "부동산에서 방을 찾고 있습니다. 보증금과 월세를 상담해보세요.",
      "미용실에 왔습니다. 원하는 스타일을 설명해보세요.",
      "호텔에 체크인합니다. 방과 주변 관광지를 물어보세요.",
      "마트에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설과 회원권을 안내합니다.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "우체국에서 소포를 보냅니다. 배송 방법을 물어보세요.",
      "서점에서 책을 찾고 있습니다. 직원에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
      "지하철역에서 길을 모릅니다. 옆 사람에게 노선을 물어보세요.",
      "약국에 왔습니다. 증상을 설명하고 약을 구매해보세요.",
      "핸드폰 매장에 왔습니다. 고장 증상을 설명하고 수리를 요청해보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네에 대해 물어보세요.",
      "세탁소에 왔습니다. 옷을 맡기고 세탁 옵션을 확인해보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
    ],
  };

  const descriptions = nativeLanguage === "en" ? SCENARIO_DESCRIPTIONS_EN : descriptionsKo;

  // Opening lines in target language (shared across native languages)
  const openings: Record<Language, string[]> = {
    en: [
      "Let's practice a job interview. I'll be the interviewer. So, tell me about yourself.",
      "Welcome to the check-in counter. May I see your passport and booking confirmation?",
      "Hi there! Come on in. Let me show you around the apartment.",
      "Hey, welcome! What can I get started for you today? We've got a new seasonal latte if you're interested.",
      "Good evening! Welcome to the Grand Hotel. Do you have a reservation with us?",
      "Hi, can I help you find something? We just rearranged a few aisles, so things might be in a different spot.",
      "Welcome to FitLife! Is this your first time here? Let me show you around the facilities.",
      "Hi there, what seems to be the problem with your phone? Let me take a look.",
      "Thank you for calling The Garden Restaurant. How can I help you today?",
      "Next, please! How can I help you today? Sending or picking up?",
      "Welcome to QuickRent! Are you here to pick up a reservation, or would you like to browse our available cars?",
      "Oh hi! You must be the new neighbor. I'm Alex from next door. Nice to finally meet you!",
      "Hello! Are you looking for something specific, or would you like some recommendations?",
      "Hi! What movie are you here to see? We've got a couple of great new releases this week.",
      "Welcome! Are you looking for a new furry friend? We just got some adorable puppies in.",
      "Hi there! Can I help you find anything? We have a sale on jackets this week.",
      "Good morning! How can I help you today? Are you looking to open an account or make a transaction?",
      "Please have a seat. So what brings you in today? Any pain or discomfort?",
      "Welcome! Are you planning a trip? Do you have a destination in mind, or would you like some suggestions?",
      "Hello, how can I help you? Did you lose something? Can you describe the item for me?",
    ],
    es: [
      "¡Buenos días! Bienvenido al mercado. ¿Qué le puedo ofrecer hoy? Tenemos frutas frescas.",
      "¡Hola! Bienvenido al bar. ¿Qué les apetece? Hoy tenemos unas gambas al ajillo buenísimas.",
      "Buenas tardes. ¿En qué puedo ayudarle? ¿Necesita algo para el dolor de cabeza?",
      "¡Hola! Bienvenido a nuestra cafetería. ¿Qué te apetece tomar? Hoy tenemos un café especial de Colombia.",
      "¡Buenas noches! Bienvenido al Hotel Sol. ¿Tiene reserva a su nombre?",
      "¡Hola! ¿Busca algo en particular? Hoy tenemos ofertas especiales en la sección de lácteos.",
      "¡Bienvenido al gimnasio! ¿Es la primera vez que vienes? Te puedo enseñar las instalaciones.",
      "Buenos días. ¿Qué le pasa al coche? Cuénteme los síntomas y le echo un vistazo.",
      "¡Hola! Bienvenida. ¿Qué te gustaría hacerte hoy? ¿Un corte, color, o los dos?",
      "Buenos días. ¿Qué necesita enviar? ¿Es un paquete nacional o internacional?",
      "¡Bienvenido! ¿Tiene una reserva o quiere ver los coches disponibles?",
      "¡Hola! Tú debes ser el nuevo vecino. Yo soy María, vivo en el piso de al lado. ¡Mucho gusto!",
      "¡Hola! ¿Busca algún libro en especial o le puedo recomendar algo?",
      "¡Hola! ¿Qué película quiere ver? Esta semana tenemos varios estrenos muy buenos.",
      "¡Bienvenido! ¿Busca una mascota? Acabamos de recibir unos gatitos preciosos.",
      "¡Hola! ¿Le puedo ayudar en algo? Esta semana tenemos descuento en chaquetas.",
      "Buenos días. ¿En qué puedo ayudarle? ¿Quiere abrir una cuenta o hacer una transferencia?",
      "Siéntese, por favor. ¿Qué le trae por aquí hoy? ¿Tiene algún dolor?",
      "¡Bienvenido! ¿Está planeando un viaje? ¿Tiene algún destino en mente?",
      "Hola, ¿en qué puedo ayudarle? ¿Ha perdido algo? ¿Puede describir el objeto?",
    ],
    fr: [
      "Bonjour ! Bienvenue à la boulangerie. Qu'est-ce qui vous ferait plaisir aujourd'hui ? Les croissants sont tout frais.",
      "Bonjour et bienvenue ! C'est la première fois que vous venez au marché ? Goûtez ce fromage, il est excellent.",
      "Bonjour, bienvenue à bord. Votre billet, s'il vous plaît. Vous allez jusqu'à Lyon ?",
      "Bonjour ! Qu'est-ce que je vous sers ? On a un très bon expresso aujourd'hui.",
      "Bonsoir ! Bienvenue à l'Hôtel Lumière. Vous avez une réservation ?",
      "Bonjour ! Vous cherchez quelque chose en particulier ? On a des promotions sur les produits frais cette semaine.",
      "Bienvenue ! C'est votre première visite ? Je vais vous faire faire le tour des installations.",
      "Bonjour ! Qu'est-ce qui ne va pas avec votre voiture ? Expliquez-moi les symptômes.",
      "Bonjour ! Qu'est-ce que vous aimeriez comme coupe aujourd'hui ?",
      "Bonjour ! Vous souhaitez envoyer un colis ? C'est en France ou à l'international ?",
      "Bienvenue ! Vous avez une réservation ou vous souhaitez voir nos véhicules disponibles ?",
      "Oh bonjour ! Vous venez d'emménager ? Je suis Sophie, votre voisine du troisième. Enchantée !",
      "Bonjour ! Vous cherchez un livre en particulier ou je peux vous conseiller quelque chose ?",
      "Bonsoir ! Quel film voulez-vous voir ? On a plusieurs nouveautés cette semaine.",
      "Bonjour ! Vous cherchez un compagnon ? On vient de recevoir des chatons adorables.",
      "Bonjour ! Je peux vous aider ? On a des soldes sur les manteaux cette semaine.",
      "Bonjour ! Comment puis-je vous aider ? Vous souhaitez ouvrir un compte ou faire un virement ?",
      "Installez-vous. Alors, qu'est-ce qui vous amène aujourd'hui ? Vous avez des douleurs ?",
      "Bienvenue ! Vous préparez un voyage ? Vous avez une destination en tête ?",
      "Bonjour ! Vous avez perdu quelque chose ? Pouvez-vous me décrire l'objet ?",
    ],
    zh: [
      "欢迎光临！请问几位？我带您到座位。今天有几道特价菜，要不要看看？",
      "您好，请问去哪里？哦，那个地方我知道，大概二十分钟到。",
      "请坐。今天哪里不舒服？什么时候开始的？",
      "您好，欢迎光临！想喝点什么？我们今天有新出的拿铁，要不要试试？",
      "晚上好！欢迎入住。请问您有预订吗？",
      "您好！需要帮忙吗？今天牛奶和水果都在打折。",
      "欢迎！是第一次来吗？我带您参观一下我们的设施。",
      "您好，手机怎么了？什么时候开始出问题的？",
      "欢迎！今天想剪什么样的发型？",
      "您好！要寄快递吗？寄到哪里？国内还是国际？",
      "您好，请问要买去哪里的票？什么时候出发？",
      "你好！你是刚搬来的吧？我是隔壁的小王，欢迎欢迎！",
      "您好！需要找什么书吗？我可以帮您查一下。",
      "您好！想看什么电影？这周有几部新片上映，都不错。",
      "欢迎！想养宠物吗？我们刚到了一批小猫，特别可爱。",
      "您好！需要帮忙吗？这周外套打八折。",
      "您好！请问要办什么业务？开户还是转账？",
      "请坐。今天哪颗牙不舒服？疼了多久了？",
      "欢迎！想去哪里旅游？有没有想好目的地？",
      "您好！丢了什么东西吗？能描述一下吗？",
    ],
    ja: [
      "いらっしゃいませ！温かいお弁当はいかがですか？今日は新しいからあげ弁当がありますよ。",
      "いらっしゃいませ！何名様ですか？飲み放題もありますが、いかがなさいますか？",
      "はじめまして。本日はどのようなお部屋をお探しですか？駅からの距離はどれくらいがよろしいですか？",
      "いらっしゃいませ！ご注文はお決まりですか？今日のおすすめはキャラメルラテです。",
      "こんばんは。ご予約はされていますか？お名前をお伺いしてもよろしいですか？",
      "いらっしゃいませ！何かお探しですか？今日は卵と牛乳がお買い得ですよ。",
      "ようこそ！初めてのご来店ですか？施設をご案内しますね。",
      "いらっしゃいませ。どのような問題がありますか？いつ頃から調子が悪いですか？",
      "こんにちは！今日はどんな感じにしましょうか？カットだけですか？",
      "こんにちは。お荷物の発送ですか？国内宛てですか、海外宛てですか？",
      "いらっしゃいませ！ご予約はございますか？それとも当日のご利用でしょうか？",
      "あ、こんにちは！お隣に引っ越してきたんですね。私は田中です、よろしくお願いします。",
      "こんにちは。何かお探しの本はありますか？おすすめもできますよ。",
      "いらっしゃいませ！何の映画をご覧になりますか？今週は新作が何本かありますよ。",
      "いらっしゃいませ！ペットをお探しですか？子猫が新しく入りましたよ、とてもかわいいです。",
      "いらっしゃいませ！何かお探しですか？今週はコートがセール中です。",
      "おはようございます。本日はどのようなご用件でしょうか？口座開設でしょうか？",
      "お座りください。今日はどうされましたか？どこか痛いところはありますか？",
      "いらっしゃいませ！旅行をお考えですか？行きたい場所はもう決まっていますか？",
      "こんにちは。何かなくされましたか？どんな物か教えていただけますか？",
    ],
    de: [
      "Guten Morgen! Willkommen in der Bäckerei. Was darf es sein? Die Brezeln sind heute ganz frisch.",
      "Hallo! Willkommen auf dem Markt. Darf ich Ihnen etwas anbieten? Die Tomaten sind heute besonders gut.",
      "Guten Tag! Wohin möchten Sie fahren? Soll ich mal die Verbindungen nachschauen?",
      "Guten Tag, nehmen Sie bitte Platz. Was führt Sie heute zu mir? Welche Beschwerden haben Sie?",
      "Na, setz dich doch! Magst du ein Bier? Wir reden hier gerade über das Fußballspiel gestern.",
      "Hallo! Willkommen im Café. Was darf ich Ihnen bringen? Wir haben heute einen tollen Cappuccino.",
      "Guten Abend! Willkommen im Hotel. Haben Sie eine Reservierung?",
      "Hallo! Kann ich Ihnen helfen? Diese Woche haben wir Sonderangebote bei den Milchprodukten.",
      "Willkommen im Fitnessstudio! Sind Sie zum ersten Mal hier? Ich zeige Ihnen gerne alles.",
      "Hallo! Was ist denn mit Ihrem Handy passiert? Seit wann haben Sie das Problem?",
      "Hallo! Was darf es heute sein? Nur schneiden oder auch Farbe?",
      "Guten Tag! Möchten Sie ein Paket verschicken? Innerhalb Deutschlands oder ins Ausland?",
      "Willkommen! Haben Sie eine Reservierung oder möchten Sie sich unsere Fahrzeuge ansehen?",
      "Oh hallo! Sie sind bestimmt der neue Nachbar. Ich bin Thomas von nebenan. Herzlich willkommen!",
      "Guten Tag! Suchen Sie etwas Bestimmtes oder darf ich Ihnen etwas empfehlen?",
      "Hallo! Welchen Film möchten Sie sehen? Diese Woche laufen ein paar richtig gute Filme.",
      "Willkommen! Suchen Sie ein Haustier? Wir haben gerade süße Kaninchen bekommen.",
      "Hallo! Kann ich Ihnen helfen? Diese Woche haben wir Jacken im Angebot.",
      "Guten Tag! Wie kann ich Ihnen helfen? Möchten Sie ein Konto eröffnen oder eine Überweisung machen?",
      "Bitte nehmen Sie Platz. Was führt Sie heute zu uns? Haben Sie Schmerzen?",
      "Willkommen! Planen Sie eine Reise? Haben Sie schon ein Reiseziel im Kopf?",
      "Guten Tag! Haben Sie etwas verloren? Können Sie mir den Gegenstand beschreiben?",
    ],
    ko: [
      "어서오세요! 뭐 드릴까요? 오늘 새로 나온 딸기 라떼 한번 드셔보실래요?",
      "어서오세요! 몇 분이세요? 메뉴판 여기 있습니다. 오늘 추천 메뉴는 김치찌개예요.",
      "안녕하세요, 앉으세요. 오늘 어디가 불편하세요? 언제부터 그러셨어요?",
      "안녕하세요! 어떤 방을 찾고 계세요? 원룸이요, 아니면 투룸이요? 예산은 어느 정도 생각하세요?",
      "어서오세요! 오늘 어떤 스타일로 해드릴까요? 커트만 하실 건가요?",
      "안녕하세요! 체크인하시려고요? 성함이 어떻게 되세요?",
      "어서오세요! 뭐 찾으시는 거 있으세요? 오늘 과일이랑 유제품 할인 중이에요.",
      "안녕하세요! 처음 오셨어요? 제가 시설 안내해드릴게요. 따라오세요!",
      "안녕하세요. 어떤 업무 보시러 오셨어요? 계좌 개설이요, 아니면 송금이요?",
      "안녕하세요! 택배 보내시려고요? 어디로 보내실 건가요?",
      "어서오세요! 어떤 책 찾으세요? 요즘 인기 있는 책 추천해드릴까요?",
      "안녕하세요! 어떤 영화 보실 건가요? 이번 주 신작 꽤 괜찮아요.",
      "앉으세요. 어디가 아프세요? 언제부터 아프셨어요?",
      "어서오세요! 여행 계획 중이세요? 어디로 가고 싶으세요?",
      "안녕하세요. 뭘 잃어버리셨어요? 어떤 물건인지 설명해주실 수 있어요?",
      "저기요, 혹시 이 근처 잘 아세요? 시청역 가려면 몇 호선 타야 해요?",
      "어서오세요. 어디가 불편하세요? 증상을 말씀해주시면 약을 추천해드릴게요.",
      "어서오세요! 핸드폰 문제가 있으세요? 어떤 증상인지 말씀해주세요.",
      "안녕하세요! 옆집에 새로 이사 오셨죠? 저는 옆집 사는 김민수라고 해요. 반가워요!",
      "어서오세요! 세탁물 맡기시려고요? 어떤 옷이에요? 한번 볼게요.",
      "어서오세요! 뭐 찾으시는 거 있으세요? 이번 주 겨울 코트 세일 중이에요.",
      "어서오세요! 반려동물 찾으세요? 이번에 새끼 고양이들이 새로 들어왔어요, 정말 귀여워요.",
    ],
  };

  const descs = descriptions[language];
  const opens = openings[language];
  return descs.map((description, i) => ({ description, opening: opens[i] }));
}
