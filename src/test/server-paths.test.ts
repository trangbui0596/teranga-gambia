// Smoke tests that run the REAL src/lib/tourcoach.server.ts against an in-memory database (helpers/fake-supabase.ts)
// and a fake Twilio gateway (stubbed fetch). They catch runtime errors in the channel handlers: null dereferences,
// wrong column names, wrong control flow. They assert on the captured outbound messages and on the stored rows.
//
// Not covered (cannot be mocked reasonably): the AI champion agent (free text in champion mode, needs the AI SDK),
// voice-note transcription/translation (ElevenLabs/AI gateway; any such call is made to fail and must not happen),
// the Google Maps review fetch (COACH reads the cached run only), and Twilio signature checks in the routes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./helpers/fake-supabase";
import { handleSms, handleWhatsApp, hashPhone, purgeFeedback, runWeeklySync, sendFollowups, sendWeeklyDigest, simulateSms } from "@/lib/tourcoach.server";

vi.mock("@/integrations/supabase/client.server", async () => {
  const { fakeDb: db } = await import("./helpers/fake-supabase");
  return { supabaseAdmin: db.client };
});
// waitUntil work is best effort in production and must not run after a test ends.
vi.mock("@/lib/background.server", () => ({ runInBackground: vi.fn(), requestCtx: { getStore: () => undefined } }));

const NOOR = "+15550001111";
const SMS_FROM = "+15550002222";
const WA_FROM = "whatsapp:+14155238886";
const VISITOR = "whatsapp:+15550003333";
const STRANGER_SMS = "+15550005555";
const GATEWAY_BASE = "https://connector-gateway.lovable.dev/twilio";
const GATEWAY = `${GATEWAY_BASE}/Messages.json`;
const VOICE_URL = "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1";

/* ---------------- fake Twilio / HTTP layer ---------------- */
type Msg = { to: string; from: string; body: string; mediaUrl: string | null; status: number };
const net = {
  attempts: [] as Msg[],
  other: [] as string[],
  tts: 0,
  smsFails: false,
  whatsappFails: false,
  ttsOk: false,
  mediaStatus: 200,
  mediaCalls: [] as string[],
  sttCalls: 0,
  sttForm: null as FormData | null,
  stt: { status: 200, json: { text: "How much does it cost?", language_code: "eng" } as Record<string, unknown> },
};
const delivered = () => net.attempts.filter((m) => m.status < 300);
const isWa = (m: Msg) => m.from.startsWith("whatsapp:");
const sms = () => net.attempts.filter((m) => !isWa(m));
const whatsapp = () => net.attempts.filter(isWa);

function installFetch() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === GATEWAY) {
      const p = new URLSearchParams(String(init?.body ?? ""));
      const msg: Msg = { to: p.get("To") ?? "", from: p.get("From") ?? "", body: p.get("Body") ?? "", mediaUrl: p.get("MediaUrl"), status: 201 };
      if (isWa(msg) ? net.whatsappFails : net.smsFails) msg.status = 400;
      net.attempts.push(msg);
      return new Response(msg.status < 300 ? "{}" : "blocked", { status: msg.status });
    }
    if (url.startsWith("https://api.elevenlabs.io/v1/text-to-speech/")) {
      net.tts++;
      return net.ttsOk ? new Response(new Uint8Array([1, 2, 3]), { status: 200 }) : new Response("no", { status: 500 });
    }
    if (url.startsWith(`${GATEWAY_BASE}/Messages/`)) { // Twilio media download (voice note), through the connector gateway
      net.mediaCalls.push(url);
      return net.mediaStatus === 200 ? new Response(new Uint8Array([9, 9, 9]), { status: 200, headers: { "content-type": "audio/ogg" } }) : new Response("gone", { status: net.mediaStatus });
    }
    if (url === "https://api.elevenlabs.io/v1/speech-to-text") {
      net.sttCalls++;
      net.sttForm = (init?.body as FormData) ?? null;
      return new Response(JSON.stringify(net.stt.json), { status: net.stt.status });
    }
    net.other.push(url); // anything else (AI gateway, speech-to-text, Google...) must not be reached; make it fail harmlessly
    return new Response("unavailable", { status: 503 });
  });
}

