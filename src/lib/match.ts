// Pure, environment-agnostic matching logic (used by server functions; later by WhatsApp/SMS handlers).
export type MatchableAnswer = { id: string; recordings?: { questions?: { topic: string } | null } | null };
export const CONFIDENCE_THRESHOLD = 0.6;
export const NOT_SURE: Record<"en" | "de" | "nl", string> = {
  en: "Not sure, Fatou will answer.",
  de: "Nicht sicher, Fatou wird antworten.",
  nl: "Niet zeker, Fatou zal antwoorden.",
};

/* ---------- Simple keyword matching (no AI yet) ---------- */
const KEYWORDS: Record<string, string[]> = {
  price: ["price", "cost", "much", "pay", "euro", "dalasi", "money", "preis", "kostet", "kosten", "teuer", "prijs", "kost", "betalen", "geld"],
  "meeting point": ["meet", "meeting", "where", "pickup", "start", "treffen", "treffpunkt", "wo", "abholen", "ontmoeten", "waar", "verzamelen", "ophalen"],
  duration: ["long", "hours", "duration", "time", "lange", "dauer", "dauert", "stunden", "lang", "duurt", "uur", "tijd"],
  "what to bring": ["bring", "pack", "wear", "shoes", "mitbringen", "mitnehmen", "anziehen", "meenemen", "aantrekken", "schoenen"],
  children: ["child", "children", "kids", "kid", "baby", "family", "kind", "kinder", "familie", "kinderen", "gezin"],
  food: ["food", "lunch", "eat", "vegetarian", "allergy", "essen", "mittagessen", "vegetarisch", "eten", "lunch", "allergie"],
  safety: ["safe", "safety", "danger", "dangerous", "sicher", "sicherheit", "gefährlich", "veilig", "veiligheid", "gevaarlijk"],
  "whats included": ["included", "include", "includes", "inklusive", "enthalten", "inbegrepen", "inclusief"],
  "how to book": ["book", "booking", "reserve", "contact", "phone", "buchen", "buchung", "reservieren", "boeken", "reserveren", "bellen"],
  cancellation: ["cancel", "cancellation", "refund", "stornieren", "storno", "absagen", "annuleren", "annulering", "terugbetaling"],
};

export function matchQuestion<A extends MatchableAnswer>(text: string, answers: A[]): { answer: A | null; confidence: number } {
  const words = text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const scores = answers.map((a) => {
    const topic = a.recordings?.questions?.topic ?? "";
    const kws = KEYWORDS[topic] ?? [];
    const hits = words.filter((w) => kws.some((k) => w === k || (k.length > 4 && w.startsWith(k)))).length;
    return { answer: a, hits };
  }).sort((x, y) => y.hits - x.hits);
  const best = scores[0];
  if (!best || best.hits === 0) return { answer: null, confidence: 0 };
  const tie = scores[1] && scores[1].hits === best.hits;
  const confidence = tie ? 0.3 : best.hits >= 2 ? 0.9 : 0.65;
  return { answer: confidence >= CONFIDENCE_THRESHOLD ? best.answer : null, confidence };
}
