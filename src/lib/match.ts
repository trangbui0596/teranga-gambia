// Pure keyword matching used by the WhatsApp/SMS backend (src/lib/tourcoach.server.ts).
// Promise: never guess. A question gets one of Noor's ten approved answers only when the evidence is clear; otherwise the
// caller says "Not sure, Noor will answer". The rules, in the order they apply:
//   R1  One word = one vote. Two spellings of the same word ("child"/"children", "include"/"included") count once.
//   R2  Weak words (GENERIC: "need", "time", "where"...) never decide alone. A topic needs one specific (strong) word, or a
//       weak word from a short allow-list (STANDS_ALONE) that is enough for that one topic ("start" for meeting point).
//   R3  The longest phrase wins: "how much time" is a duration question, "change my booking" a cancellation question.
//   R4  Words that mean something else in another language ("kind", "alter", "hat") only count inside a phrase.
//   R5  Out-of-scope subjects decline the question: visa, ATM, airport... (OUT_OF_SCOPE) always; hotel words (STAY_WORDS)
//       unless it is a pure pick-up question; money and weather words (CONTEXT_WORDS) only cancel weak evidence.
//   R6  Ties never guess: the topic with more strong words wins, equal topics stay unsure.
export type MatchableAnswer = {
  id: string;
  recordings?: { questions?: { topic: string } | null } | null;
};
export const CONFIDENCE_THRESHOLD = 0.6;
export const NOT_SURE: Record<"en" | "de" | "nl", string> = {
  en: "Not sure, Noor will answer.",
  de: "Nicht sicher, Noor wird antworten.",
  nl: "Niet zeker, Noor zal antwoorden.",
};