const consoleErrors: string[] = [];
// Errors the code swallows in try/catch blocks would hide runtime bugs; these must never be logged in the happy paths.
const FORBIDDEN_LOGS = /step=finishAnswers|step=coach|\[coach\]|command failed|step=approve|step=visitor|approval receipt failed|champion agent failed|\[sms\] reply failed|\[sync\]|\[pipeline|TypeError|Cannot read/;

beforeEach(() => {
  fakeDb.reset();
  Object.assign(net, {
    attempts: [], other: [], tts: 0, smsFails: false, whatsappFails: false, ttsOk: false,
    mediaStatus: 200, mediaCalls: [], sttCalls: 0, sttForm: null, stt: { status: 200, json: { text: "How much does it cost?", language_code: "eng" } },
  });
  consoleErrors.length = 0;
  Object.assign(process.env, {
    PHONE_HASH_SALT: "test-salt", DEMO_CHAMPION_PIN: "4821", DEMO_SMS_NUMBER: NOOR, DEMO_WHATSAPP_NUMBER: "+14155238886",
    TWILIO_SMS_FROM: SMS_FROM, TWILIO_AUTH_TOKEN: "tok", LOVABLE_API_KEY: "lk", TWILIO_API_KEY: "tk",
    ELEVENLABS_API_KEY: "ek", DIGEST_TRIGGER_SECRET: "dig",
  });
  for (const k of ["SMS_VISITOR_MODE", "SMS_RECEIPTS", "MAX_OUTBOUND_PER_DAY", "GOOGLE_REVIEW_URL"]) delete process.env[k];
  installFetch();
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => { consoleErrors.push(a.map(String).join(" ")); });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  // No database error may ever be swallowed (wrong column, constraint violation, update without filter...).
  expect(fakeDb.errors).toEqual([]);
  expect(net.other).toEqual([]);
  expect(consoleErrors.filter((l) => FORBIDDEN_LOGS.test(l))).toEqual([]);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ---------------- seed helpers ---------------- */
const TOPICS = ["price", "meeting point", "duration", "what to bring", "children", "food", "safety", "whats included", "how to book", "cancellation"];
async function seedQuestions() {
  await fakeDb.put("questions", TOPICS.map((topic, i) => ({ position: i + 1, text_en: `Question ${i + 1}`, topic })));
}

type AnswerSeed = Partial<{
  topic: string; english: string | null; german: string | null; dutch: string | null; review_status: string; is_sample: boolean;
  flags: string[]; stage: string; transcript_src: string | null; approved_at: string | null;
}>;
/** Creates the recording + answer rows (and the question card if needed). Returns the answer id. */
async function addAnswer(o: AnswerSeed = {}): Promise<string> {
  const topic = o.topic ?? "price";
  if (!fakeDb.rows("questions").length) await seedQuestions();
  const q = fakeDb.rows("questions").find((x) => x["topic"] === topic)!;
  const [rec] = await fakeDb.put("recordings", { question_id: q["id"], week: "2026-W40", audio_path: "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1" });
  const status = o.review_status ?? "approved";
  const [ans] = await fakeDb.put("answers", {
    recording_id: rec!["id"],
    transcript_src: o.transcript_src === undefined ? "Tour bi 1500 dalasi la" : o.transcript_src,
    english: o.english === undefined ? "The tour costs 1500 dalasi per person." : o.english,
    german: o.german === undefined ? "Die Tour kostet 1500 Dalasi pro Person." : o.german,
    dutch: o.dutch === undefined ? "De tocht kost 1500 dalasi per persoon." : o.dutch,
    flags: o.flags ?? ["machine-translated", "wolof unverified (no native reviewer yet)"],
    review_status: status, approved_at: status === "approved" ? new Date().toISOString() : null,
    is_sample: o.is_sample ?? false, stage: o.stage ?? "checked",
  });
  return ans!["id"];
}

const HOUR = 3600_000;
async function addAlert(o: { kind?: string; place?: string | null; expiresInH?: number; cleared?: boolean; ageMin?: number } = {}) {
  await fakeDb.put("community_alerts", {
    kind: o.kind ?? "road", place: o.place === undefined ? "Tendaba road" : o.place,
    created_at: new Date(Date.now() - (o.ageMin ?? 30) * 60000).toISOString(),
    expires_at: new Date(Date.now() + (o.expiresInH ?? 20) * HOUR).toISOString(),
    cleared_at: o.cleared ? new Date().toISOString() : null, posted_by: "hash",
  });
}

/** A fresh (< 24 h) cached coaching run, as /api/public/coach-run would have stored it. */
async function seedCoachRun() {
  const [run] = await fakeDb.put("coach_runs", { places_count: 12, reviews_count: 40, price_count: 0, actions: [], api_calls: 20, api_errors: [] });
  await fakeDb.put("coach_themes", [
    { run_id: run!["id"], theme: "price_value", sentiment: "negative", count: 8 },
    { run_id: run!["id"], theme: "guide_quality", sentiment: "positive", count: 20 },
    { run_id: run!["id"], theme: "safety", sentiment: "positive", count: 5 },
  ]);
}

async function setConv(from: string, patch: Record<string, unknown>) {
  await fakeDb.put("conversations", { phone_hash: hashPhone(from), ...patch });
}
const conv = (from: string) => fakeDb.rows("conversations").find((c) => c["phone_hash"] === hashPhone(from));

/** Sends one WhatsApp message and returns every outbound message it caused (SMS side effects included). */
async function wa(from: string, body: string): Promise<Msg[]> {
  const before = net.attempts.length;
  await handleWhatsApp({ from, body, mediaUrl: null });
  return net.attempts.slice(before);
}
const replyTo = (msgs: Msg[], from: string) => msgs.filter((m) => m.to === from && isWa(m));
async function loginCommunity(from: string) {
  const out = await wa(from, "COMMUNITY 4821");
  expect(conv(from)).toMatchObject({ role: "champion", state: "community" });
  return out;
}
const hasEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s);

/* ================= 0. the fake database is as strict as the real one ================= */
describe("fake database self-check", () => {
  it("rejects unknown columns, unfiltered updates, wrong enums and ambiguous maybeSingle()", async () => {
    await addAnswer({ topic: "price" });
    await addAnswer({ topic: "food" });
    const c = fakeDb.client;
    expect((await c.from("answers").select("id, no_such_column")).error).not.toBeNull();
    expect((await c.from("answers").update({ stage: "checked" })).error).not.toBeNull();
    expect((await c.from("answers").update({ review_status: "bogus" }).eq("stage", "checked")).error).not.toBeNull();
    expect((await c.from("community_alerts").insert({ kind: "road" })).error).not.toBeNull(); // missing NOT NULL columns
    expect((await c.from("answers").select("id").maybeSingle()).error).not.toBeNull(); // two rows
    const only = await c.from("answers").select("id, english").eq("review_status", "approved").limit(1);
    expect(Object.keys(only.data![0])).toEqual(["id", "english"]); // only requested columns come back
    expect(fakeDb.errors).toHaveLength(5);
    fakeDb.errors.length = 0; // expected here
  });
});

/* ================= 1. Noor's SMS commands ================= */
describe("handleSms from Noor's number", () => {
  it("COACH sends exactly one Wolof SMS with the coaching summary", async () => {
    await seedCoachRun();
    await handleSms({ from: NOOR, body: "COACH" });
    expect(net.attempts).toHaveLength(1);
    const m = net.attempts[0]!;
    expect(m).toMatchObject({ to: NOOR, from: SMS_FROM, status: 201, mediaUrl: null });
    expect(m.body).toContain("Teranga coaching");
    expect(m.body).toContain("40 xalaat ci 12 barab");
    expect(m.body).toContain("Reply STOP to opt out.");
    expect(hasEmoji(m.body)).toBe(false);
    expect(m.body.length).toBeLessThanOrEqual(459);
  });

  it("COACH EN answers in English", async () => {
    await seedCoachRun();
    await handleSms({ from: NOOR, body: "coach en" });
    expect(net.attempts).toHaveLength(1);
    expect(net.attempts[0]!.body).toContain("Teranga coaching (AI summary");
    expect(net.attempts[0]!.body).toContain("40 reviews from 12 places");
  });

  it("COACH without a cached run sends one plain SMS saying it is not ready", async () => {
    await handleSms({ from: NOOR, body: "COACH" });
    expect(net.attempts).toHaveLength(1);
    expect(net.attempts[0]).toMatchObject({ to: NOOR, from: SMS_FROM });
    expect(hasEmoji(net.attempts[0]!.body)).toBe(false);
  });

  it("the 'coaching not ready' SMS keeps the opt-out line", async () => {
    await handleSms({ from: NOOR, body: "COACH" });
    expect(net.attempts[0]!.body).toContain("Reply STOP to opt out.");
  });

  it("LISTING returns the progress text, counting only approved answers", async () => {
    await addAnswer({ topic: "price" });
    await addAnswer({ topic: "duration", english: "About four hours.", german: "Etwa vier Stunden.", dutch: "Ongeveer vier uur." });
    await addAnswer({ topic: "food", review_status: "pending", english: "Lunch is included." }); // pending: must not count
    await handleSms({ from: NOOR, body: "LISTING" });
    expect(net.attempts).toHaveLength(1);
    const body = net.attempts[0]!.body;
    expect(body).toContain("Google");
    expect(body).toContain("Tontu yi nangu nañu: 2 ci 10");
    expect(body).toContain("Reply STOP to opt out.");
  });

  it("WEEK returns the weekly insight in Wolof: this week's visitor counts, top topic, first action", async () => {
    const answerId = await addAnswer({ topic: "price" });
    const vqs = await fakeDb.put("visitor_questions", [
      { text: "How much?", lang: "en", matched_answer_id: answerId, confidence: 0.9 },
      { text: "Price please", lang: "en", matched_answer_id: answerId, confidence: 0.9 },
      { text: "Do you have a quad bike?", lang: "en", matched_answer_id: null, confidence: 0 },
      { text: "old question", lang: "en", matched_answer_id: null, confidence: 0, created_at: new Date(Date.now() - 20 * 24 * HOUR).toISOString() },
    ]);
    await fakeDb.put("unanswered", { visitor_question_id: vqs[2]!["id"] });
    await seedCoachRun(); // price complaints in the reviews + visitors asking about price = the strongest action
    await handleSms({ from: NOOR, body: "WEEK" });
    expect(net.attempts).toHaveLength(1);
    const body = net.attempts[0]!.body;
    expect(net.attempts[0]).toMatchObject({ to: NOOR, from: SMS_FROM });
    expect(body).toMatch(/^Teranga: li nu j[aà]ng ayubes bi\./);
    expect(body).toContain("3 laaj"); // the 20 day old question is not counted
    expect(body).toContain("(2)"); // top topic asked twice
    expect(body).toContain("njekk");
    expect(body).toMatch(/J[eë]f: .*2 yoon.*8 xalaat/); // asked twice, 8 reviews complain
    expect(body).toContain("Reply STOP to opt out.");
    expect(hasEmoji(body)).toBe(false);
  });

  it("WEEK with nothing this week says so, and WEEK EN is English", async () => {
    await handleSms({ from: NOOR, body: "WEEK" });
    await handleSms({ from: NOOR, body: "WEEK EN" });
    expect(net.attempts).toHaveLength(2);
    expect(net.attempts[0]!.body).toContain("Amul laaj ayubes bi.");
    expect(net.attempts[1]!.body).toContain("Teranga: what we learned this week.");
    expect(net.attempts[1]!.body).toContain("No visitor questions this week.");
  });

  it("WEEK counts every unanswered question and offers the 'record answers' action", async () => {
    const vqs = await fakeDb.put("visitor_questions", Array.from({ length: 5 }, (_, i) => ({ text: `Odd question ${i}`, lang: "en", confidence: 0 })));
    await fakeDb.put("unanswered", vqs.map((v) => ({ visitor_question_id: v["id"] })));
    await handleSms({ from: NOOR, body: "WEEK EN" });
    expect(net.attempts[0]!.body).toContain("5 questions had no answer");
  });

  it("WEEK EN with two cached runs and a visitor who found an answer unclear", async () => {
    const answerId = await addAnswer({ topic: "price" });
    await fakeDb.put("visitor_questions", [{ text: "How much?", lang: "en", matched_answer_id: answerId, confidence: 0.9, was_clear: false }]);
    await handleSms({ from: NOOR, body: "WEEK EN" });
    expect(net.attempts[0]!.body).toContain("1 visitors said an answer was not clear");
  });

  it("HELP and unknown text get fixed replies", async () => {
    await handleSms({ from: NOOR, body: "HELP" });
    await handleSms({ from: NOOR, body: "banana" });
    await handleSms({ from: NOOR, body: "COACH FR" }); // unknown second word
    expect(net.attempts).toHaveLength(3);
    expect(net.attempts[0]!.body).toContain("COACH = coaching");
    expect(net.attempts[1]!.body).toContain("xamuma");
    expect(net.attempts[2]!.body).toContain("xamuma");
    for (const m of net.attempts) expect(m).toMatchObject({ to: NOOR, from: SMS_FROM });
  });

  it("falls back to ONE WhatsApp copy when the SMS is blocked (US registration pending)", async () => {
    await seedCoachRun();
    net.smsFails = true;
    await handleSms({ from: NOOR, body: "COACH" });
    expect(net.attempts).toHaveLength(2);
    const [first, second] = net.attempts as [Msg, Msg];
    expect(first).toMatchObject({ to: NOOR, from: SMS_FROM, status: 400 });
    expect(second).toMatchObject({ to: `whatsapp:${NOOR}`, from: WA_FROM, status: 201 });
    expect(second.body.startsWith("SMS copy")).toBe(true);
    expect(second.body).toContain("Teranga coaching");
    expect(second.body).toContain(first.body); // same text as the SMS
  });

  it("sends nothing at all (no WhatsApp bypass) when the daily outbound cap is reached", async () => {
    await seedCoachRun();
    fakeDb.capReached = true;
    await handleSms({ from: NOOR, body: "COACH" });
    expect(net.attempts).toHaveLength(0);
  });

  it("does not answer when both SMS and WhatsApp fail (no loop, no throw)", async () => {
    await seedCoachRun();
    net.smsFails = true;
    net.whatsappFails = true;
    await handleSms({ from: NOOR, body: "HELP" });
    expect(net.attempts).toHaveLength(2); // one SMS, one WhatsApp, then stop
  });
});

/* ================= 2. carrier keywords, strangers, SMS visitor mode ================= */
describe("handleSms: STOP/START and strangers", () => {
  it("ignores STOP and START from anyone, even Noor and even with visitor mode on", async () => {
    process.env["SMS_VISITOR_MODE"] = "on";
    for (const from of [NOOR, STRANGER_SMS]) for (const body of ["STOP", "stop", " START ", "UNSTOP", "Cancel"]) await handleSms({ from, body });
    expect(net.attempts).toHaveLength(0);
    expect(fakeDb.rows("conversations")).toHaveLength(0);
  });

  it("ignores a stranger's number unless SMS_VISITOR_MODE=on: no reply, no cost, no conversations row", async () => {
    await addAnswer({ topic: "price" });
    await handleSms({ from: STRANGER_SMS, body: "How much does it cost?" });
    process.env["SMS_VISITOR_MODE"] = "off";
    await handleSms({ from: STRANGER_SMS, body: "How much does it cost?" });
    await handleSms({ from: STRANGER_SMS, body: "ALERT 2 Tendaba" });
    expect(net.attempts).toHaveLength(0);
    expect(fakeDb.rows("visitor_questions")).toHaveLength(0);
    expect(fakeDb.rows("conversations")).toHaveLength(0);
    expect(fakeDb.rpcCalls).toHaveLength(0);
  });

  it("with visitor mode on, a question gets a text-only SMS built from the approved answer (no audio, no emoji)", async () => {
    process.env["SMS_VISITOR_MODE"] = "on";
    await addAnswer({ topic: "price" });
    await addAlert(); // the community notice also appears, without the warning emoji
    await handleSms({ from: STRANGER_SMS, body: "How much does it cost?" });
    expect(net.attempts).toHaveLength(1);
    const m = net.attempts[0]!;
    expect(m).toMatchObject({ to: STRANGER_SMS, from: SMS_FROM, mediaUrl: null });
    expect(m.body).toContain("The tour costs 1500 dalasi per person.");
    expect(m.body).toContain("Machine-translated");
    expect(m.body).toContain("Community notice");
    expect(m.body).toContain("Tendaba road");
    expect(hasEmoji(m.body)).toBe(false);
    expect(/[^\x20-\x7E\n]/.test(m.body)).toBe(false); // plain GSM text, nothing exotic
    expect(m.body.length).toBeLessThanOrEqual(459);
    expect(net.tts).toBe(0); // never any voice for SMS
    expect(fakeDb.rows("answer_audio")).toHaveLength(0);
    // Logged like a WhatsApp question.
    expect(fakeDb.rows("visitor_questions")).toHaveLength(1);
    expect(fakeDb.rows("visitor_questions")[0]).toMatchObject({ lang: "en", matched_answer_id: expect.any(String) });
  });

  it("with visitor mode on, Noor's own commands still work as commands", async () => {
    process.env["SMS_VISITOR_MODE"] = "on";
    await handleSms({ from: NOOR, body: "HELP" });
    expect(net.attempts[0]!.body).toContain("COACH = coaching");
    expect(fakeDb.rows("conversations")).toHaveLength(0);
  });

  it("a question below the confidence threshold is handed to Noor over SMS and logged as unanswered", async () => {
    process.env["SMS_VISITOR_MODE"] = "on";
    await addAnswer({ topic: "price" });
    await handleSms({ from: STRANGER_SMS, body: "zzzz qqqq" });
    expect(net.attempts).toHaveLength(1);
    expect(net.attempts[0]!.body).toContain("Not sure, Noor will answer.");
    expect(fakeDb.rows("unanswered")).toHaveLength(1);
  });
});

/* ================= 2b. community champion over SMS ================= */
describe("handleSms: community session by SMS", () => {
  const CS = "+15550008888";
  const login = () => handleSms({ from: CS, body: "COMMUNITY 4821" });
  const last = () => net.attempts[net.attempts.length - 1]!;

  it("COMMUNITY <PIN> logs in even with visitor mode off and answers by SMS (no emoji)", async () => {
    await login();
    expect(conv(CS)).toMatchObject({ role: "champion", state: "community" });
    expect(net.attempts).toHaveLength(1);
    expect(net.attempts[0]).toMatchObject({ to: CS, from: SMS_FROM });
    expect(net.attempts[0]!.body).toContain("Mbootaay: ALERT");
  });

  it("a wrong PIN creates no conversations row and gets no reply (no cost for guessing)", async () => {
    await handleSms({ from: CS, body: "COMMUNITY 0000" });
    await handleSms({ from: CS, body: "REVIEW 0000" });
    expect(net.attempts).toHaveLength(0);
    expect(fakeDb.rows("conversations")).toHaveLength(0);
    expect(fakeDb.rpcCalls).toHaveLength(0);
    await handleSms({ from: CS, body: "ALERT 2 Tendaba" }); // still a stranger (mode off): ignored
    expect(net.attempts).toHaveLength(0);
    expect(fakeDb.rows("community_alerts")).toHaveLength(0);
  });

  it("ALERT 2 Tendaba road by SMS stores the notice, texts Noor, and confirms by SMS", async () => {
    await login();
    net.attempts.length = 0;
    await handleSms({ from: CS, body: "ALERT 2 Tendaba road" });
    expect(fakeDb.rows("community_alerts")).toMatchObject([{ kind: "road", place: "Tendaba road", cleared_at: null, posted_by: hashPhone(CS) }]);
    expect(net.attempts).toHaveLength(2);
    expect(net.attempts[0]).toMatchObject({ to: NOOR, from: SMS_FROM });
    expect(net.attempts[0]!.body).toContain("Teranga ndigal bu mbootaay");
    expect(net.attempts[1]).toMatchObject({ to: CS, from: SMS_FROM });
    expect(net.attempts[1]!.body).toContain("Notice posted");
    expect(hasEmoji(net.attempts[1]!.body)).toBe(false);
    expect(net.attempts[1]!.body.length).toBeLessThanOrEqual(459);
  });

  it("ALERTS, PULSE, MENU and ALERT 6 work by SMS", async () => {
    await login();
    await handleSms({ from: CS, body: "ALERT 1" });
    net.attempts.length = 0;
    await handleSms({ from: CS, body: "ALERTS" });
    expect(last().body).toContain("Active notices");
    await handleSms({ from: CS, body: "PULSE" });
    expect(last().body).toContain("Community overview");
    await handleSms({ from: CS, body: "MENU" });
    expect(last().to).toBe(CS);
    for (const m of net.attempts) expect(m.body.length).toBeLessThanOrEqual(459);
    net.attempts.length = 0;
    await handleSms({ from: CS, body: "ALERT 6" });
    expect(fakeDb.rows("community_alerts")[0]!["cleared_at"]).toEqual(expect.any(String));
    expect(net.attempts.find((m) => m.to === CS)!.body).toContain("Notices cleared");
  });

  it("BILINGUAL and free text get the 'Not an SMS command' hint; nothing is stored and no AI is called", async () => {
    await login();
    net.attempts.length = 0;
    for (const body of ["BILINGUAL", "hello", "what is the price"]) await handleSms({ from: CS, body });
    expect(net.attempts).toHaveLength(3);
    for (const m of net.attempts) {
      expect(m.body).toContain("Not an SMS command");
      expect(m.body).toContain("Send BILINGUAL on WhatsApp");
    }
    expect(fakeDb.rows("community_alerts")).toHaveLength(0);
    expect(conv(CS)).toMatchObject({ role: "champion", state: "community" });
  });

  it("REVIEW <PIN> from a community session switches to the household champion session", async () => {
    await login();
    net.attempts.length = 0;
    await handleSms({ from: CS, body: "REVIEW 4821" });
    expect(net.attempts[0]!.body).toContain("Household champion: REVIEW = check answers");
    expect(conv(CS)).toMatchObject({ role: "champion", state: "idle" });
  });

  // A digit by SMS in community state is not a translation answer (that needs the BILINGUAL card on WhatsApp), but the
  // SMS router lets [123] through and champion() then falls to the AI assistant (an AI call and a WhatsApp-style reply).
  it("KNOWN BUG: '1' by SMS in community state is answered with the SMS hint, without calling the AI assistant", async () => {
    await login();
    net.attempts.length = 0;
    try {
      await handleSms({ from: CS, body: "1" });
      expect(net.other).toEqual([]);
      expect(net.attempts[0]!.body).toContain("Not an SMS command");
    } finally { net.other.length = 0; }
  });

  it("EXIT by SMS ends the session; afterwards the number is a stranger again", async () => {
    await login();
    net.attempts.length = 0;
    await handleSms({ from: CS, body: "EXIT" });
    expect(last().body).toContain("Visitor mode");
    expect(conv(CS)).toMatchObject({ role: "visitor", state: "idle" });
    await handleSms({ from: CS, body: "ALERT 2 x" });
    expect(net.attempts).toHaveLength(1);
    expect(fakeDb.rows("community_alerts")).toHaveLength(0);
  });

  it("if the SMS reply is blocked, a community session gets ONE WhatsApp copy", async () => {
    await login();
    net.attempts.length = 0;
    net.smsFails = true;
    await handleSms({ from: CS, body: "ALERTS" });
    // SMS attempt (400) then one WhatsApp copy; the champion's session continues on WhatsApp.
    expect(net.attempts).toHaveLength(2);
    expect(net.attempts[1]).toMatchObject({ to: `whatsapp:${CS}`, from: WA_FROM, status: 201 });
    expect(net.attempts[1]!.body.startsWith("SMS copy")).toBe(true);
    expect(consoleErrors.some((l) => l.includes("[sms] reply failed"))).toBe(true);
    consoleErrors.length = 0; // expected here
  });

  it("a plain visitor in mode on cannot post alerts: ALERT is just a question", async () => {
    process.env["SMS_VISITOR_MODE"] = "on";
    await handleSms({ from: STRANGER_SMS, body: "ALERT 2 Tendaba" });
    expect(fakeDb.rows("community_alerts")).toHaveLength(0);
    expect(net.attempts.filter((m) => m.to !== STRANGER_SMS)).toHaveLength(0);
  });
});

/* ================= 2b2. household champion by SMS ================= */
describe("handleSms: household champion session (REVIEW <PIN> by SMS)", () => {
  const HS = "+15550009999";
  const login = () => handleSms({ from: HS, body: "REVIEW 4821" });
  const toHelper = () => net.attempts.filter((m) => m.to === HS);
  const pending = (o: AnswerSeed = {}) => addAnswer({ review_status: "pending", stage: "checked", ...o });

  it("a wrong PIN creates no conversations row and gets no reply; the right PIN creates one and answers briefly", async () => {
    await handleSms({ from: HS, body: "REVIEW 0000" });
    expect(net.attempts).toHaveLength(0);
    expect(fakeDb.rows("conversations")).toHaveLength(0);
    await login(); // visitor mode is OFF: a stranger with the right PIN still gets in
    expect(conv(HS)).toMatchObject({ role: "champion", state: "idle" });
    expect(net.attempts).toHaveLength(1);
    expect(net.attempts[0]).toMatchObject({ to: HS, from: SMS_FROM });
    expect(net.attempts[0]!.body).toContain("Household champion: REVIEW = check answers");
    expect(net.attempts[0]!.body.length).toBeLessThanOrEqual(459);
    expect(hasEmoji(net.attempts[0]!.body)).toBe(false);
  });

  it("REVIEW sends the compact review card: Wolof topic, transcript, numbers, 1/2/3, within 459 characters", async () => {
    await pending({ topic: "price", transcript_src: "Tour bi yuñi ak juróom teemeer dalasi la" });
    await pending({ topic: "food", transcript_src: "Ñam bi mu ngi ci" });
    await login();
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "REVIEW" });
    expect(net.attempts).toHaveLength(1);
    const m = net.attempts[0]!;
    expect(m).toMatchObject({ to: HS, from: SMS_FROM });
    expect(m.body.startsWith("1/2 Njekk")).toBe(true);
    expect(m.body).toContain("Tour bi yuñi ak juroom teemeer dalasi la");
    expect(m.body).toContain("Limu:");
    expect(m.body).toContain("1 Nangu, 2 Waxaat ko, 3");
    expect(m.body.length).toBeLessThanOrEqual(459);
    expect(hasEmoji(m.body)).toBe(false);
    expect(conv(HS)).toMatchObject({ state: "reviewing", current_review_answer_id: expect.any(String) });
  });

  it("a very long transcript is shortened, never the choices", async () => {
    await pending({ topic: "price", transcript_src: "Tour bi dafa neex ".repeat(200) });
    await login();
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "REVIEW" });
    const body = net.attempts[0]!.body;
    expect(body.length).toBeLessThanOrEqual(459);
    expect(body).toContain("...");
    expect(body).toContain("1 Nangu, 2 Waxaat ko, 3");
    expect(body).toContain("Wolof bu masin tekki");
  });

  it("REVIEW with nothing pending says so", async () => {
    await login();
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "REVIEW" });
    expect(net.attempts).toHaveLength(1);
    expect(net.attempts[0]!.body).toContain("Amul tontu bu ñu wara seet");
  });

  it("1 approves: receipt SMS to Noor, then the confirmation and the NEXT card as two SMS", async () => {
    const first = await pending({ topic: "price", transcript_src: "Njekk bi 1500" });
    const second = await pending({ topic: "food", transcript_src: "Ñam bi ngi ci" });
    await login();
    await handleSms({ from: HS, body: "REVIEW" });
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "1" });
    expect(fakeDb.rows("answers").find((a) => a["id"] === first)).toMatchObject({ review_status: "approved" });
    expect(net.attempts).toHaveLength(3);
    expect(net.attempts[0]).toMatchObject({ to: NOOR, from: SMS_FROM });
    expect(net.attempts[0]!.body).toContain('sa tontu ci "Njekk"');
    expect(net.attempts[1]).toMatchObject({ to: HS, from: SMS_FROM });
    expect(net.attempts[1]!.body).toContain("nangu"); // Wolof "approved"
    expect(net.attempts[2]).toMatchObject({ to: HS, from: SMS_FROM });
    expect(net.attempts[2]!.body.startsWith("1/1 ")).toBe(true);
    expect(net.attempts[2]!.body).toContain("1 Nangu, 2 Waxaat ko, 3");
    for (const m of net.attempts) { expect(m.body.length).toBeLessThanOrEqual(459); expect(hasEmoji(m.body)).toBe(false); }
    expect(conv(HS)).toMatchObject({ state: "reviewing", current_review_answer_id: second });
  });

  it("approving the last answer ends the queue; SMS_RECEIPTS=off suppresses the receipt", async () => {
    process.env["SMS_RECEIPTS"] = "off";
    await pending({ topic: "price" });
    await login();
    await handleSms({ from: HS, body: "REVIEW" });
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "1" });
    expect(net.attempts.filter((m) => m.to === NOOR)).toHaveLength(0);
    expect(toHelper()).toHaveLength(2);
    expect(toHelper()[1]!.body).toContain("Amul tontu");
    expect(conv(HS)).toMatchObject({ state: "idle", current_review_answer_id: null });
  });

  it("2 marks it for re-recording and 3 sends it to the bilingual reviewer (no receipt)", async () => {
    const a = await pending({ topic: "price" });
    const b = await pending({ topic: "food" });
    const c = await pending({ topic: "safety" });
    await login();
    await handleSms({ from: HS, body: "REVIEW" });
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "2" });
    expect(fakeDb.rows("answers").find((x) => x["id"] === a)).toMatchObject({ review_status: "rerecord", approved_at: null });
    expect(toHelper()).toHaveLength(2); // confirmation + next card
    expect(toHelper()[1]!.body.startsWith("1/2 ")).toBe(true);
    await handleSms({ from: HS, body: "3" });
    expect(fakeDb.rows("answers").find((x) => x["id"] === b)).toMatchObject({ review_status: "needs_bilingual" });
    expect(toHelper()).toHaveLength(4);
    expect(toHelper()[3]!.body.startsWith("1/1 ")).toBe(true);
    expect(net.attempts.filter((m) => m.to === NOOR)).toHaveLength(0);
    expect(conv(HS)).toMatchObject({ current_review_answer_id: c });
  });

  it("an answer that is still being processed is not approved by SMS", async () => {
    const id = await pending({ topic: "price", stage: "failed", english: null, german: null, dutch: null });
    await login();
    await handleSms({ from: HS, body: "REVIEW" });
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "1" });
    expect(fakeDb.rows("answers").find((x) => x["id"] === id)).toMatchObject({ review_status: "pending" });
    expect(net.attempts).toHaveLength(1);
    expect(net.attempts[0]!.body).toContain("liggéey");
    net.other.length = 0; // the approval gate tries the AI pipeline once
  });

  // "START" is a carrier opt-in keyword: handleSms() drops it before the router, so the router's reply
  // "To record your answers, call the Teranga number." can never be sent by a real SMS (it is only reachable from route()).
  it("START is swallowed as a carrier keyword (no reply); BILINGUAL and free text get the 'Not an SMS command' hint", async () => {
    await login();
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "START" });
    expect(net.attempts).toHaveLength(0);
    await handleSms({ from: HS, body: "BILINGUAL" });
    await handleSms({ from: HS, body: "tell me a joke" });
    expect(net.attempts).toHaveLength(2);
    expect(net.attempts[0]!.body).toContain("Not an SMS command");
    expect(net.attempts[1]!.body).toContain("Not an SMS command");
    expect(conv(HS)).toMatchObject({ state: "idle" }); // no recording round was started
  });

  it("LISTING, COACH and SYNC work by SMS", async () => {
    await seedCoachRun();
    await addAnswer({ topic: "price" });
    await login();
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "LISTING" });
    expect(toHelper().length).toBeGreaterThanOrEqual(1);
    expect(toHelper()[0]!.body).toContain("Sa listing ci Google");
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "COACH" });
    expect(net.attempts.filter((m) => m.to === NOOR)).toHaveLength(1); // the usual SMS copy to Noor
    expect(toHelper()).toHaveLength(1);
    expect(toHelper()[0]!.body).toContain("Teranga coaching");
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "SYNC" });
    expect(net.attempts.filter((m) => m.to === NOOR)).toHaveLength(1);
    expect(toHelper()[0]!.body).toContain("Li nu j");
    for (const m of net.attempts) expect(m.body.length).toBeLessThanOrEqual(459);
  });

  it("ALERT by SMS in household mode explains that the community tools come first", async () => {
    await login();
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "ALERT 2 Tendaba" });
    expect(net.attempts[0]!.body).toContain("Open the community tools first");
    expect(fakeDb.rows("community_alerts")).toHaveLength(0);
  });

  it("the session survives WhatsApp: REVIEW card by SMS, the answer by WhatsApp 1", async () => {
    await pending({ topic: "price" });
    await login();
    await handleSms({ from: HS, body: "REVIEW" });
    const out = await wa(`whatsapp:${HS}`, "1");
    expect(fakeDb.rows("answers")[0]).toMatchObject({ review_status: "approved" });
    expect(replyTo(out, `whatsapp:${HS}`)[0]!.body).toContain("Approved");
  });

  it("EXIT ends the session", async () => {
    await login();
    net.attempts.length = 0;
    await handleSms({ from: HS, body: "EXIT" });
    expect(conv(HS)).toMatchObject({ role: "visitor" });
    expect(net.attempts[0]!.body).toContain("Visitor mode");
  });

  it("when SMS is blocked, the reply falls back to ONE WhatsApp copy with the 'SMS copy' prefix", async () => {
    await login();
    net.attempts.length = 0;
    net.smsFails = true;
    await handleSms({ from: HS, body: "REVIEW" });
    expect(net.attempts).toHaveLength(2);
    expect(net.attempts[0]).toMatchObject({ to: HS, from: SMS_FROM, status: 400 });
    expect(net.attempts[1]).toMatchObject({ to: `whatsapp:${HS}`, from: WA_FROM, status: 201 });
    expect(net.attempts[1]!.body.startsWith("SMS copy")).toBe(true);
    consoleErrors.length = 0; // "[sms] reply failed" is expected here
  });

  // The fallback is "once": after a blocked first SMS only that part goes to WhatsApp and the loop stops. After "1" the
  // helper's session already points at the NEXT answer (state reviewing), but its review card never reaches her, so a
  // blind "1" would approve an answer she has not seen.
  it("KNOWN BUG: when SMS is blocked after '1', the next review card still reaches the household champion", async () => {
    await pending({ topic: "price" });
    await pending({ topic: "food" });
    await login();
    await handleSms({ from: HS, body: "REVIEW" });
    net.attempts.length = 0;
    net.smsFails = true;
    try {
      await handleSms({ from: HS, body: "1" });
      const copies = net.attempts.filter((m) => m.to === `whatsapp:${HS}` && m.status === 201);
      expect(copies.map((m) => m.body).join("\n")).toContain("1 Nangu, 2 Waxaat ko, 3");
    } finally { consoleErrors.length = 0; }
  });
});

