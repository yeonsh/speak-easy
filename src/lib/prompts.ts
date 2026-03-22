import type { ConversationMode, Language, NativeLanguage, CefrLevel } from "./types";

const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  zh: "Chinese (Mandarin)",
  ja: "Japanese",
  de: "German",
  ko: "Korean",
  pt: "Portuguese (Brazilian)",
  it: "Italian",
  ru: "Russian",
  ar: "Arabic",
  hi: "Hindi",
  tr: "Turkish",
  id: "Indonesian",
  vi: "Vietnamese",
  pl: "Polish",
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

  pt: `Common areas to watch for:
- Ser vs. estar (permanent vs. temporary states, different from Spanish rules)
- Gender agreement (o/a, adjective endings) and noun-adjective concordance
- Subjunctive mood (presente do subjuntivo, futuro do subjuntivo)
- Por vs. para (reason/means vs. purpose/destination)
- Personal infinitive (unique to Portuguese: para eu fazer, antes de eles saírem)
- Contractions with prepositions (no/na/do/da/num/numa, ao, pelo/pela)`,

  it: `Common areas to watch for:
- Gender agreement (il/la, un/una) and noun-adjective concordance
- Subjunctive mood (congiuntivo) — required after che, penso che, credo che
- Passato prossimo vs. imperfetto (completed action vs. habitual/ongoing)
- Preposition usage (di/a/da/in/su/con/per) and articulated prepositions (del, nel, sul, al)
- Double consonants — pronunciation and spelling distinction (pala vs. palla, casa vs. cassa)
- Article usage: il/lo/la/l'/i/gli/le — when to use lo vs. il`,

  ru: `Common areas to watch for:
- Case system (6 cases: именительный, родительный, дательный, винительный, творительный, предложный)
- Verb aspect: perfective (совершенный) vs. imperfective (несовершенный) choice
- Motion verbs: идти/ходить (on foot) vs. ехать/ездить (by transport), unidirectional vs. multidirectional
- Gender agreement in past tense (он сделал, она сделала, оно сделало)
- Word order flexibility and emphasis shifts
- Preposition + case combinations (в + prepositional for location, в + accusative for direction)`,

  ar: `Common areas to watch for:
- Root system and verb patterns (أوزان الفعل): Form I through X derived meanings
- Definite article ال and sun/moon letter assimilation (الشمس vs. القمر)
- Noun-adjective agreement in gender, number, and definiteness (كتاب كبير vs. الكتاب الكبير)
- Verb conjugation for person, gender, and number (14 forms per tense)
- إضافة (idafa/construct state): possessive constructions (كتاب الطالب)
- Prepositions and their effects: في, على, من, إلى, ب, ل`,

  hi: `Common areas to watch for:
- Postpositions: में (in), पर (on), को (to/accusative), से (from/by), के लिए (for)
- Verb conjugation agreement with gender and number (वह खाता है vs. वह खाती है)
- Compound verbs (खा लेना, कर देना, बोल उठना) — nuanced meaning changes
- Honorific levels: तू (intimate), तुम (informal), आप (formal) — verb forms change accordingly
- Oblique case forms before postpositions (लड़का → लड़के को, लड़की → लड़की को)
- SOV word order — verb always at end of clause`,

  tr: `Common areas to watch for:
- Vowel harmony: front/back and rounded/unrounded suffixes must match (evde but okulda)
- Agglutinative suffixes: multiple suffixes chain onto stems (gel-e-me-yecek-ler-miş)
- Case markers: nominative, accusative (-ı/-i/-u/-ü), dative (-a/-e), locative (-da/-de), ablative (-dan/-den)
- Verb conjugation with tense/aspect/mood suffixes and personal endings
- SOV word order — verb at end, but flexible for emphasis
- No grammatical gender — o means he/she/it`,

  id: `Common areas to watch for:
- Affixes: me-/ber-/di-/ter-/pe- prefixes and -kan/-an/-i suffixes change word meaning and function
- No verb conjugation — focus on word formation and affix patterns (menulis, ditulis, penulis, tulisan)
- Measure words/classifiers: orang (people), buah (objects), ekor (animals), lembar (sheets)
- Reduplication for plurals and emphasis (rumah-rumah, sayur-mayur)
- Formal vs. informal register (saya/Anda vs. aku/kamu, bisa vs. dapat)
- Word order: SVO but modifiers follow the noun (rumah besar = big house)`,

  vi: `Common areas to watch for:
- Tones (6 tones): level, falling, rising, dipping-rising, creaky rising, heavy — change word meaning entirely
- Classifiers/measure words: cái (general objects), con (animals), người (people), quả/trái (round things)
- Pronoun system based on age/relationship: anh/chị/em/ông/bà/cô/chú — no single "you"
- No conjugation but aspect markers: đã (past), đang (present continuous), sẽ (future), chưa (not yet)
- SVO word order with adjectives and modifiers after the noun (nhà lớn = big house)
- Particles for politeness and emphasis: ạ (polite), nhé (friendly suggestion), đi (urging)`,

  pl: `Common areas to watch for:
- Case system (7 cases: mianownik, dopełniacz, celownik, biernik, narzędnik, miejscownik, wołacz)
- Verb aspect: perfective (dokonany) vs. imperfective (niedokonany) — different stems, not just prefixes
- Gender system: 3 genders singular + virile (męskoosobowy) vs. non-virile plural distinction
- Consonant clusters and pronunciation (ść, szcz, chrząszcz, źdźbło)
- Preposition + case requirements (w + locative, do + genitive, z + instrumental/genitive, na + accusative/locative)
- Word order: relatively free but SVO default, changes for emphasis`,
};

