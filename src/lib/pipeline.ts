// Resumable voice-answer pipeline (pure; all I/O is injected so it can be unit-tested).
// Stages: received -> transcribed -> translated -> checked (done) | failed (done).
// Every step writes its result + next stage to the database before the next step runs, so
// any later call (next webhook, REVIEW, /api/public/process-pending) continues where work stopped.
// Never rely on work after the HTTP response on Workers: callers await this with a time budget.

import { certainValues, digitsMention, mentionsNumber } from "./numbers";

export type Stage = "received" | "transcribed" | "translated" | "checked" | "failed";
export type Lang = "en" | "de" | "nl";

export type PipelineRow = {
  id: string;
  stage: Stage;
  attempts: number;
  audio_url: string | null;
  position: number | null;
  transcript_src: string | null;
  english: string | null;
  flags: string[];
  notify_hash: string | null;
  notified_at: string | null;
};

export type Patch = Partial<{
  stage: Stage; attempts: number; transcript_src: string; transcript_confidence: number | null;
  english: string | null; german: string | null; dutch: string | null; roundtrip_score: number | null; flags: string[];
}>;

export type Download =
  | { ok: true; status: number; bytes: number; type: string; blob: Blob }
  | { ok: false; status: number; expired: boolean };

export interface PipelineDeps {
  now(): number;
  log(msg: string): void;
  load(id: string): Promise<PipelineRow | null>;
  listUnfinished(includeNotify: boolean, limit: number): Promise<string[]>;
  countUnfinished(): Promise<number>;
  claimLease(id: string, ms: number): Promise<boolean>;
  releaseLease(id: string): Promise<void>;
  /** Conditional update: applies only while the row is still at `from`. True if this call won. */
  advance(id: string, from: Stage, patch: Patch): Promise<boolean>;
  /** Atomically sets notified_at if still null. True only for the single winner. */
  claimNotify(id: string): Promise<boolean>;
  download(url: string, signal: AbortSignal): Promise<Download>;
  stt(blob: Blob, type: string, signal: AbortSignal): Promise<{ status: number; text: string; confidence: number | null } | null>;
  translate(text: string, to: Lang | "wo", signal: AbortSignal, numberHint?: number[]): Promise<string | null>;
  roundtrip(source: string, english: string, signal: AbortSignal): Promise<{ score: number; differences: string[] } | null>;
  hash(phone: string): string;
  notify(phone: string, text: string): Promise<boolean>;
  notifyText(row: PipelineRow, transcript: string): string;
}

export const WOLOF_FLAG = "wolof unverified (no native reviewer yet)";
export const MEDIA_EXPIRED = "media expired, please re-send";
const ROUNDTRIP_MIN = 0.7;
const MAX_ATTEMPTS = 3;
// Minimum time left before starting a step (download+STT, 3 translations, round-trip).
const NEED_MS: Record<"received" | "transcribed" | "translated", number> = { received: 4000, transcribed: 4000, translated: 3500 };
export const UNFINISHED: Stage[] = ["received", "transcribed", "translated"];

const extras = (flags: string[]) => flags.filter((f) => f !== "processing" && f !== "machine-translated" && f !== WOLOF_FLAG);

function budgetSignal(deadline: number, now: number) {
  return AbortSignal.timeout(Math.max(1, deadline - now - 300));
}

