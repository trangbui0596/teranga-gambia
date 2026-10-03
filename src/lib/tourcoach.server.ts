import { guardCleanup, reviewLinkMessage, CLEANUP_INSTRUCTIONS, FEEDBACK_PROMPT, FEEDBACK_OPTIONS, FEEDBACK_DELETED, FEEDBACK_SHARED, FEEDBACK_EMPTY } from "./feedback";
// TourCoach backend logic (server-only). Used by /api/public/whatsapp-webhook, /api/public/weekly-digest
// and /api/public/eval-match.
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { matchQuestion, NOT_SURE } from "./match";
import { runInBackground } from "./background.server";

type Lang = "en" | "de" | "nl";
const FIELD = { en: "english", de: "german", nl: "dutch" } as const;
const LANG_NAME = { en: "English", de: "German", nl: "Dutch", wo: "Wolof" } as const;
const TOTAL_QUESTIONS = 10;
const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const AI_URL = "https://ai.gateway.lovable.dev/v1/responses";
const AI_MODEL = "openai/gpt-6-astra";
const AUDIO_BUCKET = "answer-audio";
const TTS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // ElevenLabs stock voice "Sarah" (neutral, no cloning)
const WOLOF_LABEL = "unverified (no native reviewer yet)";
const ROUNDTRIP_MIN = 0.7;

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

function twilioHeaders(extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${env("LOVABLE_API_KEY")}`, "X-Connection-Api-Key": env("TWILIO_API_KEY"), ...extra };
}

/** Daily outbound cap (MAX_OUTBOUND_PER_DAY, default 60). Atomic counter in the database. */
async function claimOutbound(): Promise<boolean> {
  const max = Number(process.env["MAX_OUTBOUND_PER_DAY"] ?? "60") || 60;
  const { data, error } = await supabaseAdmin.rpc("claim_outbound" as never, { _max: max } as never);
  if (error) {
    console.error("claim_outbound failed", error.message);
    return false; // fail closed: do not spend messages if the counter is broken
  }
  if (!data) console.warn(`[cost-cap] Daily outbound cap of ${max} reached; message NOT sent.`);
  return !!data;
}

/** Sends one Twilio message (text, optionally with one media URL). Returns false when capped. */
async function twilioSend(to: string, from: string, body: string, mediaUrl?: string) {
  if (!(await claimOutbound())) return false;
  const params = new URLSearchParams({ To: to, From: from, Body: body.slice(0, 1550) });
  if (mediaUrl) params.set("MediaUrl", mediaUrl);
  const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: twilioHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: params,
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`Twilio send failed [${res.status}]: ${txt}`);
    throw new Error(`Twilio send failed [${res.status}]`);
  }
  return true;
}

const asWhatsApp = (n: string) => (n.startsWith("whatsapp:") ? n : `whatsapp:${n}`);
const sendWhatsApp = (to: string, body: string, mediaUrl?: string) =>
  twilioSend(asWhatsApp(to), asWhatsApp(env("DEMO_WHATSAPP_NUMBER")), body, mediaUrl);

function reviewLine() {
  const url = process.env["GOOGLE_REVIEW_URL"];
  return url ? `Reviews help Noor: ${url}` : "Reviews help Noor: [review link not set yet — Simulated]";
}

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}

/** Numbers, prices and times written in the transcript (digits only). */
export function numbersHeard(text: string | null) {
  if (!text) return "none";
  const m = text.match(/\d+(?:[.,:]\d+)*(?:\s*(?:dalasi|gmd|euro|eur|€|d\b|h\b|am\b|pm\b))?/gi);
  return m && m.length ? [...new Set(m.map((s) => s.trim()))].join(", ") : "none found";
}

/* ---------------- Lovable AI (Responses API, streamed) ---------------- */
async function aiText(instructions: string, input: string): Promise<string> {
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": env("LOVABLE_API_KEY"), "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: AI_MODEL, instructions, input, stream: true, store: false, reasoning: { effort: "low" } }),
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    throw new Error(`AI request failed [${res.status}]: ${txt.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        let ev: { type?: string; delta?: string; response?: { error?: { message?: string } }; message?: string };
        try { ev = JSON.parse(raw); } catch { continue; }
        if (ev.type === "response.output_text.delta" && ev.delta) out += ev.delta;
        if (ev.type === "response.failed" || ev.type === "error") {
          throw new Error(`AI stream failed: ${ev.response?.error?.message ?? ev.message ?? "unknown"}`);
        }
        if (ev.type === "response.refusal.delta") throw new Error("AI refused the request");
      }
    }
  }
  return out.trim();
}

