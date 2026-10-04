// Plain-text SMS for Noor's feature phone: she needs no internet to read, keep or send these.
// Pure functions, no I/O. Text is converted to the GSM 7-bit alphabet (160 characters per message, 153 per part when
// messages are joined) so old phones show it correctly and it stays cheap. Letters outside that alphabet are written
// plainly: ë -> e, ó -> o, ŋ -> ng. Emoji and WhatsApp formatting are dropped.
// All Wolof wording is machine-written and UNVERIFIED by a native speaker (see champion.templates.ts).
import {
  COACH_TEMPLATES as T,
  THEME_TEMPLATES,
  TOPIC_TEMPLATES,
  fill,
  type CoachLanguage,
} from "./coach.templates";
import { MIN_REVIEWS, THEME_TOPIC, type StoredRun } from "./coach";
import { TOPIC_CARD, helperFields, nextCards, type ListingPack } from "./listing";
import { topicWo } from "./champion.templates";

export const SMS_OPT_OUT = "Reply STOP to opt out.";
/** About three joined messages. */
export const SMS_MAX = 459;

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";
const SWAP: Record<string, string> = {
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  "·": "-",
  "×": "x",
  " ": " ",
  ŋ: "ng",
  Ŋ: "Ng",
  œ: "oe",
  Œ: "Oe",
  "`": "'",
  "\\": "/",
  "|": "/",
  "[": "(",
  "]": ")",
  "{": "(",
  "}": ")",
  "~": "-",
  "^": "",
  "€": "EUR",
};

/** Keeps characters the GSM alphabet has, writes the rest plainly, and drops emoji and symbols. */
export function toGsm7(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    if (GSM_BASIC.includes(ch)) {
      out += ch;
      continue;
    }
    const swap = SWAP[ch];
    if (swap !== undefined) {
      out += swap;
      continue;
    }
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (base !== ch && [...base].every((b) => GSM_BASIC.includes(b))) out += base;
  }
  return out;
}

/** WhatsApp *bold* and _italic_ markers removed (never inside links). */
export function stripWhatsAppMarkup(text: string): string {
  return text
    .split(/(https?:\/\/\S+)/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/(^|[\s(])[*_]+(?=\S)/gm, "$1")
            .replace(/(?<=\S)[*_]+(?=$|[\s).,;:!?])/gm, ""),
    )
    .join("");
}

/** Number of SMS parts a text needs (GSM 7-bit: 160 / 153; otherwise Unicode: 70 / 67). */
export function smsSegments(text: string): number {
  if (!text) return 0;
  const gsm = [...text].every((c) => GSM_BASIC.includes(c) || GSM_EXT.includes(c));
  if (gsm) {
    const len = [...text].reduce((n, c) => n + (GSM_EXT.includes(c) ? 2 : 1), 0);
    return len <= 160 ? 1 : Math.ceil(len / 153);
  }
  return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
}

/** WhatsApp-style text -> SMS text: no markup, no emoji, GSM alphabet, whitespace tidied, cut at a line or word end. */
export function toSmsText(text: string, maxChars = SMS_MAX): string {
  const plain = toGsm7(stripWhatsAppMarkup(text))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (plain.length <= maxChars) return plain;
  const cut = plain.slice(0, maxChars - 3);
  const nl = cut.lastIndexOf("\n");
  const sp = cut.lastIndexOf(" ");
  const at = nl > maxChars * 0.6 ? nl : sp > maxChars * 0.6 ? sp : cut.length;
  return `${cut.slice(0, at).trimEnd()}...`;
}

/** Body plus the opt-out line, within `maxChars` in total. The opt-out line is never cut. */
export function withOptOut(body: string, maxChars = SMS_MAX): string {
  return `${toSmsText(body, maxChars - SMS_OPT_OUT.length - 1)}\n${SMS_OPT_OUT}`;
}

/* ---------------- Coaching ---------------- */