/* ---------- Keyword matching (no AI): EN/DE/NL words and phrases per topic ---------- */
// Single words also match longer forms when they have 5+ letters ("booking" matches "bookings"); shorter words and
// every word but the last of a phrase must match exactly, so plurals of short words are listed ("kids", "meals").
// prettier-ignore
export const KEYWORDS: Record<string, string[]> = {
  price: ["price", "prices", "pricing", "cost", "costs", "how much", "fee", "fees", "expensive", "cheap", "discount", "per person", "per adult", "tariff", "rates", "you charge", "extra charge", "extra charges",
    "preis", "preise", "kosten", "kostet", "wie viel", "wieviel", "teuer", "billig", "rabatt", "pro person", "tarif",
    "prijs", "prijzen", "kost", "hoeveel", "duur", "goedkoop", "korting", "per persoon", "tarief"],
  "meeting point": ["where", "meet", "meeting", "pickup", "pick up", "picked up", "picking up", "pick us up", "pick me up", "pick you up", "collect us", "collect me", "collect you",
    "collect guests", "collect from", "collected", "depart", "location", "start",
    "wo", "treffen", "treffpunkt", "abhol", "abgeholt", "abfahrt", "beginnt",
    "waar", "ontmoet", "verzamel", "ophalen", "ophaal", "opgehaald", "vertrek", "begint"],
  duration: ["how long", "how many hours", "how many minutes", "how much time", "hours", "hour", "duration", "length", "full day", "half day", "all day", "time",
    "wie lange", "wie viele stunden", "wie viel zeit", "wieviel zeit", "dauer", "dauert", "stunde", "ganztag", "halbtag",
    "hoe lang", "hoeveel uur", "hoeveel tijd", "duurt", "de duur", "duur van", "uur", "uren", "hele dag", "halve dag", "tijd"],
  "what to bring": ["bring", "what to bring", "need to bring", "have to bring", "should i bring", "should we bring", "what do i bring", "what do we bring", "what can i bring", "what can we bring",
    "wear", "wearing", "pack", "packing", "need", "water", "how much water", "shoes", "clothes", "clothing", "dress", "dress code", "a hat", "the hat", "sun hat", "sunhat", "hats", "jacket", "raincoat", "umbrella", "sun protection",
    "sunscreen", "sun cream", "sunblock", "sunglasses", "swimsuit", "swimwear", "towel", "sandals", "footwear", "repellent", "take with me", "take with us",
    "mitbringen", "mitnehmen", "anziehen", "kleidung", "schuhe", "sonnencreme", "handtuch", "dresscode", "wie viel wasser",
    "meenemen", "aantrekken", "schoenen", "kleding", "zonnebrand", "handdoek", "hoed", "hoeveel water"],
  children: ["kids", "kid", "children", "child", "family", "families", "baby", "babies", "toddler", "infant", "teenager", "stroller", "pushchair", "pram",
    "how old", "years old", "year old", "minimum age", "age limit", "age", "ages", "aged",
    "kinder", "familie", "babys", "kleinkind", "mein kind", "meinem kind", "unser kind", "unserem kind", "ein kind", "einem kind", "das kind", "dem kind", "dein kind", "ihr kind", "mit kind",
    "welchem alter", "welches alter", "mindestalter", "altersgrenze", "altersbeschrankung", "altersbegrenzung", "wie alt", "jahre alt",
    "kinderen", "gezin", "leeftijd", "peuter", "mijn kind", "ons kind", "een kind", "het kind", "uw kind", "jouw kind", "je kind", "hoe oud", "jaar oud"],
  food: ["eat", "eating", "food", "lunch", "dinner", "breakfast", "meal", "meals", "snack", "drink", "drinks", "vegetarian", "vegan", "halal", "gluten", "allergy", "allergic", "allergen", "intolerance",
    "diet", "diets", "dietary", "dish", "dishes", "cuisine", "menu", "picnic", "refreshments",
    "essen", "mittagessen", "abendessen", "fruhstuck", "trinken", "vegetarisch", "allergie", "verpflegung", "mahlzeit", "getranke",
    "eten", "drinken", "maaltijd", "ontbijt", "diner", "dieet"],
  safety: ["safe", "safety", "danger", "dangerous", "life jacket", "life jackets", "lifejacket", "life vest", "insurance", "insured", "crime", "criminal", "theft", "thieves", "robbery", "robbed",
    "scam", "scams", "risk", "risks", "risky", "hazard", "accident", "emergency", "first aid", "shark", "swim in", "swimming in", "licensed", "registered", "accredited", "certified",
    "sicher", "sicherheit", "gefahrlich", "gefahr", "versicherung", "versichert", "kriminalitat", "diebstahl", "schwimmweste", "rettungsweste", "hai", "haie", "lizenziert",
    "veilig", "veiligheid", "gevaarlijk", "gevaar", "verzekering", "verzekerd", "criminaliteit", "diefstal", "zwemvest", "reddingsvest", "haai"],
  "whats included": ["included", "include", "includes", "inclusive", "exclude", "exclusions", "cover", "covered", "what do i get", "in the price", "in the cost",
    "price include", "price includes", "price cover", "price covers", "cost include", "cost includes", "cost covers",
    "inklusive", "enthalten", "inbegriffen", "im preis",
    "inbegrepen", "inclusief", "exclusief", "in de prijs"],
  "how to book": ["book", "booking", "reserve", "reservation", "sign up", "private tour", "private tours", "private trip", "private excursion", "private guide", "private group",
    "group booking", "custom tour", "custom tours", "custom itinerary", "custom itineraries", "customised", "customized", "tailor made", "bespoke",
    "my booking", "our booking", "my reservation", "our reservation", "meine buchung", "unsere buchung", "meine reservierung", "mijn boeking", "onze boeking", "mijn reservering",
    "buchen", "buchung", "reservieren", "reservierung", "anmelden", "anmeldung", "privattour",
    "boeken", "boeking", "reserveren", "reservering", "aanmelden", "aanmelding", "privetour"],
  cancellation: ["cancel", "cancellation", "cancellation fee", "cancellation fees", "refund", "change my booking", "changing my booking", "change the booking", "change a booking", "change my reservation", "change the date", "amend", "reschedule", "postpone", "money back", "no show",
    "stornier", "storno", "absagen", "umbuch", "erstattung", "ruckerstattung", "rucktritt", "geld zuruck",
    "annuleren", "annulering", "terugbetaling", "restitutie", "terugkrijgen", "omboeken", "verzetten", "geld terug"],
};