const TRANSLATE_RULES = [
  "You are a faithful translator for a Gambian tour operator.",
  "Translate faithfully. Never add or remove facts. Do not explain or comment.",
  "Keep every number, price (with its currency, e.g. dalasi / GMD / euro), time, date and place name exactly as in the source.",
  "Output only the translation, nothing else.",
].join("\n");

/* ---------------- Phase 2A implementations ---------------- */

/** Downloads the Twilio media (via the Twilio connector) and transcribes it with ElevenLabs scribe_v2 in Wolof. */
export async function transcribe(mediaUrl: string, languageCode: string | null = "wol"): Promise<{ text: string; confidence: number | null } | null> {
  try {
    const u = new URL(mediaUrl);
    const m = /\/Accounts\/[^/]+\/(.+)$/.exec(u.pathname);
    if (u.hostname !== "api.twilio.com" || !m) throw new Error("Unexpected media URL");
    const media = await fetch(`${GATEWAY_URL}/${m[1]}`, { headers: twilioHeaders(), redirect: "follow" });
    if (!media.ok) throw new Error(`Media download failed [${media.status}]: ${(await media.text()).slice(0, 200)}`);
    const type = (media.headers.get("content-type") ?? "audio/ogg").split(";")[0]!.trim();
    const ext = type.includes("amr") ? "amr" : type.includes("mpeg") || type.includes("mp3") ? "mp3" : type.includes("mp4") ? "m4a" : "ogg";
    const blob = new Blob([await media.arrayBuffer()], { type });

    const form = new FormData();
    form.append("file", blob, `voice.${ext}`);
    form.append("model_id", "scribe_v2");
    if (languageCode) form.append("language_code", languageCode); // null = auto-detect (visitor reviews)
    form.append("tag_audio_events", "false");
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST", headers: { "xi-api-key": env("ELEVENLABS_API_KEY") }, body: form,
    });
    if (!res.ok) throw new Error(`ElevenLabs STT failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as { text?: string; language_probability?: number; words?: Array<{ logprob?: number; type?: string }> };
    const text = (j.text ?? "").trim();
    if (!text) return null;
    const lps = (j.words ?? []).filter((w) => w.type !== "spacing" && typeof w.logprob === "number").map((w) => Math.exp(w.logprob!));
    const confidence = lps.length ? lps.reduce((a, b) => a + b, 0) / lps.length : j.language_probability ?? null;
    return { text, confidence: confidence === null ? null : Math.round(confidence * 100) / 100 };
  } catch (e) {
    console.error("transcribe failed", e);
    return null;
  }
}

/** Lovable AI translation. Wolof -> English (pivot); English -> German/Dutch; English -> Wolof for round-trip. */
export async function translate(text: string, to: Lang | "wo"): Promise<string | null> {
  const from = to === "en" ? "wo" : "en";
  try {
    const out = await aiText(`${TRANSLATE_RULES}\nTranslate from ${LANG_NAME[from]} to ${LANG_NAME[to]}.`, text);
    return out || null;
  } catch (e) {
    console.error(`translate to ${to} failed`, e);
    return null;
  }
}

/** Back-translates English to Wolof and asks the model to score consistency with the original transcript. */
export async function roundtrip(source: string, english: string): Promise<{ score: number; differences: string[]; backWolof: string } | null> {
  try {
    const backWolof = await translate(english, "wo");
    if (!backWolof) return null;
    const raw = await aiText(
      [
        "Compare two Wolof texts: ORIGINAL (a transcript) and BACK (a machine back-translation).",
        "Score how well BACK preserves the meaning of ORIGINAL from 0 to 1.",
        "List every number, price, time or name that differs or is missing between them.",
        'Answer only with JSON: {"score": number, "differences": string[]}',
      ].join("\n"),
      `ORIGINAL:\n${source}\n\nBACK:\n${backWolof}`,
    );
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { score?: number; differences?: string[] };
    const score = Math.max(0, Math.min(1, Number(j.score)));
    if (!Number.isFinite(score)) return null;
    return { score: Math.round(score * 100) / 100, differences: (j.differences ?? []).map(String).slice(0, 10), backWolof };
  } catch (e) {
    console.error("roundtrip failed", e);
    return null;
  }
}

/** ElevenLabs TTS (eleven_multilingual_v2, neutral stock voice). Stores mp3 in the private bucket; returns its path. */
export async function speak(text: string, lang: Lang, answerId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${TTS_VOICE_ID}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": env("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 2500), model_id: "eleven_multilingual_v2", language_code: lang }),
    });
    if (!res.ok) throw new Error(`ElevenLabs TTS failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
    const path = `${answerId}/${lang}.mp3`;
    const { error } = await supabaseAdmin.storage.from(AUDIO_BUCKET)
      .upload(path, new Uint8Array(await res.arrayBuffer()), { contentType: "audio/mpeg", upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return path;
  } catch (e) {
    console.error(`speak ${lang} failed`, e);
    return null;
  }
}

/* ---------------- Background pipelines ---------------- */

async function processRecording(answerId: string, mediaUrl: string, championPhone: string | null, n: number) {
  const db = supabaseAdmin;
  const t = await transcribe(mediaUrl);
  if (!t) {
    await db.from("answers").update({ flags: ["transcription failed"] }).eq("id", answerId);
    if (championPhone) await sendWhatsApp(championPhone, `Question ${n}: the voice note could not be heard (transcription failed). It stays pending.`);
    return;
  }
  const flags = ["machine-translated", `wolof ${WOLOF_LABEL}`];
  const english = await translate(t.text, "en");
  let german: string | null = null, dutch: string | null = null, score: number | null = null;
  if (!english) flags.push("translation failed");
  else {
    [german, dutch] = await Promise.all([translate(english, "de"), translate(english, "nl")]);
    if (!german || !dutch) flags.push("translation failed");
    const rt = await roundtrip(t.text, english);
    if (!rt) flags.push("round-trip check failed");
    else {
      score = rt.score;
      if (rt.score < ROUNDTRIP_MIN || rt.differences.length) flags.push("round-trip mismatch");
    }
  }
  // Never auto-approve: review_status stays "pending".
  await db.from("answers").update({
    transcript_src: t.text, transcript_confidence: t.confidence, english, german, dutch, roundtrip_score: score, flags,
  } as never).eq("id", answerId);
  // Phone-call recordings have no WhatsApp sender to notify; the champion sees them in REVIEW.
  if (championPhone) await sendWhatsApp(championPhone, [
    `Question ${n} heard. Wolof transcript (${WOLOF_LABEL}):`,
    t.text,
    `Numbers heard: ${numbersHeard(t.text)}`,
  ].join("\n"));
}

async function generateAnswerAudio(answerId: string) {
  const db = supabaseAdmin;
  const { data } = await db.from("answers").select("english, german, dutch, review_status").eq("id", answerId).maybeSingle();
  if (!data || data.review_status !== "approved") return; // audio only AFTER approval
  for (const lang of ["en", "de", "nl"] as const) {
    const text = data[FIELD[lang]];
    if (!text) continue;
    const path = await speak(text, lang, answerId);
    if (path) await db.from("answer_audio").upsert({ answer_id: answerId, lang, audio_path: path }, { onConflict: "answer_id,lang" });
  }
}

/* ---------------- WhatsApp state machine ---------------- */
type Conv = {
  phone_hash: string; role: "visitor" | "champion"; state: string; current_question_position: number | null;
  lang: Lang; last_visitor_question_id: string | null; current_review_answer_id: string | null; current_feedback_id?: string | null;
  pending_action?: { answer_id: string; status: "approved" | "rerecord" | "needs_bilingual" } | null;
  agent_history?: Array<{ role: "user" | "assistant"; content: string }>;
};
type Reply = { text: string; audioUrl?: string | undefined; secondText?: string | undefined };
type Save = (p: Partial<Conv>) => unknown;

export async function handleWhatsApp(input: { from: string; body: string; mediaUrl: string | null }) {
  const db = supabaseAdmin;
  const phone_hash = hashPhone(input.from);
  let { data: conv } = await db.from("conversations").select("*").eq("phone_hash", phone_hash).maybeSingle();
  if (!conv) {
    const ins = await db.from("conversations").insert({ phone_hash }).select("*").single();
    conv = ins.data;
  }
  const c = conv as unknown as Conv;
  const save: Save = (patch) => db.from("conversations").update(patch as never).eq("phone_hash", phone_hash);

  const r = await route(c, input, save);
  const reply: Reply = typeof r === "string" ? { text: r } : r;
  // At most one text + one audio per inbound message. No loops.
  const sent = await sendWhatsApp(input.from, reply.text);
  if (sent && reply.audioUrl) await sendWhatsApp(input.from, "AI-generated voice — Machine-translated", reply.audioUrl);
  else if (sent && reply.secondText) await sendWhatsApp(input.from, reply.secondText); // only the review POST step
}

async function route(c: Conv, input: { from: string; body: string; mediaUrl: string | null }, save: Save): Promise<string | Reply> {
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
  return c.role === "champion" ? champion(c, upper, input.mediaUrl, input.from, save, text) : visitor(c, text, upper, save, input.mediaUrl);
}

/* ---------------- Visitor ---------------- */
const CLEAR_Q: Record<Lang, string> = {
  en: "Was this clear? Reply YES or NO",
  de: "War das verständlich? Antworten Sie YES oder NO",
  nl: "Was dit duidelijk? Antwoord YES of NO",
};

async function visitor(c: Conv, text: string, upper: string, save: Save, mediaUrl: string | null = null): Promise<string | Reply> {
  const db = supabaseAdmin;
  if (upper === "FEEDBACK" || c.state.startsWith("feedback_")) return visitorFeedback(c, text, upper, save, mediaUrl);
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
    // Never guess: below threshold -> hand to Noor.
    if (vq) await db.from("unanswered").insert({ visitor_question_id: vq.id });
    await save({ last_visitor_question_id: vq?.id ?? null });
    return `${NOT_SURE[c.lang]}\n\n${CLEAR_Q[c.lang]}\n${reviewLine()}`;
  }
  await save({ last_visitor_question_id: vq?.id ?? null });

  // Pre-generated voice (only exists for approved answers). Short-lived signed URL for Twilio to fetch.
  let audioUrl: string | undefined;
  const { data: audio } = await db.from("answer_audio").select("audio_path").eq("answer_id", answer.id).eq("lang", c.lang).maybeSingle();
  if (audio?.audio_path) {
    const { data: signed } = await db.storage.from(AUDIO_BUCKET).createSignedUrl(audio.audio_path, 600);
    audioUrl = signed?.signedUrl;
  }
  return {
    text: [
      answerText + (answer.is_sample ? " (Sample answer)" : ""),
      "— Machine-translated" + (audioUrl ? " · voice note follows (AI-generated voice)" : ""),
      "",
      CLEAR_Q[c.lang],
      reviewLine(),
    ].join("\n"),
    audioUrl,
  };
}