/* ================= 2b3. Noor reviews her own answers (no PIN) ================= */
describe("Noor reviews without a PIN", () => {
  const pending = (o: AnswerSeed = {}) => addAnswer({ review_status: "pending", stage: "checked", ...o });
  const NOOR_WA = `whatsapp:${NOOR}`;

  it("SMS REVIEW from Noor creates her row, logs her in and sends the compact review card", async () => {
    await pending({ topic: "price", transcript_src: "Njekk bi yuñi dalasi la" });
    await handleSms({ from: NOOR, body: "REVIEW" });
    expect(net.attempts).toHaveLength(1);
    expect(net.attempts[0]).toMatchObject({ to: NOOR, from: SMS_FROM });
    const b = net.attempts[0]!.body;
    expect(b.startsWith("1/1 Njekk")).toBe(true);
    expect(b).toContain("Limu:");
    expect(b).toContain("1 Nangu, 2 Waxaat ko, 3");
    expect(b.length).toBeLessThanOrEqual(459);
    expect(conv(NOOR)).toMatchObject({ role: "champion", state: "reviewing", current_review_answer_id: expect.any(String) });
  });

  it("1 approves: receipt SMS to Noor, confirmation, then the NEXT card", async () => {
    const first = await pending({ topic: "price" });
    await pending({ topic: "food" });
    await handleSms({ from: NOOR, body: "review" });
    net.attempts.length = 0;
    await handleSms({ from: NOOR, body: "1" });
    expect(fakeDb.rows("answers").find((a) => a["id"] === first)).toMatchObject({ review_status: "approved" });
    expect(net.attempts).toHaveLength(3);
    for (const m of net.attempts) expect(m).toMatchObject({ to: NOOR, from: SMS_FROM });
    expect(net.attempts[0]!.body).toContain('sa tontu ci "Njekk"');
    expect(net.attempts[1]!.body).toContain("nangu");
    expect(net.attempts[2]!.body.startsWith("1/1 ")).toBe(true);
  });

  it("2 and 3 from Noor work too", async () => {
    const a = await pending({ topic: "price" });
    const b = await pending({ topic: "food" });
    await handleSms({ from: NOOR, body: "REVIEW" });
    await handleSms({ from: NOOR, body: "2" });
    await handleSms({ from: NOOR, body: "3" });
    expect(fakeDb.rows("answers").find((x) => x["id"] === a)).toMatchObject({ review_status: "rerecord" });
    expect(fakeDb.rows("answers").find((x) => x["id"] === b)).toMatchObject({ review_status: "needs_bilingual" });
  });

  it("her other commands still work after she is a champion (HELP, COACH as Noor commands)", async () => {
    await handleSms({ from: NOOR, body: "REVIEW" });
    net.attempts.length = 0;
    await handleSms({ from: NOOR, body: "HELP" });
    expect(net.attempts[0]!.body).toContain("COACH = coaching");
  });

  it("a stranger's bare REVIEW (or a lone digit) gets nothing and creates no row, even with visitor mode off", async () => {
    await pending({ topic: "price" });
    for (const body of ["REVIEW", "1", "2"]) await handleSms({ from: STRANGER_SMS, body });
    expect(net.attempts).toHaveLength(0);
    expect(fakeDb.rows("conversations")).toHaveLength(0);
    expect(fakeDb.rows("answers")[0]).toMatchObject({ review_status: "pending" });
  });

  it("a stranger's bare REVIEW on WhatsApp is just a visitor question (no champion login)", async () => {
    await pending({ topic: "price" });
    const out = await wa(VISITOR, "REVIEW");
    expect(conv(VISITOR)).toMatchObject({ role: "visitor" });
    expect(out[0]!.body).not.toContain("Tontu 1");
  });

  it("bare REVIEW on WhatsApp from Noor's number logs her in and shows the review card", async () => {
    await pending({ topic: "price", transcript_src: "Njekk bi 1500" });
    const out = await wa(NOOR_WA, "REVIEW");
    expect(conv(NOOR_WA)).toMatchObject({ role: "champion", state: "reviewing" });
    const reply = replyTo(out, NOOR_WA);
    expect(reply).toHaveLength(1);
    expect(reply[0]!.body).toContain("Njekk bi 1500");
    expect(reply[0]!.body).toContain("Tontu 1 ci 1");
  });

  it("a digit from Noor outside a review never calls the AI assistant (visitor row: answered as a question)", async () => {
    await handleSms({ from: NOOR, body: "1" });
    expect(net.attempts).toHaveLength(1);
    expect(net.attempts[0]).toMatchObject({ to: NOOR, from: SMS_FROM });
    expect(net.attempts[0]!.body).toContain("Not sure");
    expect(net.other).toEqual([]);
  });

  it("a digit from Noor as a champion with nothing under review gets the SMS hint, no AI call", async () => {
    await handleSms({ from: NOOR, body: "REVIEW" }); // nothing pending: state idle
    net.attempts.length = 0;
    await handleSms({ from: NOOR, body: "2" });
    expect(net.attempts).toHaveLength(1);
    expect(net.attempts[0]!.body).toContain("Not an SMS command");
    expect(net.other).toEqual([]);
  });

  // On WhatsApp a champion's "2" with no review in progress falls through champion() to championAgent(): an AI call for a lone digit.
  it("KNOWN BUG (minor): a lone digit from a WhatsApp champion with no review in progress does not call the AI assistant", async () => {
    await wa(NOOR_WA, "REVIEW");
    try {
      await wa(NOOR_WA, "2");
      expect(net.other).toEqual([]);
    } finally { net.other.length = 0; consoleErrors.length = 0; }
  });
});