/** R2: weak words. They appear in questions about many topics ("Do I need a visa?", "best time to visit"), so they count
 *  as a hit but never decide a topic on their own and never win a tie. Words that only describe the tour ("full day") and
 *  booking nouns are weak too: "booking" is usually the object of another question ("cancel my booking", "booking fee"),
 *  and "my booking" (an existing booking) is never a "how do I book?" question. */
// prettier-ignore
export const GENERIC = new Set(["bring", "need", "time", "tijd", "where", "wo", "waar", "start", "begint", "beginnt", "location", "water", "age", "ages", "aged", "drink", "drinks", "include", "cover", "covered",
  "how old", "wie alt", "hoe oud",
  "full day", "half day", "all day", "ganztag", "halbtag", "hele dag", "halve dag",
  "booking", "reservation", "buchung", "reservierung", "boeking", "reservering",
  "my booking", "our booking", "my reservation", "our reservation", "meine buchung", "unsere buchung", "meine reservierung", "mijn boeking", "onze boeking", "mijn reservering"]);

/** R2: the few weak words that ARE enough on their own, for one topic only ("When does the tour start?", "Is there a minimum age?").
 *  Not on this list on purpose: need, time, where, pay, money (the words behind the false answers on visa, currency and season
 *  questions), a bare "bring" ("Can I bring my laptop?": what to bring is recognised by phrases like "what should I bring") and
 *  the verb "drink" ("Can I drink alcohol?"): only the noun "drinks" ("Are drinks provided?") counts. */
export const STANDS_ALONE: Record<string, string[]> = {
  "meeting point": ["start", "begint", "beginnt"],
  children: ["age", "ages", "aged"],
  food: ["drinks"],
  "whats included": ["include"],
  "how to book": ["booking", "reservation", "buchung", "reservierung", "boeking", "reservering"],
};

/** R5: subjects that none of Noor's ten answers covers: travel admin, general information, other businesses. A question that
 *  contains one is about that subject ("How much does a visa cost?", "Is it safe to use an ATM?", "Pick-up from the airport?"),
 *  so even a clear in-scope word next to it must not produce an answer: the question goes to Noor. A longer in-scope phrase that
 *  contains one of these words still wins (R3): "money back" is a refund question. */
// prettier-ignore
export const OUT_OF_SCOPE = [
  // entry rules and health
  "visa", "visas", "visum", "passport", "paspoort", "reisepass", "vaccin", "impfung", "impfungen", "impfen", "inenting", "immunis", "immuniz", "malaria", "yellow fever", "gelbfieber", "gele koorts",
  "travel insurance", "reiseversicherung", "reisverzekering", "health", "gesundheit", "gezondheid", "medical", "doctor", "arzt", "dokter", "hospital", "krankenhaus", "ziekenhuis", "pharmacy", "medicine", "medication",
  // money abroad
  "money", "geld", "cash", "bargeld", "contant", "currency", "currencies", "wahrung", "valuta", "exchange", "wechselkurs", "wisselkoers", "atm", "atms", "geldautomat", "bankautomaat", "pinautomaat",
  "card", "cards", "kreditkarte", "bankkarte", "kartenzahlung", "creditcard", "bankkaart", "pinpas", "bank", "banks", "tip", "tipping", "gratuity", "trinkgeld", "fooi", "fooien",
  // getting there, time difference, luggage
  "flight", "airline", "airport", "flug", "fluge", "flughafen", "fluggesellschaft", "vlucht", "luchthaven", "vliegveld", "time difference", "time zone", "timezone", "jet lag", "jetlag",
  "zeitverschiebung", "zeitunterschied", "tijdsverschil", "tijdverschil", "luggage", "baggage", "suitcase", "gepack", "koffer", "bagage", "taxi", "taxis",
  // water quality, languages, pets, pools, opening hours
  "tap water", "drinking water", "safe to drink", "leitungswasser", "trinkwasser", "kraanwater", "drinkwater",
  "speak", "language", "translat", "interpret", "sprache", "sprech", "spricht", "taal", "spreek", "spreken",
  "my pet", "your pet", "a pet", "pet friendly", "pets", "dog", "dogs", "hund", "hunde", "hunden", "haustier", "hond", "honden", "huisdier", "pool", "pools", "schwimmbad", "zwembad",
  "opening hours", "office hours", "business hours", "opening times",
  // other places and other businesses: venue tips, "nearest X", nature reserves, "about us" questions
  "restaurant", "where to eat", "place to eat", "places to eat", "nearby", "nearest", "closest", "in der nahe", "in de buurt", "nature reserve", "game reserve",
  "how long have", "how long has", "how long ago", "family run", "family owned", "family business",
];