/* ---------------- Visitor reviews (phase 2C) ----------------
 * No rating is asked, everyone gets the same link, text is only lightly cleaned (guardCleanup falls back to raw).
 * Stored only for the visitor's own use; shared with Noor only after SHARE; deleted on NO or after 24h (purgeFeedback). */
async function deleteTwilioMedia(mediaUrl: string | null) {
  if (!mediaUrl) return;
  try {
    const m = /\/Accounts\/[^/]+\/(Messages\/[^/]+\/Media\/[^/.]+)/.exec(new URL(mediaUrl).pathname);
    if (!m) return;
    const r = await fetch(`${GATEWAY_URL}/${m[1]}.json`, { method: "DELETE", headers: twilioHeaders() });
    if (!r.ok && r.status !== 404) console.error(`Twilio media delete failed [${r.status}]: ${(await r.text()).slice(0, 200)}`);
  } catch (e) { console.error("Twilio media delete failed", e); }
}

async function deleteFeedback(id: string) {
  const db = supabaseAdmin;
  const { data } = await db.from("visitor_feedback" as never).select("media_url").eq("id", id).maybeSingle();
  await deleteTwilioMedia((data as { media_url: string | null } | null)?.media_url ?? null);
  await db.from("visitor_feedback" as never).delete().eq("id", id);
}