/** Short coaching summary for SMS: counts, top 3 themes and the first action. Fixed templates only. */
export function coachSms(r: StoredRun, lang: CoachLanguage = "wo"): string {
  const N = r.reviews_count,
    M = r.places_count;
  const wo = lang === "wo";
  const head = wo
    ? "Teranga coaching (AI, mën na baña dëppoo):"
    : "Teranga coaching (AI summary, may be wrong):";
  const counts = wo
    ? `${N} xalaat ci ${M} barab (Google Maps).`
    : `${N} reviews from ${M} places (Google Maps).`;
  const label = wo ? "Wolof bu masin tekki, wóoragul." : "";
  if (N === 0)
    return withOptOut(
      [head, wo ? "Amul xalaat léegi." : "No reviews yet.", label].filter(Boolean).join("\n"),
    );
  if (N < MIN_REVIEWS) {
    return withOptOut(
      [
        head,
        counts,
        wo ? "Xalaat yi néew nañu ngir coaching bu wóor." : "Too few reviews to coach reliably.",
        label,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  const top = r.themes
    .slice(0, 3)
    .map(
      (t, i) =>
        `${i + 1}. ${THEME_TEMPLATES[t.theme][lang][t.sentiment]}: ${fill(T.countPhrase[lang], { n: t.count, total: N })}`,
    );
  const lead = r.themes.find((t) => t.sentiment === "negative") ?? r.themes[0];
  let action = "";
  if (lead) {
    const topic = THEME_TOPIC[lead.theme];
    const local = topic
      ? (TOPIC_TEMPLATES[topic as keyof typeof TOPIC_TEMPLATES]?.[lang] ?? topic)
      : "";
    const neg = lead.sentiment === "negative";
    action = topic
      ? fill(T[neg ? "recordImprove" : "ensureCovers"][lang], { topic: local })
      : T[neg ? "talkNoor" : "mentionGreeting"][lang];
  }
  return withOptOut(
    [head, counts, ...top, action ? `${wo ? "Jëf" : "Action"}: ${action}` : "", label]
      .filter(Boolean)
      .join("\n"),
  );
}

/* ---------------- Google listing ---------------- */

/** Progress line for Noor: answers approved, listing fields ready, which cards to record next, what only the household champion can add. */
export function listingSms(p: ListingPack, lang: CoachLanguage = "wo"): string {
  const wo = lang === "wo";
  const cards = nextCards(p);
  const helper = helperFields(p).map((f) => (wo ? f.labelWo : f.labelEn).toLowerCase());
  const lines = [
    wo
      ? `Teranga: sa listing ci Google Maps: ${p.ready} ci ${p.total} paré. Tontu yi nangu nañu: ${p.approved} ci ${p.cardsTotal}.`
      : `Teranga: your Google Maps listing: ${p.ready} of ${p.total} ready. Answers approved: ${p.approved} of ${p.cardsTotal}.`,
    cards.length
      ? wo
        ? `Woote Teranga, waxal kaartu ${cards.join(", ")}.`
        : `Call Teranga and record card ${cards.join(", ")}.`
      : "",
    helper.length
      ? wo
        ? `Sa mbokk mi war na def: ${helper.join(", ")}.`
        : `Your household champion must add: ${helper.join(", ")}.`
      : "",
    wo ? "Wolof bu masin tekki, wóoragul." : "",
  ].filter(Boolean);
  return withOptOut(lines.join("\n"));
}

/** Receipt when Noor approves one of her answers. */
export function approvalSms(topic: string, p: ListingPack, lang: CoachLanguage = "wo"): string {
  const wo = lang === "wo";
  const cardNo = TOPIC_CARD[topic];
  const lines = [
    wo
      ? `Teranga: sa tontu ci "${topicWo(topic)}"${cardNo ? ` (kaartu ${cardNo})` : ""} nangu nañu ko. Tontu yi nangu nañu: ${p.approved} ci ${p.cardsTotal}.`
      : `Teranga: your answer for "${topic}"${cardNo ? ` (card ${cardNo})` : ""} was approved. Answers approved: ${p.approved} of ${p.cardsTotal}.`,
    wo
      ? `Listing Google: ${p.ready} ci ${p.total} paré.`
      : `Google listing: ${p.ready} of ${p.total} ready.`,
    wo ? "Wolof bu masin tekki, wóoragul." : "",
  ].filter(Boolean);
  return withOptOut(lines.join("\n"));
}

/* ---------------- Noor's commands by SMS ---------------- */

/** Words the carrier network and Twilio handle themselves (opt-out and opt-in). We never answer them. */
export const isCarrierKeyword = (body: string) => /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|START|UNSTOP)$/i.test(body.trim());

export type OperatorSmsCommand = {
  cmd: "coach" | "listing" | "week" | "help";
  lang: CoachLanguage;
} | null;

/** COACH, LISTING, WEEK, HELP; add EN for English. Anything else is not a command. STOP and HELP words are also
 *  handled by Twilio itself, so HELP here only answers when Twilio forwards it. */
export function parseOperatorSms(body: string): OperatorSmsCommand {
  const words = body.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 2) return null;
  const lang: CoachLanguage = words[1] === "EN" ? "en" : "wo";
  if (words.length === 2 && words[1] !== "EN") return null;
  const cmd = ({ COACH: "coach", LISTING: "listing", WEEK: "week", HELP: "help" } as const)[
    words[0] as "COACH"
  ];
  return cmd ? { cmd, lang } : null;
}

export function helpSms(lang: CoachLanguage = "wo"): string {
  return withOptOut(
    lang === "wo"
      ? "Teranga: COACH = coaching. LISTING = sa listing ci Google. WEEK = xibaar ayubes bi. Yokk EN ngir Angale. Woote Teranga ngir waxal sa tontu yi."
      : "Teranga: COACH = coaching. LISTING = your Google listing. WEEK = this week's digest. Call Teranga to record your answers.",
  );
}

export const unknownSms = (lang: CoachLanguage = "wo") =>
  withOptOut(
    lang === "wo"
      ? "Teranga: xamuma li nga bind. Yonnee HELP."
      : "Teranga: I did not understand. Send HELP.",
  );

/* ---------------- Weekly digest in Wolof ---------------- */

/** Wolof digest for Noor: counts only. The questions themselves are English, so they stay on the household champion's WhatsApp. */
export function weeklyDigestSmsWo(
  total: number,
  topics: Array<{ topic: string; count: number }>,
  unansweredCount: number,
): string {
  if (total === 0) return withOptOut("Teranga xibaar ayubes bi: amul laaj ayubes bi.");
  const top = [...topics]
    .filter((t) => t.topic !== "unanswered")
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((t) => `${topicWo(t.topic)}: ${t.count}`)
    .join(". ");
  return withOptOut(
    [
      `Teranga xibaar ayubes bi: ${total} laaj.`,
      top ? `${top}.` : "",
      unansweredCount > 0
        ? `Laaj yu amul tontu: ${unansweredCount} (seetal ko ci WhatsApp bu sa mbokk mi).`
        : "",
      "Wolof bu masin tekki, wóoragul.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
