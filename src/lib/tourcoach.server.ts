import { moreAsk, noOptIn, connectNoted, FIT_BY_CHOICE, pickPartner, suggestionText, ledgerText, type Partner } from "./partners";
import { guardCleanup, CLEANUP_INSTRUCTIONS, FEEDBACK_PROMPT, FEEDBACK_OPTIONS, FEEDBACK_DELETED, FEEDBACK_SHARED, FEEDBACK_EMPTY, reviewStepsMessage } from "./feedback";
// Teranga backend logic (server-only). Used by /api/public/whatsapp-webhook, /api/public/weekly-digest
// and /api/public/eval-match.
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { matchQuestion, NOT_SURE } from "./match";
import { looksArabicScript } from "./script-guard";
import { gateApproval, STILL_PROCESSING } from "./approval";
import { runInBackground } from "./background.server";
import { numbersHeard } from "./numbers";
import { recordingCommand, ROUND_HINT, roundStoppedText, recordingHelpText } from "./champion-commands";
import { finishAnswers as runFinish, ensureAudio, finishAudio, type AudioDeps, type PipelineDeps, type PipelineRow, type Download, UNFINISHED } from "./pipeline";
import { callSummarySms, weeklyDigestSms, sendSmsWithFallback } from "./sms";
import { weeklyDigestWhatsApp } from "./digest.templates";
import { NOTIFY_HINT, NOTIFY_NONE, NOTIFY_OK, channelOf, followupMessage, plainNumber } from "./followup";
import { buildListingPack, formatListingPack, listingCopyText, type ApprovedAnswers } from "./listing";
import { ALERT_MENU, ALERT_TTL_HOURS, BILINGUAL_FLAG, COMMUNITY_MENU, alertPosted, alertSms, formatAlertList, formatBilingualItem, formatPulse, noNotices, parseAlertCommand, translationLabel, visitorNotice, type ActiveAlert } from "./community";
import { approvalSms, coachSms, helpSms, isCarrierKeyword, listingSms, parseOperatorSms, smsSegments, toSmsText, unknownSms, weeklyDigestSmsWo, withOptOut, type OperatorSmsCommand } from "./sms-text";
import type { StoredRun } from "./coach";
import { formatWeeklyReport, weeklyInsight, weeklyInsightSms } from "./weekly-insight";
import { parseCallPositions, questionTwimlBody, wrapTwiml, GOODBYE_TWIML_BODY } from "./call-flow";
import { formatPendingQueue, formatReviewSms } from "./review-queue";
import { W, bi, sl, topicWo, topicEn, UNVERIFIED_FOOTER } from "./champion.templates";

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
export async function aiText(instructions: string, input: string, signal: AbortSignal | null = null): Promise<string> {
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
  "You are a faithful translator for a Gambian tourism operator.",
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
  const j = (await res.json()) as { text?: string; language_code?: string; language_probability?: number; words?: Array<{ logprob?: number; type?: string }> };
  let text = (j.text ?? "").trim();
  if (languageCode === "wol" && looksArabicScript(text)) { console.warn("[stt] Wolof transcript came back in Arabic script; treating as not understood"); text = ""; }
  const lps = (j.words ?? []).filter((w) => w.type !== "spacing" && typeof w.logprob === "number").map((w) => Math.exp(w.logprob!));
  const confidence = lps.length ? lps.reduce((a, b) => a + b, 0) / lps.length : j.language_probability ?? null;
  return { status: res.status, text, language: j.language_code ?? null, confidence: confidence === null ? null : Math.round(confidence * 100) / 100 };
}