/* ================= 3b. visitor voice notes (WhatsApp) ================= */
describe("handleWhatsApp: visitor voice question", () => {
  const voice = async (from = VISITOR, body = "") => {
    const before = net.attempts.length;
    await handleWhatsApp({ from, body, mediaUrl: VOICE_URL });
    return net.attempts.slice(before);
  };

  it("English voice question -> transcribed (language auto-detected), matched, answered with the heard text first", async () => {
    await addAnswer({ topic: "price" });
    const out = await voice();
    expect(out).toHaveLength(1);
    const body = out[0]!.body;
    expect(body.startsWith("🎙️ “How much does it cost?”")).toBe(true);
    expect(body).toContain("The tour costs 1500 dalasi per person.");
    expect(body).toContain("Was this clear? Reply YES or NO");
    // The media came through the connector gateway, and STT ran once with language auto-detect and the right model.
    expect(net.mediaCalls).toEqual([`${GATEWAY_BASE}/Messages/MM1/Media/ME1`]);
    expect(net.sttCalls).toBe(1);
    expect(net.sttForm!.get("model_id")).toBe("scribe_v2");
    expect(net.sttForm!.get("language_code")).toBeNull();
    expect(fakeDb.rows("visitor_questions")[0]).toMatchObject({ text: "How much does it cost?", lang: "en", matched_answer_id: expect.any(String) });
    expect(conv(VISITOR)).toMatchObject({ lang: "en" });
  });

  it("German spoken language (language_code deu) switches the conversation to German and answers in German", async () => {
    await addAnswer({ topic: "price" });
    net.stt.json = { text: "Wie viel kostet die Tour?", language_code: "deu" };
    const out = await voice();
    const body = out[0]!.body;
    expect(body).toContain("🎙️ “Wie viel kostet die Tour?”");
    expect(body).toContain("Die Tour kostet 1500 Dalasi pro Person.");
    expect(body).toContain("Maschinell übersetzt");
    expect(body).toContain("War das verständlich?");
    expect(conv(VISITOR)).toMatchObject({ lang: "de" }); // saved for the next question
    expect(fakeDb.rows("visitor_questions")[0]).toMatchObject({ lang: "de" });
    // The next TEXT question stays German.
    expect((await wa(VISITOR, "Wie viel kostet die Tour?"))[0]!.body).toContain("Die Tour kostet");
  });

  it("Dutch (nld) works too, and an unknown language keeps the current one", async () => {
    await addAnswer({ topic: "price" });
    net.stt.json = { text: "Hoeveel kost de tocht?", language_code: "nld" };
    expect((await voice())[0]!.body).toContain("De tocht kost 1500 dalasi per persoon.");
    expect(conv(VISITOR)).toMatchObject({ lang: "nl" });
    net.stt.json = { text: "How much does it cost?", language_code: "fra" };
    const out = await voice();
    expect(conv(VISITOR)).toMatchObject({ lang: "nl" }); // unchanged
    expect(out[0]!.body).toContain("De tocht kost");
  });

  it("a spoken question with no matching answer gets the 'not sure' text, still with the heard line, and is logged as unanswered", async () => {
    await addAnswer({ topic: "price" });
    net.stt.json = { text: "zzzz qqqq", language_code: "eng" };
    const out = await voice();
    expect(out[0]!.body).toContain("🎙️ “zzzz qqqq”");
    expect(out[0]!.body).toContain("Not sure, Noor will answer.");
    expect(fakeDb.rows("unanswered")).toHaveLength(1);
  });

  it("an active community notice is shown under a voice answer as well", async () => {
    await addAnswer({ topic: "price" });
    await addAlert();
    expect((await voice())[0]!.body).toContain("Community notice");
  });

  it("a failed transcription (STT error) replies 'Sorry, I could not hear that voice note.' and logs nothing", async () => {
    await addAnswer({ topic: "price" });
    net.stt = { status: 500, json: { detail: "boom" } };
    const out = await voice();
    expect(out).toHaveLength(1);
    expect(out[0]!.body).toContain("Sorry, I could not hear that voice note.");
    expect(fakeDb.rows("visitor_questions")).toHaveLength(0);
    expect(fakeDb.rows("unanswered")).toHaveLength(0);
    consoleErrors.length = 0; // "ElevenLabs STT failed" is expected here
  });

  it("an empty transcript and an expired media link get the same reply", async () => {
    net.stt.json = { text: "   ", language_code: "eng" };
    expect((await voice())[0]!.body).toContain("Sorry, I could not hear that voice note.");
    net.stt.json = { text: "How much?", language_code: "eng" };
    net.mediaStatus = 404;
    expect((await voice())[0]!.body).toContain("Sorry, I could not hear that voice note.");
    expect(net.sttCalls).toBe(1); // the second one never reached speech-to-text
    expect(fakeDb.rows("visitor_questions")).toHaveLength(0);
    consoleErrors.length = 0; // "Media download failed" is expected here
  });

  it("a typed question that comes with media is answered from the text (no transcription)", async () => {
    await addAnswer({ topic: "price" });
    const out = await voice(VISITOR, "How much does it cost?");
    expect(net.sttCalls).toBe(0);
    expect(net.mediaCalls).toHaveLength(0);
    expect(out[0]!.body.startsWith("The tour costs")).toBe(true);
  });

  it("an unexpected media URL does not crash: same 'could not hear' reply", async () => {
    await handleWhatsApp({ from: VISITOR, body: "", mediaUrl: "https://evil.example/x.ogg" });
    expect(net.attempts[0]!.body).toContain("Sorry, I could not hear that voice note.");
    expect(net.mediaCalls).toHaveLength(0);
    consoleErrors.length = 0; // "[transcribe] error" is expected here
  });

  it("an empty message without media still asks for a question", async () => {
    expect((await wa(VISITOR, ""))[0]!.body).toBe("Please type your question.");
  });
});

