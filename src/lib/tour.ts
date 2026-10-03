import { supabase } from "@/integrations/supabase/client";

export type Lang = "en" | "de" | "nl";
export const LANGS: { code: Lang; label: string; flag: string; field: "english" | "german" | "dutch" }[] = [
  { code: "en", label: "English", flag: "🇬🇧", field: "english" },
  { code: "de", label: "Deutsch", flag: "🇩🇪", field: "german" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱", field: "dutch" },
];

export const TOPIC_ICON: Record<string, string> = {
  price: "💰", "meeting point": "📍", duration: "⏱️", "what to bring": "🎒", children: "🧒",
  food: "🍲", safety: "🛡️", "whats included": "✅", "how to book": "📞", cancellation: "↩️",
};

export const PLACES = ["Senegambia", "Kololi", "Lamin Lodge", "Lamin", "Brikama", "Banjul", "Serrekunda", "Bakau", "Gambia"];

export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}

export const ANSWER_SELECT =
  "id, transcript_src, english, german, dutch, roundtrip_score, flags, review_status, approved_at, is_sample, recording_id, recordings(id, question_id, audio_path, week, is_sample, questions(position, text_en, topic))";

export type AnswerRow = {
  id: string; transcript_src: string | null; english: string | null; german: string | null; dutch: string | null;
  roundtrip_score: number | null; flags: string[]; review_status: "pending" | "approved" | "rerecord" | "needs_bilingual";
  approved_at: string | null; is_sample: boolean; recording_id: string;
  recordings: { id: string; question_id: string; audio_path: string | null; week: string; is_sample: boolean;
    questions: { position: number; text_en: string; topic: string } | null } | null;
};

export async function fetchAnswers(status?: AnswerRow["review_status"]) {
  let q = supabase.from("answers").select(ANSWER_SELECT);
  if (status) q = q.eq("review_status", status);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as AnswerRow[];
  return rows.sort((a, b) => (a.recordings?.questions?.position ?? 0) - (b.recordings?.questions?.position ?? 0));
}

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

export function matchQuestion(text: string, answers: AnswerRow[]) {
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
  return { answer: confidence >= 0.6 ? best.answer : null, confidence };
}