/** R5: places to stay. In a tour FAQ a hotel word belongs to pick-up questions ("Can you pick us up from our hotel?"). Next to any
 *  other clear topic the question is about the hotel ("Is breakfast included at the hotel?", "Can I book a hotel?", "Does the hotel
 *  have a safe?"), so it is declined. */
// prettier-ignore
export const STAY_WORDS = ["hotel", "lodge", "resort", "guesthouse", "hostel", "accommodation", "unterkunft", "accommodatie"];

/** R5: circumstance words (weather, season, covid, currencies, "pay"). They are rarely the real question and they make a lone
 *  weak word like "start" unreliable ("When does the rainy season start?"), so with one of them only a strong in-scope word may
 *  answer ("Can I cancel if the weather is bad?" still works). */
// prettier-ignore
export const CONTEXT_WORDS = [
  "weather", "climate", "temperature", "rain", "rains", "rainy", "raining", "rainfall", "season", "covid", "coronavirus", "pandemic",
  "wetter", "klima", "temperatur", "regen", "regenzeit", "jahreszeit", "saison", "corona", "weer", "klimaat", "temperatuur", "seizoen",
  "euro", "euros", "dalasi", "pound", "pounds", "dollar", "pay", "paying", "paid", "payment", "payments",
  "pfund", "bezahlen", "zahlen", "zahlung", "bezahlung", "pond", "betalen", "betaal", "betaling",
];

/* ---------- Matching ---------- */
const HARD = "#out-of-scope",
  SOFT = "#context",
  STAY = "#stay";
type Hit = { topic: string; key: string; from: number; to: number };

/** Lower case, no accents, letters only (digits and punctuation split words: "what's" -> "what s"). */
export const tokenize = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Every place in `words` where one of `keys` occurs, as a word span [from, to). */
function findHits(words: string[], topic: string, keys: readonly string[]): Hit[] {
  const out: Hit[] = [];
  for (const key of keys) {
    const parts = key.split(" ");
    const last = parts.length - 1;
    for (let i = 0; i + parts.length <= words.length; i++) {
      const ok = parts.every((p, j) => {
        const w = words[i + j] ?? "";
        return w === p || (j === last && p.length > 4 && w.startsWith(p));
      });
      if (ok) out.push({ topic, key, from: i, to: i + parts.length });
    }
  }
  return out;
}

type Evidence = { hits: number; strong: number; lone: number };
const NONE: Evidence = { hits: 0, strong: 0, lone: 0 };

/** Evidence per topic plus the out-of-scope flags. `hits` = distinct words/phrases (R1), `strong` = hits with a non-weak word,
 *  `lone` = hits made only of a weak word that is on the allow-list for that topic (R2). */