export async function cleanReview(raw: string): Promise<{ text: string; usedRaw: boolean; reason?: string }> {
  let cleaned: string | null = null;
  try { cleaned = await aiText(CLEANUP_INSTRUCTIONS, raw.slice(0, 2000)); } catch (e) { console.error("cleanup failed", e); }
  return guardCleanup(raw, cleaned);
}

async function visitorFeedback(c: Conv, text: string, upper: string, save: Save, mediaUrl: string | null): Promise<string | Reply> {
  const db = supabaseAdmin;
  const L = c.lang;
  const fid = c.current_feedback_id ?? null;
  const done = () => save({ state: "idle", current_feedback_id: null } as Partial<Conv>);

  if (upper === "FEEDBACK") {
    if (fid) await deleteFeedback(fid); // a new one replaces any unfinished one
    const { data } = await db.from("visitor_feedback" as never).insert({ lang: L, status: "awaiting" } as never).select("id").single();
    await save({ state: "feedback_wait", current_feedback_id: (data as { id: string } | null)?.id ?? null } as Partial<Conv>);
    return FEEDBACK_PROMPT[L];
  }
  if (!fid) { await done(); return FEEDBACK_PROMPT[L]; }

  if (upper === "NO") {
    await deleteFeedback(fid);
    await done();
    return FEEDBACK_DELETED[L];
  }
  if (c.state === "feedback_ready") {
    if (upper === "EDIT") {
      const { data } = await db.from("visitor_feedback" as never).select("media_url").eq("id", fid).maybeSingle();
      await deleteTwilioMedia((data as { media_url: string | null } | null)?.media_url ?? null);
      await db.from("visitor_feedback" as never).update({ transcript_raw: null, text_cleaned: null, media_url: null, status: "awaiting" } as never).eq("id", fid);
      await save({ state: "feedback_wait" });
      return FEEDBACK_PROMPT[L];
    }
    if (upper === "SHARE") {
      await db.from("visitor_feedback" as never).update({ shared_with_operator: true } as never).eq("id", fid);
      return `${FEEDBACK_SHARED[L]}\n${FEEDBACK_OPTIONS[L]}`;
    }
    if (upper === "POST") {
      const { data } = await db.from("visitor_feedback" as never).select("text_cleaned").eq("id", fid).maybeSingle();
      const t = (data as { text_cleaned: string | null } | null)?.text_cleaned;
      if (!t) { await done(); return FEEDBACK_PROMPT[L]; }
      await db.from("visitor_feedback" as never).update({ status: "posted" } as never).eq("id", fid);
      // Stays in feedback_ready so SHARE / NO still work; purged after 24h unless shared.
      return { text: t, secondText: reviewLinkMessage(process.env['GOOGLE_REVIEW_URL']) };
    }
    return FEEDBACK_OPTIONS[L];
  }

  // feedback_wait: take a voice note (auto-detect language) or text.
  let raw = text;
  if (mediaUrl) {
    const t = await transcribe(mediaUrl, null);
    raw = t?.text ?? "";
  }
  raw = raw.slice(0, 2000).trim();
  if (!raw) return FEEDBACK_EMPTY[L];
  const cleaned = await cleanReview(raw);
  await db.from("visitor_feedback" as never)
    .update({ transcript_raw: raw, text_cleaned: cleaned.text, media_url: mediaUrl, status: "ready" } as never).eq("id", fid);
  await save({ state: "feedback_ready" });
  return `${cleaned.text}\n\n${FEEDBACK_OPTIONS[L]}`;
}

