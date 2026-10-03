// TourCoach backend logic (server-only). Used by /api/public/whatsapp-webhook and /api/public/weekly-digest.
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { matchQuestion, NOT_SURE } from "./match";

type Lang = "en" | "de" | "nl";
const FIELD = { en: "english", de: "german", nl: "dutch" } as const;
const TOTAL_QUESTIONS = 10;
const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

/* ---------------- Phase-2 placeholders (NOT implemented yet; no external calls) ---------------- */
export async function transcribe(_mediaUrl: string): Promise<string | null> {
  return null; // TODO phase 2: ElevenLabs speech-to-text (scribe_v2, language_code "wol")
}
export async function translate(_text: string, _to: Lang): Promise<string | null> {
  return null; // TODO phase 2: Lovable AI translation (Wolof -> EN, EN -> DE/NL)
}
export async function roundtrip(_source: string, _translated: string): Promise<number | null> {
  return null; // TODO phase 2: Lovable AI round-trip consistency score
}
export async function speak(_text: string, _lang: Lang): Promise<string | null> {
  return null; // TODO phase 2: ElevenLabs text-to-speech with a neutral stock voice (labeled AI-generated)
}

/* ---------------- Helpers ---------------- */
function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
}

export function hashPhone(phone: string) {
  return createHash("sha256").update(env("PHONE_HASH_SALT") + "|" + phone.replace(/^whatsapp:/, "")).digest("hex");
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Twilio request validation: base64(HMAC-SHA1(authToken, url + sorted(key+value))). */
export function validTwilioSignature(url: string, params: Record<string, string>, signature: string | null) {
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", env("TWILIO_AUTH_TOKEN")).update(data, "utf8").digest("base64");
  return safeEqual(expected, signature);
}

export function isDigestAuthorized(header: string | null) {
  return !!header && safeEqual(header, env("DIGEST_TRIGGER_SECRET"));
}

async function twilioSend(to: string, from: string, body: string) {
  const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("LOVABLE_API_KEY")}`,
      "X-Connection-Api-Key": env("TWILIO_API_KEY"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 1550) }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`Twilio send failed [${res.status}]: ${txt}`);
    throw new Error(`Twilio send failed [${res.status}]`);
  }
}

const asWhatsApp = (n: string) => (n.startsWith("whatsapp:") ? n : `whatsapp:${n}`);

function reviewLine() {
  const url = process.env["GOOGLE_REVIEW_URL"];
  return url ? `Reviews help Fatou: ${url}` : "Reviews help Fatou: [review link not set yet — Simulated]";
}

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}

type Conv = {
  phone_hash: string; role: "visitor" | "champion"; state: string; current_question_position: number | null;
  lang: Lang; last_visitor_question_id: string | null; current_review_answer_id: string | null;
};

/* ---------------- WhatsApp state machine ---------------- */
export async function handleWhatsApp(input: { from: string; body: string; mediaUrl: string | null }) {
  const db = supabaseAdmin;
  const phone_hash = hashPhone(input.from);
  let { data: conv } = await db.from("conversations").select("*").eq("phone_hash", phone_hash).maybeSingle();
  if (!conv) {
    const ins = await db.from("conversations").insert({ phone_hash }).select("*").single();
    conv = ins.data;
  }
  const c = conv as Conv;
  const save = (patch: Partial<Conv>) => db.from("conversations").update(patch).eq("phone_hash", phone_hash);

  const reply = await route(c, input, save);
  await twilioSend(asWhatsApp(input.from), asWhatsApp(env("DEMO_WHATSAPP_NUMBER")), reply);
}

async function route(c: Conv, input: { body: string; mediaUrl: string | null }, save: (p: Partial<Conv>) => unknown) {
  const text = input.body.trim();
  const upper = text.toUpperCase();

  // DEMO SHORTCUT: champion login by PIN over WhatsApp. Not a real authentication method.
  const pinMatch = /^REVIEW\s+(\S+)$/i.exec(text);
  if (pinMatch) {
    if (safeEqual(pinMatch[1]!, env("DEMO_CHAMPION_PIN"))) {
      await save({ role: "champion", state: "idle", current_question_position: null, current_review_answer_id: null });
      return "Champion mode (demo shortcut).\nSTART = record the 10 questions\nREVIEW = review pending answers\nEXIT = back to visitor mode";
    }
    return "Wrong PIN (demo shortcut).";
  }
  if (upper === "EXIT") {
    await save({ role: "visitor", state: "idle", current_question_position: null, current_review_answer_id: null });
    return "Visitor mode. Ask any question about the tour. Reply EN, DE or NL to change language.";
  }
  return c.role === "champion" ? champion(c, upper, input.mediaUrl, save) : visitor(c, text, upper, save);
}

/* ---------------- Visitor ---------------- */
const CLEAR_Q: Record<Lang, string> = {
  en: "Was this clear? Reply YES or NO",
  de: "War das verständlich? Antworten Sie YES oder NO",
  nl: "Was dit duidelijk? Antwoord YES of NO",
};

async function visitor(c: Conv, text: string, upper: string, save: (p: Partial<Conv>) => unknown) {
  const db = supabaseAdmin;
  if (upper === "EN" || upper === "DE" || upper === "NL") {
    await save({ lang: upper.toLowerCase() as Lang });
    return { EN: "Language: English", DE: "Sprache: Deutsch", NL: "Taal: Nederlands" }[upper];
  }
  if ((upper === "YES" || upper === "NO") && c.last_visitor_question_id) {
    await db.from("visitor_questions").update({ was_clear: upper === "YES" }).eq("id", c.last_visitor_question_id);
    await save({ last_visitor_question_id: null });
    return `Thank you!\n${reviewLine()}`;
  }

  const q = text.slice(0, 500);
  if (!q) return "Please type your question.";
  const { data: rows } = await db
    .from("answers")
    .select("id, english, german, dutch, is_sample, recordings(questions(topic))")
    .eq("review_status", "approved");
  const answers = (rows ?? []) as unknown as Array<{
    id: string; english: string | null; german: string | null; dutch: string | null; is_sample: boolean;
    recordings: { questions: { topic: string } | null } | null;
  }>;
  const { answer, confidence } = matchQuestion(q, answers);
  const answerText = answer?.[FIELD[c.lang]] ?? null;

  const { data: vq } = await db.from("visitor_questions")
    .insert({ text: q, lang: c.lang, matched_answer_id: answerText ? answer!.id : null, confidence })
    .select("id").single();

  if (!answer || !answerText) {
    // Never guess: below threshold -> hand to Fatou.
    if (vq) await db.from("unanswered").insert({ visitor_question_id: vq.id });
    await save({ last_visitor_question_id: vq?.id ?? null });
    return `${NOT_SURE[c.lang]}\n\n${CLEAR_Q[c.lang]}\n${reviewLine()}`;
  }
  await save({ last_visitor_question_id: vq?.id ?? null });
  return [
    answerText + (answer.is_sample ? " (Sample answer)" : ""),
    "— Machine-translated",
    "",
    CLEAR_Q[c.lang],
    reviewLine(),
  ].join("\n");
}

/* ---------------- Champion ---------------- */
async function champion(c: Conv, upper: string, mediaUrl: string | null, save: (p: Partial<Conv>) => unknown) {
  const db = supabaseAdmin;
  const { data: questions } = await db.from("questions").select("id, position, topic").order("position");
  const qs = questions ?? [];
  const ask = (n: number) => `Question ${n} of ${TOTAL_QUESTIONS}: ${qs[n - 1]?.topic ?? "?"}\nReply with a voice note.`;

  if (upper === "START") {
    await save({ state: "recording", current_question_position: 1 });
    return ask(1);
  }

  if (c.state === "recording" && c.current_question_position) {
    const n = c.current_question_position;
    if (!mediaUrl) return `Please send a voice note for question ${n}.\n${ask(n)}`;
    const q = qs[n - 1];
    if (!q) return "Question not found.";
    const { data: rec } = await db.from("recordings")
      .insert({ question_id: q.id, audio_path: mediaUrl, week: isoWeek(), status: "received" })
      .select("id").single();
    if (rec) {
      // Phase 1: placeholders return null; answer waits for review with no text yet.
      const transcript = await transcribe(mediaUrl);
      await db.from("answers").insert({
        recording_id: rec.id, transcript_src: transcript, review_status: "pending",
        flags: ["machine-translated", "placeholder: not transcribed yet"],
      });
    }
    const next = n + 1;
    if (next > TOTAL_QUESTIONS) {
      await save({ state: "idle", current_question_position: null });
      return `Got question ${n}. Round complete. Reply REVIEW to review.`;
    }
    await save({ current_question_position: next });
    return `Got question ${n}.\n\n${ask(next)}`;
  }

  if (upper === "REVIEW") return showNextPending(save, null);

  if (c.state === "reviewing" && c.current_review_answer_id) {
    const m = /^([123])\b/.exec(upper);
    if (!m) return "Reply 1 approve, 2 re-record, 3 needs bilingual reviewer.";
    const status = { "1": "approved", "2": "rerecord", "3": "needs_bilingual" }[m[1]!] as "approved" | "rerecord" | "needs_bilingual";
    await db.from("answers").update({
      review_status: status, approved_at: status === "approved" ? new Date().toISOString() : null,
    }).eq("id", c.current_review_answer_id);
    const label = { approved: "Approved", rerecord: "Marked for re-record", needs_bilingual: "Sent to bilingual reviewer" }[status];
    return `${label}.\n\n${await showNextPending(save, c.current_review_answer_id)}`;
  }

  return "Champion mode (demo shortcut). START, REVIEW or EXIT.";
}

async function showNextPending(save: (p: Partial<Conv>) => unknown, _after: string | null) {
  const { data } = await supabaseAdmin
    .from("answers")
    .select("id, english, is_sample, created_at, recordings(questions(position, topic))")
    .eq("review_status", "pending")
    .order("created_at");
  const list = (data ?? []) as unknown as Array<{
    id: string; english: string | null; is_sample: boolean; recordings: { questions: { position: number; topic: string } | null } | null;
  }>;
  const item = list[0];
  if (!item) {
    await save({ state: "idle", current_review_answer_id: null });
    return "No pending answers.";
  }
  await save({ state: "reviewing", current_review_answer_id: item.id });
  const q = item.recordings?.questions;
  return [
    `Pending: ${list.length}. Now: question ${q?.position} (${q?.topic})${item.is_sample ? " (Sample answer)" : ""}`,
    item.english ?? "[No text yet — transcription/translation placeholder, Simulated]",
    "",
    "Reply 1 approve, 2 re-record, 3 needs bilingual reviewer",
  ].join("\n");
}

/* ---------------- Weekly digest ---------------- */
export async function sendWeeklyDigest() {
  const db = supabaseAdmin;
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: vqs } = await db.from("visitor_questions")
    .select("id, text, is_sample, answers(recordings(questions(topic)))")
    .gte("created_at", since);
  const rows = (vqs ?? []) as unknown as Array<{
    id: string; text: string; is_sample: boolean; answers: { recordings: { questions: { topic: string } | null } | null } | null;
  }>;
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const t = r.answers?.recordings?.questions?.topic ?? "unanswered";
    counts[t] = (counts[t] ?? 0) + 1;
  }
  const { data: un } = await db.from("unanswered")
    .select("visitor_questions(text, is_sample)").gte("created_at", since).limit(10);
  const unList = ((un ?? []) as unknown as Array<{ visitor_questions: { text: string; is_sample: boolean } | null }>)
    .map((u) => u.visitor_questions).filter(Boolean)
    .map((v) => `- ${v!.text.slice(0, 80)}${v!.is_sample ? " (Sample)" : ""}`);
  const hasSample = rows.some((r) => r.is_sample);

  const body = [
    "TourCoach demo — weekly digest" + (hasSample ? " (includes Sample data)" : ""),
    `Questions (7 days): ${rows.length}`,
    ...Object.entries(counts).map(([k, v]) => `${k}: ${v}`),
    "Unanswered:",
    ...(unList.length ? unList : ["- none"]),
  ].join("\n");

  await twilioSend(env("DEMO_SMS_NUMBER"), env("TWILIO_SMS_FROM"), body);
  return { sent: true, questions: rows.length, unanswered: unList.length };
}