/** Download + transcribe in one go (used by the champion assistant and visitor reviews, inside the request). */
export async function transcribe(mediaUrl: string, languageCode: string | null = "wol", signal: AbortSignal | null = null): Promise<{ text: string; confidence: number | null; language?: string | null } | null> {
  try {
    const dl = await downloadMedia(mediaUrl, signal);
    console.log(`[transcribe] media downloaded ${dl.status} ${dl.ok ? dl.bytes : 0} ${dl.ok ? dl.type : "-"}`);
    if (!dl.ok) return null;
    const t0 = Date.now();
    const t = await sttBlob(dl.blob, dl.type, languageCode, signal);
    console.log(`[transcribe] stt ${t?.status ?? "failed"} ${Date.now() - t0}`);
    return t && t.text ? { text: t.text, confidence: t.confidence, language: t.language } : null;
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
    notifyText: (row, tx) => [`${sl(W.heard(row.position ?? "?"), `Question ${row.position ?? "?"} heard`)}`, `“${tx}”`, "", `${sl(W.numbersLabel, "Numbers")}`, numbersHeard(tx), "", UNVERIFIED_FOOTER].join("\n"),
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

async function route(c: Conv, input: { from: string; body: string; mediaUrl: string | null }, save: Save, channel: "whatsapp" | "sms" = "whatsapp"): Promise<string | Reply> {
  const text = input.body.trim();
  const upper = text.toUpperCase();

  // DEMO SHORTCUT: champion login by PIN over WhatsApp. Not a real authentication method.
  const pinMatch = /^REVIEW\s+(\S+)$/i.exec(text);
  const communityMatch = /^COMMUNITY\s+(\S+)$/i.exec(text);
  // Noor approves her own answers: her number needs no PIN to review (the PIN is for the household and community champions).
  if (upper === "REVIEW" && c.role !== "champion" && isOperatorCaller(input.from)) {
    await save({ role: "champion", state: "idle", current_question_position: null, current_review_answer_id: null });
    c.role = "champion"; c.state = "idle";
  }
  // By SMS the household champion and the community champion can do everything that is text: review (1 / 2 / 3), listing,
  // coaching, the weekly report, notices. Recording is by phone call. (Demo PIN over SMS is a shortcut, not real sign-in.)
  if (channel === "sms" && c.role === "champion" && !pinMatch && !communityMatch && upper !== "EXIT") {
    if (upper === "START") return "To record your answers, call the Teranga number.";
    return /^(REVIEW|LISTING|COACH( EN)?|SYNC|LEDGER|ALERT|ALERTS|PULSE|MENU|COMMUNITY)$|^ALERT\b/.test(upper) || (/^[123]$/.test(upper) && c.state === "reviewing")
      ? champion(c, upper, null, input.from, save, text, channel)
      : "Not an SMS command. By SMS: REVIEW, 1 2 3, LISTING, COACH, SYNC, ALERT, EXIT. Send BILINGUAL on WhatsApp.";
  }
  // DEMO SHORTCUT: the community champion logs in with the same demo PIN. Not a real authentication method.
  if (communityMatch) {
    if (safeEqual(communityMatch[1]!, env("DEMO_CHAMPION_PIN"))) {
      await save({ role: "champion", state: "community", current_question_position: null, current_review_answer_id: null });
      return channel === "sms" ? "Mbootaay: ALERT (send a notice), ALERTS, PULSE. Send EXIT to leave." : COMMUNITY_MENU;
    }
    return bi(W.wrongPin, "Wrong PIN.");
  }
  if (pinMatch) {
    if (safeEqual(pinMatch[1]!, env("DEMO_CHAMPION_PIN"))) {
      await save({ role: "champion", state: "idle", current_question_position: null, current_review_answer_id: null });
      if (channel === "sms") return "Household champion: REVIEW = check answers (then 1 approve, 2 record again, 3 bilingual). LISTING, COACH, SYNC. To record, call the Teranga number. EXIT to leave.";
      return `${W.menuTitle}\n${bi(W.menu, W.menuEn)}`;
    }
    return bi(W.wrongPin, "Wrong PIN.");
  }
  // In a recording round EXIT ends the round (handled in champion()), it does not leave champion mode.
  if (upper === "EXIT" && !(c.role === "champion" && c.state === "recording")) {
    await save({ role: "visitor", state: "idle", current_question_position: null, current_review_answer_id: null });
    return bi(W.visitorMode, "Visitor mode. Ask any question about the tour. Reply EN, DE or NL to change language.");
  }
  return c.role === "champion" ? champion(c, upper, input.mediaUrl, input.from, save, text) : visitor(c, text, upper, save, input.mediaUrl, channel, input.from);
}

/* ---------------- Visitor ---------------- */
const CLEAR_Q: Record<Lang, string> = {
  en: "Was this clear? Reply YES or NO",
  de: "War das verständlich? Antworten Sie YES oder NO",
  nl: "Was dit duidelijk? Antwoord YES of NO",
};

/** ElevenLabs language codes (eng, deu, nld or two-letter) to our three visitor languages. */
function spokenLang(code: string | null | undefined): Lang | null {
  const c = (code ?? "").toLowerCase();
  if (c === "eng" || c === "en") return "en";
  if (c === "deu" || c === "ger" || c === "de") return "de";
  if (c === "nld" || c === "dut" || c === "nl") return "nl";
  return null;
}

export async function visitor(c: Conv, text: string, upper: string, save: Save, mediaUrl: string | null = null, channel: "whatsapp" | "sms" = "whatsapp", from = ""): Promise<string | Reply> {
  const db = supabaseAdmin;
  if (upper === "FEEDBACK" || c.state.startsWith("feedback_")) return visitorFeedback(c, text, upper, save, mediaUrl);
  // Phase 2E (Simulated): opt-in partner suggestion. Asked once; only "<1|2|3> YES" suggests anything.
  if (upper === "MORE" || upper === "RECOMMEND") { await save({ state: "more_wait" }); return moreAsk(c.lang); }
  if (c.state === "more_wait") {
    const m = /^([123])\s*,?\s*YES$/.exec(upper);
    if (!m) { await save({ state: "idle" }); return noOptIn(c.lang); }
    const r = await recommendPartner(c.phone_hash, m[1]!, c.lang);
    await save({ state: "idle", last_recommendation_id: r.ledgerId } as Partial<Conv>);
    return r.text;
  }
  if (upper === "CONNECT" && c.last_recommendation_id) {
    await db.from("recommendation_ledger" as never).update({ connect_requested: true } as never).eq("id", c.last_recommendation_id);
    await save({ last_recommendation_id: null } as Partial<Conv>);
    return connectNoted(c.lang);
  }
  if (upper === "EN" || upper === "DE" || upper === "NL") {
    await save({ lang: upper.toLowerCase() as Lang });
    return { EN: "Language: English", DE: "Sprache: Deutsch", NL: "Taal: Nederlands" }[upper];
  }
  if (upper === "NOTIFY") {
    if (!c.last_visitor_question_id || !from) return NOTIFY_NONE[c.lang];
    const { data: vq } = await db.from("visitor_questions").select("matched_answer_id").eq("id", c.last_visitor_question_id).maybeSingle();
    if (!vq || (vq as { matched_answer_id: string | null }).matched_answer_id) return NOTIFY_NONE[c.lang];
    // Consent given by replying NOTIFY: the number is kept only until the answer is sent (or 14 days).
    await db.from("visitor_followups" as never).insert({ visitor_question_id: c.last_visitor_question_id, phone: plainNumber(from), channel: channelOf(from), lang: c.lang } as never);
    return NOTIFY_OK[c.lang];
  }
  if (upper === "STATUS") return visitorNotice(await activeAlerts(), c.lang) || noNotices(c.lang);
  if ((upper === "YES" || upper === "NO") && c.last_visitor_question_id) {
    await db.from("visitor_questions").update({ was_clear: upper === "YES" }).eq("id", c.last_visitor_question_id);
    await save({ last_visitor_question_id: null });
    return `Thank you!\n${reviewLine()}`;
  }

  let q = text.slice(0, 500);
  let heard = "";
  // A visitor can ask with a voice note in English, German or Dutch: speech recognition (language detected), then the same
  // matching as for text. The answer comes back in the language they spoke.
  if (!q && mediaUrl && channel !== "sms") {
    const t = await transcribe(mediaUrl, null, AbortSignal.timeout(9000));
    if (!t) return "Sorry, I could not hear that voice note. Please type your question.";
    q = t.text.slice(0, 500);
    const spoken = spokenLang(t.language);
    if (spoken && spoken !== c.lang) { c.lang = spoken; await save({ lang: spoken }); }
    heard = `🎙️ “${q}”\n\n`;
  }
  if (!q) return "Please type your question.";
  const { data: rows } = await db
    .from("answers")
    .select("id, english, german, dutch, is_sample, flags, recordings(questions(topic))")
    .eq("review_status", "approved");
  const answers = (rows ?? []) as unknown as Array<{
    id: string; english: string | null; german: string | null; dutch: string | null; is_sample: boolean; flags: string[] | null;
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
    const sureNotice = visitorNotice(await activeAlerts(), c.lang);
    return `${heard}${NOT_SURE[c.lang]}\n${NOTIFY_HINT[c.lang]}${sureNotice ? `\n\n${sureNotice}` : ""}\n\n${CLEAR_Q[c.lang]}\n${reviewLine()}`;
  }
  await save({ last_visitor_question_id: vq?.id ?? null });

  // Pre-generated voice (only exists for approved answers). Short-lived signed URL for Twilio to fetch.
  let audioUrl: string | undefined;
  let { data: audio } = channel === "sms" ? { data: null } : await db.from("answer_audio").select("audio_path").eq("answer_id", answer.id).eq("lang", c.lang).maybeSingle();
  if (channel !== "sms" && !audio?.audio_path) {
    // On demand, inside this request (8 s budget). Text only if it is not ready in time.
    try { await ensureAnswerAudio(answer.id, [c.lang], 8000); } catch (e) { console.error("[audio] error step=visitor", e); }
    ({ data: audio } = await db.from("answer_audio").select("audio_path").eq("answer_id", answer.id).eq("lang", c.lang).maybeSingle());
    if (!audio?.audio_path) console.log(`[audio ${answer.id}] not ready for ${c.lang}; text only`);
  }
  if (audio?.audio_path) {
    const { data: signed } = await db.storage.from(AUDIO_BUCKET).createSignedUrl(audio.audio_path, 600);
    audioUrl = signed?.signedUrl;
  }
  // A community notice (flood, closed road...) goes under every answer while it is active.
  const notice = visitorNotice(await activeAlerts(), c.lang);
  return {
    text: [
      heard + answerText + (answer.is_sample ? " (Sample answer)" : ""),
      "— " + translationLabel(c.lang, !!answer.flags?.includes(BILINGUAL_FLAG)) + (audioUrl ? " · voice note follows (AI-generated voice)" : ""),
      ...(notice ? ["", notice] : []),
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
      return { text: t, secondText: reviewStepsMessage(L, process.env['GOOGLE_REVIEW_URL']) };
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
  // Follow-up numbers are kept at most 14 days (consent was only for one message).
  await db.from("visitor_followups" as never).delete().lt("created_at", new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString());
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
export async function recommendPartner(visitorHash: string, choice: string, lang: Lang = "en"): Promise<{ text: string; ledgerId: string | null }> {
  const fit = FIT_BY_CHOICE[choice];
  const { data } = await supabaseAdmin.from("partner_operators" as never).select("id, name, tour_type, fit, language_support");
  const p = fit ? pickPartner((data ?? []) as Partner[], await monthCounts(), fit) : null;
  if (!p) return { text: suggestionText(null, lang), ledgerId: null };
  const { data: row } = await supabaseAdmin.from("recommendation_ledger" as never)
    .insert({ from_operator: "Noor", to_operator_id: p.id, visitor_hash: visitorHash, is_sample: true } as never).select("id").single();
  return { text: suggestionText(p, lang), ledgerId: (row as { id: string } | null)?.id ?? null };
}

/** Contact requests (CONNECT) this month that a person still has to pass on. */
async function connectRequestCount(): Promise<number> {
  const { count } = await supabaseAdmin.from("recommendation_ledger" as never)
    .select("id", { count: "exact", head: true }).eq("connect_requested", true).gte("created_at", monthStart());
  return count ?? 0;
}

export async function ledgerSummary(): Promise<string> {
  const { data } = await supabaseAdmin.from("partner_operators" as never).select("id, name").order("name");
  const counts = await monthCounts();
  const rows = ((data ?? []) as Array<{ id: string; name: string }>).map((p) => ({ name: p.name, received: counts[p.id] ?? 0 }));
  return ledgerText(rows, Object.values(counts).reduce((a, b) => a + b, 0), await connectRequestCount());
}

/** Approved English answers by topic; a real answer always wins over a seeded sample. */
async function approvedAnswers(): Promise<ApprovedAnswers> {
  const { data } = await supabaseAdmin.from("answers")
    .select("english, is_sample, recordings(questions(topic))").eq("review_status", "approved");
  const by: ApprovedAnswers = {};
  for (const r of (data ?? []) as unknown as Array<{ english: string | null; is_sample: boolean; recordings: { questions: { topic: string } | null } | null }>) {
    const topic = r.recordings?.questions?.topic;
    if (!topic || !r.english) continue;
    const cur = by[topic];
    if (!cur || (cur.sample && !r.is_sample)) by[topic] = { text: r.english, sample: r.is_sample };
  }
  return by;
}

export async function currentListingPack() {
  return buildListingPack(await approvedAnswers(), { whatsapp: process.env["DEMO_WHATSAPP_NUMBER"] });
}

/** Google listing draft from APPROVED answers only. Nothing is sent to Google: a person claims the profile and pastes it. */
export async function draftListing(): Promise<Reply> {
  const pack = await currentListingPack();
  return { text: formatListingPack(pack), secondText: listingCopyText(pack) ?? undefined };
}

/* ---------------- Champion ---------------- */
async function champion(c: Conv, upper: string, mediaUrl: string | null, from: string, save: Save, text: string, channel: "whatsapp" | "sms" = "whatsapp") {
  const db = supabaseAdmin;
  const { data: questions } = await db.from("questions").select("id, position, topic").order("position");
  const qs = questions ?? [];
  const ask = (n: number) => `*Laaj ${n} ci ${TOTAL_QUESTIONS}* · ${topicWo(qs[n - 1]?.topic)}\n_Question ${n} of ${TOTAL_QUESTIONS} · ${topicEn(qs[n - 1]?.topic)}_\n🎙️ ${sl("Tontul ak kàddu", "Reply with a voice note")}`;
  const roundHint = `_${W.roundHint}_`;

  // Confirmation turn for an agent-proposed review decision: only an explicit YES executes it.
  if (c.pending_action) {
    const pa = c.pending_action;
    await save({ pending_action: null });
    if (/^(YES|OUI|WAAW)\b/.test(upper)) {
      const { data: still } = await db.from("answers").select("review_status").eq("id", pa.answer_id).maybeSingle();
      if (still?.review_status !== "pending") return "That answer is no longer pending. Nothing changed.";
      if (!(await applyReview(pa.answer_id, pa.status))) return STILL_PROCESSING;
      return { approved: bi(W.approved, "Done: approved."), rerecord: bi(W.rerecord, "Done: marked for re-record."), needs_bilingual: bi(W.bilingual, "Done: sent to bilingual reviewer.") }[pa.status];
    }
    // Anything else cancels the proposal and is handled as a new message below.
  }

  // Community tools (alerts, translation checks, overview) exist only after COMMUNITY <PIN>.
  if (c.state === "community" || c.state === "bilingual") {
    const r = await communityChampion(c, upper, text, save);
    if (r !== null) return r;
  } else if (/^(ALERT|ALERTS|BILINGUAL|PULSE)\b/.test(upper)) {
    return bi("Jëkk dugg ci mbootaay: COMMUNITY + PIN.", "Open the community tools first: COMMUNITY <PIN>.");
  }

  // A lone digit with no review on screen is not a question for the AI assistant.
  if (/^[123]$/.test(upper) && c.state !== "reviewing" && c.state !== "bilingual" && c.state !== "recording") {
    return bi("Jëkk bind REVIEW ngir gis tontu yi.", "Send REVIEW first to see the answers.");
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
    return bi(W.stopped(saved), roundStoppedText(saved));
  }
  if (cmd === "help") return bi(W.help(c.current_question_position ?? 1, TOTAL_QUESTIONS), recordingHelpText(c.current_question_position ?? 1, TOTAL_QUESTIONS));
  if (cmd === "review") await save({ state: "idle", current_question_position: null }); // falls through to REVIEW below

  if (c.state === "recording" && c.current_question_position && !cmd) {
    const n = c.current_question_position;
    if (!mediaUrl) return `${bi(W.pleaseSend(n), `Please send a voice note for question ${n}.`)}\n\n${ask(n)}\n\n${roundHint}`;
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
      return { text: `${sl(W.gotQuestion(n), `Got question ${n}`)}\n${sl(W.roundComplete, "Round complete. Send REVIEW to review.")}`, finishFirst: answerId };
    }
    await save({ current_question_position: next });
    return { text: `${sl(W.gotQuestion(n), `Got question ${n}`)}\n\n${ask(next)}\n\n${roundHint}`, finishFirst: answerId };
  }

  if (upper === "REVIEW") {
    // Finish what is pending first (no transcript messages here: REVIEW shows the transcript itself).
    try { await finishAnswers(10000); } catch (e) { console.error("[pipeline] error step=finishAnswers", e); }
    return showNextPending(save, channel);
  }
  if (upper === "FOLLOWUPS") {
    const f = await sendFollowups();
    return bi(`Yónnee nañu ${f.sent} tontu ci gan yi. ${f.waiting} di xaar.`, `Follow-ups sent to tourists: ${f.sent}. Still waiting: ${f.waiting}.`);
  }
  if (upper === "SYNC") {
    const r = await weeklySync(false);
    return r.report + (await smsCopyNote(r.sms));
  }
  if (upper === "LEDGER") return ledgerSummary();
  if (upper === "LISTING") return draftListing();
  if (["COACH", "COACH EN", "COACH MORE", "COACH MORE EN"].includes(upper)) {
    const coach = await import("./coach.server");
    const lang = upper.endsWith(" EN") ? "en" : "wo";
    try {
      if (upper.startsWith("COACH MORE")) return await coach.coachMore(undefined, lang);
      const r = await coach.getCoaching(aiText, 10000, undefined, undefined, true, lang);
      // Noor also gets a short copy by SMS, so she can keep it and read it without internet. Best effort, one attempt.
      if (!r.run) return r.messages[0];
      const note = await smsCopyNote(coachSms(r.run, lang));
      return r.messages[0].length + note.length <= 1540 ? r.messages[0] + note : { text: r.messages[0], secondText: note.trim() };
    } catch (e) {
      console.error("[coach] error step=coach", e);
      const { COACH_TEMPLATES: t } = await import("./coach.templates");
      return `${t.loadError[lang]}${lang === "wo" ? `\n${t.englishHint.wo}\n${t.machineLabel.wo}\n${t.machineLabel.en}` : ""}`;
    }
  }

  if ((c.state === "reviewing" || cmd === "digit") && c.current_review_answer_id) {
    const m = /^([123])\b/.exec(upper);
    if (m) {
    const status = { "1": "approved", "2": "rerecord", "3": "needs_bilingual" }[m[1]!] as "approved" | "rerecord" | "needs_bilingual";
    if (!(await applyReview(c.current_review_answer_id, status))) return STILL_PROCESSING;
    const label = { approved: sl(W.approved, "Approved"), rerecord: sl(W.rerecord, "Marked for re-record"), needs_bilingual: sl(W.bilingual, "Sent to a bilingual reviewer") }[status];
    const next = await showNextPending(save, channel);
    return channel === "sms" ? { text: label, secondText: next } : `${label}\n\n${next}`;
    }
  }

  return championAgent(c, text, mediaUrl, save);
}

/** Returns false (and changes nothing) when an approval is refused because the answer is not fully processed. */
async function applyReview(id: string, status: "approved" | "rerecord" | "needs_bilingual"): Promise<boolean> {
  if (status === "approved") {
    const ok = await gateApproval(id, {
      load: async (x) => (await supabaseAdmin.from("answers").select("stage, english, german, dutch").eq("id", x).maybeSingle()).data as never,
      finish: (x, ms) => finishAnswers(ms, { firstId: x }),
    }, 10000);
    if (!ok) { console.log(`[approve ${id}] refused: not fully processed`); return false; }
  }
  await supabaseAdmin.from("answers").update({
    review_status: status, approved_at: status === "approved" ? new Date().toISOString() : null,
  }).eq("id", id);
  // Voice files are made inside this request (about 10 s) before the confirmation is sent; leftovers via finishAnswers.
  if (status === "approved") {
    try { await ensureAnswerAudio(id, ["en", "de", "nl"], 10000); } catch (e) { console.error("[audio] error step=approve", e); }
    // The receipt to Noor must never delay the household champion's confirmation (Twilio waits about 15 s): give it 3 s at most.
    await Promise.race([notifyApproval(id), new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
  }
  return true;
}

/* ---------------- Noor's SMS (works on a feature phone without internet) ---------------- */

type SmsStatus = "sent" | "failed" | "capped";

/** One SMS to Noor's phone (DEMO_SMS_NUMBER). No fallback: used for copies and receipts she does not wait for. */
export async function sendOperatorSms(body: string): Promise<SmsStatus> {
  try {
    return (await twilioSend(env("DEMO_SMS_NUMBER"), env("TWILIO_SMS_FROM"), body)) ? "sent" : "capped";
  } catch (e) {
    console.error("[sms] operator SMS failed", (e as Error).message);
    return "failed";
  }
}

/** One line for the household champion's WhatsApp reply saying what happened to the SMS copy. */
async function smsCopyNote(body: string): Promise<string> {
  const st = await sendOperatorSms(body);
  const line = {
    sent: sl("SMS bi dem na ci Noor", "SMS copy sent to Noor's phone"),
    failed: sl("SMS bi demul", "SMS copy not delivered: US carrier registration pending"),
    capped: sl("SMS bi demul (cap bu bés bi)", "SMS copy skipped: daily message cap"),
  }[st];
  return `\n\n📲 ${line}`;
}

/** Receipt to Noor when the household champion approves one of her answers (set SMS_RECEIPTS=off to turn off). */
async function notifyApproval(answerId: string) {
  if (process.env["SMS_RECEIPTS"] === "off") return;
  try {
    const { data } = await supabaseAdmin.from("answers").select("is_sample, recordings(questions(topic))").eq("id", answerId).maybeSingle();
    const row = data as unknown as { is_sample: boolean; recordings: { questions: { topic: string } | null } | null } | null;
    const topic = row?.recordings?.questions?.topic;
    if (!topic || row?.is_sample) return;
    await sendOperatorSms(approvalSms(topic, await currentListingPack(), "wo"));
  } catch (e) {
    console.error("[sms] approval receipt failed", e);
  }
}

/** Reply to Noor's text. If SMS is blocked (US carrier registration pending) the same text goes to WhatsApp once. */
async function replyOperatorSms(to: string, body: string) {
  await sendSmsWithFallback(
    body,
    () => twilioSend(to, env("TWILIO_SMS_FROM"), body),
    () => sendWhatsApp(to, `SMS copy (shown here because US SMS registration is pending):\n${body}`),
  );
}

/** The SMS text for one of Noor's commands. Shared by the real SMS webhook and the public simulator (which sends nothing). */
async function operatorSmsBody(parsed: OperatorSmsCommand, fallbackLang: "wo" | "en" = "wo"): Promise<string> {
  const lang = parsed?.lang ?? fallbackLang;
  try {
    if (!parsed) return unknownSms(lang);
    if (parsed.cmd === "help") return helpSms(lang);
    if (parsed.cmd === "listing") return listingSms(await currentListingPack(), lang);
    if (parsed.cmd === "week") return weeklyInsightSms((await weeklySync(false)).insight, lang);
    const coach = await import("./coach.server");
    const r = await coach.getCoaching(aiText, 10000, undefined, undefined, true, lang);
    return r.run ? coachSms(r.run, lang) : withOptOut(r.messages[0]);
  } catch (e) {
    console.error("[sms] command failed", e);
    return withOptOut(lang === "wo" ? "Teranga: jafe-jafe amna. Yonnee ko ci kanam tuuti." : "Teranga: something went wrong. Please try again in a minute.");
  }
}

/** Inbound SMS. Noor's number gets COACH / LISTING / WEEK / HELP. A community champion can log in with COMMUNITY <PIN> and
 *  post ALERT notices by SMS (SMS keeps working when mobile data does not). Everyone else is ignored unless SMS_VISITOR_MODE=on. */
export async function handleSms(input: { from: string; body: string }): Promise<void> {
  if (isCarrierKeyword(input.body)) return; // Twilio answers STOP and START itself
  if (isOperatorCaller(input.from)) {
    // Noor reviews and approves her own answers by SMS: REVIEW, then 1 (approve), 2 (record again) or 3 (bilingual reviewer).
    if (/^(REVIEW|[123])$/i.test(input.body.trim())) { await handleOtherSms(input, true); return; }
    await replyOperatorSms(input.from, await operatorSmsBody(parseOperatorSms(input.body)));
    return;
  }
  await handleOtherSms(input);
}

/** Text-only SMS from anyone but Noor: community champion sessions, and visitors when SMS_VISITOR_MODE=on. */
async function handleOtherSms(input: { from: string; body: string }, trusted = false) {
  const db = supabaseAdmin;
  const visitorMode = process.env["SMS_VISITOR_MODE"] === "on";
  const wantsLogin = /^(COMMUNITY|REVIEW)\s+\S+$/i.test(input.body.trim());
  const phone_hash = hashPhone(input.from);
  let { data: conv } = await db.from("conversations").select("*").eq("phone_hash", phone_hash).maybeSingle();
  const pin = /^(?:COMMUNITY|REVIEW)\s+(\S+)$/i.exec(input.body.trim())?.[1];
  const pinOk = !!pin && safeEqual(pin, env("DEMO_CHAMPION_PIN"));
  if (!conv && (visitorMode || pinOk || trusted)) conv = (await db.from("conversations").insert({ phone_hash }).select("*").single()).data;
  if (!conv) return; // a stranger texting a random word: no row, no reply, no cost
  const c = conv as unknown as Conv;
  const inCommunity = c.role === "champion"; // a household champion or community champion who logged in by SMS or WhatsApp
  const noorReview = trusted && /^(REVIEW|[123])$/i.test(input.body.trim());
  if (!visitorMode && !wantsLogin && !inCommunity && !noorReview) return;
  const save: Save = (patch) => db.from("conversations").update(patch as never).eq("phone_hash", phone_hash);
  const r = await route(c, { from: input.from, body: input.body, mediaUrl: null }, save, "sms");
  const reply: Reply = typeof r === "string" ? { text: r } : r;
  const parts = [reply.text, reply.secondText].filter((x): x is string => !!x).map((x) => toSmsText(x));
  for (let i = 0; i < parts.length; i++) {
    try { if (!(await twilioSend(input.from, env("TWILIO_SMS_FROM"), parts[i]!))) break; }
    catch (e) {
      console.error("[sms] reply failed", (e as Error).message);
      // A household champion or community champion still gets the answer on WhatsApp if US SMS is blocked: ALL remaining parts, so the
      // next review card is never hidden behind a "1" that approves an unseen answer.
      if (inCommunity || wantsLogin) for (const rest of parts.slice(i)) await sendWhatsApp(input.from, `SMS copy (shown here because US SMS registration is pending):\n${rest}`).catch(() => undefined);
      break;
    }
  }
}

/** Public simulator for the home page: what the SMS would say. Reads data, writes nothing, sends nothing. */
export async function simulateSms(as: "noor" | "visitor", text: string, lang: "en" | "de" | "nl" | "wo"): Promise<{ reply: string; parts: number }> {
  const body = text.trim().slice(0, 160);
  let reply: string;
  if (isCarrierKeyword(body)) reply = "(Twilio handles STOP and START itself; no reply is sent.)";
  else if (as === "noor") {
    const parsed = parseOperatorSms(body);
    reply = await operatorSmsBody(parsed ? { ...parsed, lang: lang === "en" ? "en" : parsed.lang } : null, lang === "en" ? "en" : "wo");
  } else reply = await visitorSmsAnswer(body, lang === "wo" ? "en" : lang);
  return { reply, parts: smsSegments(reply) };
}

/** Stateless visitor answer for the simulator: the same matching and labels as WhatsApp, text only. */
async function visitorSmsAnswer(q: string, lang: Lang): Promise<string> {
  if (!q) return "Please type your question.";
  const notice = visitorNotice(await activeAlerts(), lang);
  if (q.toUpperCase() === "STATUS") return toSmsText(notice || noNotices(lang));
  const { data } = await supabaseAdmin.from("answers")
    .select("id, english, german, dutch, is_sample, flags, recordings(questions(topic))").eq("review_status", "approved");
  const answers = (data ?? []) as unknown as Array<{
    id: string; english: string | null; german: string | null; dutch: string | null; is_sample: boolean; flags: string[] | null;
    recordings: { questions: { topic: string } | null } | null;
  }>;
  const { answer } = matchQuestion(q, answers);
  const text = answer?.[FIELD[lang]] ?? null;
  if (!answer || !text) return toSmsText([NOT_SURE[lang], ...(notice ? ["", notice] : [])].join("\n"));
  return toSmsText([
    text + (answer.is_sample ? " (Sample answer)" : ""),
    "- " + translationLabel(lang, !!answer.flags?.includes(BILINGUAL_FLAG)),
    ...(notice ? ["", notice] : []),
  ].join("\n"));
}

/** Weekly sync: re-read the public reviews (fresh = ignore the 24 h cache), add what visitors asked and said this week,
 *  and refine the coaching. Counts only. */
export async function weeklySync(fresh: boolean, budgetMs = 45000) {
  const coach = await import("./coach.server");
  let run: StoredRun | null = null;
  let prev: StoredRun | null = null;
  try {
    if (fresh) {
      prev = await coach.dbStore.latest();
      const r = await coach.refreshCoaching(aiText, budgetMs);
      if (r.places_count > 0) run = await coach.dbStore.latest(); else { run = prev; prev = null; }
    } else {
      run = await coach.dbStore.latest();
      prev = await coach.previousRun();
    }
  } catch (e) { console.error("[sync] review refresh failed", e); run = run ?? prev; prev = null; }
  const d = await digestData();
  const byTopic = Object.fromEntries(d.topics.map((t) => [t.topic, t.count]));
  const insight = weeklyInsight({ total: d.total, byTopic, unanswered: byTopic["unanswered"] ?? 0, notClear: d.notClear }, run, prev);
  return { insight, report: formatWeeklyReport(insight), sms: weeklyInsightSms(insight, "wo") };
}

/** The weekly job (POST /api/public/weekly-sync with the digest secret): fresh review scan, then the household champion's report on
 *  WhatsApp (the smartphone session) and a short SMS to Noor. */
export async function runWeeklySync() {
  const r = await weeklySync(true);
  const to = env("DEMO_SMS_NUMBER");
  const sms = await sendOperatorSms(r.sms);
  let whatsapp = false;
  try { whatsapp = await sendWhatsApp(to, r.report); } catch (e) { console.error("[sync] WhatsApp report failed", (e as Error).message); }
  const followups = await sendFollowups().catch((e) => { console.error("[sync] followups failed", e); return { sent: 0, waiting: 0 }; });
  return { sms, whatsapp, visitors: r.insight.total, actions: r.insight.actions.length, reviewShifts: r.insight.shifts.length, followups };
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

async function showNextPending(save: Save, channel: "whatsapp" | "sms" = "whatsapp") {
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
  if (channel === "sms") {
    const item = list.find((i) => i.id === answerId)!;
    return formatReviewSms({
      index: 1, total: list.length, topic: item.recordings?.questions?.topic ?? null, transcript: item.transcript_src,
      numbers: numbersHeard(item.transcript_src), flags: item.flags,
    });
  }
  return text;
}

/* ---------------- Follow-up to tourists ---------------- */

/** Messages every opted-in visitor whose question now has an approved answer, then deletes their number. Best effort: a message
 *  that cannot be sent (for example WhatsApp's 24 h window closed) stays for the next sync; rows older than 14 days are purged. */
export async function sendFollowups(limit = 20): Promise<{ sent: number; waiting: number }> {
  const db = supabaseAdmin;
  const { data } = await db.from("visitor_followups" as never)
    .select("id, phone, channel, lang, visitor_questions(text)").order("created_at").limit(limit);
  const rows = (data ?? []) as unknown as Array<{ id: string; phone: string; channel: "whatsapp" | "sms"; lang: "en" | "de" | "nl"; visitor_questions: { text: string } | null }>;
  if (!rows.length) return { sent: 0, waiting: 0 };
  const { data: ans } = await db.from("answers")
    .select("id, english, german, dutch, is_sample, flags, recordings(questions(topic))").eq("review_status", "approved");
  const answers = (ans ?? []) as unknown as Array<{
    id: string; english: string | null; german: string | null; dutch: string | null; is_sample: boolean; flags: string[] | null;
    recordings: { questions: { topic: string } | null } | null;
  }>;
  let sent = 0;
  for (const r of rows) {
    const q = r.visitor_questions?.text;
    if (!q) continue;
    const { answer } = matchQuestion(q, answers);
    const text = answer?.[FIELD[r.lang]] ?? null;
    if (!answer || !text) continue;
    const body = followupMessage(r.lang, q, text + (answer.is_sample ? " (Sample answer)" : ""), translationLabel(r.lang, !!answer.flags?.includes(BILINGUAL_FLAG)));
    try {
      const ok = r.channel === "whatsapp" ? await sendWhatsApp(r.phone, body) : await twilioSend(r.phone, env("TWILIO_SMS_FROM"), toSmsText(body));
      if (!ok) break; // daily cap reached: keep the rest for later
      await db.from("visitor_followups" as never).delete().eq("id", r.id);
      sent++;
    } catch (e) { console.error("[followup] send failed", (e as Error).message); }
  }
  return { sent, waiting: rows.length - sent };
}

/* ---------------- Community Circle (community champion) ---------------- */

/** Notices that are still running: not cleared and not past their 24 hours. */
async function activeAlerts(): Promise<ActiveAlert[]> {
  const { data } = await supabaseAdmin.from("community_alerts" as never)
    .select("kind, place, created_at").is("cleared_at", null).gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(5);
  return (data ?? []) as unknown as ActiveAlert[];
}

/** Posts a notice, or (kind "clear") ends all running ones. Returns how many were cleared. */
async function postAlert(kind: ActiveAlert["kind"], place: string | null, byHash: string): Promise<number> {
  const db = supabaseAdmin;
  const now = new Date();
  if (kind === "clear") {
    const { data } = await db.from("community_alerts" as never).update({ cleared_at: now.toISOString() } as never)
      .is("cleared_at", null).gt("expires_at", now.toISOString()).select("id");
    return (data ?? []).length;
  }
  const { error } = await db.from("community_alerts" as never).insert({
    kind, place, expires_at: new Date(now.getTime() + ALERT_TTL_HOURS * 3600000).toISOString(), posted_by: byHash,
  } as never);
  if (error) throw new Error(`alert not saved: ${(error as { message?: string }).message ?? "unknown"}`);
  return 0;
}

async function addFlag(answerId: string, flag: string) {
  const { data } = await supabaseAdmin.from("answers").select("flags").eq("id", answerId).maybeSingle();
  const flags = ((data as { flags: string[] | null } | null)?.flags ?? []).filter((f) => f !== flag);
  await supabaseAdmin.from("answers").update({ flags: [...flags, flag] }).eq("id", answerId);
}

/** Next answer a household champion sent to "a bilingual reviewer" (option 3). Sample answers are never shown. */
async function showNextBilingual(save: Save): Promise<string> {
  const { data } = await supabaseAdmin.from("answers")
    .select("id, transcript_src, english, flags, recordings(questions(topic))")
    .eq("review_status", "needs_bilingual").eq("is_sample", false).order("created_at");
  const list = (data ?? []) as unknown as Array<{
    id: string; transcript_src: string | null; english: string | null; flags: string[] | null;
    recordings: { questions: { topic: string } | null } | null;
  }>;
  const item = list[0];
  if (!item) {
    await save({ state: "community", current_review_answer_id: null });
    return bi("Amul tekki bu ñu war a seet léegi.", "No translations are waiting for a check.");
  }
  await save({ state: "bilingual", current_review_answer_id: item.id });
  return formatBilingualItem({
    topic: item.recordings?.questions?.topic ?? null, transcript: item.transcript_src, english: item.english,
    numbers: numbersHeard(item.transcript_src), flags: item.flags ?? [],
  }, list.length);
}

async function pulseText(): Promise<string> {
  const db = supabaseAdmin;
  const [alerts, bilingual, partners, contacts, approved] = await Promise.all([
    activeAlerts(),
    db.from("answers").select("id", { count: "exact", head: true }).eq("review_status", "needs_bilingual").eq("is_sample", false),
    db.from("partner_operators").select("id", { count: "exact", head: true }),
    connectRequestCount(),
    approvedAnswers(),
  ]);
  return formatPulse({
    realMembers: 1, simulatedMembers: partners.count ?? 0, activeNotices: alerts.filter((a) => a.kind !== "clear").length,
    translationsWaiting: bilingual.count ?? 0, contactRequests: contacts,
    approved: Object.values(approved).filter((x) => x && !x.sample).length, cards: 10,
  });
}

/** Commands for the community champion. Returns null for anything else, so household commands still work. */
async function communityChampion(c: Conv, upper: string, text: string, save: Save): Promise<string | Reply | null> {
  // A translation is on screen: 1 = English is right, 2 = record again, 3 = leave it.
  if (c.state === "bilingual" && c.current_review_answer_id && /^[123]\b/.test(upper)) {
    const id = c.current_review_answer_id;
    if (upper.startsWith("1")) {
      if (!(await applyReview(id, "approved"))) return STILL_PROCESSING;
      await addFlag(id, BILINGUAL_FLAG);
      return `${bi("Baax na: nangu nañu ko, te nit ku xam ñaar yi làkk seet na ko.", "Done: approved, and marked as checked by a bilingual reviewer.")}\n\n${await showNextBilingual(save)}`;
    }
    if (upper.startsWith("2")) {
      await applyReview(id, "rerecord");
      return `${sl(W.rerecord, "Marked for re-record")}\n\n${await showNextBilingual(save)}`;
    }
    await save({ state: "community", current_review_answer_id: null });
    return `${bi("Baax na, bàyyi nañu ko.", "Left for now.")}\n\n${COMMUNITY_MENU}`;
  }
  if (upper === "COMMUNITY" || upper === "MENU") {
    await save({ state: "community", current_review_answer_id: null });
    return COMMUNITY_MENU;
  }
  const alert = parseAlertCommand(text);
  if (alert) {
    if ("menu" in alert) return ALERT_MENU;
    if ("invalid" in alert) return bi("Xamuma ndigal bi. Bind ALERT ngir gis limu yi.", "I did not understand. Send ALERT to see the numbers.");
    let cleared: number;
    try { cleared = await postAlert(alert.kind, alert.place, c.phone_hash); }
    catch (e) { console.error("[community] alert failed", e); return bi("Ndigal bi dem ul. Jéemaat ci kanam.", "The notice was NOT posted and nobody was messaged. Please try again."); }
    const sms = await sendOperatorSms(alertSms(alert.kind, alert.place));
    const { count } = await supabaseAdmin.from("partner_operators").select("id", { count: "exact", head: true });
    return alertPosted(alert.kind, alert.place, sms, count ?? 0, cleared);
  }
  if (upper === "ALERTS") return formatAlertList(await activeAlerts());
  if (upper === "PULSE") return pulseText();
  if (upper === "BILINGUAL") return showNextBilingual(save);
  return null;
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
/** Counts of this week's visitor questions by topic, plus the first unanswered ones. */
async function digestData() {
  const db = supabaseAdmin;
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: vqs } = await db.from("visitor_questions")
    .select("id, text, is_sample, was_clear, answers(recordings(questions(topic)))")
    .gte("created_at", since);
  const rows = (vqs ?? []) as unknown as Array<{
    id: string; text: string; is_sample: boolean; was_clear: boolean | null; answers: { recordings: { questions: { topic: string } | null } | null } | null;
  }>;
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const t = r.answers?.recordings?.questions?.topic ?? "unanswered";
    counts[t] = (counts[t] ?? 0) + 1;
  }
  const { data: un } = await db.from("unanswered")
    .select("visitor_questions(text, is_sample)").gte("created_at", since).limit(3);
  const unanswered = ((un ?? []) as unknown as Array<{ visitor_questions: { text: string; is_sample: boolean } | null }>)
    .map((u) => u.visitor_questions).filter((v): v is { text: string; is_sample: boolean } => !!v)
    .map((v) => ({ text: v.text, isSample: v.is_sample }));
  return { total: rows.length, topics: Object.entries(counts).map(([topic, count]) => ({ topic, count })), unanswered, notClear: rows.filter((r) => r.was_clear === false).length };
}

/** Noor gets the digest by SMS in Wolof (counts only, so it works without internet); her household champion's WhatsApp fallback has the full text. */
export async function sendWeeklyDigest() {
  const d = await digestData();
  const body = weeklyDigestSmsWo(d.total, d.topics, d.topics.find((t) => t.topic === "unanswered")?.count ?? 0);
  const referrals = Object.values(await monthCounts()).reduce((a, b) => a + b, 0);
  const waBody = weeklyDigestWhatsApp(d.total, d.topics, d.unanswered, referrals);
  const to = env("DEMO_SMS_NUMBER");
  const result = await sendSmsWithFallback(body,
    () => twilioSend(to, env("TWILIO_SMS_FROM"), body),
    () => sendWhatsApp(to, waBody));
  return { ...result, questions: d.total, unanswered: d.unanswered.length };
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

const xml = (body: string) => new Response(wrapTwiml(body), { headers: { "Content-Type": "text/xml" } });

/** Card positions asked per call (optional secret CALL_QUESTION_POSITIONS, default "1,5"). */
export const callPositions = () => parseCallPositions(process.env["CALL_QUESTION_POSITIONS"]);

export const twimlPrivate = () => xml(`<Say>Sorry, this line is private.</Say><Hangup/>`);

/** TwiML for call step n (1..M); the card position comes from callPositions(). */
export function twimlQuestion(n: number, opts: { greet?: boolean; retry?: boolean } = {}) {
  return xml(questionTwimlBody(n, callPositions(), opts));
}

export const twimlGoodbye = () => xml(GOODBYE_TWIML_BODY);

/** One summary per call, with a single WhatsApp fallback if SMS fails. */
export async function sendCallSummary(callSid: string) {
  const to = env("DEMO_SMS_NUMBER");
  const { data } = await supabaseAdmin.rpc("voice_call_claim_summary" as never, { _sid: callSid } as never);
  if (data === null || data === undefined) return false; // already sent for this call
  const n = Number(data) || 0;
  const body = callSummarySms(n, callPositions().length);
  const result = await sendSmsWithFallback(body,
    () => twilioSend(to, env("TWILIO_SMS_FROM"), body),
    () => sendWhatsApp(to, body));
  return result.sent;
}

/** Stores a call recording against card `position` and runs the same pipeline as WhatsApp voice notes. Returns answers so far. */
export async function storeCallRecording(callSid: string, position: number, recordingUrl: string) {
  const db = supabaseAdmin;
  const { data: q } = await db.from("questions").select("id").eq("position", position).maybeSingle();
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
