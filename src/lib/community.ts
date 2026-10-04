// Community Circle (Mbootaay): a community champion leads a group of operators, on top of each operator's household
// helper. The community champion posts notices when a flood, storm or closed road changes what visitors should expect,
// checks translations that household helpers cannot, and mediates referrals. Pure functions, no I/O.
// Notices use FIXED templates in English, German, Dutch and Wolof, so nothing is machine-translated at the moment it
// matters. Only a short place name is free text. UNVERIFIED Wolof: written by Claude, not checked by a native speaker.
import { bi, sl, topicEn, topicWo, UNVERIFIED_FOOTER } from "./champion.templates";
import { withOptOut } from "./sms-text";

export type NoticeLang = "en" | "de" | "nl";
type Texts = Record<NoticeLang | "wo", string>;

export type AlertKind = "flood" | "road" | "storm" | "boats" | "closed" | "clear";
/** Menu number of each kind, in the order the community champion sees them. */
export const ALERT_KINDS: Array<{ n: number; kind: AlertKind; key: string }> = [
  { n: 1, kind: "flood", key: "FLOOD" }, { n: 2, kind: "road", key: "ROAD" }, { n: 3, kind: "storm", key: "STORM" },
  { n: 4, kind: "boats", key: "BOATS" }, { n: 5, kind: "closed", key: "CLOSED" }, { n: 6, kind: "clear", key: "CLEAR" },
];
/** A notice stays on visitors' answers for 24 hours unless the community champion clears it sooner. */
export const ALERT_TTL_HOURS = 24;
export const MAX_ACTIVE_SHOWN = 2;

export const ALERT_TEXT: Record<AlertKind, Texts> = {
  flood: {
    en: "Flooding in the area: river and road trips may be cancelled or changed.",
    de: "Überschwemmung in der Region: Fluss- und Straßentouren können ausfallen oder geändert werden.",
    nl: "Overstroming in de regio: rivier- en wegtochten kunnen worden afgelast of aangepast.",
    wo: "Ndox bi dugg na ci barab yi: tukki ci dex ak ci yoon yi mën na soppiku walla taxaw.",
  },
  road: {
    en: "Road closed or flooded",
    de: "Straße gesperrt oder überflutet",
    nl: "Weg afgesloten of overstroomd",
    wo: "Yoon bi tëj na walla ndox bi fees na ko",
  },
  storm: {
    en: "Storm or heavy rain warning: some tours may be paused.",
    de: "Sturm- oder Starkregenwarnung: einige Touren können pausieren.",
    nl: "Storm- of zware regenwaarschuwing: sommige tochten kunnen worden stilgelegd.",
    wo: "Ngelaw lu metti walla taw bu bare: yenn tukki yi mën nañu taxaw.",
  },
  boats: {
    en: "Boat trips are paused today.",
    de: "Bootstouren sind heute ausgesetzt.",
    nl: "Boottochten liggen vandaag stil.",
    wo: "Tukki ci gaal yi taxaw na tey.",
  },
  closed: {
    en: "Tours are closed today.",
    de: "Touren sind heute geschlossen.",
    nl: "Tochten zijn vandaag gesloten.",
    wo: "Tukki yi taxaw nañu tey.",
  },
  clear: {
    en: "All clear: tours are running again.",
    de: "Entwarnung: Die Touren finden wieder statt.",
    nl: "Alles in orde: de tochten gaan weer door.",
    wo: "Lépp baax na: tukki yi tàmbalaat nañu.",
  },
};

const LABEL: Record<NoticeLang, string> = { en: "Community notice", de: "Hinweis der Community", nl: "Melding van de gemeenschap" };
const DISCLAIMER: Record<NoticeLang, string> = {
  en: "This is a community notice, not an official warning. Noor will confirm your tour.",
  de: "Dies ist ein Hinweis der Community, keine amtliche Warnung. Noor bestätigt Ihre Tour.",
  nl: "Dit is een melding van de gemeenschap, geen officiële waarschuwing. Noor bevestigt je tocht.",
};
const NO_NOTICES: Record<NoticeLang, string> = {
  en: "No community notices right now.",
  de: "Derzeit keine Hinweise der Community.",
  nl: "Op dit moment geen meldingen van de gemeenschap.",
};
export const noNotices = (l: NoticeLang) => NO_NOTICES[l];

/** "just now", "35 min ago", "3 h ago" in the visitor's language. */
export function ago(ms: number, l: NoticeLang): string {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.round(min / 60);
  if (min < 2) return { en: "just now", de: "gerade eben", nl: "zojuist" }[l];
  if (min < 90) return { en: `${min} min ago`, de: `vor ${min} Min.`, nl: `${min} min geleden` }[l];
  return { en: `${h} h ago`, de: `vor ${h} Std.`, nl: `${h} u geleden` }[l];
}