/** Runs as many steps of one answer as the budget allows. */
export async function runAnswer(d: PipelineDeps, id: string, deadline: number, phone: string | null): Promise<"done" | "partial" | "skipped"> {
  if (!(await d.claimLease(id, Math.max(5000, deadline - d.now() + 2000)))) return "skipped";
  try {
    for (let guard = 0; guard < 6; guard++) {
      const row = await d.load(id);
      if (!row) return "done";

      // Notify (once) as soon as a transcript exists and the champion who sent it is the current caller.
      if (row.transcript_src && !row.notified_at && row.notify_hash && phone && d.hash(phone) === row.notify_hash && row.stage !== "failed") {
        if (await d.claimNotify(id)) {
          try { await d.notify(phone, d.notifyText(row, row.transcript_src)); d.log(`[pipeline ${id}] notify sent`); }
          catch (e) { d.log(`[pipeline ${id}] error step=notify ${(e as Error).message}`); }
        }
        continue;
      }
      if (row.stage === "checked" || row.stage === "failed") return "done";
      if (deadline - d.now() < NEED_MS[row.stage]) return "partial";
      const signal = budgetSignal(deadline, d.now());
      d.log(`[pipeline ${id}] step start ${row.stage}`);

      if (row.stage === "received") {
        if (!row.audio_url) { await d.advance(id, "received", { stage: "failed", flags: ["transcription failed"] }); continue; }
        let dl: Download;
        try { dl = await d.download(row.audio_url, signal); }
        catch (e) {
          d.log(`[pipeline ${id}] error step=download ${(e as Error).message}`);
          if (signal.aborted) return "partial";
          dl = { ok: false, status: 0, expired: false };
        }
        if (!dl.ok) {
          d.log(`[pipeline ${id}] media downloaded ${dl.status} 0 -`);
          if (dl.expired) await d.advance(id, "received", { stage: "failed", flags: [MEDIA_EXPIRED] });
          else if (row.attempts + 1 >= MAX_ATTEMPTS) await d.advance(id, "received", { stage: "failed", flags: ["transcription failed"] });
          else { await d.advance(id, "received", { attempts: row.attempts + 1 }); return "partial"; }
          continue;
        }
        d.log(`[pipeline ${id}] media downloaded ${dl.status} ${dl.bytes} ${dl.type}`);
        const t0 = d.now();
        let t: Awaited<ReturnType<PipelineDeps["stt"]>> = null;
        try { t = await d.stt(dl.blob, dl.type, signal); }
        catch (e) { d.log(`[pipeline ${id}] error step=stt ${(e as Error).message}`); if (signal.aborted) return "partial"; }
        d.log(`[pipeline ${id}] stt ${t?.status ?? "failed"} ${d.now() - t0}`);
        if (!t || !t.text) {
          if (row.attempts + 1 >= MAX_ATTEMPTS) await d.advance(id, "received", { stage: "failed", flags: ["transcription failed"] });
          else { await d.advance(id, "received", { attempts: row.attempts + 1 }); return "partial"; }
          continue;
        }
        if (await d.advance(id, "received", { stage: "transcribed", transcript_src: t.text, transcript_confidence: t.confidence, attempts: 0 })) {
          d.log(`[pipeline ${id}] transcript saved`);
        }
        continue;
      }

      if (row.stage === "transcribed") {
        const src = row.transcript_src ?? "";
        const fl = extras(row.flags);
        let english: string | null = null, german: string | null = null, dutch: string | null = null;
        try {
          const stated = certainValues(src);
          english = await d.translate(src, "en", signal, stated);
          // A price must survive translation: if the English does not state the number the Wolof words say, ask once more, then flag it.
          if (english && stated.length && !stated.every((v) => mentionsNumber(english!, v))) {
            english = (await d.translate(src, "en", signal, stated)) ?? english;
            if (!stated.every((v) => mentionsNumber(english!, v))) fl.push("number mismatch: please confirm");
          }
          if (english) [german, dutch] = await Promise.all([d.translate(english, "de", signal, stated), d.translate(english, "nl", signal, stated)]);
          // Visitors read German and Dutch, but the operator only ever approves the Wolof, so check the numbers there too (digits, separators ignored).
          if (stated.length) {
            const bad = (txt: string | null) => !!txt && !stated.every((v) => digitsMention(txt, v));
            if (bad(german)) german = (await d.translate(english!, "de", signal, stated)) ?? german;
            if (bad(dutch)) dutch = (await d.translate(english!, "nl", signal, stated)) ?? dutch;
            if (bad(german) || bad(dutch)) fl.push("number mismatch (German or Dutch): please confirm");
          }
        } catch (e) { d.log(`[pipeline ${id}] error step=translate ${(e as Error).message}`); }
        if (signal.aborted) return "partial"; // budget ran out mid-step: redo the step next time
        if (!english || !german || !dutch) fl.push("translation failed");
        await d.advance(id, "transcribed", { stage: "translated", english, german, dutch, flags: ["processing", ...fl] });
        d.log(`[pipeline ${id}] translate en/de/nl done`);
        continue;
      }

      if (row.stage === "translated") {
        const fl = extras(row.flags);
        let score: number | null = null;
        if (row.english && row.transcript_src) {
          let rt: { score: number; differences: string[] } | null = null;
          try { rt = await d.roundtrip(row.transcript_src, row.english, signal); }
          catch (e) { d.log(`[pipeline ${id}] error step=roundtrip ${(e as Error).message}`); }
          if (signal.aborted) return "partial";
          if (!rt) fl.push("round-trip check failed");
          else { score = rt.score; if (rt.score < ROUNDTRIP_MIN || rt.differences.length) fl.push("round-trip mismatch"); }
        }
        // Never auto-approve: review_status stays "pending".
        await d.advance(id, "translated", { stage: "checked", roundtrip_score: score, flags: ["machine-translated", WOLOF_FLAG, ...fl] });
        d.log(`[pipeline ${id}] roundtrip done ${score ?? "none"}`);
        continue;
      }
    }
    return "partial";
  } finally {
    await d.releaseLease(id).catch(() => undefined);
  }
}