/* ================= 3c. NOTIFY follow-ups ================= */
describe("follow-up to tourists (NOTIFY)", () => {
  const PHONE = "+15550003333";
  const followups = () => fakeDb.rows("visitor_followups");
  const unsure = async (from = VISITOR, q = "zzzz qqqq") => (await wa(from, q))[0]!.body;
  /** A visitor who got "not sure" for a question that later gets an approved answer. */
  async function waitingVisitor(o: { channel?: "whatsapp" | "sms"; lang?: string; text?: string; phone?: string; ageDays?: number } = {}) {
    const [vq] = await fakeDb.put("visitor_questions", { text: o.text ?? "How much does it cost?", lang: o.lang ?? "en", matched_answer_id: null, confidence: 0 });
    const created = o.ageDays ? { created_at: new Date(Date.now() - o.ageDays * 24 * HOUR).toISOString() } : {};
    await fakeDb.put("visitor_followups", { visitor_question_id: vq!["id"], phone: o.phone ?? PHONE, channel: o.channel ?? "whatsapp", lang: o.lang ?? "en", ...created });
    return vq!["id"] as string;
  }

  it("'Not sure' now carries the NOTIFY hint (English, German, Dutch)", async () => {
    expect(await unsure()).toContain("Reply NOTIFY and we will message you here when Noor has answered.");
    await wa(VISITOR, "DE");
    expect(await unsure()).toContain("Antworten Sie NOTIFY");
    await wa(VISITOR, "NL");
    expect(await unsure()).toContain("Antwoord NOTIFY");
  });

  it("NOTIFY right after an unanswered question stores one follow-up (number without prefix, channel, lang, question id)", async () => {
    await unsure();
    const qid = fakeDb.rows("visitor_questions")[0]!["id"];
    const out = await wa(VISITOR, "notify");
    expect(out[0]!.body).toContain("Noted. We will message you here when Noor has answered.");
    expect(out[0]!.body).toContain("delete");
    expect(followups()).toHaveLength(1);
    expect(followups()[0]).toMatchObject({ visitor_question_id: qid, phone: PHONE, channel: "whatsapp", lang: "en" });
  });

  it("German visitor gets German texts and lang 'de' is stored", async () => {
    await wa(VISITOR, "DE");
    await unsure();
    const out = await wa(VISITOR, "NOTIFY");
    expect(out[0]!.body).toContain("Notiert.");
    expect(followups()[0]).toMatchObject({ lang: "de", phone: PHONE });
    fakeDb.reset();
    expect((await wa(VISITOR, "DE"), (await wa(VISITOR, "NOTIFY"))[0]!.body)).toContain("Stellen Sie zuerst eine Frage");
  });

  it("NOTIFY with no prior question, or after an ANSWERED question, stores nothing", async () => {
    expect((await wa(VISITOR, "NOTIFY"))[0]!.body).toBe("Ask a question first. If Noor has no answer yet, reply NOTIFY.");
    await addAnswer({ topic: "price" });
    await wa(VISITOR, "How much does it cost?");
    expect((await wa(VISITOR, "NOTIFY"))[0]!.body).toContain("Ask a question first");
    expect(followups()).toHaveLength(0);
  });

  it("NOTIFY over SMS (visitor mode) stores channel 'sms'", async () => {
    process.env["SMS_VISITOR_MODE"] = "on";
    await handleSms({ from: STRANGER_SMS, body: "zzzz qqqq" });
    expect(net.attempts[0]!.body).toContain("Reply NOTIFY");
    await handleSms({ from: STRANGER_SMS, body: "NOTIFY" });
    expect(followups()).toMatchObject([{ phone: STRANGER_SMS, channel: "sms", lang: "en" }]);
  });

  describe("sendFollowups", () => {
    it("sends the answer on WhatsApp with the question quoted and the label, then deletes the row", async () => {
      await waitingVisitor();
      await addAnswer({ topic: "price" });
      const r = await sendFollowups();
      expect(r).toEqual({ sent: 1, waiting: 0 });
      expect(net.attempts).toHaveLength(1);
      expect(net.attempts[0]).toMatchObject({ to: `whatsapp:${PHONE}`, from: WA_FROM, status: 201 });
      const b = net.attempts[0]!.body;
      expect(b).toContain("Noor has now answered your question: “How much does it cost?”");
      expect(b).toContain("The tour costs 1500 dalasi per person.");
      expect(b).toContain("Machine-translated");
      expect(followups()).toHaveLength(0);
    });

    it("sends by SMS (plain GSM text, from TWILIO_SMS_FROM) for the sms channel, in the stored language", async () => {
      await waitingVisitor({ channel: "sms", lang: "de", text: "Wie viel kostet die Tour?", phone: STRANGER_SMS });
      await addAnswer({ topic: "price", flags: ["bilingual verified"] });
      expect(await sendFollowups()).toEqual({ sent: 1, waiting: 0 });
      const m = net.attempts[0]!;
      expect(m).toMatchObject({ to: STRANGER_SMS, from: SMS_FROM });
      expect(m.body).toContain("Noor hat Ihre Frage jetzt beantwortet");
      expect(m.body).toContain("Die Tour kostet 1500 Dalasi pro Person.");
      expect(m.body).toContain("Maschinell");
      expect(hasEmoji(m.body)).toBe(false);
      expect(/[^\x20-\x7EäöüÄÖÜß\n]/.test(m.body)).toBe(false); // GSM-7 letters only
      expect(m.body.length).toBeLessThanOrEqual(459);
    });

    it("keeps a row whose question still has no answer", async () => {
      await waitingVisitor({ text: "zzzz qqqq" });
      await addAnswer({ topic: "price" });
      expect(await sendFollowups()).toEqual({ sent: 0, waiting: 1 });
      expect(net.attempts).toHaveLength(0);
      expect(followups()).toHaveLength(1);
    });

    it("keeps the row when the send throws (retry next sync), and still sends the others", async () => {
      await waitingVisitor({ channel: "sms", phone: STRANGER_SMS });
      await waitingVisitor({ channel: "whatsapp" });
      await addAnswer({ topic: "price" });
      net.smsFails = true;
      expect(await sendFollowups()).toEqual({ sent: 1, waiting: 1 });
      expect(followups()).toMatchObject([{ channel: "sms" }]);
      expect(consoleErrors.some((l) => l.includes("[followup] send failed"))).toBe(true);
      consoleErrors.length = 0; // expected here
      net.smsFails = false;
      expect(await sendFollowups()).toEqual({ sent: 1, waiting: 0 });
    });

    it("stops and keeps the rest when the daily cap is reached", async () => {
      await waitingVisitor();
      await waitingVisitor();
      await addAnswer({ topic: "price" });
      fakeDb.capReached = true;
      expect(await sendFollowups()).toEqual({ sent: 0, waiting: 2 });
      expect(net.attempts).toHaveLength(0);
      expect(followups()).toHaveLength(2);
    });

    it("an empty table is a no-op", async () => {
      expect(await sendFollowups()).toEqual({ sent: 0, waiting: 0 });
    });

    it("champion FOLLOWUPS sends them and reports the count in Wolof and English", async () => {
      await waitingVisitor();
      await waitingVisitor({ text: "zzzz qqqq" });
      await addAnswer({ topic: "price" });
      const HC = "whatsapp:+15550006666";
      await wa(HC, "REVIEW 4821");
      net.attempts.length = 0;
      const out = await wa(HC, "FOLLOWUPS");
      const reply = replyTo(out, HC)[0]!.body;
      expect(reply).toContain("Yónnee nañu 1 tontu ci gan yi. 1 di xaar.");
      expect(reply).toContain("Follow-ups sent to tourists: 1. Still waiting: 1.");
      expect(out.filter((m) => m.to === `whatsapp:${PHONE}`)).toHaveLength(1);
      expect(followups()).toHaveLength(1);
    });
  });

  it("purgeFeedback deletes follow-ups older than 14 days only", async () => {
    await waitingVisitor({ ageDays: 15 });
    await waitingVisitor({ ageDays: 13 });
    await waitingVisitor();
    await purgeFeedback();
    expect(followups()).toHaveLength(2);
    expect(followups().every((f) => Date.now() - Date.parse(f["created_at"]) < 14 * 24 * HOUR)).toBe(true);
  });

  it("runWeeklySync sends waiting follow-ups and reports followups {sent, waiting}", async () => {
    process.env["GOOGLE_MAPS_API_KEY"] = "gk";
    try {
      await waitingVisitor();
      await waitingVisitor({ text: "zzzz qqqq" });
      await addAnswer({ topic: "price" });
      const r = await runWeeklySync();
      expect(r.followups).toEqual({ sent: 1, waiting: 1 });
      expect(net.attempts.filter((m) => m.to === `whatsapp:${PHONE}`)).toHaveLength(1);
    } finally {
      delete process.env["GOOGLE_MAPS_API_KEY"];
      net.other.length = 0;
      consoleErrors.length = 0; // Google errors expected
    }
  });
});

/* ================= 3d. listing pack: WhatsApp link field ================= */
describe("listing pack WhatsApp field", () => {
  it("has 11 fields; the wa.me link comes from DEMO_WHATSAPP_NUMBER and needs a check; answers approved stays 'of 10'", async () => {
    await addAnswer({ topic: "price" });
    const HC = "whatsapp:+15550006666";
    await wa(HC, "REVIEW 4821");
    net.attempts.length = 0;
    const out = await wa(HC, "LISTING");
    const body = out[0]!.body;
    expect(body).toContain("Listing: 0 ci 11 paré");
    expect(body).toContain("Answers approved: 1 of 10");
    expect(body).toContain("WhatsApp chat");
  });

  it("the SMS progress text counts 11 fields", async () => {
    await handleSms({ from: NOOR, body: "LISTING EN" });
    expect(net.attempts[0]!.body).toContain("0 of 11 ready");
    expect(net.attempts[0]!.body).toContain("Answers approved: 0 of 10");
  });

  it("without DEMO_WHATSAPP_NUMBER digits the field needs input", async () => {
    const mod = await import("@/lib/listing");
    expect(mod.whatsappLink("+14155238886")).toBe("https://wa.me/14155238886");
    expect(mod.whatsappLink("abc")).toBeNull();
    const pack = mod.buildListingPack({}, { whatsapp: "+14155238886" });
    expect(pack.fields).toHaveLength(11);
    expect(pack.fields.find((f) => f.key === "whatsapp")).toMatchObject({ state: "check", value: "https://wa.me/14155238886" });
    expect(mod.buildListingPack({}, {}).fields.find((f) => f.key === "whatsapp")).toMatchObject({ state: "needs_input", value: null });
  });
});