/** A short place name: letters, digits, spaces and a little punctuation; no links, no phone numbers, no markup. */
export function cleanPlace(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .replace(/(?:https?:\/\/|www\.)\S+/gi, " ")
    .replace(/\S+@\S+/g, " ")
    .replace(/\+?\d[\d\s().-]{5,}\d/g, " ")
    .replace(/[^\p{L}\p{N} .,'’()/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
  return s || null;
}

export type AlertCommand = { kind: AlertKind; place: string | null } | { menu: true } | { invalid: true } | null;

/** "ALERT" shows the menu; "ALERT 2 Tendaba road", "ALERT road Tendaba", "ALERT 6" post or clear a notice.
 *  Anything that does not start with the word ALERT is not an alert command. */
export function parseAlertCommand(text: string): AlertCommand {
  const m = /^ALERT(?:\s+(\S+)(?:\s+([\s\S]+))?)?$/i.exec(text.trim());
  if (!m) return null;
  if (!m[1]) return { menu: true };
  const word = m[1].toUpperCase();
  const hit = ALERT_KINDS.find((k) => String(k.n) === word || k.key === word);
  if (!hit) return { invalid: true };
  return { kind: hit.kind, place: cleanPlace(m[2]) };
}

export type ActiveAlert = { kind: AlertKind; place: string | null; created_at: string };

/** The line of text a visitor sees under an answer while a notice is active (empty when there is none). */
export function visitorNotice(alerts: ActiveAlert[], l: NoticeLang, now = Date.now()): string {
  const shown = alerts.filter((a) => a.kind !== "clear").slice(0, MAX_ACTIVE_SHOWN);
  if (!shown.length) return "";
  const lines = shown.map((a) => {
    const base = ALERT_TEXT[a.kind][l];
    const where = a.place ? (a.kind === "road" ? `${base}: ${a.place}` : `${base} (${a.place})`) : base;
    return `⚠️ ${LABEL[l]} (${ago(now - new Date(a.created_at).getTime(), l)}): ${where}`;
  });
  return `${lines.join("\n")}\n${DISCLAIMER[l]}`;
}

/** SMS to a member operator, in Wolof first. Short, plain, with the opt-out line. */
export function alertSms(kind: AlertKind, place: string | null): string {
  const where = place ? (kind === "road" ? `: ${place}` : ` (${place})`) : "";
  return withOptOut(`Teranga ndigal bu mbootaay: ${ALERT_TEXT[kind].wo}${where}\nWolof bu masin tekki, wóoragul.`);
}

/* ---------------- Messages for the community champion (Wolof first, English small) ---------------- */

const NAME: Record<AlertKind, { wo: string; en: string }> = {
  flood: { wo: "Ndox bi dugg na", en: "Flooding" },
  road: { wo: "Yoon bi tëj na", en: "Road closed or flooded" },
  storm: { wo: "Ngelaw/taw bu metti", en: "Storm or heavy rain" },
  boats: { wo: "Gaal yi taxaw nañu", en: "Boat trips paused" },
  closed: { wo: "Tukki yi taxaw nañu", en: "Tours closed today" },
  clear: { wo: "Lépp baax na", en: "All clear" },
};
export const alertName = (kind: AlertKind) => sl(NAME[kind].wo, NAME[kind].en);

export const COMMUNITY_MENU = [
  "*Mbootaay* _(Community circle)_ · demo shortcut",
  bi(
    ["ALERT = yónnee ndigal ci sa mbokk yi", "ALERTS = ndigal yi nekk", "BILINGUAL = seetal tekki yi (Wolof ak Angale)", "PULSE = xibaar mbootaay mi", "LEDGER = ndimbal yi"].join("\n"),
    ["send a notice to the members", "active notices", "check translations (Wolof and English)", "community overview", "referrals"].join("\n"),
  ),
].join("\n");

export const ALERT_MENU = [
  `*Ndigal bu mbootaay* _(Community notice)_`,
  ...ALERT_KINDS.map((k) => `${k.n} ${alertName(k.kind)}`),
  "",
  sl("Misaal: ALERT 2 Tendaba (6 = ñépp baax na)", "Example: ALERT 2 Tendaba (6 = all clear)"),
  `_${LABEL.en}s last ${ALERT_TTL_HOURS} h. Members get an SMS. Visitors see it under every answer._`,
].join("\n");

/** Reply to the community champion after posting or clearing. `members` = real members messaged, `simulated` = demo members. */
export function alertPosted(kind: AlertKind, place: string | null, sms: "sent" | "failed" | "capped", simulated: number, cleared = 0): string {
  const smsLine = {
    sent: sl("SMS bi dem na ci Noor", "SMS sent to Noor"),
    failed: sl("SMS bi demul (US carrier registration)", "SMS not delivered: US carrier registration pending"),
    capped: sl("SMS bi demul (cap bu bés bi)", "SMS skipped: daily message cap"),
  }[sms];
  if (kind === "clear") {
    return [
      `✅ *${sl("Ndigal yi dindi nañu ko", "Notices cleared")}* (${cleared})`,
      `📲 ${smsLine}`,
      `_${simulated} simulated members (demo) were not messaged._`,
    ].join("\n");
  }
  return [
    `✅ *${sl("Ndigal bi yónnee nañu ko", "Notice posted")}*: ${alertName(kind)}${place ? ` · ${place}` : ""}`,
    `📲 ${smsLine}`,
    `👀 ${sl("Gan yi dinañu ko gis ci tontu yépp (24 waxtu)", "Visitors see it under every answer (24 h)")}`,
    `_${simulated} simulated members (demo) were not messaged. ${LABEL.en}: not an official warning._`,
  ].join("\n");
}

export function formatAlertList(alerts: ActiveAlert[], now = Date.now()): string {
  const shown = alerts.filter((a) => a.kind !== "clear");
  if (!shown.length) return bi("Amul ndigal bu nekk.", "No active notices.");
  return [
    `*${sl("Ndigal yi nekk", "Active notices")}*`,
    ...shown.map((a) => `• ${alertName(a.kind)}${a.place ? ` · ${a.place}` : ""} _(${ago(now - new Date(a.created_at).getTime(), "en")})_`),
    "",
    sl("ALERT 6 = lépp baax na", "ALERT 6 = all clear"),
  ].join("\n");
}

export type Pulse = { realMembers: number; simulatedMembers: number; activeNotices: number; translationsWaiting: number; contactRequests: number; approved: number; cards: number };
export function formatPulse(p: Pulse): string {
  return [
    `*Mbootaay* _(Community overview)_`,
    `👥 ${sl("Mbokk yi", "Members")}: *${p.realMembers + p.simulatedMembers}* _(${p.realMembers} real, ${p.simulatedMembers} simulated)_`,
    `⚠️ ${sl("Ndigal yi nekk", "Active notices")}: *${p.activeNotices}*`,
    `🌐 ${sl("Tekki yi ñu war a seet", "Translations waiting")}: *${p.translationsWaiting}*`,
    `🤝 ${sl("Laaj ndimbal yi", "Contact requests waiting")}: *${p.contactRequests}*`,
    `✅ ${sl("Tontu yi nangu nañu (Noor)", "Answers approved (Noor)")}: *${p.approved}* ci ${p.cards}`,
    "",
    UNVERIFIED_FOOTER,
  ].join("\n");
}

/* ---------------- Bilingual review: the community checks what a household helper cannot ---------------- */

export type BilingualItem = { topic: string | null; transcript: string | null; english: string | null; numbers: string; flags: string[] };

export function formatBilingualItem(i: BilingualItem, waiting: number): string {
  const lines = [
    `*Tekki bu ñu laaj* _(Translation check)_ · ${topicWo(i.topic)} _(${topicEn(i.topic)})_`,
    `_${waiting} waiting_`,
    "",
    `🎙️ *Wolof* _(What Noor said: unverified transcript)_`,
    `“${i.transcript ?? "[no transcript]"}”`,
    "",
    `*EN* _(English, machine-translated)_`,
    `“${i.english ?? "[no English yet]"}”`,
    "",
    `🔢 *${sl("Limu yi", "Numbers")}*`,
    i.numbers,
  ];
  const warn = i.flags.filter((f) => !/^(machine-translated|wolof unverified|processing|phone call|bilingual verified)/.test(f));
  if (warn.length) lines.push("", `⚠️ ${warn.join(", ")}`);
  lines.push(
    "",
    `*${sl("Tontu", "Reply")}*`,
    `1️⃣ ${sl("Baax na: Angale bi dëggu na", "English is right")}`,
    `2️⃣ ${sl("Baaxul: waxaat ko", "Not right: record again")}`,
    `3️⃣ ${sl("Bàyyi ko léegi", "Leave it for now")}`,
    "",
    UNVERIFIED_FOOTER,
  );
  return lines.join("\n");
}

const MT_LABEL: Record<NoticeLang, { plain: string; checked: string }> = {
  en: { plain: "Machine-translated", checked: "Machine-translated · English checked by a bilingual reviewer" },
  de: { plain: "Maschinell übersetzt", checked: "Maschinell übersetzt · Englisch von einer zweisprachigen Person geprüft" },
  nl: { plain: "Machinevertaald", checked: "Machinevertaald · Engels gecontroleerd door een tweetalige beoordelaar" },
};
/** Label under a visitor answer. "Checked" only when a bilingual reviewer approved the English; German and Dutch stay machine translations of it. */
export const translationLabel = (l: NoticeLang, bilingualVerified: boolean) => MT_LABEL[l][bilingualVerified ? "checked" : "plain"];
export const BILINGUAL_FLAG = "bilingual verified";