/** Deletes unshared visitor reviews older than 24h (transcript + Twilio audio). Shared ones are kept for Noor. */
export async function purgeFeedback(): Promise<{ purged: number }> {
  const db = supabaseAdmin;
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await db.from("visitor_feedback" as never).select("id, media_url").eq("shared_with_operator", false).lt("created_at", cutoff);
  const rows = (data ?? []) as Array<{ id: string; media_url: string | null }>;
  for (const r of rows) await deleteTwilioMedia(r.media_url);
  if (rows.length) await db.from("visitor_feedback" as never).delete().in("id", rows.map((r) => r.id));
  return { purged: rows.length };
}

/* ---------------- Champion ---------------- */
async function champion(c: Conv, upper: string, mediaUrl: string | null, from: string, save: Save, text: string) {
  const db = supabaseAdmin;
  const { data: questions } = await db.from("questions").select("id, position, topic").order("position");
  const qs = questions ?? [];
  const ask = (n: number) => `Question ${n} of ${TOTAL_QUESTIONS}: ${qs[n - 1]?.topic ?? "?"}\nReply with a voice note.`;

  // Confirmation turn for an agent-proposed review decision: only an explicit YES executes it.
  if (c.pending_action) {
    const pa = c.pending_action;
    await save({ pending_action: null });
    if (/^(YES|OUI|WAAW)\b/.test(upper)) {
      const { data: still } = await db.from("answers").select("review_status").eq("id", pa.answer_id).maybeSingle();
      if (still?.review_status !== "pending") return "That answer is no longer pending. Nothing changed.";
      await applyReview(pa.answer_id, pa.status);
      return { approved: "Done: approved.", rerecord: "Done: marked for re-record.", needs_bilingual: "Done: sent to bilingual reviewer." }[pa.status];
    }
    // Anything else cancels the proposal and is handled as a new message below.
  }

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
      const { data: ans } = await db.from("answers").insert({
        recording_id: rec.id, review_status: "pending", flags: ["processing"],
      }).select("id").single();
      // Heavy work after the "Got question N" reply: transcribe -> translate -> round-trip -> notify champion.
      if (ans) runInBackground("recording", () => processRecording(ans.id, mediaUrl, from, n));
    }
    const next = n + 1;
    if (next > TOTAL_QUESTIONS) {
      await save({ state: "idle", current_question_position: null });
      return `Got question ${n}. Round complete. Reply REVIEW to review.`;
    }
    await save({ current_question_position: next });
    return `Got question ${n}.\n\n${ask(next)}`;
  }

  if (upper === "REVIEW") return showNextPending(save);

  if (c.state === "reviewing" && c.current_review_answer_id) {
    const m = /^([123])\b/.exec(upper);
    if (m) {
    const status = { "1": "approved", "2": "rerecord", "3": "needs_bilingual" }[m[1]!] as "approved" | "rerecord" | "needs_bilingual";
    await applyReview(c.current_review_answer_id, status);
    const label = { approved: "Approved", rerecord: "Marked for re-record", needs_bilingual: "Sent to bilingual reviewer" }[status];
    return `${label}.\n\n${await showNextPending(save)}`;
    }
  }

  return championAgent(c, text, mediaUrl, save);
}

