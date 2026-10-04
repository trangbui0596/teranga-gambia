// Fixed champion-facing copy for WhatsApp: Wolof first, small English in italics next to it. The champion may not
// read English (PRD); the English helps the demo audience and reviewers. NO runtime AI: only placeholders are filled in.
//
// UNVERIFIED Wolof: written by Claude (not a native speaker), checked by nobody. It needs native review before real use.
// Keep digits as digits. Keep command words (START, REVIEW, DONE, EXIT, HELP) exactly as the champion types them.
// WhatsApp formatting: *bold*, _italic_. Never advertise STOP (Twilio intercepts it).

/** Wolof words for the 10 question-card topics (DB topic names). */
export const TOPIC_WO: Record<string, string> = {
  price: "Njekk",
  "meeting point": "Barabu ndaje",
  duration: "Waxtu bi mu yàgg",
  "what to bring": "Li ngay indi",
  children: "Xale",
  food: "Ñam",
  safety: "Kaarange",
  "whats included": "Li ci bokk",
  "how to book": "Naka lañuy booké",
  cancellation: "Neenal",
};
export const topicWo = (topic?: string | null) => (topic && TOPIC_WO[topic]) || topic || "?";
export const topicEn = (topic?: string | null) => {
  const t = topic ?? "?";
  return t.charAt(0).toUpperCase() + t.slice(1).replace("whats included", "what's included");
};

/** Small English gloss in italics: "wo _(en)_". */
export const sl = (wo: string, en: string) => `${wo} _(${en})_`;

/** Wolof line, English gloss on the next line. Multi-line texts with the same number of lines are interleaved line by line. */
export const bi = (wo: string, en: string) => {
  const w = wo.split("\n"), e = en.split("\n");
  if (w.length === e.length && w.length > 1) return w.map((line, i) => sl(line, e[i]!)).join("\n");
  return `${wo}\n_(${en})_`;
};

export const UNVERIFIED_FOOTER = "_Wolof bu masin tekki, wóoragul · Machine-translated Wolof, unverified_";

export const W = {
  menuTitle: "*Champion mode* · demo shortcut",
  menu: "START — tambali laaj yi\nREVIEW — seet tontu yi\nEXIT — dellu ci visitor mode",
  menuEn: "record the 10 questions\nreview answers\nback to visitor mode",
  wrongPin: "PIN bi jubul.",
  visitorMode: "*Visitor mode.* Laajal lu mën ci tukki bi. EN, DE walla NL ngir soppi làkk.",
  roundHint: "DONE = jeexal · REVIEW = seet",
  pleaseSend: (n: number) => `Yónnee kàddu (voice note) ngir laaj ${n}.`,
  gotQuestion: (n: number) => `✅ *Jot naa laaj ${n}*`,
  roundComplete: "*Jeex na.* Yónnee REVIEW ngir seet tontu yi.",
  stopped: (saved: number) => `✅ *Jeex na.* ${saved} tontu denc nañu ko. Yónnee REVIEW ngir seet.`,
  help: (n: number, total: number) =>
    [`Léegi: laaj ${n} ci ${total}. Yónnee kàddu (voice note).`,
      "DONE — jeexal (tontu yi dañuy des)", "REVIEW — seet tontu yi",
      "1 / 2 / 3 — nangu / waxaat ko / nit ku xam ñaar yi làkk", "HELP — lii"].join("\n"),
  approved: "✅ *Baax na* — nangu nañu ko.",
  rerecord: "🔁 *Waxaat ko* ci kàddu.",
  bilingual: "📨 Yónnee nañu ko ci nit ku xam ñaar yi làkk.",
  stillProcessing: "⏳ Mu ngi ci liggéey. Jéemaat ci benn minit.",
  noPending: "Amul tontu bu ñu wara seet.",
  noneReadyYet: "⏳ Amul tontu bu waaj.",
  busy: (n: number) => `⏳ ${n} mu ngi ci liggéey. Yónnee REVIEW ci benn minit.`,
  heard: (n: number | string) => `🎙️ *Laaj ${n} dégg nañu ko*`,
  heardLabel: "*Li ñu dégg ci Wolof*",
  numbersLabel: "🔢 *Limu yi*",
  confirm: "Wóorlul ko",
  reply: "*Tontu*",
  option1: "1️⃣ Nangu",
  option2: "2️⃣ Waxaat ko",
  option3: "3️⃣ Nit ku xam ñaar yi làkk",
} as const;
