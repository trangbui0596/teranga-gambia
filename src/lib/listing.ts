// Google Business Profile listing pack built ONLY from answers the helper approved (pure, no I/O).
// Nothing is sent to Google: a person creates or claims the profile at business.google.com and pastes this in.
// Fields that the ten recorded answers cannot supply (name, phone, hours, photos) stay "needs input"; nothing is invented.
// UNVERIFIED Wolof: written by Claude, not checked by a native speaker (see champion.templates.ts).
import { bi, sl, topicEn, UNVERIFIED_FOOTER } from "./champion.templates";

/** Card number (call position) of each question topic: what Noor records next. */
export const TOPIC_CARD: Record<string, number> = {
  price: 1,
  "meeting point": 2,
  duration: 3,
  "what to bring": 4,
  children: 5,
  food: 6,
  safety: 7,
  "whats included": 8,
  "how to book": 9,
  cancellation: 10,
};

const cardOf = (topic: string): number => TOPIC_CARD[topic] as number;

/** Approved English answer text by topic. `sample` marks seeded sample answers, which are never presented as real. */
export type ApprovedAnswers = Record<string, { text: string; sample: boolean } | undefined>;

export type FieldState = "ready" | "check" | "needs_input";
export type ListingField = {
  key: string;
  labelEn: string;
  labelWo: string;
  state: FieldState;
  value: string | null;
  /** Question card Noor can record to fill this field, when one exists. */
  card?: number;
  /** Google's character limit for the field, when it has one. */
  limit?: number;
};
export type ListingPack = {
  fields: ListingField[];
  /** Fields that are fully ready (not counting defaults and drafts that still need a person's check). */
  ready: number;
  total: number;
  description: string;
  usesSample: boolean;
  /** How many of Noor's ten answers are approved, and which topics are not. */
  approved: number;
  cardsTotal: number;
  unapprovedTopics: string[];
};

export const DESCRIPTION_LIMIT = 750; // Google Business Profile description limit
const DESCRIPTION_ORDER: Array<[string, string]> = [
  ["whats included", "Included"],
  ["meeting point", "Meeting point"],
  ["duration", "Duration"],
  ["price", "Price"],
  ["children", "Children"],
  ["food", "Food"],
  ["what to bring", "Bring"],
  ["safety", "Safety"],
  ["how to book", "How to book"],
  ["cancellation", "Cancellation"],
];

const SENTENCE_MAX = 160;
/** The first sentence(s) of an approved answer, up to 160 characters, cut at a word boundary only when one sentence is
 *  longer than that. Words are never changed. */