async function applyReview(id: string, status: "approved" | "rerecord" | "needs_bilingual") {
  await supabaseAdmin.from("answers").update({
    review_status: status, approved_at: status === "approved" ? new Date().toISOString() : null,
  }).eq("id", id);
  if (status === "approved") runInBackground("tts", () => generateAnswerAudio(id));
}

/** Free-text (or voice) champion messages go to the tool-limited AI assistant. One reply per message. */
async function championAgent(c: Conv, text: string, mediaUrl: string | null, save: Save) {
  let message = text;
  let heard = "";
  if (mediaUrl) {
    const t = await transcribe(mediaUrl);
    if (!t) return "Sorry, I could not hear the voice note. Please type or try again.";
    message = t.text;
    heard = `Heard (Wolof, ${WOLOF_LABEL}): "${t.text}"\n\n`;
  }
  if (!message.trim()) return "Champion mode (demo shortcut). START, REVIEW or EXIT.";
  const { runChampionAgent } = await import("./agent.server");
  try {
    const history = (c.agent_history ?? []).slice(-6);
    const r = await runChampionAgent({ phone_hash: c.phone_hash }, message, history);
    await save({ agent_history: [...history, { role: "user" as const, content: message.slice(0, 500) }, { role: "assistant" as const, content: r.plainText.slice(0, 500) }].slice(-6) });
    return heard + r.reply;
  } catch (e) {
    console.error("champion agent failed", e);
    return heard + "Assistant unavailable right now. Shortcuts: START, REVIEW, EXIT.";
  }
}