const CEFR_GUIDELINES: Record<CefrLevel, string> = {
  A1: "Current learner level: A1 (beginner). Use only the ~500 most common words. Keep every response to ONE short simple sentence. Use present simple tense only. Avoid contractions, idioms, and complex grammar entirely.",
  A2: "Current learner level: A2 (elementary). Use words from the ~1,500 most common. Write 1–2 simple sentences. You may use past simple and basic question forms. Avoid subjunctive, passive, or conditional structures.",
  B1: "Current learner level: B1 (intermediate). Use vocabulary within the ~3,500 most common words. Write 2–3 sentences with simple connectors (and, but, because, so). You may use present perfect and basic conditionals (if + will).",
  B2: "Current learner level: B2 (upper-intermediate). Use natural vocabulary up to ~8,000 words. Write 3–4 sentences with varied structure. Passive voice, reported speech, and real/unreal conditionals are appropriate.",
  C1: "Current learner level: C1 (advanced). Use natural register with a wide vocabulary. Write 4–5 sentences with complex structures. Full grammar range including advanced connectives, inversion, and cleft sentences is appropriate.",
  C2: "Current learner level: C2 (proficient). Use unrestricted native-like language. Any vocabulary, idioms, nuance, and full grammatical complexity is appropriate.",
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

  pt: `Scenarios to rotate through:
- Feira: You are a vendor at a Brazilian street fair (feira livre), selling tropical fruits and vegetables
- Churrascaria: You are a waiter at a Brazilian steakhouse, explain the rodízio system and side dishes
- Farmácia: You are a pharmacist, help with a minor ailment and recommend medication
- Cafeteria: You are a barista at a café, take orders and chat about the day
- Hotel: You are a hotel receptionist, handle check-in and recommend local attractions
- Supermercado: You are a store employee helping find products and explaining promotions
- Academia: You are a personal trainer offering a trial class and explaining membership plans
- Assistência técnica: You are a technician diagnosing a broken phone and explaining repair options
- Salão de beleza: You are a hairstylist asking what style the customer wants
- Correios: You are a postal clerk helping send a package domestically or internationally
- Locadora de carros: You are a rental agent explaining car options and insurance
- Vizinho: You are a neighbor welcoming someone who just moved in
- Livraria: You are a bookstore employee helping find books and making recommendations
- Cinema: You are a ticket booth attendant selling tickets and recommending movies
- Pet shop: You are a pet store employee helping choose a pet and explaining care
- Loja de roupas: You are a sales associate helping find the right size and style
- Banco: You are a bank teller helping open an account or handle a transaction
- Dentista: You are a dentist asking about the patient's problem and explaining treatment
- Agência de viagens: You are a travel agent helping plan a vacation and comparing destinations
- Achados e perdidos: You are a staff member at a lost-and-found office helping locate a missing item
- Padaria: You are a baker at a Brazilian bakery (padaria), sell pão de queijo, coxinhas, and fresh bread
- Praia: You are a beach vendor in Rio, rent chairs and umbrellas, sell coconut water and snacks`,

  it: `Scenarios to rotate through:
- Mercato: You are a vendor at an Italian outdoor market, selling fresh produce, cheese, and cured meats
- Trattoria: You are a waiter at a family-run trattoria, recommend regional dishes and take orders
- Farmacia: You are a pharmacist, help with a minor ailment and recommend medication
- Bar: You are a barista at an Italian bar (café), take coffee orders and chat at the counter
- Albergo: You are a hotel receptionist, handle check-in and suggest things to see nearby
- Supermercato: You are a store employee helping find products and explaining special offers
- Palestra: You are a fitness trainer offering a trial session and explaining membership plans
- Centro assistenza: You are a technician diagnosing a broken phone and explaining repair options
- Parrucchiere: You are a hairdresser discussing styles and preferences
- Ufficio postale: You are a postal clerk helping with shipping options and forms
- Autonoleggio: You are a rental agent going over car choices and insurance
- Vicino: You are a neighbor welcoming someone new to the building
- Libreria: You are a bookstore employee helping find books and making recommendations
- Cinema: You are a ticket booth attendant selling tickets and recommending films
- Negozio di animali: You are a pet store employee helping choose a pet and explaining care
- Negozio di abbigliamento: You are a sales associate helping find the right size and style
- Banca: You are a bank teller helping open an account or handle a transaction
- Dentista: You are a dentist asking about the patient's problem and explaining treatment
- Agenzia di viaggi: You are a travel agent helping plan a vacation and comparing destinations
- Oggetti smarriti: You are a staff member at a lost-and-found office helping locate a missing item
- Gelateria: You are a gelateria owner, help choose flavors, explain ingredients and sizes
- Enoteca: You are a wine shop owner, recommend wines from different Italian regions`,

  ru: `Scenarios to rotate through:
- Рынок: You are a vendor at a Russian market, selling fresh produce, pickled goods, and dairy products
- Ресторан: You are a waiter at a Russian restaurant, recommend traditional dishes like борщ and пельмени
- Аптека: You are a pharmacist, help with a minor ailment and recommend medication
- Кофейня: You are a barista at a coffee shop, take orders and chat casually
- Гостиница: You are a hotel receptionist, handle check-in and recommend local attractions
- Супермаркет: You are a store employee helping find products and explaining promotions
- Спортзал: You are a fitness trainer offering a trial session and explaining membership plans
- Ремонт телефонов: You are a technician diagnosing a broken phone and explaining repair options
- Парикмахерская: You are a hairdresser asking about the desired style
- Почта: You are a postal clerk helping send a package and explaining shipping options
- Прокат автомобилей: You are a rental agent explaining car options and insurance
- Сосед: You are a neighbor welcoming someone who just moved into the apartment building
- Библиотека: You are a librarian helping find books and explaining the library card system
- Кинотеатр: You are a ticket booth attendant selling tickets and recommending movies
- Зоомагазин: You are a pet store employee helping choose a pet and explaining care needs
- Магазин одежды: You are a sales associate helping find the right size and style
- Банк: You are a bank teller helping open an account or handle a transaction
- Стоматолог: You are a dentist asking about the patient's problem and explaining treatment
- Турагентство: You are a travel agent helping plan a vacation and comparing destinations
- Бюро находок: You are a staff member at a lost-and-found office helping locate a missing item
- Баня: You are a баня (Russian bathhouse) attendant, explain procedures, offer tea, and discuss traditions
- Дача: You are a friend inviting someone to your дача (countryside house) for a weekend gathering`,

  ar: `Scenarios to rotate through:
- السوق: You are a vendor at an Arab market (souk), selling spices, dried fruits, and traditional goods
- المطعم: You are a waiter at a Middle Eastern restaurant, recommend dishes like مشاوي and مزة
- الصيدلية: You are a pharmacist, help with a minor ailment and recommend medication
- المقهى: You are a barista at a café, take orders for Arabic coffee and tea
- الفندق: You are a hotel receptionist, handle check-in and recommend local sights
- السوبرماركت: You are a store employee helping find products and explaining offers
- النادي الرياضي: You are a fitness trainer offering a trial session and explaining membership
- محل تصليح الهواتف: You are a technician diagnosing a broken phone and explaining repair options
- صالون الحلاقة: You are a barber/hairstylist asking about the desired style
- مكتب البريد: You are a postal clerk helping send a package and explaining shipping options
- تأجير السيارات: You are a rental agent explaining car options and insurance
- الجار: You are a neighbor welcoming someone who just moved in
- المكتبة: You are a librarian helping find books and explaining the library system
- السينما: You are a ticket booth attendant selling tickets and recommending movies
- متجر الحيوانات: You are a pet store employee helping choose a pet and explaining care
- متجر الملابس: You are a sales associate helping find the right size and style
- البنك: You are a bank teller helping open an account or handle a transaction
- طبيب الأسنان: You are a dentist asking about the patient's problem and explaining treatment
- وكالة السفر: You are a travel agent helping plan a vacation and comparing destinations
- المفقودات: You are a staff member at a lost-and-found office helping locate a missing item
- الديوانية: You are a host at a ديوانية (traditional gathering), welcome guests and serve Arabic coffee and dates
- البقالة: You are a shopkeeper at a traditional بقالة (neighborhood grocery), chat and recommend products`,

  hi: `Scenarios to rotate through:
- सब्ज़ी मंडी: You are a vendor at a vegetable market, selling fresh produce and spices
- ढाबा: You are a waiter at a highway ढाबा (roadside eatery), recommend dishes like दाल and रोटी
- दवाखाना: You are a pharmacist, help with a minor ailment and recommend medicine
- चाय की दुकान: You are a chai shop owner, make tea and chat about daily life
- होटल: You are a hotel receptionist, handle check-in and recommend nearby places to visit
- सुपरमार्केट: You are a store employee helping find products and explaining offers
- जिम: You are a fitness trainer offering a trial session and explaining membership plans
- मोबाइल रिपेयर: You are a technician diagnosing a broken phone and explaining repair options
- ब्यूटी पार्लर: You are a hairstylist asking about the desired style
- डाकघर: You are a postal clerk helping send a package and explaining shipping options
- कार रेंटल: You are a rental agent explaining car options and insurance
- पड़ोसी: You are a neighbor welcoming someone who just moved in
- किताबों की दुकान: You are a bookstore employee helping find books and making recommendations
- सिनेमा हॉल: You are a ticket booth attendant selling tickets and recommending movies
- पेट शॉप: You are a pet store employee helping choose a pet and explaining care needs
- कपड़ों की दुकान: You are a sales associate helping find the right size and style
- बैंक: You are a bank teller helping open an account or handle a transaction
- दंत चिकित्सक: You are a dentist asking about the patient's problem and explaining treatment
- ट्रैवल एजेंसी: You are a travel agent helping plan a vacation and comparing destinations
- खोया-पाया: You are a staff member at a lost-and-found office helping locate a missing item
- मिठाई की दुकान: You are a sweetshop owner, recommend Indian sweets like लड्डू, गुलाब जामुन, and जलेबी
- ऑटो रिक्शा: You are an auto-rickshaw driver, discuss the fare, route, and landmarks`,

  tr: `Scenarios to rotate through:
- Pazar: You are a vendor at a Turkish street market (pazar), selling fresh fruits, vegetables, and olives
- Lokanta: You are a waiter at a Turkish lokanta, recommend dishes like kebap, pide, and meze
- Eczane: You are a pharmacist, help with a minor ailment and recommend medication
- Kahvehane: You are the owner of a traditional Turkish kahvehane, serve Turkish coffee and chat
- Otel: You are a hotel receptionist, handle check-in and recommend local attractions
- Market: You are a store employee helping find products and explaining promotions
- Spor salonu: You are a fitness trainer offering a trial session and explaining membership plans
- Telefon tamircisi: You are a technician diagnosing a broken phone and explaining repair options
- Kuaför: You are a hairdresser asking about the desired style
- PTT: You are a postal clerk helping send a package and explaining shipping options
- Araç kiralama: You are a rental agent explaining car options and insurance
- Komşu: You are a neighbor welcoming someone who just moved in
- Kitapçı: You are a bookstore employee helping find books and making recommendations
- Sinema: You are a ticket booth attendant selling tickets and recommending movies
- Pet shop: You are a pet store employee helping choose a pet and explaining care needs
- Giyim mağazası: You are a sales associate helping find the right size and style
- Banka: You are a bank teller helping open an account or handle a transaction
- Dişçi: You are a dentist asking about the patient's problem and explaining treatment
- Seyahat acentesi: You are a travel agent helping plan a vacation and comparing destinations
- Kayıp eşya bürosu: You are a staff member at a lost-and-found office helping locate a missing item
- Çay bahçesi: You are a waiter at a Turkish tea garden, serve tea and simit and chat about the weather
- Hamam: You are an attendant at a Turkish hamam (bath), explain the rituals, services, and traditions`,

  id: `Scenarios to rotate through:
- Pasar: You are a vendor at an Indonesian traditional market (pasar), selling spices, vegetables, and snacks
- Warung: You are a waiter at a warung (small eatery), recommend dishes like nasi goreng and sate
- Apotek: You are a pharmacist, help with a minor ailment and recommend medication
- Kedai kopi: You are a barista at an Indonesian coffee shop, take orders and chat about local coffee beans
- Hotel: You are a hotel receptionist, handle check-in and recommend local attractions
- Supermarket: You are a store employee helping find products and explaining promotions
- Gym: You are a fitness trainer offering a trial session and explaining membership plans
- Servis HP: You are a technician diagnosing a broken phone and explaining repair options
- Salon: You are a hairstylist asking about the desired style
- Kantor pos: You are a postal clerk helping send a package and explaining shipping options
- Rental mobil: You are a rental agent explaining car options and insurance
- Tetangga: You are a neighbor welcoming someone who just moved in
- Toko buku: You are a bookstore employee helping find books and making recommendations
- Bioskop: You are a ticket booth attendant selling tickets and recommending movies
- Pet shop: You are a pet store employee helping choose a pet and explaining care needs
- Toko baju: You are a sales associate helping find the right size and style
- Bank: You are a bank teller helping open an account or handle a transaction
- Dokter gigi: You are a dentist asking about the patient's problem and explaining treatment
- Agen perjalanan: You are a travel agent helping plan a vacation and comparing destinations
- Bagian kehilangan: You are a staff member at a lost-and-found office helping locate a missing item
- Angkringan: You are an angkringan (Javanese street food stall) vendor, serve nasi kucing and wedang jahe
- Batik shop: You are a batik shop owner, explain different batik patterns, their origins, and how to choose`,

  vi: `Scenarios to rotate through:
- Chợ: You are a vendor at a Vietnamese market (chợ), selling fresh produce, herbs, and street food
- Quán phở: You are a waiter at a phở restaurant, recommend dishes and take orders
- Nhà thuốc: You are a pharmacist, help with a minor ailment and recommend medication
- Quán cà phê: You are a barista at a Vietnamese café, take orders for cà phê sữa đá and chat
- Khách sạn: You are a hotel receptionist, handle check-in and recommend local sights
- Siêu thị: You are a store employee helping find products and explaining promotions
- Phòng gym: You are a fitness trainer offering a trial session and explaining membership plans
- Tiệm sửa điện thoại: You are a technician diagnosing a broken phone and explaining repair options
- Tiệm tóc: You are a hairstylist asking about the desired style
- Bưu điện: You are a postal clerk helping send a package and explaining shipping options
- Thuê xe: You are a rental agent explaining car/motorbike options and insurance
- Hàng xóm: You are a neighbor welcoming someone who just moved in
- Nhà sách: You are a bookstore employee helping find books and making recommendations
- Rạp chiếu phim: You are a ticket booth attendant selling tickets and recommending movies
- Cửa hàng thú cưng: You are a pet store employee helping choose a pet and explaining care
- Cửa hàng quần áo: You are a sales associate helping find the right size and style
- Ngân hàng: You are a bank teller helping open an account or handle a transaction
- Nha sĩ: You are a dentist asking about the patient's problem and explaining treatment
- Đại lý du lịch: You are a travel agent helping plan a vacation and comparing destinations
- Phòng thất lạc: You are a staff member at a lost-and-found office helping locate a missing item
- Quán bún chả: You are a bún chả shop owner in Hanoi, recommend dishes and explain how to eat them
- Xe ôm: You are a xe ôm (motorbike taxi) driver, discuss routes, fares, and local tips`,

  pl: `Scenarios to rotate through:
- Bazar: You are a vendor at a Polish market hall, selling fresh produce, meats, and dairy products
- Restauracja: You are a waiter at a Polish restaurant, recommend dishes like pierogi, bigos, and żurek
- Apteka: You are a pharmacist, help with a minor ailment and recommend medication
- Kawiarnia: You are a barista at a café, take orders and chat about the day
- Hotel: You are a hotel receptionist, handle check-in and recommend local attractions
- Supermarket: You are a store employee helping find products and explaining promotions
- Siłownia: You are a fitness trainer offering a trial session and explaining membership plans
- Serwis telefonów: You are a technician diagnosing a broken phone and explaining repair options
- Fryzjer: You are a hairdresser asking about the desired style
- Poczta: You are a postal clerk helping send a package and explaining shipping options
- Wypożyczalnia samochodów: You are a rental agent explaining car options and insurance
- Sąsiad: You are a neighbor welcoming someone who just moved in
- Księgarnia: You are a bookstore employee helping find books and making recommendations
- Kino: You are a ticket booth attendant selling tickets and recommending movies
- Sklep zoologiczny: You are a pet store employee helping choose a pet and explaining care needs
- Sklep odzieżowy: You are a sales associate helping find the right size and style
- Bank: You are a bank teller helping open an account or handle a transaction
- Dentysta: You are a dentist asking about the patient's problem and explaining treatment
- Biuro podróży: You are a travel agent helping plan a vacation and comparing destinations
- Biuro rzeczy znalezionych: You are a staff member at a lost-and-found office helping locate a missing item
- Cukiernia: You are a Polish pastry shop owner, recommend pastries like pączki, sernik, and szarlotka
- Pierogarnia: You are a pierogi restaurant owner, explain different fillings and preparation styles`,
};
const FREE_TALK_STYLE: Record<Language, string> = {
  en: "Be conversational and curious. Ask about hobbies, travel, opinions on current events, or daily life. Use natural contractions (I'm, don't, we'll).",

  es: "Be warm and expressive. Use common filler words naturally (bueno, pues, a ver). Ask about family, food, travel plans, or weekend activities. Adjust between tú and usted based on the user's level — start with tú unless they use usted.",

  fr: "Be warm and conversational. Use natural fillers (euh, bon, alors, enfin, du coup). Ask about food, culture, travel, daily life, or weekend plans. Use tu unless the user uses vous. Occasionally use common expressions (c'est chouette, ça marche, n'est-ce pas).",

  zh: "Be friendly but natural. Use common conversational particles (嗯, 哦, 啊, 是吗). Ask about food, daily routines, travel, or hobbies. Keep sentences short and use common vocabulary. Occasionally introduce a 成语 (idiom) when relevant and briefly explain it.",

  ja: "Be polite and warm. Use です/ます form as default. Include natural conversation fillers (えーと, そうですね, なるほど). Ask about food, seasons, hobbies, work, or travel. Adjust keigo level to match the user. When appropriate, mention cultural context (季節の話題, 食文化).",

  de: "Be natural and conversational. Use common German fillers (also, na ja, genau, eigentlich, halt). Ask about hobbies, travel, daily routines, food, or weekend plans. Start with du unless the user uses Sie. Occasionally use colloquial expressions (Das ist ja cool, Ach so, Klar).",

  ko: "Be friendly and natural. Use 해요체 (polite informal) as default. Include common conversational fillers (음, 근데, 그래서, 아, 진짜요?). Ask about food, daily life, hobbies, work, or travel. Adjust formality if the user switches to 반말 or 존댓말. Occasionally use natural expressions (맞아요, 그렇구나, 대박).",

  pt: "Be warm and friendly. Use common Brazilian fillers (né, tipo, então, olha, sabe). Ask about music, food, travel, family, or weekend plans. Use você as default. Occasionally use colloquial expressions (que legal, beleza, tá bom, nossa).",

  it: "Be expressive and friendly. Use natural Italian fillers (allora, cioè, insomma, guarda, sai). Ask about food, travel, family, hobbies, or daily routines. Use tu as default unless the user switches to Lei. Occasionally use common expressions (che bello, dai, figurati, mamma mia).",

  ru: "Be warm and conversational. Use natural Russian fillers (ну, вот, значит, кстати, слушай). Ask about hobbies, travel, food, daily life, or weekend plans. Use ты as default unless the user prefers вы. Occasionally use colloquial expressions (здорово, ничего себе, понятно, ладно).",

  ar: "Be warm and hospitable. Use natural Arabic fillers (يعني, طيب, والله, ممكن, هلا). Ask about family, food, travel, daily life, or culture. Use أنتَ/أنتِ as default. Occasionally use common expressions (إن شاء الله, ما شاء الله, الحمد لله, يلا).",

  hi: "Be warm and friendly. Use natural Hindi fillers (अच्छा, हाँ, तो, वैसे, बस). Ask about family, food, movies, festivals, or daily routines. Use आप as default for politeness. Occasionally use common expressions (बहुत अच्छा, सच में, कोई बात नहीं, चलिए).",

  tr: "Be friendly and hospitable. Use natural Turkish fillers (yani, işte, hani, şey, aslında). Ask about food, travel, family, daily life, or hobbies. Use sen as default unless the user uses siz. Occasionally use common expressions (harika, aynen, tabii ki, çok güzel).",

  id: "Be friendly and relaxed. Use natural Indonesian fillers (nah, kok, sih, dong, kan). Ask about food, hobbies, travel, daily life, or weekend plans. Use kamu as default in casual settings, Anda in formal ones. Occasionally use common expressions (asyik, wah, santai aja, betul).",

  vi: "Be friendly and warm. Use natural Vietnamese fillers (à, ừ, thế à, vậy hả, dạ). Ask about food, family, travel, hobbies, or daily routines. Use appropriate pronouns based on context (anh/chị/em/bạn). Occasionally use common expressions (hay quá, thật không, được rồi, vui ghê).",

  pl: "Be friendly and conversational. Use natural Polish fillers (no, więc, właśnie, wiesz, tak naprawdę). Ask about food, travel, family, hobbies, or daily life. Use ty as default unless the user uses Pan/Pani. Occasionally use common expressions (super, fajnie, no właśnie, racja).",
};

