import { MORE_ASK, FIT_BY_CHOICE, pickPartner, suggestionText, buildListing, ledgerText, type Partner } from "./partners";
import { guardCleanup, reviewLinkMessage, CLEANUP_INSTRUCTIONS, FEEDBACK_PROMPT, FEEDBACK_OPTIONS, FEEDBACK_DELETED, FEEDBACK_SHARED, FEEDBACK_EMPTY } from "./feedback";
// Teranga backend logic (server-only). Used by /api/public/whatsapp-webhook, /api/public/weekly-digest
// and /api/public/eval-match.
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { matchQuestion, NOT_SURE } from "./match";
import { runInBackground } from "./background.server";
import { numbersHeard } from "./numbers";
import { recordingCommand, ROUND_HINT, roundStoppedText, recordingHelpText } from "./champion-commands";
import { finishAnswers as runFinish, ensureAudio, finishAudio, type AudioDeps, type PipelineDeps, type PipelineRow, type Download, UNFINISHED } from "./pipeline";
import { callSummarySms, weeklyDigestSms, sendSmsWithFallback } from "./sms";
import { formatPendingQueue } from "./review-queue";

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

/** Numbers, prices and times in the transcript: digits plus Wolof number words (src/lib/numbers.ts). */
export { numbersHeard };