function analyse(text: string): {
  topics: Record<string, Evidence>;
  blocked: boolean;
  soft: boolean;
  stay: boolean;
} {
  const words = tokenize(text);
  let all: Hit[] = [];
  for (const topic of Object.keys(KEYWORDS))
    all = all.concat(findHits(words, topic, KEYWORDS[topic] ?? []));
  all = all.concat(
    findHits(words, HARD, OUT_OF_SCOPE),
    findHits(words, SOFT, CONTEXT_WORDS),
    findHits(words, STAY, STAY_WORDS),
  );
  // R3: a hit that lies strictly inside a longer hit is dropped, whatever topic the longer one belongs to.
  const kept = all.filter(
    (a) => !all.some((b) => b.from <= a.from && a.to <= b.to && b.to - b.from > a.to - a.from),
  );
  const topics: Record<string, Evidence> = {};
  for (const topic of Object.keys(KEYWORDS)) {
    const spans = new Map<string, string[]>(); // R1: hits on the same words (e.g. "child" and "children") count once
    for (const h of kept)
      if (h.topic === topic) {
        const id = `${h.from}-${h.to}`;
        spans.set(id, [...(spans.get(id) ?? []), h.key]);
      }
    let strong = 0,
      lone = 0;
    for (const keys of spans.values()) {
      if (keys.some((k) => !GENERIC.has(k))) strong++;
      else if (keys.some((k) => STANDS_ALONE[topic]?.includes(k))) lone++;
    }
    topics[topic] = { hits: spans.size, strong, lone };
  }
  return {
    topics,
    blocked: kept.some((h) => h.topic === HARD),
    soft: kept.some((h) => h.topic === SOFT),
    stay: kept.some((h) => h.topic === STAY),
  };
}

/** Keyword evidence for one topic (phrases count as one hit; single words also match longer forms, e.g. "bookings").
 *  `strong` = hits that did not come only from a weak word. */
export function topicHitsDetailed(text: string, topic: string): { hits: number; strong: number } {
  const { hits, strong } = analyse(text).topics[topic] ?? NONE;
  return { hits, strong };
}
export function topicHits(text: string, topic: string): number {
  return topicHitsDetailed(text, topic).hits;
}

type WithSample = { is_sample?: boolean | null };
/** Scores TOPICS (not answers), so a real and a sample answer for one topic never tie each other.
 *  Per topic a real approved answer is always preferred; the sample is used only when no real one exists. */
export function matchQuestion<A extends MatchableAnswer & WithSample>(
  text: string,
  answers: A[],
): { answer: A | null; confidence: number; topic?: string } {
  const byTopic = new Map<string, A>();
  for (const a of answers) {
    const topic = a.recordings?.questions?.topic ?? "";
    const cur = byTopic.get(topic);
    if (!cur || (cur.is_sample && !a.is_sample)) byTopic.set(topic, a);
  }
  const ev = analyse(text);
  if (ev.blocked) return { answer: null, confidence: 0 }; // R5: about something Noor does not cover
  if (ev.stay && Object.entries(ev.topics).some(([t, e]) => t !== "meeting point" && e.strong > 0))
    return { answer: null, confidence: 0 }; // R5: about the hotel
  const scores = [...byTopic].map(([topic, answer]) => ({
    topic,
    answer,
    ...(ev.topics[topic] ?? NONE),
  }));
  // R2/R5: only topics with a strong word, or (without a circumstance word) a stand-alone weak word, may answer.
  const usable = scores
    .filter((x) => x.strong > 0 || (x.lone > 0 && !ev.soft))
    .sort((x, y) => y.strong - x.strong || y.hits - x.hits);
  const best = usable[0];
  if (!best) return { answer: null, confidence: scores.some((x) => x.hits > 0) ? 0.3 : 0 };
  // R6: equal evidence in two topics: never guess.
  if (usable.some((x) => x !== best && x.strong === best.strong && x.hits === best.hits))
    return { answer: null, confidence: 0.3, topic: best.topic };
  const confidence = best.hits >= 2 ? 0.9 : 0.65;
  return {
    answer: confidence >= CONFIDENCE_THRESHOLD ? best.answer : null,
    confidence,
    topic: best.topic,
  };
}