/** Processes the oldest unfinished answers one at a time within budgetMs. */
export async function finishAnswers(d: PipelineDeps, budgetMs: number, opts: { phone?: string | null; firstId?: string | null } = {}) {
  const deadline = d.now() + budgetMs;
  const phone = opts.phone ?? null;
  let ids = await d.listUnfinished(!!phone, 20);
  if (opts.firstId) ids = [opts.firstId, ...ids.filter((x) => x !== opts.firstId)];
  let processed = 0, finished = 0;
  for (const id of ids) {
    if (deadline - d.now() < 3000) break;
    const r = await runAnswer(d, id, deadline, phone);
    if (r !== "skipped") processed++;
    if (r === "done") finished++;
  }
  return { processed, finished, remaining: await d.countUnfinished() };
}

/* ---------------- Approved-answer voice files (EN/DE/NL) ----------------
 * Per-language progress = an answer_audio row for that language. Missing languages are generated
 * inside the request (parallel TTS, each saved as soon as it is ready), so a cut-off run resumes
 * with only the languages still missing. Only approved answers ever get audio. */
export const AUDIO_LANGS: Lang[] = ["en", "de", "nl"];

export interface AudioDeps {
  now(): number;
  log(msg: string): void;
  texts(id: string): Promise<{ approved: boolean; en: string | null; de: string | null; nl: string | null } | null>;
  existing(id: string): Promise<Lang[]>;
  claimLease(id: string, ms: number): Promise<boolean>;
  releaseLease(id: string): Promise<void>;
  speak(text: string, lang: Lang, id: string, signal: AbortSignal): Promise<string | null>;
  save(id: string, lang: Lang, path: string): Promise<void>;
  listMissing(limit: number): Promise<string[]>;
}

/** Returns the languages that have audio after this call. */
export async function ensureAudio(d: AudioDeps, id: string, langs: Lang[], deadline: number): Promise<Lang[]> {
  const have = new Set(await d.existing(id));
  const t = await d.texts(id);
  if (!t || !t.approved) return [...have]; // audio only AFTER approval
  const missing = langs.filter((l) => !have.has(l) && t[l]);
  if (!missing.length) return [...have];
  if (deadline - d.now() < 2500) { d.log(`[audio ${id}] skipped, no time left`); return [...have]; }
  if (!(await d.claimLease(id, Math.max(5000, deadline - d.now() + 2000)))) { d.log(`[audio ${id}] busy elsewhere`); return [...have]; }
  try {
    const signal = AbortSignal.timeout(Math.max(1, deadline - d.now() - 300));
    await Promise.all(missing.map(async (l) => {
      const t0 = d.now();
      try {
        const path = await d.speak(t[l]!, l, id, signal);
        if (!path) { d.log(`[audio ${id}] tts ${l} failed ${d.now() - t0}`); return; }
        await d.save(id, l, path);
        have.add(l);
        d.log(`[audio ${id}] tts ${l} saved ${d.now() - t0}`);
      } catch (e) { d.log(`[audio ${id}] error step=tts ${l} ${(e as Error).message}`); }
    }));
  } finally {
    await d.releaseLease(id).catch(() => undefined);
  }
  return [...have];
}

/** Completes missing voice files for approved answers, oldest first, within budgetMs. */
export async function finishAudio(d: AudioDeps, budgetMs: number) {
  const deadline = d.now() + budgetMs;
  const ids = await d.listMissing(20);
  let done = 0;
  for (const id of ids) {
    if (deadline - d.now() < 3000) break;
    const got = await ensureAudio(d, id, AUDIO_LANGS, deadline);
    if (AUDIO_LANGS.every((l) => got.includes(l))) done++;
  }
  return { audio_completed: done, audio_remaining: (await d.listMissing(100)).length };
}
