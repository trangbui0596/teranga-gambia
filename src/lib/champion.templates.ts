// Fixed champion-facing copy: Wolof first, English second. The champion may not read English (PRD), the English
// stays for the demo audience and for reviewers. NO runtime AI: only placeholders are filled in.
//
// UNVERIFIED Wolof: written by Claude (not a native speaker), checked by nobody. It needs native review before real use.
// Keep digits as digits. Keep command words (START, REVIEW, DONE, EXIT, HELP) exactly as typed by the champion.

/** Wolof words for the 10 question-card topics (DB topic names). */
export const TOPIC_WO: Record<string, string> = {
  price: "njekk",
  "meeting point": "barabu ndaje",
  duration: "waxtu bi mu yàgg",
  "what to bring": "li ngay indi",
  children: "xale",
  food: "ñam",
  safety: "kaarange",
  "whats included": "li ci bokk",
  "how to book": "naka lañuy booké",
  cancellation: "neenal",
};
export const topicWo = (topic?: string | null) => (topic && TOPIC_WO[topic]) || topic || "?";

/** Short label pair on one line: "Wolof / English". */
export const sl = (wo: string, en: string) => `${wo} / ${en}`;

/** Message pair: Wolof first, English second (below). */
export const bi = (wo: string, en: string) => (en.includes("\n") ? `${wo}\n\nEN:\n${en}` : `${wo}\n— ${en}`);

export const W = {
  menu: "Champion mode (demo shortcut).\nSTART = tambali laaj yi (10 laaj)\nREVIEW = seet tontu yi ñu wara seet\nEXIT = dellu ci visitor mode",
  wrongPin: "PIN bi jubul (demo shortcut).",
  visitorMode: "Visitor mode. Laajal lu mën ci tukki bi. EN, DE walla NL ngir soppi làkk.",
  roundHint: "Yónnee DONE boo jeexee, walla REVIEW ngir seet.",
  pleaseSend: (n: number) => `Yónnee kàddu (voice note) ngir laaj ${n}.`,
  gotQuestion: (n: number) => `Jot naa laaj ${n}`,
  roundComplete: "Jeex na",
  replyReview: "Yónnee REVIEW ngir seet tontu yi",
  stopped: (saved: number) => `Jeex na. ${saved} tontu denc nañu ko. Yónnee REVIEW ngir seet.`,
  help: (n: number, total: number) =>
    [`Léegi: laaj ${n} ci ${total}. Yónnee kàddu (voice note) ngir tontu ko.`,
      "DONE = jeexal (tontu yi dañuy des)", "REVIEW = seet tontu yi",
      "1 / 2 / 3 = nangu / waxaat ko / nit ku xam ñaar yi làkk (bu ñuy seet)", "HELP = lii"].join("\n"),
  approved: "Baax na: nangu nañu ko.",
  rerecord: "Waxaat ko ci kàddu.",
  bilingual: "Yónnee nañu ko ci nit ku xam ñaar yi làkk.",
  stillProcessing: "Mu ngi ci liggéey. Jéemaat ci benn minit.",
  noPending: "Amul tontu bu ñu wara seet.",
  noneReadyYet: "Amul tontu bu waaj.",
  busy: (n: number) => `${n} mu ngi ci liggéey. Yónnee REVIEW ci benn minit.`,
  pending: "Ñu ngi xaar",
  now: "Léegi",
  question: "laaj",
  wolofTranscript: "Li ñu dégg ci Wolof",
  numbersHeard: "Limu yi ñu dégg",
  flags: "Màndarga yi",
  reply: "Tontu",
  replyOptions: "1 = nangu, 2 = waxaat ko, 3 = nit ku xam ñaar yi làkk",
  heard: (n: number | string) => `Laaj ${n} dégg nañu ko`,
} as const;