export function firstSentence(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  const sentences = one.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)?.map((x) => x.trim()) ?? [one];
  let out = "";
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > SENTENCE_MAX) break;
    out = next;
  }
  if (out) return out;
  const cut = (sentences[0] ?? one).slice(0, SENTENCE_MAX - 3);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40))}...`;
}

/** Description from the approved answers, in a fixed order, whole entries only, within Google's 750 characters. */
export function buildDescription(a: ApprovedAnswers): string {
  const parts: string[] = [];
  let len = 0;
  for (const [topic, label] of DESCRIPTION_ORDER) {
    const t = a[topic]?.text?.trim();
    if (!t) continue;
    const part = `${label}: ${firstSentence(t)}`;
    const add = part.length + (parts.length ? 1 : 0);
    if (len + add > DESCRIPTION_LIMIT) continue;
    parts.push(part);
    len += add;
  }
  return parts.join(" ");
}

const answered = (a: ApprovedAnswers, topic: string) => !!a[topic]?.text?.trim();

export function buildListingPack(a: ApprovedAnswers): ListingPack {
  const description = buildDescription(a);
  const approvedCount = Object.values(a).filter((x) => x?.text?.trim()).length;
  const fromTopic = (
    key: string,
    labelEn: string,
    labelWo: string,
    topic: string,
    join?: (t: string) => string,
  ): ListingField => {
    const t = a[topic]?.text?.trim();
    return t
      ? { key, labelEn, labelWo, state: "ready", value: join ? join(t) : t }
      : { key, labelEn, labelWo, state: "needs_input", value: null, card: cardOf(topic) };
  };
  const services = ["price", "duration", "whats included"].filter((t) => answered(a, t));
  const fields: ListingField[] = [
    {
      key: "name",
      labelEn: "Business name",
      labelWo: "Tur",
      state: "needs_input",
      value: null,
      limit: 100,
    },
    {
      key: "category",
      labelEn: "Category",
      labelWo: "Xeet",
      state: "check",
      value: "Tour operator",
    },
    {
      key: "description",
      labelEn: "Description",
      labelWo: "Description",
      limit: DESCRIPTION_LIMIT,
      value: description || null,
      state: approvedCount >= 3 ? "ready" : approvedCount >= 1 ? "check" : "needs_input",
      // The description is built from Noor's recorded answers, so an empty one points to a card, not to the helper.
      ...(approvedCount === 0 ? { card: cardOf("whats included") } : {}),
    },
    services.length
      ? {
          key: "services",
          labelEn: "Services (price, duration, what is included)",
          labelWo: "Liggéey yi (njekk, waxtu, li ci bokk)",
          state: services.length === 3 ? "ready" : "check",
          value: services.map((t) => `${topicEn(t)}: ${firstSentence(a[t]!.text)}`).join("\n"),
        }
      : {
          key: "services",
          labelEn: "Services (price, duration, what is included)",
          labelWo: "Liggéey yi (njekk, waxtu, li ci bokk)",
          state: "needs_input",
          value: null,
          card: cardOf("price"),
        },
    fromTopic("meeting", "Meeting point / service area", "Barabu ndaje", "meeting point"),
    fromTopic("booking", "How to book", "Naka lañuy booké", "how to book"),
    {
      key: "languages",
      labelEn: "Languages",
      labelWo: "Làkk yi",
      state: "check",
      value: "English, German, Dutch (machine-translated). Wolof.",
    },
    {
      key: "hours",
      labelEn: "Opening hours",
      labelWo: "Waxtu liggéey",
      state: "needs_input",
      value: null,
    },
    {
      key: "phone",
      labelEn: "Phone number",
      labelWo: "Telefon",
      state: "needs_input",
      value: null,
    },
    {
      key: "photos",
      labelEn: "Photos (3 or more)",
      labelWo: "Nataal (3 walla yeneen)",
      state: "needs_input",
      value: null,
    },
  ];
  const ready = fields.filter((f) => f.state === "ready").length;
  const usesSample = Object.values(a).some((x) => x?.sample);
  const unapprovedTopics = Object.keys(TOPIC_CARD).filter((t) => !answered(a, t));
  return {
    fields,
    ready,
    total: fields.length,
    description,
    usesSample,
    approved: approvedCount,
    cardsTotal: Object.keys(TOPIC_CARD).length,
    unapprovedTopics,
  };
}

/** Cards Noor should record next: the ones that fill empty listing fields first, then the rest in the order the
 *  description uses them. Ascending, at most `max`. */
export function nextCards(p: ListingPack, max = 4): number[] {
  const wanted = [
    ...p.fields.filter((f) => f.state === "needs_input" && f.card).map((f) => f.card!),
    ...DESCRIPTION_ORDER.map(([t]) => t)
      .filter((t) => p.unapprovedTopics.includes(t))
      .map(cardOf),
  ];
  return [...new Set(wanted)].slice(0, max).sort((x, y) => x - y);
}
export const missingCards = nextCards;

/** Fields only the family helper can fill (no recorded answer can supply them). */
export const helperFields = (p: ListingPack): ListingField[] =>
  p.fields.filter((f) => f.state === "needs_input" && !f.card);

const ICON: Record<FieldState, string> = { ready: "✅", check: "📝", needs_input: "❌" };
const STATE_WO: Record<FieldState, string> = {
  ready: "paré",
  check: "seetal ko",
  needs_input: "ñaan nañu ko",
};
const STATE_EN: Record<FieldState, string> = {
  ready: "ready",
  check: "check it",
  needs_input: "needs input",
};

export const CLAIM_STEPS = bi(
  [
    "1. Dem ci business.google.com te nga ubbi sa Google account.",
    "2. Bind sa tur ak sa xeet (Tour operator).",
    "3. Tàbbal description bi, njekk bi, waxtu bi ak nataal yi.",
    "4. Google dina la laaj ngir wóorlu ko (telefon, SMS, email walla video).",
    "5. Teranga duñu ko yónnee Google: nit ñoo ko war a def.",
  ].join("\n"),
  [
    "Go to business.google.com and sign in with a Google account.",
    "Add your business name and category (Tour operator).",
    "Paste the description, price, hours and photos.",
    "Google will ask you to verify (phone, SMS, email or video).",
    "Teranga sends nothing to Google: a person must do it.",
  ].join("\n"),
);

/** WhatsApp message for the family helper: Wolof first, English small. Draft only, never published by Teranga. */
export function formatListingPack(p: ListingPack): string {
  const blocks: string[] = [
    `*Sa listing ci Google* _(Your Google listing, draft)_\n*Tontu yi nangu nañu: ${p.approved} ci ${p.cardsTotal}* _(Answers approved: ${p.approved} of ${p.cardsTotal})_\n*Listing: ${p.ready} ci ${p.total} paré* _(Listing: ${p.ready} of ${p.total} ready)_`,
    `✅ paré _(ready)_ · 📝 seetal ko _(check it)_ · ❌ ñaan nañu ko _(needs input)_\n` +
      p.fields.map((f) => `${ICON[f.state]} ${f.labelWo === f.labelEn ? f.labelWo : `${f.labelWo} _(${f.labelEn})_`}`).join("\n"),
  ];
  const cards = nextCards(p);
  if (cards.length) {
    const names = cards.map((c) => topicEn(Object.keys(TOPIC_CARD).find((k) => TOPIC_CARD[k] === c))).join(", ");
    blocks.push(`🎙️ ${sl(`Waxal kaartu ${cards.join(", ")} ci telefon`, `Record card ${cards.join(", ")} by phone call`)}\n_${names}_`);
  }
  const helper = helperFields(p);
  if (helper.length) blocks.push(`✍️ ${sl("Yaw rekk nga ko mën a def", "Only you can fill")}: ${helper.map((f) => f.labelWo).join(", ")}`);
  blocks.push(CLAIM_STEPS);
  if (p.usesSample) blocks.push("_(Built partly from Sample answers)_");
  blocks.push(UNVERIFIED_FOOTER);
  return blocks.join("\n\n");
}

/** The description alone, so it can be copied with one long-press. Null when no answer is approved yet. */
export const listingCopyText = (p: ListingPack): string | null =>
  p.description ? p.description : null;