async function showNextPending(save: Save) {
  const { data } = await supabaseAdmin
    .from("answers")
    .select("id, transcript_src, flags, is_sample, created_at, recordings(questions(position, topic))")
    .eq("review_status", "pending")
    .order("created_at");
  const list = (data ?? []) as unknown as Array<{
    id: string; transcript_src: string | null; flags: string[]; is_sample: boolean;
    recordings: { questions: { position: number; topic: string } | null } | null;
  }>;
  const item = list[0];
  if (!item) {
    await save({ state: "idle", current_review_answer_id: null });
    return "No pending answers.";
  }
  await save({ state: "reviewing", current_review_answer_id: item.id });
  const q = item.recordings?.questions;
  // The champion does not speak English: only the Wolof transcript and numbers are shown, never English text.
  return [
    `Pending: ${list.length}. Now: question ${q?.position} (${q?.topic})${item.is_sample ? " (Sample answer)" : ""}`,
    `Wolof transcript (${WOLOF_LABEL}):`,
    item.transcript_src ?? (item.flags.includes("processing") ? "[still processing]" : "[no transcript]"),
    `Numbers heard: ${numbersHeard(item.transcript_src)}`,
    `Flags: ${item.flags.length ? item.flags.join(", ") : "none"}`,
    "",
    "Reply 1 approve, 2 re-record, 3 needs bilingual reviewer",
  ].join("\n");
}

/* ---------------- Evaluation (keyword-match intent accuracy) ---------------- */
export async function evaluateMatching(custom?: Array<{ text: string; expected_topic: string }>) {
  const db = supabaseAdmin;
  const { data: qs } = await db.from("questions").select("topic");
  // One pseudo-answer per topic so intent accuracy is measured independently of what is approved.
  const pseudo = (qs ?? []).map((q) => ({ id: q.topic, recordings: { questions: { topic: q.topic } } }));
  let items = custom;
  if (!items) {
    const { data } = await db.from("eval_questions" as never).select("text, expected_topic");
    items = (data ?? []) as unknown as Array<{ text: string; expected_topic: string }>;
  }
  const results = items.map((it) => {
    const { answer, confidence } = matchQuestion(it.text, pseudo);
    const predicted = answer?.id ?? null;
    return { text: it.text, expected: it.expected_topic, predicted, confidence, correct: predicted === it.expected_topic };
  });
  const correct = results.filter((r) => r.correct).length;
  const unsure = results.filter((r) => r.predicted === null).length;
  const wrong = results.length - correct - unsure;
  return {
    label: custom ? "custom labeled list" : "evaluation test data (hand-written, not real visitor data)",
    total: results.length, correct, unsure_not_answered: unsure, wrong_answer: wrong,
    accuracy: results.length ? Math.round((correct / results.length) * 1000) / 1000 : null,
    results,
  };
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

  const sent = await twilioSend(env("DEMO_SMS_NUMBER"), env("TWILIO_SMS_FROM"), body);
  return { sent, questions: rows.length, unanswered: unList.length };
}