/* ================= 2c. public simulator: reads, sends nothing, writes nothing ================= */
describe("simulateSms", () => {
  const snapshot = () => JSON.stringify(fakeDb.tables);
  async function sim(as: "noor" | "visitor", text: string, lang: "en" | "de" | "nl" | "wo" = "wo") {
    const before = snapshot();
    const r = await simulateSms(as, text, lang);
    // The simulator must not write, send, count against the daily cap, or touch the network at all.
    expect(snapshot()).toBe(before);
    expect(net.attempts).toHaveLength(0);
    expect(net.tts).toBe(0);
    expect(fakeDb.rpcCalls).toHaveLength(0);
    return r;
  }

  it("Noor's commands: COACH / LISTING / WEEK / HELP / unknown", async () => {
    await seedCoachRun();
    await addAnswer({ topic: "price" });
    expect((await sim("noor", "COACH")).reply).toContain("Teranga coaching (AI, ");
    expect((await sim("noor", "COACH", "en")).reply).toContain("Teranga coaching (AI summary");
    const listing = await sim("noor", "listing");
    expect(listing.reply).toContain("Google");
    expect(listing.parts).toBeGreaterThanOrEqual(1);
    expect((await sim("noor", "WEEK", "en")).reply).toContain("Teranga: what we learned this week.");
    expect((await sim("noor", "WEEK")).reply).toContain("Teranga: li nu");
    expect((await sim("noor", "HELP")).reply).toContain("COACH = coaching");
    expect((await sim("noor", "banana")).reply).toContain("xamuma");
  });

  // simulateSms() applies the chosen language only to recognised commands: unknown text is always answered in Wolof.
  it("the simulator answers unknown text in English when English is selected", async () => {
    expect((await sim("noor", "banana", "en")).reply).toContain("I did not understand");
  });

  it("STOP/START get the explanation, not a reply", async () => {
    expect((await sim("noor", "STOP")).reply).toContain("no reply is sent");
    expect((await sim("visitor", "start")).reply).toContain("no reply is sent");
  });

  it("visitor: answer + label + notice, text only, in the chosen language", async () => {
    await addAnswer({ topic: "price", flags: ["bilingual verified"] });
    await addAlert();
    const en = await sim("visitor", "How much does it cost?", "en");
    expect(en.reply).toContain("The tour costs 1500 dalasi per person.");
    expect(en.reply).toContain("English checked by a bilingual reviewer");
    expect(en.reply).toContain("Community notice");
    expect(hasEmoji(en.reply)).toBe(false);
    expect(en.parts).toBeGreaterThanOrEqual(1);
    const de = await sim("visitor", "Wie viel kostet die Tour?", "de");
    expect(de.reply).toContain("Die Tour kostet 1500 Dalasi pro Person.");
    expect(de.reply).toContain("Hinweis der Community");
    // Wolof is not a visitor language: the simulator answers in English.
    expect((await sim("visitor", "How much does it cost?", "wo")).reply).toContain("The tour costs");
  });

  it("visitor: STATUS, unmatched and empty questions", async () => {
    await addAnswer({ topic: "price" });
    expect((await sim("visitor", "STATUS", "en")).reply).toBe("No community notices right now.");
    await addAlert({ kind: "flood", place: null });
    expect((await sim("visitor", "status", "en")).reply).toContain("Flooding in the area");
    const unsure = await sim("visitor", "zzzz qqqq", "en");
    expect(unsure.reply).toContain("Not sure, Noor will answer.");
    expect(unsure.reply).toContain("Community notice");
    expect((await sim("visitor", "   ", "en")).reply).toBe("Please type your question.");
  });

  it("long input is cut to 160 characters before it is used", async () => {
    await addAnswer({ topic: "price" });
    const r = await sim("visitor", `How much does it cost? ${"x".repeat(400)}`, "en");
    expect(r.reply).toContain("The tour costs");
  });
});

/* ================= 2d. weekly sync (SYNC command, runWeeklySync) ================= */
describe("weekly sync", () => {
  const HC = "whatsapp:+15550006666";
  async function seedTwoRuns() {
    // Last week: price complaints were rare (2 of 40); now 8 of 40.
    const [old] = await fakeDb.put("coach_runs", { fetched_at: new Date(Date.now() - 8 * 24 * HOUR).toISOString(), places_count: 12, reviews_count: 40 });
    await fakeDb.put("coach_themes", [{ run_id: old!["id"], theme: "price_value", sentiment: "negative", count: 2 }, { run_id: old!["id"], theme: "guide_quality", sentiment: "positive", count: 20 }]);
    await seedCoachRun();
  }
  async function seedVisitors() {
    const priceAnswer = await addAnswer({ topic: "price" });
    const vqs = await fakeDb.put("visitor_questions", [
      { text: "How much?", lang: "en", matched_answer_id: priceAnswer, confidence: 0.9 },
      { text: "Price?", lang: "en", matched_answer_id: priceAnswer, confidence: 0.9, was_clear: false },
      { text: "quad bike?", lang: "en", confidence: 0 },
    ]);
    await fakeDb.put("unanswered", { visitor_question_id: vqs[2]!["id"] });
  }

  it("champion SYNC sends the weekly report on WhatsApp and a copy by SMS to Noor", async () => {
    await seedTwoRuns();
    await seedVisitors();
    await wa(HC, "REVIEW 4821");
    net.attempts.length = 0;
    const out = await wa(HC, "SYNC");
    const copy = out.find((m) => !isWa(m))!;
    expect(copy).toMatchObject({ to: NOOR, from: SMS_FROM });
    expect(copy.body).toMatch(/^Teranga: li nu j[aà]ng ayubes bi\./);
    expect(copy.body).toContain("3 laaj");
    const reply = replyTo(out, HC);
    expect(reply).toHaveLength(1);
    const body = reply[0]!.body;
    expect(body).toContain("Li nu jàng ayubés bi");
    expect(body).toContain("*3*");
    expect(body).toContain("Xalaat yi soppiku nañu"); // 5% -> 20% price complaints
    expect(body).toContain("5% → 20%");
    expect(body).toContain("Jëf yi");
    expect(body).toContain("1 questions had no answer");
    expect(body).toContain("SMS bi dem na ci Noor");
  });

  it("SYNC says when the SMS copy was not delivered", async () => {
    await wa(HC, "REVIEW 4821");
    net.attempts.length = 0;
    net.smsFails = true;
    const out = await wa(HC, "SYNC");
    expect(out.filter((m) => !isWa(m))).toHaveLength(1);
    expect(replyTo(out, HC)[0]!.body).toContain("SMS bi demul");
  });

  it("SYNC works with no data at all (no reviews, no visitors)", async () => {
    await wa(HC, "REVIEW 4821");
    net.attempts.length = 0;
    const out = await wa(HC, "SYNC");
    expect(replyTo(out, HC)[0]!.body).toContain("Amul laaj ayubés bi");
    expect(replyTo(out, HC)[0]!.body).toContain("Not enough reviews to see changes");
  });

  it("SYNC is not available to a plain visitor (it is just a question)", async () => {
    const out = await wa(VISITOR, "SYNC");
    expect(out.filter((m) => !isWa(m))).toHaveLength(0);
    expect(out[0]!.body).toContain("Not sure, Noor will answer.");
  });

  it("SYNC also works from community mode", async () => {
    await wa(HC, "COMMUNITY 4821");
    net.attempts.length = 0;
    const out = await wa(HC, "SYNC");
    expect(replyTo(out, HC)[0]!.body).toContain("Li nu jàng ayubés bi");
  });

  it("a full SYNC report (reviews, shifts, 3 topics, 3 actions) still ends with the SMS status line", async () => {
    await seedTwoRuns();
    await seedVisitors();
    await fakeDb.put("visitor_questions", [{ text: "Is it safe?", lang: "en", confidence: 0, was_clear: false }]);
    await wa(HC, "REVIEW 4821");
    const out = await wa(HC, "SYNC");
    const text = replyTo(out, HC).map((m) => m.body).join("\n");
    expect(text).toContain("SMS bi dem na ci Noor");
    expect(replyTo(out, HC).every((m) => m.body.length <= 1550)).toBe(true);
  });

  describe("runWeeklySync (cron)", () => {
    beforeEach(() => { process.env["GOOGLE_MAPS_API_KEY"] = "gk"; });
    afterEach(() => { delete process.env["GOOGLE_MAPS_API_KEY"]; net.other.length = 0; });

    it("with Google unreachable it still sends the SMS and the WhatsApp report from the cached run + this week's visitors", async () => {
      await seedTwoRuns();
      await seedVisitors();
      const r = await runWeeklySync();
      expect(net.other.length).toBeGreaterThan(0);
      expect(net.other.every((u) => u.startsWith("https://connector-gateway.lovable.dev/google_maps"))).toBe(true);
      expect(r).toMatchObject({ sms: "sent", whatsapp: true, visitors: 3, followups: { sent: 0, waiting: 0 } });
      expect(net.attempts).toHaveLength(2);
      expect(net.attempts[0]).toMatchObject({ to: NOOR, from: SMS_FROM });
      expect(net.attempts[1]).toMatchObject({ to: `whatsapp:${NOOR}`, from: WA_FROM });
      expect(net.attempts[1]!.body).toContain("Li nu jàng ayubés bi");
      expect(fakeDb.rows("coach_runs")).toHaveLength(2); // a failed run is not saved
      expect(net.attempts[1]!.body).toContain("8 xalaat ñaxtu"); // the cached run still feeds the report (price complaints)
      consoleErrors.length = 0; // "[coach] places error 503" is expected here
    });

    it("an SMS failure does not stop the WhatsApp report", async () => {
      net.smsFails = true;
      const r = await runWeeklySync();
      expect(r).toMatchObject({ sms: "failed", whatsapp: true });
      consoleErrors.length = 0; // Google errors and the blocked SMS are expected here
    });

    it("when the review refresh throws, the sync still uses the latest cached run", async () => {
      delete process.env["GOOGLE_MAPS_API_KEY"];
      await seedTwoRuns();
      await seedVisitors();
      const r = await runWeeklySync();
      expect(r).toMatchObject({ sms: "sent", whatsapp: true });
      expect(consoleErrors.some((l) => l.includes("[sync] review refresh failed"))).toBe(true);
      consoleErrors.length = 0; // expected here
      // The cached run should still feed the report (8 price complaints) even though the refresh failed.
      expect(net.attempts[1]!.body).toContain("8 xalaat ñaxtu");
    });
  });
});

/* ================= 2e. the pushed weekly digest (cron, unchanged) ================= */
describe("sendWeeklyDigest", () => {
  it("sends the Wolof counts digest by SMS to Noor", async () => {
    const answerId = await addAnswer({ topic: "price" });
    const vqs = await fakeDb.put("visitor_questions", [
      { text: "How much?", lang: "en", matched_answer_id: answerId, confidence: 0.9 },
      { text: "Price please", lang: "en", matched_answer_id: answerId, confidence: 0.9 },
      { text: "quad bike?", lang: "en", confidence: 0 },
    ]);
    await fakeDb.put("unanswered", { visitor_question_id: vqs[2]!["id"] });
    const r = await sendWeeklyDigest();
    expect(r).toMatchObject({ sent: true, channel: "sms", questions: 3, unanswered: 1 });
    expect(net.attempts).toHaveLength(1);
    expect(net.attempts[0]).toMatchObject({ to: NOOR, from: SMS_FROM });
    expect(net.attempts[0]!.body).toContain("Teranga xibaar ayubes bi");
    expect(net.attempts[0]!.body).toContain("Njekk: 2");
    expect(net.attempts[0]!.body).toContain("Laaj yu amul tontu: 1");
  });

  it("falls back to ONE WhatsApp message with the full digest when SMS is blocked", async () => {
    net.smsFails = true;
    const r = await sendWeeklyDigest();
    expect(r).toMatchObject({ sent: true, channel: "whatsapp" });
    expect(net.attempts).toHaveLength(2);
    expect(net.attempts[1]).toMatchObject({ to: `whatsapp:${NOOR}`, from: WA_FROM });
  });

  it("the pushed digest counts all unanswered questions, not just the first 3", async () => {
    const vqs = await fakeDb.put("visitor_questions", Array.from({ length: 5 }, (_, i) => ({ text: `Odd question ${i}`, lang: "en", confidence: 0 })));
    await fakeDb.put("unanswered", vqs.map((v) => ({ visitor_question_id: v["id"] })));
    await sendWeeklyDigest();
    expect(net.attempts[0]!.body).toContain("Laaj yu amul tontu: 5");
  });
});