/* ---------------- Lovable AI (Responses API, streamed) ---------------- */
async function aiText(instructions: string, input: string, signal: AbortSignal | null = null): Promise<string> {
  const res = await fetch(AI_URL, {
    method: "POST", signal,
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

/** Downloads Twilio media through the Twilio connection. 401/403/404/410 = link expired or gone. */
export async function downloadMedia(mediaUrl: string, signal: AbortSignal | null = null): Promise<Download> {
  const u = new URL(mediaUrl);
  const m = /\/Accounts\/[^/]+\/(.+)$/.exec(u.pathname);
  if (u.hostname !== "api.twilio.com" || !m) throw new Error("Unexpected media URL");
  const media = await fetch(`${GATEWAY_URL}/${m[1]}`, { headers: twilioHeaders(), redirect: "follow", signal });
  if (!media.ok) {
    console.error(`Media download failed [${media.status}]: ${(await media.text()).slice(0, 200)}`);
    return { ok: false, status: media.status, expired: [401, 403, 404, 410].includes(media.status) };
  }
  const type = (media.headers.get("content-type") ?? "audio/ogg").split(";")[0]!.trim();
  const buf = await media.arrayBuffer();
  return { ok: true, status: media.status, bytes: buf.byteLength, type, blob: new Blob([buf], { type }) };
}

/** ElevenLabs scribe_v2. languageCode null = auto-detect (visitor reviews). */
export async function sttBlob(blob: Blob, type: string, languageCode: string | null, signal: AbortSignal | null = null) {
  const ext = type.includes("amr") ? "amr" : type.includes("mpeg") || type.includes("mp3") ? "mp3" : type.includes("mp4") ? "m4a" : "ogg";
  const form = new FormData();
  form.append("file", blob, `voice.${ext}`);
  form.append("model_id", "scribe_v2");
  if (languageCode) form.append("language_code", languageCode);
  form.append("tag_audio_events", "false");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST", headers: { "xi-api-key": env("ELEVENLABS_API_KEY") }, body: form, signal,
  });
  if (!res.ok) { console.error(`ElevenLabs STT failed [${res.status}]: ${(await res.text()).slice(0, 300)}`); return null; }
  const j = (await res.json()) as { text?: string; language_probability?: number; words?: Array<{ logprob?: number; type?: string }> };
  const text = (j.text ?? "").trim();
  const lps = (j.words ?? []).filter((w) => w.type !== "spacing" && typeof w.logprob === "number").map((w) => Math.exp(w.logprob!));
  const confidence = lps.length ? lps.reduce((a, b) => a + b, 0) / lps.length : j.language_probability ?? null;
  return { status: res.status, text, confidence: confidence === null ? null : Math.round(confidence * 100) / 100 };
}

/** Download + transcribe in one go (used by the champion assistant and visitor reviews, inside the request). */
export async function transcribe(mediaUrl: string, languageCode: string | null = "wol", signal: AbortSignal | null = null): Promise<{ text: string; confidence: number | null } | null> {
  try {
    const dl = await downloadMedia(mediaUrl, signal);
    console.log(`[transcribe] media downloaded ${dl.status} ${dl.ok ? dl.bytes : 0} ${dl.ok ? dl.type : "-"}`);
    if (!dl.ok) return null;
    const t0 = Date.now();
    const t = await sttBlob(dl.blob, dl.type, languageCode, signal);
    console.log(`[transcribe] stt ${t?.status ?? "failed"} ${Date.now() - t0}`);
    return t && t.text ? { text: t.text, confidence: t.confidence } : null;
  } catch (e) {
    console.error("[transcribe] error step=transcribe", e);
    return null;
  }
}

/** Lovable AI translation. Wolof -> English (pivot); English -> German/Dutch; English -> Wolof for round-trip. */
export async function translate(text: string, to: Lang | "wo", signal: AbortSignal | null = null): Promise<string | null> {
  const from = to === "en" ? "wo" : "en";
  try {
    const out = await aiText(`${TRANSLATE_RULES}\nTranslate from ${LANG_NAME[from]} to ${LANG_NAME[to]}.`, text, signal);
    return out || null;
  } catch (e) {
    console.error(`translate to ${to} failed`, e);
    return null;
  }
}

/** Back-translates English to Wolof and asks the model to score consistency with the original transcript. */
export async function roundtrip(source: string, english: string, signal: AbortSignal | null = null): Promise<{ score: number; differences: string[]; backWolof: string } | null> {
  try {
    const backWolof = await translate(english, "wo", signal);
    if (!backWolof) return null;
    const raw = await aiText(
      [
        "Compare two Wolof texts: ORIGINAL (a transcript) and BACK (a machine back-translation).",
        "Score how well BACK preserves the meaning of ORIGINAL from 0 to 1.",
        "List every number, price, time or name that differs or is missing between them.",
        'Answer only with JSON: {"score": number, "differences": string[]}',
      ].join("\n"),
      `ORIGINAL:\n${source}\n\nBACK:\n${backWolof}`,
      signal,
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
export async function speak(text: string, lang: Lang, answerId: string, signal: AbortSignal | null = null): Promise<string | null> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${TTS_VOICE_ID}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": env("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 2500), model_id: "eleven_multilingual_v2", language_code: lang }),
      signal,
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

/* Resumable pipeline (src/lib/pipeline.ts). Nothing depends on work after the HTTP response. */
const ANSWER_COLS = "id, stage, attempts, transcript_src, english, flags, notify_hash, notified_at, recordings(audio_path, questions(position))";
type AnswerDbRow = Omit<PipelineRow, "audio_url" | "position"> & { recordings: { audio_path: string | null; questions: { position: number } | null } | null };

function pipelineDeps(): PipelineDeps {
  const db = supabaseAdmin;
  const t = () => db.from("answers" as never);
  return {
    now: () => Date.now(),
    log: (m) => console.log(m),
    async load(id) {
      const { data } = await t().select(ANSWER_COLS).eq("id", id).maybeSingle();
      const r = data as unknown as AnswerDbRow | null;
      if (!r) return null;
      return { ...r, audio_url: r.recordings?.audio_path ?? null, position: r.recordings?.questions?.position ?? null };
    },
    async listUnfinished(includeNotify, limit) {
      const { data } = await t().select("id").eq("is_sample", false).in("stage", UNFINISHED).order("created_at").limit(limit);
      const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
      if (includeNotify) {
        const { data: n } = await t().select("id").eq("is_sample", false).is("notified_at", null)
          .not("notify_hash", "is", null).not("transcript_src", "is", null).neq("stage", "failed").order("created_at").limit(limit);
        for (const r of (n ?? []) as Array<{ id: string }>) if (!ids.includes(r.id)) ids.push(r.id);
      }
      return ids;
    },
    async countUnfinished() {
      const { count } = await t().select("id", { count: "exact", head: true }).eq("is_sample", false).in("stage", UNFINISHED);
      return count ?? 0;
    },
    async claimLease(id, ms) {
      const now = new Date().toISOString();
      const { data } = await t().update({ lease_until: new Date(Date.now() + ms).toISOString() } as never)
        .eq("id", id).or(`lease_until.is.null,lease_until.lt.${now}`).select("id");
      return !!(data as unknown[] | null)?.length;
    },
    async releaseLease(id) { await t().update({ lease_until: null } as never).eq("id", id); },
    async advance(id, from, patch) {
      const { data, error } = await t().update(patch as never).eq("id", id).eq("stage", from).select("id");
      if (error) console.error(`[pipeline ${id}] error step=db ${error.message}`);
      return !!(data as unknown[] | null)?.length;
    },
    async claimNotify(id) {
      const { data } = await t().update({ notified_at: new Date().toISOString() } as never).eq("id", id).is("notified_at", null).select("id");
      return !!(data as unknown[] | null)?.length;
    },
    download: (url, signal) => downloadMedia(url, signal),
    stt: (blob, type, signal) => sttBlob(blob, type, "wol", signal),
    translate: (text, to, signal) => translate(text, to, signal),
    roundtrip: (src, en, signal) => roundtrip(src, en, signal),
    hash: (p) => hashPhone(p),
    notify: (phone, text) => sendWhatsApp(phone, text),
    notifyText: (row, tx) => [`Question ${row.position ?? "?"} heard. Wolof transcript (${WOLOF_LABEL}):`, tx, `Numbers heard: ${numbersHeard(tx)}`].join("\n"),
  };
}

/** Finishes unfinished answers (oldest first) within budgetMs. phone = current champion caller (enables the one transcript message). */
export async function finishAnswers(budgetMs: number, opts: { phone?: string | null; firstId?: string | null } = {}) {
  const start = Date.now();
  const res = await runFinish(pipelineDeps(), budgetMs, opts);
  // Then any approved answers still missing voice files.
  const audio = await finishAudio(audioDeps(), budgetMs - (Date.now() - start));
  return { ...res, ...audio };
}

function audioDeps(): AudioDeps {
  const db = supabaseAdmin;
  const p = pipelineDeps();
  return {
    now: () => Date.now(),
    log: (m) => console.log(m),
    async texts(id) {
      const { data } = await db.from("answers").select("english, german, dutch, review_status").eq("id", id).maybeSingle();
      return data ? { approved: data.review_status === "approved", en: data.english, de: data.german, nl: data.dutch } : null;
    },
    async existing(id) {
      const { data } = await db.from("answer_audio").select("lang").eq("answer_id", id);
      return ((data ?? []) as Array<{ lang: string }>).map((r) => r.lang as Lang);
    },
    claimLease: p.claimLease,
    releaseLease: p.releaseLease,
    speak: (text, lang, id, signal) => speak(text, lang, id, signal),
    async save(id, lang, path) {
      const { error } = await db.from("answer_audio").upsert({ answer_id: id, lang, audio_path: path }, { onConflict: "answer_id,lang" });
      if (error) throw new Error(`answer_audio save failed: ${error.message}`);
    },
    async listMissing(limit) {
      const { data } = await db.from("answers").select("id, english, german, dutch, answer_audio(lang)")
        .eq("review_status", "approved").eq("is_sample", false).order("approved_at", { ascending: true, nullsFirst: true }).limit(200);
      const rows = (data ?? []) as unknown as Array<{ id: string; english: string | null; german: string | null; dutch: string | null; answer_audio: Array<{ lang: string }> }>;
      return rows.filter((r) => {
        const have = new Set(r.answer_audio.map((a) => a.lang));
        return (["en", "de", "nl"] as const).some((l) => r[FIELD[l]] && !have.has(l));
      }).slice(0, limit).map((r) => r.id);
    },
  };
}

/** Generates missing voice files for one approved answer inside the current request. */
export function ensureAnswerAudio(id: string, langs: Lang[], budgetMs: number) {
  return ensureAudio(audioDeps(), id, langs, Date.now() + budgetMs);
}

/* ---------------- WhatsApp state machine ---------------- */
type Conv = {
  phone_hash: string; role: "visitor" | "champion"; state: string; current_question_position: number | null;
  lang: Lang; last_visitor_question_id: string | null; current_review_answer_id: string | null; current_feedback_id?: string | null; last_recommendation_id?: string | null;
  pending_action?: { answer_id: string; status: "approved" | "rerecord" | "needs_bilingual" } | null;
  agent_history?: Array<{ role: "user" | "assistant"; content: string }>;
};
type Reply = { text: string; audioUrl?: string | undefined; secondText?: string | undefined; finishFirst?: string | null | undefined };
type Save = (p: Partial<Conv>) => unknown;

export async function handleWhatsApp(input: { from: string; body: string; mediaUrl: string | null }) {
  const startedAt = Date.now();
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

  // Champion requests: finish voice answers inside this request (Twilio waits up to 15 s). Resumable, so a cut-off is harmless.
  if (reply.finishFirst !== undefined || c.role === "champion") {
    const left = WEBHOOK_BUDGET_MS - (Date.now() - startedAt);
    if (left > 3000) {
      try { await finishAnswers(left, { phone: input.from, firstId: reply.finishFirst ?? null }); }
      catch (e) { console.error("[pipeline] error step=finishAnswers", e); }
    }
    // Best effort only (never relied on): continue in waitUntil if the runtime offers it.
    runInBackground("finish", () => finishAnswers(20000, { phone: input.from }));
  }
}
const WEBHOOK_BUDGET_MS = 11000;

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
  // In a recording round EXIT ends the round (handled in champion()), it does not leave champion mode.
  if (upper === "EXIT" && !(c.role === "champion" && c.state === "recording")) {
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

export async function visitor(c: Conv, text: string, upper: string, save: Save, mediaUrl: string | null = null): Promise<string | Reply> {
  const db = supabaseAdmin;
  if (upper === "FEEDBACK" || c.state.startsWith("feedback_")) return visitorFeedback(c, text, upper, save, mediaUrl);
  // Phase 2E (Simulated): opt-in partner suggestion. Asked once; only "<1|2|3> YES" suggests anything.
  if (upper === "MORE" || upper === "RECOMMEND") { await save({ state: "more_wait" }); return MORE_ASK; }
  if (c.state === "more_wait") {
    const m = /^([123])\s*,?\s*YES$/.exec(upper);
    if (!m) { await save({ state: "idle" }); return "No suggestion made (no opt-in). (Simulated)"; }
    const r = await recommendPartner(c.phone_hash, m[1]!);
    await save({ state: "idle", last_recommendation_id: r.ledgerId } as Partial<Conv>);
    return r.text;
  }
  if (upper === "CONNECT" && c.last_recommendation_id) {
    await db.from("recommendation_ledger" as never).update({ connect_requested: true } as never).eq("id", c.last_recommendation_id);
    await save({ last_recommendation_id: null } as Partial<Conv>);
    return "Noted (Simulated). Noor or the champion will pass on the contact. Your number is not shared automatically. No payment involved.";
  }
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
  let { data: audio } = await db.from("answer_audio").select("audio_path").eq("answer_id", answer.id).eq("lang", c.lang).maybeSingle();
  if (!audio?.audio_path) {
    // On demand, inside this request (8 s budget). Text only if it is not ready in time.
    try { await ensureAnswerAudio(answer.id, [c.lang], 8000); } catch (e) { console.error("[audio] error step=visitor", e); }
    ({ data: audio } = await db.from("answer_audio").select("audio_path").eq("answer_id", answer.id).eq("lang", c.lang).maybeSingle());
    if (!audio?.audio_path) console.log(`[audio ${answer.id}] not ready for ${c.lang}; text only`);
  }
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

export async function visitorFeedback(c: Conv, text: string, upper: string, save: Save, mediaUrl: string | null): Promise<string | Reply> {
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
    const t = await transcribe(mediaUrl, null, AbortSignal.timeout(9000)); // inside the request, bounded
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

/* ---------------- Phase 2E / 2F (Simulated demos) ---------------- */
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); };

async function monthCounts(): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin.from("recommendation_ledger" as never).select("to_operator_id").gte("created_at", monthStart());
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ to_operator_id: string }>) out[r.to_operator_id] = (out[r.to_operator_id] ?? 0) + 1;
  return out;
}

