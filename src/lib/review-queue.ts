// Pure formatting for the champion's REVIEW queue. Seeded sample answers
// (is_sample = true) are never shown or counted; real answers are oldest first.
import { W, bi, sl, topicWo, topicEn, UNVERIFIED_FOOTER } from "./champion.templates";
import { toSmsText, SMS_MAX } from "./sms-text";

export const NO_PENDING_MSG = bi(W.noPending, "No pending answers from Noor's recordings.");

export type PendingItem = {
  id: string;
  transcript_src: string | null;
  flags: string[];
  is_sample: boolean;
  position?: number | null;
  topic?: string | null;
};

/** Flags that are always true for demo answers are not worth showing; anything else is a real warning. */
const ROUTINE_FLAGS = [/^machine-translated$/, /^wolof unverified/, /^processing$/, /^phone call$/];
export const notableFlags = (flags: string[]) => flags.filter((f) => !ROUTINE_FLAGS.some((r) => r.test(f)));

/** Build the REVIEW message. items must be oldest first; samples are dropped defensively.
 *  `_wolofLabel` is kept for compatibility: the "unverified" label is now the footer line. */
export function formatPendingQueue(items: PendingItem[], busy: number, _wolofLabel: string, numbersHeard: (t: string | null) => string) {
  const list = items.filter((i) => !i.is_sample);
  const still = busy > 0 ? `\n\n${sl(W.busy(busy), `${busy} still processing, send REVIEW again in a minute`)}` : "";
  const item = list[0];
  if (!item) {
    return { text: busy > 0 ? `${bi(W.noneReadyYet, "No answers ready yet.")}${still}` : NO_PENDING_MSG, answerId: null as string | null };
  }
  const transcript = item.transcript_src ?? (item.flags.includes("processing") ? "[still processing]" : "[no transcript]");
  const numbers = numbersHeard(item.transcript_src);
  const warn = notableFlags(item.flags);
  const text = [
    `*Tontu ${1} ci ${list.length}* · ${topicWo(item.topic)}`,
    `_Answer 1 of ${list.length} · Question ${item.position} · ${topicEn(item.topic)}_`,
    "",
    `🎙️ ${sl(W.heardLabel, "What we heard, in Wolof")}`,
    `“${transcript}”`,
    "",
    `${sl(W.numbersLabel, "Numbers")}`,
    numbers,
    ...(/please confirm/i.test(numbers) ? [`⚠️ ${sl(W.confirm, "please confirm")}`] : []),
    ...(warn.length ? ["", `⚠️ ${warn.join(", ")}`] : []),
    "",
    `${sl(W.reply, "Reply")}`,
    sl(W.option1, "approve"),
    sl(W.option2, "record again"),
    sl(W.option3, "ask a bilingual reviewer"),
    "",
    UNVERIFIED_FOOTER,
  ].join("\n") + still;
  return { text, answerId: item.id as string | null };
}

/** The same review card as plain SMS for the household helper: the Wolof transcript is shortened (never the choices) so the
 *  numbers and 1 / 2 / 3 always fit in three parts. */
export function formatReviewSms(p: { index: number; total: number; topic?: string | null; transcript: string | null; numbers: string; flags: string[] }): string {
  const confirm = /please confirm/i.test(p.numbers) ? ` (${W.confirm})` : "";
  const warn = notableFlags(p.flags);
  const tail = [
    `Limu: ${p.numbers}${confirm}`,
    ...(warn.length ? [`Warning: ${warn.join(", ")}`] : []),
    "1 Nangu, 2 Waxaat ko, 3 Nit ku xam ñaar yi làkk",
    "Wolof bu masin tekki, wóoragul.",
  ].join("\n");
  const head = `${p.index}/${p.total} ${topicWo(p.topic)}`;
  const budget = SMS_MAX - toSmsText(`${head}\n""\n${tail}`, 9999).length - 3;
  const raw = p.transcript ?? "[no transcript]";
  const t = raw.length > budget ? `${raw.slice(0, Math.max(20, budget - 3)).trimEnd()}...` : raw;
  return toSmsText(`${head}\n"${t}"\n${tail}`);
}