/* ================= 3. visitor Q&A over WhatsApp ================= */
describe("handleWhatsApp: visitor Q&A and community notices", () => {
  const ask = (body = "How much does it cost?") => wa(VISITOR, body);

  it("answers from the approved answer and logs the question", async () => {
    await addAnswer({ topic: "price" });
    const out = await ask();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ to: VISITOR, from: WA_FROM, mediaUrl: null });
    expect(out[0]!.body).toContain("The tour costs 1500 dalasi per person.");
    expect(out[0]!.body).toContain("Machine-translated");
    expect(out[0]!.body).toContain("Was this clear? Reply YES or NO");
    expect(out[0]!.body).toContain("Reviews help Noor:");
    expect(out[0]!.body).not.toContain("Community notice");
    const vq = fakeDb.rows("visitor_questions");
    expect(vq).toHaveLength(1);
    expect(conv(VISITOR)).toMatchObject({ role: "visitor", last_visitor_question_id: vq[0]!["id"] });
  });

  it("YES after an answer records was_clear and thanks the visitor", async () => {
    await addAnswer({ topic: "price" });
    await ask();
    const out = await wa(VISITOR, "YES");
    expect(out[0]!.body).toContain("Thank you!");
    expect(fakeDb.rows("visitor_questions")[0]).toMatchObject({ was_clear: true });
    expect(conv(VISITOR)).toMatchObject({ last_visitor_question_id: null });
  });

  it("an ACTIVE community alert is shown under the answer with the 'not an official warning' disclaimer", async () => {
    await addAnswer({ topic: "price" });
    await addAlert({ kind: "road", place: "Tendaba road" });
    const out = await ask();
    expect(out).toHaveLength(1);
    const body = out[0]!.body;
    expect(body).toContain("Community notice");
    expect(body).toContain("not an official warning");
    expect(body).toContain("Road closed or flooded: Tendaba road");
    expect(body).toContain("The tour costs 1500 dalasi per person."); // the answer is still there
  });

  it("a cleared alert and an expired alert are not shown", async () => {
    await addAnswer({ topic: "price" });
    await addAlert({ cleared: true });
    await addAlert({ expiresInH: -1, ageMin: 25 * 60 }); // ran out 1 h ago
    const out = await ask();
    expect(out[0]!.body).not.toContain("Community notice");
    expect(out[0]!.body).not.toContain("not an official warning");
  });

  it("STATUS shows the notice, or 'No community notices right now.'", async () => {
    expect((await wa(VISITOR, "STATUS"))[0]!.body).toBe("No community notices right now.");
    await addAlert({ kind: "flood", place: null });
    const body = (await wa(VISITOR, "status"))[0]!.body;
    expect(body).toContain("Community notice");
    expect(body).toContain("Flooding in the area");
    expect(body).toContain("not an official warning");
  });

  it("an unmatched question still carries the notice and goes to the unanswered list", async () => {
    await addAnswer({ topic: "price" });
    await addAlert();
    const out = await ask("zzzz qqqq");
    expect(out[0]!.body).toContain("Not sure, Noor will answer.");
    expect(out[0]!.body).toContain("Community notice");
    expect(fakeDb.rows("unanswered")).toHaveLength(1);
  });

  it("shows the bilingual-reviewed label only when the flag 'bilingual verified' is set", async () => {
    const id = await addAnswer({ topic: "price", flags: ["machine-translated", "bilingual verified"] });
    expect((await ask())[0]!.body).toContain("English checked by a bilingual reviewer");
    // Same answer without the flag: plain machine-translation label.
    await fakeDb.client.from("answers").update({ flags: ["machine-translated"] }).eq("id", id);
    const plain = (await ask())[0]!.body;
    expect(plain).toContain("Machine-translated");
    expect(plain).not.toContain("English checked by a bilingual reviewer");
  });

  it("in German the answer, the label and the notice are German (fixed templates)", async () => {
    await addAnswer({ topic: "price" });
    await addAlert({ kind: "storm", place: null });
    await setConv(VISITOR, { lang: "de" });
    const body = (await ask("Wie viel kostet die Tour?"))[0]!.body;
    expect(body).toContain("Die Tour kostet 1500 Dalasi pro Person.");
    expect(body).toContain("Maschinell übersetzt");
    expect(body).toContain("Hinweis der Community");
    expect(body).toContain("keine amtliche Warnung");
    expect(body).not.toContain("Community notice");
    expect(body).toContain("War das verständlich?");
  });

  it("language switch EN/DE/NL is stored", async () => {
    const out = await wa(VISITOR, "NL");
    expect(out[0]!.body).toBe("Taal: Nederlands");
    expect(conv(VISITOR)).toMatchObject({ lang: "nl" });
  });

  it("sends the pre-generated voice note as a second message (signed URL) and never for unapproved answers", async () => {
    const id = await addAnswer({ topic: "price" });
    await fakeDb.put("answer_audio", { answer_id: id, lang: "en", audio_path: `${id}/en.mp3` });
    fakeDb.putFile("answer-audio", `${id}/en.mp3`);
    const out = await ask();
    expect(out).toHaveLength(2);
    expect(out[0]!.body).toContain("voice note follows (AI-generated voice)");
    expect(out[1]).toMatchObject({ to: VISITOR, from: WA_FROM, body: "AI-generated voice — Machine-translated" });
    expect(out[1]!.mediaUrl).toContain(`https://fake.storage/answer-audio/${id}/en.mp3`);
    expect(net.tts).toBe(0);
  });

  it("generates the voice file on demand inside the request when it is missing", async () => {
    const id = await addAnswer({ topic: "price" });
    net.ttsOk = true;
    const out = await ask();
    expect(out).toHaveLength(2);
    expect(out[1]!.mediaUrl).toContain(`/answer-audio/${id}/en.mp3`);
    expect(fakeDb.rows("answer_audio")).toEqual([{ answer_id: id, lang: "en", audio_path: `${id}/en.mp3` }]);
  });

  it("falls back to text only when text-to-speech fails", async () => {
    await addAnswer({ topic: "price" });
    const out = await ask();
    expect(out).toHaveLength(1);
    expect(out[0]!.body).not.toContain("voice note follows");
    expect(net.tts).toBe(1);
  });
});