/** visitorHash must already be the salted hash; raw numbers are never stored or shared. */
export async function recommendPartner(visitorHash: string, choice: string): Promise<{ text: string; ledgerId: string | null }> {
  const fit = FIT_BY_CHOICE[choice];
  const { data } = await supabaseAdmin.from("partner_operators" as never).select("id, name, tour_type, fit, language_support");
  const p = fit ? pickPartner((data ?? []) as Partner[], await monthCounts(), fit) : null;
  if (!p) return { text: suggestionText(null), ledgerId: null };
  const { data: row } = await supabaseAdmin.from("recommendation_ledger" as never)
    .insert({ from_operator: "Noor", to_operator_id: p.id, visitor_hash: visitorHash, is_sample: true } as never).select("id").single();
  return { text: suggestionText(p), ledgerId: (row as { id: string } | null)?.id ?? null };
}

export async function ledgerSummary(): Promise<string> {
  const { data } = await supabaseAdmin.from("partner_operators" as never).select("id, name").order("name");
  const counts = await monthCounts();
  const rows = ((data ?? []) as Array<{ id: string; name: string }>).map((p) => ({ name: p.name, received: counts[p.id] ?? 0 }));
  return ledgerText(rows, Object.values(counts).reduce((a, b) => a + b, 0));
}

