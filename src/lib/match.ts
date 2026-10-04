// Pure keyword matching used by the WhatsApp/SMS backend (src/lib/tourcoach.server.ts).
export type MatchableAnswer = { id: string; recordings?: { questions?: { topic: string } | null } | null };
export const CONFIDENCE_THRESHOLD = 0.6;
export const NOT_SURE: Record<"en" | "de" | "nl", string> = {
  en: "Not sure, Noor will answer.",
  de: "Nicht sicher, Noor wird antworten.",
  nl: "Niet zeker, Noor zal antwoorden.",
};

/* ---------- Keyword matching (no AI): EN/DE/NL words and phrases per topic ---------- */
export const KEYWORDS: Record<string, string[]> = {
  price: ["price", "prices", "cost", "costs", "how much", "fee", "fees", "pay", "dalasi", "euro", "euros", "expensive", "cheap", "money",
    "preis", "preise", "kosten", "kostet", "wie viel", "wieviel", "teuer", "billig", "bezahlen",
    "prijs", "kost", "hoeveel", "duur", "goedkoop", "betalen", "geld"],
  "meeting point": ["where", "meet", "meeting", "pickup", "pick up", "pick us up", "pick me up", "pick you up", "collect us", "location", "start", "wo", "treffen", "treffpunkt", "abholen", "waar", "ontmoeten", "verzamelen", "ophalen"],
  duration: ["how long", "hours", "hour", "duration", "time", "wie lange", "dauer", "dauert", "stunden", "hoe lang", "duurt", "uur", "tijd"],
  "what to bring": ["bring", "wear", "pack", "need", "hat", "water", "shoes", "mitbringen", "mitnehmen", "anziehen", "meenemen", "aantrekken", "schoenen"],
  children: ["kids", "kid", "children", "child", "family", "age", "baby", "kind", "kinder", "familie", "alter", "kinderen", "gezin", "leeftijd"],
  food: ["eat", "food", "lunch", "drink", "meal", "vegetarian", "allergy", "essen", "mittagessen", "trinken", "vegetarisch", "eten", "drinken", "maaltijd"],
  safety: ["safe", "safety", "danger", "dangerous", "life jacket", "insurance", "sicher", "sicherheit", "gefahrlich", "versicherung", "veilig", "veiligheid", "gevaarlijk", "verzekering"],
  "whats included": ["included", "include", "includes", "cover", "covered", "what do i get", "inklusive", "enthalten", "inbegriffen", "inbegrepen", "inclusief"],
  "how to book": ["book", "booking", "reserve", "reservation", "sign up", "buchen", "buchung", "reservieren", "boeken", "reserveren", "aanmelden"],
  cancellation: ["cancel", "cancellation", "refund", "change my booking", "stornieren", "storno", "absagen", "annuleren", "annulering", "terugbetaling"],
};

const norm = (t: string) => " " + t.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean).join(" ") + " ";

/** Very common words that appear in questions about other topics too ("Can we bring our kids?"). They count as hits,
 *  but are ignored when two topics tie, so the more specific topic wins. */
const GENERIC = new Set(["bring", "need", "time", "where", "start", "wo", "age", "pay", "drink", "include"]);

/** Keyword hits for one topic (phrases count as one hit; single words also match longer forms, e.g. "booking").
 *  `strong` = hits that did not come from a generic word. */
export function topicHitsDetailed(text: string, topic: string): { hits: number; strong: number } {
  const t = norm(text);
  const words = t.trim().split(" ");
  let hits = 0, strong = 0;
  for (const k of KEYWORDS[topic] ?? []) {
    const hit = k.includes(" ") ? t.includes(` ${k} `) : words.some((w) => w === k || (k.length > 4 && w.startsWith(k)));
    if (hit) { hits++; if (!GENERIC.has(k)) strong++; }
  }
  return { hits, strong };
}
export function topicHits(text: string, topic: string): number {
  return topicHitsDetailed(text, topic).hits;
}

type WithSample = { is_sample?: boolean | null };
/** Scores TOPICS (not answers), so a real and a sample answer for one topic never tie each other.
 *  Per topic a real approved answer is always preferred; the sample is used only when no real one exists. */
export function matchQuestion<A extends MatchableAnswer & WithSample>(text: string, answers: A[]): { answer: A | null; confidence: number; topic?: string } {
  const byTopic = new Map<string, A>();
  for (const a of answers) {
    const topic = a.recordings?.questions?.topic ?? "";
    const cur = byTopic.get(topic);
    if (!cur || (cur.is_sample && !a.is_sample)) byTopic.set(topic, a);
  }
  const scores = [...byTopic].map(([topic, answer]) => ({ topic, answer, ...topicHitsDetailed(text, topic) })).sort((x, y) => y.hits - x.hits || y.strong - x.strong);
  const best = scores[0];
  if (!best || best.hits === 0) return { answer: null, confidence: 0 };
  const tied = scores.filter((x) => x.hits === best.hits);
  let winner = best;
  let confidence = best.hits >= 2 ? 0.9 : 0.65;
  if (tied.length > 1) {
    // Tie: only a topic with MORE non-generic hits than every other tied topic wins; otherwise stay unsure (never guess).
    const top = Math.max(...tied.map((x) => x.strong));
    const leaders = tied.filter((x) => x.strong === top);
    if (leaders.length === 1 && top > 0) { winner = leaders[0]!; confidence = 0.65; } else confidence = 0.3;
  }
  const best2 = winner;
  return { answer: confidence >= CONFIDENCE_THRESHOLD ? best2.answer : null, confidence, topic: best2.topic };
}