/* ================= 4. community champion ================= */
describe("handleWhatsApp: community champion (Mbootaay)", () => {
  const CH = "whatsapp:+15550004444";

  it("COMMUNITY 4821 opens the menu; a wrong PIN changes nothing", async () => {
    const wrong = await wa(CH, "COMMUNITY 0000");
    expect(wrong).toHaveLength(1);
    expect(wrong[0]!.body).toContain("PIN bi jubul");
    expect(wrong[0]!.body).toContain("Wrong PIN");
    expect(conv(CH)).toMatchObject({ role: "visitor", state: "idle" });

    const ok = await loginCommunity(CH);
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ to: CH, from: WA_FROM });
    expect(ok[0]!.body).toContain("Mbootaay");
    expect(ok[0]!.body).toContain("ALERT");
  });

  it("ALERT 2 Tendaba road stores a 24 h notice and sends one Wolof SMS to Noor", async () => {
    await loginCommunity(CH);
    const out = await wa(CH, "ALERT 2 Tendaba road");
    const alerts = fakeDb.rows("community_alerts");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "road", place: "Tendaba road", cleared_at: null });
    expect(typeof alerts[0]!["posted_by"]).toBe("string");
    expect(alerts[0]!["posted_by"]).toBe(hashPhone(CH)); // never the raw number
    const ttl = Date.parse(alerts[0]!["expires_at"]) - Date.now();
    expect(Math.abs(ttl - 24 * HOUR)).toBeLessThan(60_000);

    expect(sms().filter((m) => m.to === NOOR)).toHaveLength(1);
    const s = out.find((m) => !isWa(m))!;
    expect(s).toMatchObject({ to: NOOR, from: SMS_FROM });
    expect(s.body).toContain("Teranga ndigal bu mbootaay");
    expect(s.body).toContain("Tendaba road");
    expect(s.body).toContain("Reply STOP to opt out.");
    const reply = replyTo(out, CH);
    expect(reply).toHaveLength(1);
    expect(reply[0]!.body).toContain("Notice posted");
    expect(reply[0]!.body).toContain("SMS sent to Noor");
    expect(reply[0]!.body).toContain("not an official warning");
    expect(out).toHaveLength(2);
  });

  // If the insert fails (e.g. the table is not granted to service_role) the champion must not be told "Notice posted".
  it("ALERT does not claim 'Notice posted' when the notice could not be stored", async () => {
    await loginCommunity(CH);
    fakeDb.denied.add("community_alerts");
    try {
      const out = await wa(CH, "ALERT 2 Tendaba road");
      expect(replyTo(out, CH)[0]!.body).not.toContain("Notice posted");
    } finally {
      fakeDb.errors.length = 0; // the denied insert is expected here
    }
  });

  it("ALERT 6 with nothing running stores nothing and reports 0 cleared", async () => {
    await loginCommunity(CH);
    const out = await wa(CH, "ALERT 6");
    expect(fakeDb.rows("community_alerts")).toHaveLength(0);
    expect(replyTo(out, CH)[0]!.body).toContain("(0)");
  });

  it("reports an SMS that was not delivered, but still posts the notice", async () => {
    await loginCommunity(CH);
    net.smsFails = true;
    const out = await wa(CH, "ALERT 1");
    expect(fakeDb.rows("community_alerts")).toHaveLength(1);
    expect(replyTo(out, CH)[0]!.body).toContain("SMS not delivered");
  });

  it("ALERT alone shows the menu, a bad number is explained, nothing is stored", async () => {
    await loginCommunity(CH);
    expect((await wa(CH, "ALERT"))[0]!.body).toContain("Ndigal bu mbootaay");
    expect((await wa(CH, "ALERT 9"))[0]!.body).toContain("I did not understand");
    expect(fakeDb.rows("community_alerts")).toHaveLength(0);
    expect(net.attempts.filter((m) => !isWa(m))).toHaveLength(0);
  });

  it("ALERTS lists running notices and the visitor sees them; ALERT 6 clears them", async () => {
    await loginCommunity(CH);
    expect((await wa(CH, "ALERTS"))[0]!.body).toContain("No active notices");
    await wa(CH, "ALERT 2 Tendaba road");
    const list = (await wa(CH, "ALERTS"))[0]!.body;
    expect(list).toContain("Active notices");
    expect(list).toContain("Tendaba road");
    expect(list).toContain("Road closed or flooded");

    await addAnswer({ topic: "price" });
    expect((await wa(VISITOR, "How much does it cost?"))[0]!.body).toContain("Community notice");

    const out = await wa(CH, "ALERT 6");
    const rows = fakeDb.rows("community_alerts");
    expect(rows).toHaveLength(1);
    expect(rows[0]!["cleared_at"]).toEqual(expect.any(String));
    expect(replyTo(out, CH)[0]!.body).toContain("Notices cleared");
    expect(replyTo(out, CH)[0]!.body).toContain("(1)");
    expect(out.find((m) => !isWa(m))!.body).toContain("Teranga ndigal bu mbootaay");
    expect((await wa(CH, "ALERTS"))[0]!.body).toContain("No active notices");
    expect((await wa(VISITOR, "How much does it cost?"))[0]!.body).not.toContain("Community notice");
  });

  it("PULSE returns the community overview with live counts", async () => {
    await fakeDb.put("partner_operators", [
      { name: "Sunbird Trails (fictional sample)", tour_type: "birdwatching", fit: "nature" },
      { name: "Kora Village Visits (fictional sample)", tour_type: "village culture", fit: "culture" },
    ]);
    await addAnswer({ topic: "price" });
    await addAnswer({ topic: "duration", is_sample: true }); // samples are not counted as Noor's answers
    await addAnswer({ topic: "food", review_status: "needs_bilingual", stage: "checked" });
    await addAlert();
    await loginCommunity(CH);
    const body = (await wa(CH, "PULSE"))[0]!.body;
    expect(body).toContain("Community overview");
    expect(body).toContain("Members");
    expect(body).toContain("*3*"); // 1 real + 2 simulated
    expect(body).toMatch(/Active notices\)_?: \*1\*/);
    expect(body).toMatch(/Translations waiting\)_?: \*1\*/);
    expect(body).toMatch(/Answers approved \(Noor\)\)_?: \*1\* ci 10/);
  });

  it("BILINGUAL shows the translation check; 1 approves it, flags it and sends the approval receipt SMS", async () => {
    const id = await addAnswer({ topic: "price", review_status: "needs_bilingual", stage: "checked", is_sample: false });
    await loginCommunity(CH);
    const shown = await wa(CH, "BILINGUAL");
    expect(shown).toHaveLength(1);
    expect(shown[0]!.body).toContain("Translation check");
    expect(shown[0]!.body).toContain("Tour bi 1500 dalasi la");
    expect(shown[0]!.body).toContain("The tour costs 1500 dalasi per person.");
    expect(conv(CH)).toMatchObject({ state: "bilingual", current_review_answer_id: id });

    const out = await wa(CH, "1");
    const row = fakeDb.rows("answers").find((a) => a["id"] === id)!;
    expect(row["review_status"]).toBe("approved");
    expect(row["approved_at"]).toEqual(expect.any(String));
    expect(row["flags"]).toContain("bilingual verified");
    expect(row["flags"]).toContain("machine-translated"); // earlier flags are kept
    // Approval receipt to Noor (Wolof SMS), then the champion's confirmation.
    const receipt = out.find((m) => !isWa(m))!;
    expect(receipt).toMatchObject({ to: NOOR, from: SMS_FROM });
    expect(receipt.body).toContain('sa tontu ci "Njekk"');
    expect(receipt.body).toContain("Reply STOP to opt out.");
    const reply = replyTo(out, CH);
    expect(reply).toHaveLength(1);
    expect(reply[0]!.body).toContain("approved");
    expect(reply[0]!.body).toContain("No translations are waiting");
    expect(conv(CH)).toMatchObject({ state: "community", current_review_answer_id: null });

    // A visitor now sees it with the bilingual label.
    const visitorBody = (await wa(VISITOR, "How much does it cost?"))[0]!.body;
    expect(visitorBody).toContain("English checked by a bilingual reviewer");
  });

  it("SMS_RECEIPTS=off suppresses the approval receipt", async () => {
    process.env["SMS_RECEIPTS"] = "off";
    await addAnswer({ topic: "price", review_status: "needs_bilingual" });
    await loginCommunity(CH);
    await wa(CH, "BILINGUAL");
    const out = await wa(CH, "1");
    expect(out.filter((m) => !isWa(m))).toHaveLength(0);
  });

  it("a translation that is still processing cannot be approved", async () => {
    const id = await addAnswer({ topic: "price", review_status: "needs_bilingual", stage: "transcribed", english: null, german: null, dutch: null });
    await loginCommunity(CH);
    await wa(CH, "BILINGUAL");
    const out = await wa(CH, "1");
    expect(fakeDb.rows("answers").find((a) => a["id"] === id)).toMatchObject({ review_status: "needs_bilingual" });
    expect(replyTo(out, CH)[0]!.body).toContain("Still processing");
    // The gate tried to finish the pipeline once, which needs the AI gateway (made to fail here).
    expect(net.other.every((u) => u.startsWith("https://ai.gateway.lovable.dev/"))).toBe(true);
    net.other.length = 0;
  });

  it("options 2 and 3 on a translation: record again / leave it", async () => {
    const a = await addAnswer({ topic: "price", review_status: "needs_bilingual" });
    const b = await addAnswer({ topic: "food", review_status: "needs_bilingual" });
    await loginCommunity(CH);
    await wa(CH, "BILINGUAL");
    const two = await wa(CH, "2");
    expect(fakeDb.rows("answers").find((x) => x["id"] === a)).toMatchObject({ review_status: "rerecord" });
    expect(replyTo(two, CH)[0]!.body).toContain("Translation check"); // the next one is shown
    expect(conv(CH)).toMatchObject({ state: "bilingual", current_review_answer_id: b });
    const three = await wa(CH, "3");
    expect(fakeDb.rows("answers").find((x) => x["id"] === b)).toMatchObject({ review_status: "needs_bilingual" });
    expect(replyTo(three, CH)[0]!.body).toContain("Left for now");
    expect(conv(CH)).toMatchObject({ state: "community" });
  });

  it("BILINGUAL with nothing waiting says so; sample answers are never shown", async () => {
    await addAnswer({ topic: "price", review_status: "needs_bilingual", is_sample: true });
    await loginCommunity(CH);
    expect((await wa(CH, "BILINGUAL"))[0]!.body).toContain("No translations are waiting");
  });

  it("the household champion cannot use ALERT: 'Open the community tools first' and nothing is inserted", async () => {
    await wa(CH, "REVIEW 4821");
    expect(conv(CH)).toMatchObject({ role: "champion", state: "idle" });
    for (const cmd of ["ALERT 2", "ALERTS", "BILINGUAL", "PULSE"]) {
      const out = await wa(CH, cmd);
      expect(out).toHaveLength(1);
      expect(out[0]!.body).toContain("Open the community tools first");
    }
    expect(fakeDb.rows("community_alerts")).toHaveLength(0);
    expect(net.attempts.filter((m) => !isWa(m))).toHaveLength(0); // no SMS to Noor
  });

  it("EXIT leaves community mode and then ALERT is just a visitor question", async () => {
    await loginCommunity(CH);
    const out = await wa(CH, "EXIT");
    expect(out[0]!.body).toContain("Visitor mode");
    expect(conv(CH)).toMatchObject({ role: "visitor", state: "idle" });
    await wa(CH, "ALERT 2 Tendaba");
    expect(fakeDb.rows("community_alerts")).toHaveLength(0);
  });
});

/* ================= 5. household champion: LISTING and COACH ================= */
describe("handleWhatsApp: household champion", () => {
  const HC = "whatsapp:+15550006666";
  beforeEach(async () => { await wa(HC, "REVIEW 4821"); net.attempts.length = 0; });

  it("LISTING sends the draft, then the description as a second message", async () => {
    await addAnswer({ topic: "price" });
    await addAnswer({ topic: "whats included", english: "Included: boat trip, lunch and a guide.", german: "x", dutch: "x" });
    await addAnswer({ topic: "duration", review_status: "pending", english: "Unapproved text must not appear." });
    const out = await wa(HC, "LISTING");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ to: HC, from: WA_FROM });
    expect(out[0]!.body).toContain("Sa listing ci Google");
    expect(out[0]!.body).toContain("2 ci 10");
    expect(out[1]).toMatchObject({ to: HC, from: WA_FROM });
    expect(out[1]!.body).toContain("Included: boat trip, lunch and a guide.");
    expect(out[1]!.body).toContain("Price: The tour costs 1500 dalasi per person.");
    expect(out.map((m) => m.body).join("\n")).not.toContain("Unapproved text");
  });

  // twilioSend() cuts every body at 1550 characters: the draft must be short enough that its footer still arrives.
  it("the LISTING draft arrives complete (not cut at 1550 characters)", async () => {
    await addAnswer({ topic: "price" });
    const out = await wa(HC, "LISTING");
    expect(out[0]!.body).toContain("Wolof bu masin tekki, wóoragul");
  });

  it("LISTING with no approved answers sends only the draft (no empty second message)", async () => {
    const out = await wa(HC, "LISTING");
    expect(out).toHaveLength(1);
    expect(out[0]!.body).toContain("Sa listing ci Google");
  });

  it("COACH sends the coaching to WhatsApp and one SMS copy to Noor, and says the SMS was sent", async () => {
    await seedCoachRun();
    const out = await wa(HC, "COACH");
    const copies = out.filter((m) => !isWa(m));
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ to: NOOR, from: SMS_FROM });
    expect(copies[0]!.body).toContain("Teranga coaching");
    expect(copies[0]!.body).toContain("40 xalaat ci 12 barab");
    const reply = replyTo(out, HC).map((m) => m.body).join("\n");
    expect(replyTo(out, HC).length).toBeGreaterThanOrEqual(1);
    expect(reply).toContain("40");
    expect(reply).toContain("SMS bi dem na ci Noor");
    expect(reply).toContain("SMS copy sent to Noor's phone");
  });

  it("COACH EN is English, with the SMS copy in English", async () => {
    await seedCoachRun();
    const out = await wa(HC, "COACH EN");
    expect(out.find((m) => !isWa(m))!.body).toContain("Teranga coaching (AI summary");
    expect(replyTo(out, HC).map((m) => m.body).join("\n")).toContain("SMS copy sent to Noor's phone");
  });

  it("COACH tells the household champion when the SMS copy was not delivered", async () => {
    await seedCoachRun();
    net.smsFails = true;
    const out = await wa(HC, "COACH");
    expect(out.filter((m) => !isWa(m))).toHaveLength(1); // one attempt, no retry
    const reply = replyTo(out, HC).map((m) => m.body).join("\n");
    expect(reply).toContain("SMS bi demul");
    expect(reply).toContain("SMS copy not delivered");
    expect(reply).not.toContain("SMS copy sent");
  });

  it("COACH without a cached run sends the fixed 'not ready' text and no SMS", async () => {
    const out = await wa(HC, "COACH");
    expect(out.filter((m) => !isWa(m))).toHaveLength(0);
    expect(replyTo(out, HC)).toHaveLength(1);
  });

  it("COACH MORE without a recent run answers with the fixed text", async () => {
    const out = await wa(HC, "COACH MORE");
    expect(replyTo(out, HC)).toHaveLength(1);
    expect(out.filter((m) => !isWa(m))).toHaveLength(0);
  });

  it("LEDGER works with sample partners", async () => {
    await fakeDb.put("partner_operators", [{ name: "Sunbird Trails (fictional sample)", tour_type: "birdwatching", fit: "nature" }]);
    const out = await wa(HC, "LEDGER");
    expect(out).toHaveLength(1);
    expect(out[0]!.body).toContain("Sunbird Trails");
  });

  it("REVIEW shows the next pending answer and 1 approves it (receipt SMS to Noor)", async () => {
    await seedQuestions();
    const id = await addAnswer({ topic: "price", review_status: "pending", stage: "checked", flags: ["machine-translated", "wolof unverified (no native reviewer yet)"] });
    const shown = await wa(HC, "REVIEW");
    expect(replyTo(shown, HC)[0]!.body).toContain("Tour bi 1500 dalasi la");
    expect(conv(HC)).toMatchObject({ state: "reviewing", current_review_answer_id: id });
    const out = await wa(HC, "1");
    expect(fakeDb.rows("answers").find((a) => a["id"] === id)).toMatchObject({ review_status: "approved" });
    expect(out.find((m) => !isWa(m))!.body).toContain('sa tontu ci "Njekk"');
    expect(replyTo(out, HC)[0]!.body).toContain("Approved");
  });

  it("option 3 in REVIEW sends the answer to the bilingual queue, which the community champion then finds", async () => {
    const id = await addAnswer({ topic: "price", review_status: "pending", stage: "checked" });
    await wa(HC, "REVIEW");
    await wa(HC, "3");
    expect(fakeDb.rows("answers").find((a) => a["id"] === id)).toMatchObject({ review_status: "needs_bilingual" });
    const CH = "whatsapp:+15550004444";
    await loginCommunity(CH);
    expect((await wa(CH, "BILINGUAL"))[0]!.body).toContain("Translation check");
  });
});

/* ================= 6. migrations ================= */
describe("database grants", () => {
  // Every table is reached only by server code with the service role, so every created table needs a service_role grant.
  it("every created table is granted to service_role", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(__dirname, "../../supabase/migrations");
    const sql = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
    const tables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map((m) => m[1]!);
    expect(tables.length).toBeGreaterThan(10);
    const missing = tables.filter((t) => !new RegExp(`grant[^;]*on\\s+(?:table\\s+)?public\\.${t}\\b[^;]*service_role`, "i").test(sql));
    expect(missing).toEqual([]);
    expect(sql).toMatch(/grant all on public\.community_alerts to service_role/i);
  });
});