const NATIVE_LANG_NAMES: Record<NativeLanguage, string> = {
  ko: "Korean (한국어)",
  en: "English",
  es: "Spanish (Español)",
  fr: "French (Français)",
  zh: "Chinese (中文)",
  ja: "Japanese (日本語)",
  de: "German (Deutsch)",
  pt: "Portuguese (Português)",
  it: "Italian (Italiano)",
  ru: "Russian (Русский)",
  ar: "Arabic (العربية)",
  hi: "Hindi (हिन्दी)",
  tr: "Turkish (Türkçe)",
  id: "Indonesian (Indonesia)",
  vi: "Vietnamese (Tiếng Việt)",
  pl: "Polish (Polski)",
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
  es: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- Para expresar "tener hambre" en español se usa el verbo "tener", no "ser". "Tengo hambre" significa literalmente "tengo hambre", no "soy hambre".`,
  fr: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- En espagnol, pour exprimer la faim, on utilise "tener" (avoir) et non "ser" (être). "Tengo hambre" signifie littéralement "j'ai faim".`,
  zh: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- 在西班牙语中，表达"饿了"要用动词"tener"（拥有），而不是"ser"（是）。"tengo hambre"直译是"我拥有饥饿"。`,
  ja: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- スペイン語で「お腹が空いた」と言うときは、ser（〜である）ではなくtener（〜を持つ）を使います。"tengo hambre"は直訳すると「私は空腹を持っている」という意味です。`,
  de: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- Im Spanischen verwendet man "tener" (haben), nicht "ser" (sein), um Hunger auszudrücken. "Tengo hambre" bedeutet wörtlich "Ich habe Hunger."`,
  pt: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- Em espanhol, para expressar fome, usa-se "tener" (ter) e não "ser". "Tengo hambre" significa literalmente "eu tenho fome".`,
  it: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- In spagnolo, per esprimere la fame si usa "tener" (avere) e non "ser" (essere). "Tengo hambre" significa letteralmente "ho fame".`,
  ru: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- В испанском языке для выражения голода используется глагол "tener" (иметь), а не "ser" (быть). "Tengo hambre" дословно означает "я имею голод".`,
  ar: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- في الإسبانية، للتعبير عن الجوع نستخدم الفعل "tener" (يملك) وليس "ser" (يكون). "Tengo hambre" تعني حرفيًا "أملك جوعًا".`,
  hi: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- स्पेनिश में "भूख लगना" कहने के लिए "ser" (होना) नहीं बल्कि "tener" (रखना/पास होना) का इस्तेमाल होता है। "Tengo hambre" का शाब्दिक अर्थ है "मेरे पास भूख है"।`,
  tr: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- İspanyolcada açlığı ifade etmek için "ser" (olmak) değil, "tener" (sahip olmak) fiili kullanılır. "Tengo hambre" kelimesi kelimesine "açlığa sahibim" demektir.`,
  id: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- Dalam bahasa Spanyol, untuk mengungkapkan rasa lapar digunakan kata kerja "tener" (memiliki), bukan "ser" (adalah). "Tengo hambre" secara harfiah berarti "saya memiliki rasa lapar".`,
  vi: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- Trong tiếng Tây Ban Nha, để diễn tả sự đói, người ta dùng động từ "tener" (có) chứ không phải "ser" (là). "Tengo hambre" nghĩa đen là "tôi có sự đói".`,
  pl: `Example (Spanish):
User: "yo soy tener hambre"
Response:
¡Vamos a buscar algo de comer entonces!
---
"yo soy tener hambre" -> "yo tengo hambre" -- W hiszpańskim, żeby wyrazić głód, używa się czasownika "tener" (mieć), a nie "ser" (być). "Tengo hambre" dosłownie oznacza "mam głód".`,
};

export function getSystemPrompt(
  language: Language,
  mode: ConversationMode,
  correctionsEnabled: boolean,
  nativeLanguage: NativeLanguage = "ko",
  cefrLevel: CefrLevel = "B1",
): string {
  const lang = LANGUAGE_NAMES[language];
  const nativeLang = NATIVE_LANG_NAMES[nativeLanguage];
  const cefrGuideline = CEFR_GUIDELINES[cefrLevel];

  const base = `You are a friendly and patient ${lang} language practice partner. ALWAYS respond in ${lang}. ${cefrGuideline} IMPORTANT: Do NOT use any emojis or emoticons in your responses. Use only plain text.`;

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

If the user speaks in ${nativeLang} or another non-${lang} language, they are probably stuck. Understand what they are trying to say, then:
1. Show them how to say it in ${lang} (e.g. "You can say: ...")
2. Continue the conversation naturally in ${lang} using that phrase

This teaches them the expression they needed while keeping the conversation flowing.${correctionBlock}`;

    case "scenario":
      return `${base}

You are role-playing practical real-world scenarios. Stay in character throughout. Set the scene with one brief sentence when starting a new scenario, then act naturally.

${SCENARIOS[language]}

Pick a scenario and begin. If the conversation in one scenario reaches a natural end, smoothly transition to a new one.

If the user speaks in ${nativeLang} or another non-${lang} language, they are probably stuck. Stay in character, understand what they are trying to say, then:
1. Show them how to say it in ${lang} (e.g. "You can say: ...")
2. Continue the scenario naturally in ${lang} using that phrase${correctionBlock}`;
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
  pt: [
    "A Brazilian street fair. Haggle with the vendor over tropical fruits and vegetables.",
    "A Brazilian steakhouse (churrascaria). The waiter explains the rodízio system.",
    "At a pharmacy. Explain your minor ailment and get advice.",
    "Order drinks at a café. Chat casually with the barista.",
    "Check in at a hotel. Ask about the room and nearby attractions.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The trainer explains facilities and membership.",
    "Your phone is broken. Explain the problem to the technician.",
    "At a hair salon. Describe the style you want.",
    "Send a package at the post office. Ask about shipping methods.",
    "Rent a car. Ask about options and insurance.",
    "Meet a new neighbor. Introduce yourself and ask about the area.",
    "At a bookstore looking for books. Ask for recommendations.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or make a transfer.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations and schedules.",
    "At a lost-and-found office. Describe and look for your missing item.",
    "At a Brazilian bakery (padaria). Choose pão de queijo and fresh bread.",
    "At a beach in Rio. Rent chairs and buy coconut water from the vendor.",
  ],
  it: [
    "An Italian outdoor market. Chat with the vendor selling fresh produce and cheese.",
    "A family-run trattoria. The waiter recommends regional dishes. Order something.",
    "At a pharmacy. Explain your minor ailment and get advice.",
    "At an Italian bar (café). Order an espresso and chat at the counter.",
    "Check in at a hotel. Ask about the room and things to see nearby.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The trainer explains facilities and membership.",
    "Your phone is broken. Explain the problem to the technician.",
    "At a hair salon. Describe the style you want.",
    "Send a package at the post office. Ask about shipping options.",
    "Rent a car. Ask about options and insurance.",
    "Meet a new neighbor in your building. Introduce yourself.",
    "At a bookstore looking for books. Ask for recommendations.",
    "At a movie theater ticket booth. Pick a film and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or make a transfer.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations.",
    "At a lost-and-found office. Describe and look for your missing item.",
    "At a gelateria. Choose flavors and ask about ingredients.",
    "At a wine shop (enoteca). Ask for wine recommendations from different Italian regions.",
  ],
  ru: [
    "At a Russian market. Chat with the vendor selling produce and dairy.",
    "At a Russian restaurant. The waiter recommends traditional dishes. Order something.",
    "At a pharmacy. Explain your minor ailment and get advice.",
    "Order drinks at a coffee shop. Chat casually with the barista.",
    "Check in at a hotel. Ask about the room and local attractions.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The trainer explains facilities and membership.",
    "Your phone is broken. Explain the problem to the technician.",
    "At a hair salon. Describe the style you want.",
    "Send a package at the post office. Ask about shipping options.",
    "Rent a car. Ask about options and insurance.",
    "Meet a new neighbor in your apartment building. Introduce yourself.",
    "At a library looking for books. Ask for recommendations.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or make a transfer.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations.",
    "At a lost-and-found office. Describe and look for your missing item.",
    "At a Russian bathhouse (баня). The attendant explains procedures and traditions.",
    "A friend invites you to their дача (countryside house). Chat about weekend plans.",
  ],
  ar: [
    "At an Arab souk. Haggle with the vendor over spices and traditional goods.",
    "At a Middle Eastern restaurant. The waiter recommends dishes. Order something.",
    "At a pharmacy. Explain your minor ailment and get advice.",
    "At a café. Order Arabic coffee or tea and chat.",
    "Check in at a hotel. Ask about the room and local sights.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The trainer explains facilities and membership.",
    "Your phone is broken. Explain the problem to the technician.",
    "At a barber shop. Describe the style you want.",
    "Send a package at the post office. Ask about shipping options.",
    "Rent a car. Ask about options and insurance.",
    "Meet a new neighbor. Introduce yourself and ask about the area.",
    "At a library looking for books. Ask for recommendations.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or make a transfer.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations.",
    "At a lost-and-found office. Describe and look for your missing item.",
    "At a traditional ديوانية gathering. Your host serves Arabic coffee and dates.",
    "At a traditional neighborhood بقالة (grocery). Chat with the shopkeeper.",
  ],
  hi: [
    "At a vegetable market. Haggle with the vendor over fresh produce and spices.",
    "At a highway ढाबा (roadside eatery). The waiter recommends dishes. Order something.",
    "At a pharmacy. Explain your minor ailment and get medicine advice.",
    "At a chai shop. Order tea and chat with the owner about daily life.",
    "Check in at a hotel. Ask about the room and nearby places to visit.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The trainer explains facilities and membership.",
    "Your phone is broken. Explain the problem to the technician.",
    "At a beauty parlor. Describe the style you want.",
    "Send a package at the post office. Ask about shipping options.",
    "Rent a car. Ask about options and insurance.",
    "Meet a new neighbor. Introduce yourself and ask about the area.",
    "At a bookstore looking for books. Ask for recommendations.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or make a transfer.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations.",
    "At a lost-and-found office. Describe and look for your missing item.",
    "At an Indian sweet shop. Choose sweets and ask about flavors and ingredients.",
    "In an auto-rickshaw. Discuss the fare, route, and landmarks with the driver.",
  ],
  tr: [
    "At a Turkish street market (pazar). Haggle over fresh fruits, vegetables, and olives.",
    "At a Turkish lokanta. The waiter recommends dishes. Order something.",
    "At a pharmacy. Explain your minor ailment and get advice.",
    "At a traditional Turkish kahvehane. Order Turkish coffee and chat.",
    "Check in at a hotel. Ask about the room and nearby attractions.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The trainer explains facilities and membership.",
    "Your phone is broken. Explain the problem to the technician.",
    "At a hair salon. Describe the style you want.",
    "Send a package at the PTT (post office). Ask about shipping options.",
    "Rent a car. Ask about options and insurance.",
    "Meet a new neighbor. Introduce yourself and ask about the area.",
    "At a bookstore looking for books. Ask for recommendations.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or make a transfer.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations.",
    "At a lost-and-found office. Describe and look for your missing item.",
    "At a Turkish tea garden. Enjoy tea and simit and chat about the weather.",
    "At a Turkish hamam (bath). The attendant explains the rituals and services.",
  ],
  id: [
    "At a traditional Indonesian market (pasar). Haggle with the vendor over spices and vegetables.",
    "At a warung (small eatery). The waiter recommends dishes. Order something.",
    "At a pharmacy. Explain your minor ailment and get advice.",
    "At an Indonesian coffee shop. Order local coffee and chat about the beans.",
    "Check in at a hotel. Ask about the room and local attractions.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The trainer explains facilities and membership.",
    "Your phone is broken. Explain the problem to the technician.",
    "At a hair salon. Describe the style you want.",
    "Send a package at the post office. Ask about shipping options.",
    "Rent a car. Ask about options and insurance.",
    "Meet a new neighbor. Introduce yourself and ask about the area.",
    "At a bookstore looking for books. Ask for recommendations.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or make a transfer.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations.",
    "At a lost-and-found office. Describe and look for your missing item.",
    "At an angkringan (Javanese street food stall). Order nasi kucing and warm drinks.",
    "At a batik shop. The owner explains different patterns and how to choose.",
  ],
  vi: [
    "At a Vietnamese market (chợ). Haggle with the vendor over fresh produce and herbs.",
    "At a phở restaurant. The waiter recommends dishes. Order something.",
    "At a pharmacy. Explain your minor ailment and get advice.",
    "At a Vietnamese café. Order cà phê sữa đá and chat.",
    "Check in at a hotel. Ask about the room and local sights.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The trainer explains facilities and membership.",
    "Your phone is broken. Explain the problem to the technician.",
    "At a hair salon. Describe the style you want.",
    "Send a package at the post office. Ask about shipping options.",
    "Rent a car or motorbike. Ask about options and insurance.",
    "Meet a new neighbor. Introduce yourself and ask about the area.",
    "At a bookstore looking for books. Ask for recommendations.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or make a transfer.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations.",
    "At a lost-and-found office. Describe and look for your missing item.",
    "At a bún chả shop in Hanoi. The owner recommends dishes and explains how to eat.",
    "On a xe ôm (motorbike taxi). Chat with the driver about routes and local tips.",
  ],
  pl: [
    "At a Polish market hall. Chat with the vendor selling fresh produce and meats.",
    "At a Polish restaurant. The waiter recommends traditional dishes. Order something.",
    "At a pharmacy. Explain your minor ailment and get advice.",
    "Order drinks at a café. Chat casually with the barista.",
    "Check in at a hotel. Ask about the room and nearby attractions.",
    "Looking for items at a supermarket. Ask an employee for help.",
    "First visit to a gym. The trainer explains facilities and membership.",
    "Your phone is broken. Explain the problem to the technician.",
    "At a hair salon. Describe the style you want.",
    "Send a package at the post office. Ask about shipping options.",
    "Rent a car. Ask about options and insurance.",
    "Meet a new neighbor. Introduce yourself and ask about the area.",
    "At a bookstore looking for books. Ask for recommendations.",
    "At a movie theater ticket booth. Pick a movie and buy tickets.",
    "Visit a pet shop. Choose a pet and ask about care.",
    "Shopping at a clothing store. Ask about sizes and styles.",
    "At a bank. Open an account or make a transfer.",
    "At the dentist. Explain your symptoms and ask about treatment.",
    "Plan a vacation at a travel agency. Discuss destinations.",
    "At a lost-and-found office. Describe and look for your missing item.",
    "At a Polish pastry shop (cukiernia). Choose pączki, sernik, and other pastries.",
    "At a pierogi restaurant. The owner explains different fillings and styles.",
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
    pt: [
      "브라질 길거리 시장(페이라)입니다. 열대 과일과 채소를 파는 상인과 흥정해보세요.",
      "브라질 슈하스카리아(churrascaria)입니다. 호지지우 시스템을 체험해보세요.",
      "약국에 왔습니다. 약사에게 증상을 설명하고 약을 구매해보세요.",
      "카페에서 음료를 주문합니다. 바리스타와 가볍게 대화해보세요.",
      "호텔에 체크인합니다. 방 상태와 주변 관광지를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 도움을 요청해보세요.",
      "헬스장(아카데미아)에 처음 왔습니다. 트레이너가 시설과 회원권을 설명합니다.",
      "휴대폰이 고장났습니다. 수리 기사에게 문제를 설명해보세요.",
      "미용실에 왔습니다. 원하는 스타일을 설명해보세요.",
      "우체국에서 소포를 보냅니다. 배송 방법을 물어보세요.",
      "렌터카 업체에서 차를 빌립니다. 옵션과 보험을 확인해보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네에 대해 물어보세요.",
      "서점에서 책을 찾고 있습니다. 직원에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
      "브라질 빵집(파다리아)입니다. 빵지케이주와 신선한 빵을 골라보세요.",
      "리우 해변에 왔습니다. 의자를 빌리고 코코넛 워터를 사보세요.",
    ],
    it: [
      "이탈리아 야외 시장입니다. 신선한 농산물과 치즈를 파는 상인과 대화해보세요.",
      "가족이 운영하는 트라토리아입니다. 웨이터가 지역 요리를 추천합니다. 주문해보세요.",
      "약국에 왔습니다. 약사에게 증상을 설명하고 약을 구매해보세요.",
      "이탈리아 바(카페)에서 에스프레소를 주문하고 카운터에서 대화해보세요.",
      "호텔에 체크인합니다. 방 상태와 주변 볼거리를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설과 회원권을 설명합니다.",
      "휴대폰이 고장났습니다. 수리 기사에게 문제를 설명해보세요.",
      "미용실에 왔습니다. 원하는 스타일을 설명해보세요.",
      "우체국에서 소포를 보냅니다. 배송 옵션을 확인해보세요.",
      "렌터카에서 차를 빌립니다. 차종과 보험을 물어보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네를 물어보세요.",
      "서점에서 책을 찾고 있습니다. 직원에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
      "젤라테리아에 왔습니다. 맛을 고르고 재료에 대해 물어보세요.",
      "에노테카(와인 가게)에 왔습니다. 이탈리아 각 지역의 와인 추천을 받아보세요.",
    ],
    ru: [
      "러시아 시장입니다. 신선한 농산물과 유제품을 파는 상인과 대화해보세요.",
      "러시아 레스토랑입니다. 웨이터가 전통 요리를 추천합니다. 주문해보세요.",
      "약국에 왔습니다. 약사에게 증상을 설명하고 약을 구매해보세요.",
      "카페에서 음료를 주문합니다. 바리스타와 가볍게 대화해보세요.",
      "호텔에 체크인합니다. 방 상태와 주변 관광지를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설과 회원권을 설명합니다.",
      "휴대폰이 고장났습니다. 수리 기사에게 문제를 설명해보세요.",
      "미용실에 왔습니다. 원하는 스타일을 설명해보세요.",
      "우체국에서 소포를 보냅니다. 배송 옵션을 확인해보세요.",
      "렌터카에서 차를 빌립니다. 차종과 보험을 물어보세요.",
      "아파트에 새로 이사 온 이웃을 만났습니다. 자기소개를 해보세요.",
      "도서관에서 책을 찾고 있습니다. 사서에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
      "러시아 바냐(목욕탕)에 왔습니다. 직원이 절차와 전통을 설명합니다.",
      "친구가 다차(시골집)에 초대했습니다. 주말 계획에 대해 대화해보세요.",
    ],
    ar: [
      "아랍 수크(시장)입니다. 향신료와 전통 물건을 파는 상인과 흥정해보세요.",
      "중동 레스토랑입니다. 웨이터가 요리를 추천합니다. 주문해보세요.",
      "약국에 왔습니다. 약사에게 증상을 설명하고 약을 구매해보세요.",
      "카페에 왔습니다. 아랍 커피나 차를 주문하고 대화해보세요.",
      "호텔에 체크인합니다. 방 상태와 주변 관광지를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설과 회원권을 설명합니다.",
      "휴대폰이 고장났습니다. 수리 기사에게 문제를 설명해보세요.",
      "이발소에 왔습니다. 원하는 스타일을 설명해보세요.",
      "우체국에서 소포를 보냅니다. 배송 옵션을 확인해보세요.",
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
      "디와니야(전통 모임)에 초대받았습니다. 아랍 커피와 대추를 즐기며 대화해보세요.",
      "동네 바깔라(전통 식료품점)에 왔습니다. 주인과 대화하며 물건을 골라보세요.",
    ],
    hi: [
      "채소 시장(사브지 만디)입니다. 신선한 채소와 향신료를 파는 상인과 흥정해보세요.",
      "도로변 식당(다바)입니다. 웨이터가 요리를 추천합니다. 주문해보세요.",
      "약국에 왔습니다. 약사에게 증상을 설명하고 약을 구매해보세요.",
      "차이 가게에 왔습니다. 차를 주문하고 주인과 일상 대화를 나눠보세요.",
      "호텔에 체크인합니다. 방 상태와 주변 관광지를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설과 회원권을 설명합니다.",
      "휴대폰이 고장났습니다. 수리 기사에게 문제를 설명해보세요.",
      "뷰티 팔러에 왔습니다. 원하는 스타일을 설명해보세요.",
      "우체국에서 소포를 보냅니다. 배송 옵션을 확인해보세요.",
      "렌터카에서 차를 빌립니다. 차종과 보험을 물어보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네에 대해 물어보세요.",
      "서점에서 책을 찾고 있습니다. 직원에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
      "인도 과자 가게(미타이 두칸)에 왔습니다. 과자를 고르고 맛에 대해 물어보세요.",
      "오토 릭샤를 탔습니다. 기사와 요금, 경로에 대해 이야기해보세요.",
    ],
    tr: [
      "터키 길거리 시장(파자르)입니다. 과일, 채소, 올리브를 파는 상인과 흥정해보세요.",
      "터키 로칸타에 왔습니다. 웨이터가 요리를 추천합니다. 주문해보세요.",
      "약국에 왔습니다. 약사에게 증상을 설명하고 약을 구매해보세요.",
      "전통 카흐베하네에 왔습니다. 터키 커피를 주문하고 대화해보세요.",
      "호텔에 체크인합니다. 방 상태와 주변 관광지를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설과 회원권을 설명합니다.",
      "휴대폰이 고장났습니다. 수리 기사에게 문제를 설명해보세요.",
      "미용실에 왔습니다. 원하는 스타일을 설명해보세요.",
      "PTT(우체국)에서 소포를 보냅니다. 배송 옵션을 확인해보세요.",
      "렌터카에서 차를 빌립니다. 차종과 보험을 물어보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네에 대해 물어보세요.",
      "서점에서 책을 찾고 있습니다. 직원에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
      "터키 차 정원(차이 바흐체시)에 왔습니다. 차와 시미트를 즐기며 대화해보세요.",
      "터키 하맘(목욕탕)에 왔습니다. 직원이 의식과 서비스를 설명합니다.",
    ],
    id: [
      "인도네시아 전통 시장(파사르)입니다. 향신료와 채소를 파는 상인과 흥정해보세요.",
      "와룽(작은 식당)에 왔습니다. 웨이터가 요리를 추천합니다. 주문해보세요.",
      "약국에 왔습니다. 약사에게 증상을 설명하고 약을 구매해보세요.",
      "인도네시아 커피숍에 왔습니다. 현지 커피를 주문하고 대화해보세요.",
      "호텔에 체크인합니다. 방 상태와 주변 관광지를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설과 회원권을 설명합니다.",
      "휴대폰이 고장났습니다. 수리 기사에게 문제를 설명해보세요.",
      "미용실에 왔습니다. 원하는 스타일을 설명해보세요.",
      "우체국에서 소포를 보냅니다. 배송 옵션을 확인해보세요.",
      "렌터카에서 차를 빌립니다. 차종과 보험을 물어보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네에 대해 물어보세요.",
      "서점에서 책을 찾고 있습니다. 직원에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
      "앙크링안(자바 길거리 음식 포장마차)에 왔습니다. 나시 쿠칭과 따뜻한 음료를 주문해보세요.",
      "바틱 가게에 왔습니다. 주인이 다양한 바틱 패턴과 선택법을 설명합니다.",
    ],
    vi: [
      "베트남 시장(쩌)입니다. 신선한 채소와 허브를 파는 상인과 흥정해보세요.",
      "퍼(phở) 식당에 왔습니다. 웨이터가 요리를 추천합니다. 주문해보세요.",
      "약국에 왔습니다. 약사에게 증상을 설명하고 약을 구매해보세요.",
      "베트남 카페에 왔습니다. 카페쓰어다(cà phê sữa đá)를 주문하고 대화해보세요.",
      "호텔에 체크인합니다. 방 상태와 주변 관광지를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설과 회원권을 설명합니다.",
      "휴대폰이 고장났습니다. 수리 기사에게 문제를 설명해보세요.",
      "미용실에 왔습니다. 원하는 스타일을 설명해보세요.",
      "우체국에서 소포를 보냅니다. 배송 옵션을 확인해보세요.",
      "렌터카에서 차나 오토바이를 빌립니다. 옵션과 보험을 물어보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네에 대해 물어보세요.",
      "서점에서 책을 찾고 있습니다. 직원에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
      "하노이의 분짜(bún chả) 가게에 왔습니다. 주인이 요리와 먹는 법을 설명합니다.",
      "쎄옴(xe ôm, 오토바이 택시)을 탔습니다. 기사와 경로와 현지 팁에 대해 대화해보세요.",
    ],
    pl: [
      "폴란드 시장입니다. 신선한 농산물과 육류를 파는 상인과 대화해보세요.",
      "폴란드 레스토랑입니다. 웨이터가 전통 요리를 추천합니다. 주문해보세요.",
      "약국에 왔습니다. 약사에게 증상을 설명하고 약을 구매해보세요.",
      "카페에서 음료를 주문합니다. 바리스타와 가볍게 대화해보세요.",
      "호텔에 체크인합니다. 방 상태와 주변 관광지를 물어보세요.",
      "슈퍼마켓에서 물건을 찾고 있습니다. 직원에게 물어보세요.",
      "헬스장에 처음 왔습니다. 트레이너가 시설과 회원권을 설명합니다.",
      "휴대폰이 고장났습니다. 수리 기사에게 문제를 설명해보세요.",
      "미용실에 왔습니다. 원하는 스타일을 설명해보세요.",
      "우체국에서 소포를 보냅니다. 배송 옵션을 확인해보세요.",
      "렌터카에서 차를 빌립니다. 차종과 보험을 물어보세요.",
      "새 이웃을 만났습니다. 자기소개를 하고 동네에 대해 물어보세요.",
      "서점에서 책을 찾고 있습니다. 직원에게 추천을 부탁해보세요.",
      "영화관 매표소입니다. 영화를 고르고 표를 사보세요.",
      "펫샵에 왔습니다. 반려동물을 고르고 관리 방법을 물어보세요.",
      "옷가게에서 쇼핑 중입니다. 사이즈와 스타일을 물어보세요.",
      "은행에 왔습니다. 계좌 개설이나 거래를 해보세요.",
      "치과에 왔습니다. 증상을 설명하고 치료에 대해 물어보세요.",
      "여행사에서 휴가를 계획합니다. 목적지와 일정을 상담해보세요.",
      "분실물 센터에 왔습니다. 잃어버린 물건을 찾아보세요.",
      "폴란드 과자점(추키에르니아)에 왔습니다. 폰치키, 세르니크 등 과자를 골라보세요.",
      "피에로기 전문점에 왔습니다. 주인이 다양한 속과 조리법을 설명합니다.",
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
    pt: [
      "Bom dia! Bem-vindo à feira! O que vai levar hoje? As mangas estão uma delícia, quer experimentar?",
      "Bem-vindo à churrascaria! Já conhece o nosso rodízio? Vou explicar como funciona.",
      "Boa tarde! Em que posso ajudar? Está sentindo alguma coisa?",
      "Oi! Bem-vindo! O que você vai querer? Hoje temos um café especial de Minas.",
      "Boa noite! Bem-vindo ao hotel. Tem reserva no seu nome?",
      "Oi! Está procurando alguma coisa? Hoje tem promoção nos laticínios.",
      "Bem-vindo à academia! É a primeira vez aqui? Vou te mostrar as instalações.",
      "Oi! O que aconteceu com o celular? Desde quando está com problema?",
      "Oi! Bem-vinda! O que você quer fazer hoje? Corte, cor, ou os dois?",
      "Bom dia! Quer enviar um pacote? É nacional ou internacional?",
      "Bem-vindo! Tem reserva ou quer ver os carros disponíveis?",
      "Oi! Você é o vizinho novo, né? Eu sou o Carlos, moro aqui do lado. Prazer!",
      "Oi! Está procurando algum livro em especial ou quer uma recomendação?",
      "Oi! Qual filme você quer ver? Essa semana tem umas estreias bem legais.",
      "Bem-vindo! Está procurando um bichinho? Acabamos de receber uns filhotes lindos.",
      "Oi! Posso te ajudar? Essa semana temos desconto em jaquetas.",
      "Bom dia! Em que posso ajudar? Quer abrir uma conta ou fazer uma transferência?",
      "Pode sentar. O que te traz aqui hoje? Está sentindo alguma dor?",
      "Bem-vindo! Está planejando uma viagem? Já tem algum destino em mente?",
      "Oi! Perdeu alguma coisa? Pode descrever o objeto pra mim?",
      "Bom dia! Bem-vindo à padaria! O pão de queijo acabou de sair do forno. Quer experimentar?",
      "E aí! Quer alugar cadeira e guarda-sol? Também tenho água de coco bem geladinha!",
    ],
    it: [
      "Buongiorno! Benvenuto al mercato! Cosa Le posso dare oggi? I pomodori sono freschissimi.",
      "Benvenuti! Avete già scelto o volete un consiglio? Oggi vi consiglio le tagliatelle al ragù, sono speciali.",
      "Buongiorno! Come posso aiutarLa? Ha qualche disturbo?",
      "Buongiorno! Cosa prende? Abbiamo un ottimo espresso oggi.",
      "Buonasera! Benvenuto all'albergo. Ha una prenotazione?",
      "Buongiorno! Cerca qualcosa in particolare? Questa settimana abbiamo offerte sui latticini.",
      "Benvenuto! È la prima volta qui? Le faccio vedere le strutture.",
      "Buongiorno! Cosa è successo al telefono? Da quando ha questo problema?",
      "Buongiorno! Come vuole i capelli oggi? Solo taglio o anche colore?",
      "Buongiorno! Vuole spedire un pacco? In Italia o all'estero?",
      "Benvenuto! Ha una prenotazione o vuole vedere le auto disponibili?",
      "Oh ciao! Lei deve essere il nuovo vicino. Io sono Marco, abito qui accanto. Piacere!",
      "Buongiorno! Cerca un libro in particolare o posso consigliarLe qualcosa?",
      "Buonasera! Che film vuole vedere? Questa settimana ci sono delle belle novità.",
      "Benvenuto! Cerca un animale domestico? Abbiamo appena ricevuto dei gattini adorabili.",
      "Buongiorno! Posso aiutarLa? Questa settimana abbiamo i cappotti in saldo.",
      "Buongiorno! Come posso aiutarLa? Vuole aprire un conto o fare un bonifico?",
      "Si accomodi. Cosa La porta qui oggi? Ha qualche dolore?",
      "Benvenuto! Sta pianificando un viaggio? Ha già una destinazione in mente?",
      "Buongiorno! Ha perso qualcosa? Può descrivermi l'oggetto?",
      "Buongiorno! Benvenuto alla gelateria! Vuole assaggiare qualche gusto? Il pistacchio oggi è eccezionale.",
      "Buonasera! Benvenuto all'enoteca. Cerca un vino per un'occasione speciale o per tutti i giorni?",
    ],
    ru: [
      "Здравствуйте! Добро пожаловать на рынок! Что вам предложить? Помидоры сегодня отличные, попробуйте!",
      "Добро пожаловать! Вы уже выбрали или хотите, чтобы я порекомендовал? Сегодня борщ особенно хорош.",
      "Здравствуйте! Чем могу помочь? Что вас беспокоит?",
      "Привет! Что будете заказывать? У нас сегодня отличный капучино.",
      "Добрый вечер! Добро пожаловать в гостиницу. У вас есть бронирование?",
      "Здравствуйте! Вам помочь что-то найти? Сегодня скидки на молочные продукты.",
      "Добро пожаловать! Вы у нас впервые? Давайте я покажу вам зал.",
      "Здравствуйте! Что случилось с телефоном? Когда начались проблемы?",
      "Здравствуйте! Какую стрижку хотите сегодня? Только стрижка или ещё покраска?",
      "Здравствуйте! Хотите отправить посылку? По России или за границу?",
      "Добро пожаловать! У вас есть бронирование или хотите посмотреть доступные машины?",
      "О, здравствуйте! Вы, наверное, новый сосед? Я Наталья из соседней квартиры. Очень приятно!",
      "Здравствуйте! Ищете что-то конкретное или хотите, чтобы я порекомендовала?",
      "Здравствуйте! Какой фильм хотите посмотреть? На этой неделе несколько хороших новинок.",
      "Добро пожаловать! Ищете домашнего питомца? У нас только что появились милые котята.",
      "Здравствуйте! Могу помочь? На этой неделе скидки на куртки.",
      "Здравствуйте! Чем могу помочь? Хотите открыть счёт или сделать перевод?",
      "Присаживайтесь. Что вас привело к нам? Есть какие-то боли?",
      "Добро пожаловать! Планируете путешествие? Есть уже направление на примете?",
      "Здравствуйте! Вы что-то потеряли? Можете описать предмет?",
      "Добро пожаловать в баню! Первый раз у нас? Давайте я расскажу, как всё устроено. Чай будете?",
      "Привет! Рад, что приехал! Проходи, я тебе всё покажу. Шашлык уже готовится, а пока давай чаю.",
    ],
    ar: [
      "أهلاً وسهلاً! تفضل، عندنا بهارات طازة وتمر ممتاز. شو تحب تشوف؟",
      "أهلاً! تفضلوا اجلسوا. عندنا اليوم مشاوي طازة ومزة لبنانية. تحبوا تبدأوا بإيش؟",
      "أهلاً! كيف أقدر أساعدك؟ عندك أي أعراض؟",
      "أهلاً وسهلاً! شو تحب تشرب؟ عندنا قهوة عربية طازة.",
      "مساء الخير! أهلاً بك في الفندق. عندك حجز؟",
      "أهلاً! تدور على شي معين؟ اليوم عندنا عروض على المنتجات الطازة.",
      "أهلاً وسهلاً! أول مرة عندنا؟ خلني أوريك النادي.",
      "أهلاً! شو صار بالجوال؟ من متى عندك هالمشكلة؟",
      "أهلاً! كيف تحب تقص شعرك اليوم؟",
      "أهلاً! تبي ترسل طرد؟ داخلي ولا دولي؟",
      "أهلاً وسهلاً! عندك حجز ولا تبي تشوف السيارات المتوفرة؟",
      "أهلاً! أنت الجار الجديد صح؟ أنا أحمد، ساكن بالشقة الجنب. تشرفنا!",
      "أهلاً! تدور على كتاب معين ولا تبي أنصحك بشي؟",
      "أهلاً! أي فيلم تبي تشوف؟ هالأسبوع عندنا أفلام جديدة حلوة.",
      "أهلاً وسهلاً! تدور على حيوان أليف؟ عندنا قطط صغيرة لطيفة.",
      "أهلاً! أقدر أساعدك؟ هالأسبوع عندنا تخفيضات على الجاكيتات.",
      "أهلاً! كيف أقدر أساعدك؟ تبي تفتح حساب ولا تسوي تحويل؟",
      "تفضل اجلس. شو اللي جابك اليوم؟ عندك ألم؟",
      "أهلاً وسهلاً! تخطط لسفرة؟ عندك وجهة معينة بالبال؟",
      "أهلاً! ضيعت شي؟ ممكن توصف لي الشي اللي ضاع؟",
      "أهلاً وسهلاً بك في الديوانية! تفضل اجلس. قهوة عربية مع تمر؟",
      "أهلاً يا جاري! تفضل، شو تحتاج اليوم؟ وصلنا أرز جديد وزيت زيتون طازج.",
    ],
    hi: [
      "नमस्ते! आइए, क्या चाहिए? आज भिंडी और टमाटर एकदम ताज़े हैं, देखिए!",
      "नमस्ते जी! बैठिए, बैठिए। आज दाल मखनी बहुत अच्छी बनी है। क्या लेंगे?",
      "नमस्ते! बताइए, क्या तकलीफ़ है? कब से ऐसा हो रहा है?",
      "नमस्ते! क्या लेंगे? एक अदरक वाली चाय बनाऊँ? बहुत अच्छी बनती है यहाँ की।",
      "नमस्कार! होटल में आपका स्वागत है। क्या आपने रिज़र्वेशन किया है?",
      "नमस्ते! कुछ ढूँढ रहे हैं? आज दूध और दही पर छूट चल रही है।",
      "नमस्ते! पहली बार आए हैं? चलिए, मैं आपको सब दिखाता हूँ।",
      "नमस्ते! फ़ोन में क्या प्रॉब्लम है? कब से ऐसा हो रहा है?",
      "नमस्ते! आज कैसा हेयर स्टाइल चाहिए? सिर्फ़ कटिंग या कलर भी?",
      "नमस्ते! पार्सल भेजना है? कहाँ भेजना है? देश में या विदेश?",
      "नमस्ते! रिज़र्वेशन है या गाड़ियाँ देखना चाहेंगे?",
      "अरे नमस्ते! आप नए पड़ोसी हैं ना? मैं शर्मा जी हूँ, बगल वाले फ्लैट में रहता हूँ। बहुत खुशी हुई!",
      "नमस्ते! कोई ख़ास किताब ढूँढ रहे हैं या सुझाव दूँ?",
      "नमस्ते! कौन सी फ़िल्म देखनी है? इस हफ़्ते कई अच्छी फ़िल्में आई हैं।",
      "नमस्ते! पालतू जानवर ढूँढ रहे हैं? हमारे पास नए पिल्ले आए हैं, बहुत प्यारे हैं।",
      "नमस्ते! कुछ मदद चाहिए? इस हफ़्ते जैकेट पर सेल चल रही है।",
      "नमस्कार! बताइए, क्या काम है? खाता खोलना है या पैसे भेजने हैं?",
      "बैठिए। आज क्या तकलीफ़ है? कहाँ दर्द हो रहा है?",
      "नमस्ते! कहीं घूमने का प्लान है? कोई जगह सोची है?",
      "नमस्ते! कुछ खो गया है? बताइए, कैसा सामान था?",
      "नमस्ते! मिठाई की दुकान में आपका स्वागत है! लड्डू आज ताज़े बने हैं। कौन सी मिठाई पसंद करेंगे?",
      "नमस्ते साहब! कहाँ जाना है? मीटर से चलेंगे या भाव बताइए।",
    ],
    tr: [
      "Hoş geldiniz! Bugün meyve ve sebzeler çok taze. Bir bakın, ne istersiniz?",
      "Hoş geldiniz! Menüyü gördünüz mü? Bugün Adana kebabımız çok güzel olmuş, tavsiye ederim.",
      "Merhaba! Size nasıl yardımcı olabilirim? Bir şikayetiniz mi var?",
      "Hoş geldiniz! Ne içmek istersiniz? Bugün özel Türk kahvemiz var, bir deneyin.",
      "İyi akşamlar! Otele hoş geldiniz. Rezervasyonunuz var mı?",
      "Merhaba! Bir şey mi arıyorsunuz? Bu hafta süt ürünlerinde indirim var.",
      "Hoş geldiniz! İlk kez mi geliyorsunuz? Size tesisleri gezdireyim.",
      "Merhaba! Telefonunuza ne oldu? Ne zamandan beri böyle?",
      "Merhaba! Bugün nasıl bir saç istiyorsunuz? Sadece kesim mi, renk de mi?",
      "Merhaba! Kargo göndermek mi istiyorsunuz? Yurt içi mi, yurt dışı mı?",
      "Hoş geldiniz! Rezervasyonunuz var mı, yoksa araçları görmek ister misiniz?",
      "Aa merhaba! Siz yeni komşu olmalısınız. Ben Ayşe, yan dairede oturuyorum. Hoş geldiniz!",
      "Merhaba! Özel bir kitap mı arıyorsunuz, yoksa tavsiye ister misiniz?",
      "Merhaba! Hangi filmi izlemek istiyorsunuz? Bu hafta güzel filmler var.",
      "Hoş geldiniz! Evcil hayvan mı arıyorsunuz? Yeni yavru kedilerimiz geldi, çok tatlılar.",
      "Merhaba! Yardımcı olabilir miyim? Bu hafta montlarda indirim var.",
      "Merhaba! Size nasıl yardımcı olabilirim? Hesap açmak mı istiyorsunuz, yoksa havale mi?",
      "Buyurun, oturun. Bugün sizi ne getirdi? Ağrınız mı var?",
      "Hoş geldiniz! Tatil mi planlıyorsunuz? Aklınızda bir yer var mı?",
      "Merhaba! Bir şey mi kaybettiniz? Eşyayı tarif edebilir misiniz?",
      "Hoş geldiniz çay bahçesine! Buyurun oturun. Çay mı istersiniz, simit de getirelim mi?",
      "Hoş geldiniz hamama! İlk kez mi geliyorsunuz? Size hamamın nasıl işlediğini anlatayım.",
    ],
    id: [
      "Selamat datang! Mau cari apa, Kak? Hari ini sayur dan bumbunya segar-segar, silakan pilih!",
      "Selamat datang! Sudah lihat menunya? Hari ini nasi goreng spesial kita enak banget, mau coba?",
      "Selamat siang! Ada yang bisa saya bantu? Ada keluhan apa?",
      "Halo! Mau pesan apa? Hari ini kopi Toraja kita lagi bagus banget, mau coba?",
      "Selamat malam! Selamat datang di hotel. Sudah ada reservasi?",
      "Halo! Cari sesuatu? Minggu ini ada promo susu dan buah-buahan.",
      "Selamat datang! Baru pertama kali ke sini? Yuk, saya tunjukkan fasilitasnya.",
      "Halo! HP-nya kenapa? Sejak kapan bermasalah?",
      "Halo! Mau potong model apa hari ini? Potong aja atau sekalian warnain?",
      "Selamat siang! Mau kirim paket? Tujuannya ke mana? Dalam negeri atau luar negeri?",
      "Selamat datang! Sudah ada reservasi atau mau lihat-lihat mobil yang tersedia?",
      "Halo! Kamu pasti tetangga baru ya? Aku Budi, tinggal di sebelah. Salam kenal!",
      "Halo! Cari buku tertentu atau mau saya rekomendasikan sesuatu?",
      "Halo! Mau nonton film apa? Minggu ini ada beberapa film baru yang bagus.",
      "Selamat datang! Cari hewan peliharaan? Kami baru dapat anak kucing lucu-lucu.",
      "Halo! Bisa saya bantu? Minggu ini jaket lagi diskon.",
      "Selamat pagi! Ada yang bisa saya bantu? Mau buka rekening atau transfer?",
      "Silakan duduk. Ada keluhan apa hari ini? Giginya yang mana yang sakit?",
      "Selamat datang! Lagi rencanain liburan? Sudah ada tujuan yang diinginkan?",
      "Halo! Ada barang yang hilang? Bisa jelaskan barangnya seperti apa?",
      "Selamat datang di angkringan! Silakan duduk. Mau nasi kucing sama wedang jahe?",
      "Selamat datang! Mau cari batik? Sini, saya jelaskan motif-motifnya. Setiap motif punya makna berbeda.",
    ],
    vi: [
      "Chào chị! Hôm nay rau quả tươi lắm. Chị muốn mua gì? Mấy quả xoài này ngọt lắm!",
      "Chào anh! Mời anh ngồi. Hôm nay phở bò đặc biệt ngon lắm. Anh dùng gì ạ?",
      "Chào anh! Anh có vấn đề gì không ạ? Triệu chứng thế nào?",
      "Chào bạn! Bạn muốn uống gì? Hôm nay cà phê sữa đá của tụi mình ngon lắm, thử không?",
      "Chào anh! Chào mừng anh đến khách sạn. Anh có đặt phòng trước không ạ?",
      "Chào chị! Chị cần tìm gì không? Tuần này sữa và trái cây đang giảm giá.",
      "Chào mừng bạn! Lần đầu đến đây hả? Để mình dẫn bạn đi xem cơ sở vật chất nhé.",
      "Chào anh! Điện thoại bị sao vậy ạ? Bị từ lúc nào?",
      "Chào chị! Hôm nay chị muốn cắt kiểu gì ạ? Cắt thôi hay nhuộm luôn?",
      "Chào anh! Anh muốn gửi bưu kiện hả? Gửi trong nước hay quốc tế ạ?",
      "Chào mừng! Anh có đặt trước không hay muốn xem xe có sẵn?",
      "Ồ chào! Anh mới chuyển đến hả? Em là Lan, ở nhà bên cạnh. Rất vui được gặp anh!",
      "Chào bạn! Bạn tìm sách gì? Hay để mình gợi ý cho bạn nhé?",
      "Chào anh! Anh muốn xem phim gì? Tuần này có mấy phim mới hay lắm.",
      "Chào mừng! Bạn muốn nuôi thú cưng hả? Tụi mình mới có mấy chú mèo con dễ thương lắm.",
      "Chào chị! Em giúp gì được cho chị? Tuần này áo khoác đang giảm giá.",
      "Chào anh! Em có thể giúp gì ạ? Anh muốn mở tài khoản hay chuyển tiền?",
      "Mời anh ngồi. Hôm nay anh đến vì lý do gì ạ? Có đau ở đâu không?",
      "Chào mừng! Anh đang lên kế hoạch du lịch hả? Đã có điểm đến nào chưa?",
      "Chào anh! Anh bị mất đồ hả? Anh mô tả lại đồ vật được không ạ?",
      "Chào anh! Mời anh ngồi. Bún chả hôm nay ngon lắm. Để em chỉ cách ăn cho anh nhé!",
      "Chào anh! Anh muốn đi đâu? Lên xe đi, em chở. Đường này em thuộc lắm!",
    ],
    pl: [
      "Dzień dobry! Witamy na targu! Co podać? Dzisiaj pomidory są wyjątkowo dobre, proszę spróbować!",
      "Dzień dobry! Witamy w restauracji. Co podać? Dzisiaj polecam pierogi ruskie i żurek, są wyśmienite.",
      "Dzień dobry! W czym mogę pomóc? Jakie ma Pan/Pani dolegliwości?",
      "Cześć! Co podać? Mamy dzisiaj świetną kawę z nowej palarni.",
      "Dobry wieczór! Witamy w hotelu. Czy ma Pan/Pani rezerwację?",
      "Dzień dobry! Szuka Pan/Pani czegoś konkretnego? W tym tygodniu mamy promocję na nabiał.",
      "Witamy! Pierwszy raz u nas? Pokażę Panu/Pani wszystko.",
      "Dzień dobry! Co się stało z telefonem? Od kiedy jest problem?",
      "Dzień dobry! Jaką fryzurę sobie życzy? Tylko strzyżenie czy też koloryzacja?",
      "Dzień dobry! Chce Pan/Pani wysłać paczkę? W kraju czy za granicę?",
      "Witamy! Ma Pan/Pani rezerwację czy chce zobaczyć dostępne samochody?",
      "O cześć! Pan/Pani to chyba nowy sąsiad? Jestem Kasia z mieszkania obok. Miło mi!",
      "Dzień dobry! Szuka Pan/Pani jakiejś konkretnej książki czy mogę coś polecić?",
      "Cześć! Jaki film chcecie zobaczyć? W tym tygodniu mamy kilka świetnych premier.",
      "Witamy! Szuka Pan/Pani zwierzaka? Właśnie dostaliśmy urocze kocięta.",
      "Dzień dobry! Mogę w czymś pomóc? W tym tygodniu mamy wyprzedaż kurtek.",
      "Dzień dobry! W czym mogę pomóc? Chce Pan/Pani otworzyć konto czy zrobić przelew?",
      "Proszę usiąść. Co Pana/Panią do nas sprowadza? Coś boli?",
      "Witamy! Planuje Pan/Pani podróż? Ma już Pan/Pani jakiś kierunek na myśli?",
      "Dzień dobry! Zgubił Pan/Pani coś? Może Pan/Pani opisać ten przedmiot?",
      "Dzień dobry! Witamy w cukierni! Pączki są dzisiaj prosto z pieca. Co podać? Może sernik albo szarlotkę?",
      "Dzień dobry! Witamy w pierogarni! Jakie pierogi Pana/Panią interesują? Mamy ruskie, z mięsem i ze szpinakiem.",
    ],
  };

  const descs = descriptions[language];
  const opens = openings[language];
  return descs.map((description, i) => ({ description, opening: opens[i] }));
}
