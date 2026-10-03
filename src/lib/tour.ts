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

const PUBLIC_SELECT =
  "id, english, german, dutch, flags, review_status, is_sample, recording_id, recordings(id, question_id, questions(position, text_en, topic))";

export async function fetchAnswers(status?: AnswerRow["review_status"], publicOnly = false) {
  let q = supabase.from("answers").select(publicOnly ? PUBLIC_SELECT : ANSWER_SELECT);
  if (status) q = q.eq("review_status", status);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as AnswerRow[];
  return rows.sort((a, b) => (a.recordings?.questions?.position ?? 0) - (b.recordings?.questions?.position ?? 0));
}

export { matchQuestion } from "./match";