/** Draft listing from APPROVED answers only (English text). Nothing is sent to Google. */
export async function draftListing(): Promise<string> {
  const { data } = await supabaseAdmin.from("answers")
    .select("english, is_sample, recordings(questions(topic))").eq("review_status", "approved");
  const by: Record<string, string> = {};
  let sample = false;
  for (const r of (data ?? []) as unknown as Array<{ english: string | null; is_sample: boolean; recordings: { questions: { topic: string } | null } | null }>) {
    const t = r.recordings?.questions?.topic;
    if (t && r.english) { by[t] = r.english; sample ||= r.is_sample; }
  }
  return buildListing(by) + (sample ? "\n(Built from Sample answers)" : "");
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

  // Text commands first during a round; only non-command text gets the voice-note reminder.
  const cmd = c.state === "recording" && !mediaUrl ? recordingCommand(upper, !!c.current_review_answer_id) : null;
  if (cmd === "stop") {
    const saved = Math.max(0, (c.current_question_position ?? 1) - 1);
    await save({ state: "idle", current_question_position: null });
    return roundStoppedText(saved);
  }
  if (cmd === "help") return recordingHelpText(c.current_question_position ?? 1, TOTAL_QUESTIONS);
  if (cmd === "review") await save({ state: "idle", current_question_position: null }); // falls through to REVIEW below

  if (c.state === "recording" && c.current_question_position && !cmd) {
    const n = c.current_question_position;
    if (!mediaUrl) return `Please send a voice note for question ${n}.\n${ROUND_HINT}\n${ask(n)}`;
    const q = qs[n - 1];
    if (!q) return "Question not found.";
    let answerId: string | null = null;
    const { data: rec } = await db.from("recordings")
      .insert({ question_id: q.id, audio_path: mediaUrl, week: isoWeek(), status: "received" })
      .select("id").single();
    if (rec) {
      const { data: ans } = await db.from("answers").insert({
        recording_id: rec.id, review_status: "pending", flags: ["processing"], stage: "received", notify_hash: hashPhone(from),
      } as never).select("id").single();
      answerId = (ans as { id: string } | null)?.id ?? null;
    }
    // The "Got question N" ack is sent first; handleWhatsApp then awaits the pipeline for this answer.
    const next = n + 1;
    if (next > TOTAL_QUESTIONS) {
      await save({ state: "idle", current_question_position: null });
      return { text: `Got question ${n}. Round complete. Reply REVIEW to review.`, finishFirst: answerId };
    }
    await save({ current_question_position: next });
    return { text: `Got question ${n}. ${ROUND_HINT}\n\n${ask(next)}`, finishFirst: answerId };
  }

  if (upper === "REVIEW") {
    // Finish what is pending first (no transcript messages here: REVIEW shows the transcript itself).
    try { await finishAnswers(10000); } catch (e) { console.error("[pipeline] error step=finishAnswers", e); }
    return showNextPending(save);
  }
  if (upper === "LEDGER") return ledgerSummary();
  if (upper === "LISTING") return draftListing();

  if ((c.state === "reviewing" || cmd === "digit") && c.current_review_answer_id) {
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
  // Voice files are made inside this request (about 10 s) before the confirmation is sent; leftovers via finishAnswers.
  if (status === "approved") {
    try { await ensureAnswerAudio(id, ["en", "de", "nl"], 10000); } catch (e) { console.error("[audio] error step=approve", e); }
  }
}

/** Free-text (or voice) champion messages go to the tool-limited AI assistant. One reply per message. */
async function championAgent(c: Conv, text: string, mediaUrl: string | null, save: Save) {
  let message = text;
  let heard = "";
  if (mediaUrl) {
    const t = await transcribe(mediaUrl, "wol", AbortSignal.timeout(9000));
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
    .eq("is_sample", false) // seeded sample answers are never in the champion's review queue
    .in("stage" as never, ["checked", "failed"] as never)
    .order("created_at");
  const { count: busy } = await supabaseAdmin.from("answers").select("id", { count: "exact", head: true })
    .eq("review_status", "pending").eq("is_sample", false).in("stage" as never, UNFINISHED as never);
  const list = (data ?? []) as unknown as Array<{
    id: string; transcript_src: string | null; flags: string[]; is_sample: boolean;
    recordings: { questions: { position: number; topic: string } | null } | null;
  }>;
  const { text, answerId } = formatPendingQueue(
    list.map((i) => ({
      id: i.id, transcript_src: i.transcript_src, flags: i.flags, is_sample: i.is_sample,
      position: i.recordings?.questions?.position ?? null, topic: i.recordings?.questions?.topic ?? null,
    })),
    busy ?? 0, WOLOF_LABEL, numbersHeard);
  // The champion does not speak English: only the Wolof transcript and numbers are shown, never English text.
  if (!answerId) {
    await save({ state: "idle", current_review_answer_id: null });
    return text;
  }
  await save({ state: "reviewing", current_review_answer_id: answerId });
  return text;
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
    .select("visitor_questions(text, is_sample)").gte("created_at", since).limit(3);
  const unList = ((un ?? []) as unknown as Array<{ visitor_questions: { text: string; is_sample: boolean } | null }>)
    .map((u) => u.visitor_questions).filter((v): v is { text: string; is_sample: boolean } => !!v);
  const body = weeklyDigestSms(rows.length, Object.entries(counts).map(([topic, count]) => ({ topic, count })),
    unList.map((v) => ({ text: v.text, isSample: v.is_sample })));
  const to = env("DEMO_SMS_NUMBER");
  const result = await sendSmsWithFallback(body,
    () => twilioSend(to, env("TWILIO_SMS_FROM"), body),
    () => sendWhatsApp(to, body));
  return { ...result, questions: rows.length, unanswered: unList.length };
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

/** One summary per call, with a single WhatsApp fallback if SMS fails. */
export async function sendCallSummary(callSid: string) {
  const to = env("DEMO_SMS_NUMBER");
  const { data } = await supabaseAdmin.rpc("voice_call_claim_summary" as never, { _sid: callSid } as never);
  if (data === null || data === undefined) return false; // already sent for this call
  const n = Number(data) || 0;
  const body = callSummarySms(n);
  const result = await sendSmsWithFallback(body,
    () => twilioSend(to, env("TWILIO_SMS_FROM"), body),
    () => sendWhatsApp(to, body));
  return result.sent;
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
    .insert({ recording_id: rec.id, review_status: "pending", flags: ["processing", "phone call"], stage: "received" } as never).select("id").single();
  // Not processed here (Noor would wait in silence); finished by voice-status at call end, REVIEW or process-pending.
  if (ans) runInBackground("call-recording", () => finishAnswers(25000)); // best effort only
  const { data: count } = await db.rpc("voice_call_answered" as never, { _sid: callSid } as never);
  return Number(count) || 0;
}