/* ---------------- Phone-call input (Twilio Voice) for Noor's feature phone ---------------- */

/** URL Twilio signed: TWILIO_WEBHOOK_URL's origin (if set) + this route's path and query. */
export function signedUrlFor(request: Request) {
  const u = new URL(request.url);
  const base = process.env["TWILIO_WEBHOOK_URL"];
  const origin = base ? new URL(base).origin : `https://${u.host}`;
  return origin + u.pathname + u.search;
}

/** Only the demo operator's phone (hash of DEMO_SMS_NUMBER) may use the voice line. */
export function isOperatorCaller(from: string | undefined) {
  return !!from && safeEqual(hashPhone(from), hashPhone(env("DEMO_SMS_NUMBER")));
}

const xml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { "Content-Type": "text/xml" } });

export const twimlPrivate = () => xml(`<Say>Sorry, this line is private.</Say><Hangup/>`);

/** TwiML for question n (1..10). Says only the number; Noor uses a printed card in the same order. */
export function twimlQuestion(n: number, opts: { greet?: boolean; retry?: boolean } = {}) {
  const r = opts.retry ? 1 : 0;
  const action = `/api/public/voice-recorded?n=${n}&amp;r=${r}`;
  return xml([
    opts.greet ? `<Say>Hello Noor. Please answer each question after the beep. Press hash when done.</Say>` : "",
    opts.retry ? `<Say>Please answer again.</Say>` : "",
    `<Say>Question ${n}</Say>`,
    `<Record playBeep="true" maxLength="90" timeout="4" finishOnKey="#" action="${action}" method="POST"/>`,
    // Reached only when nothing was recorded: Twilio skips the action and continues here.
    `<Redirect method="POST">${action}&amp;empty=1</Redirect>`,
  ].join(""));
}

export const twimlGoodbye = () => xml(`<Say>Thank you, goodbye</Say><Hangup/>`);

/** One SMS per call, counted in the daily cap. */
export async function sendCallSummary(callSid: string) {
  const to = env("DEMO_SMS_NUMBER"), from = env("TWILIO_SMS_FROM"); // check secrets before marking the summary as sent
  const { data } = await supabaseAdmin.rpc("voice_call_claim_summary" as never, { _sid: callSid } as never);
  if (data === null || data === undefined) return false; // already sent for this call
  const n = Number(data) || 0;
  return twilioSend(to, from,
    `TourCoach demo: Got ${n} of ${TOTAL_QUESTIONS} answers. The family helper will check them.`);
}

/** Stores a call recording for question n and runs the same pipeline as WhatsApp voice notes. Returns answers so far. */
export async function storeCallRecording(callSid: string, n: number, recordingUrl: string) {
  const db = supabaseAdmin;
  const { data: q } = await db.from("questions").select("id").eq("position", n).maybeSingle();
  if (!q) return null;
  const audio = recordingUrl + ".mp3";
  const { data: rec } = await db.from("recordings")
    .insert({ question_id: q.id, audio_path: audio, week: isoWeek(), status: "received" }).select("id").single();
  if (!rec) return null;
  const { data: ans } = await db.from("answers")
    .insert({ recording_id: rec.id, review_status: "pending", flags: ["processing", "phone call"] }).select("id").single();
  if (ans) runInBackground("call-recording", () => processRecording(ans.id, audio, null, n));
  const { data: count } = await db.rpc("voice_call_answered" as never, { _sid: callSid } as never);
  return Number(count) || 0;
}
