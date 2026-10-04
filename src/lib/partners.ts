// Pure helpers for phase 2E (scripted partner recommendation) and 2F (draft listing). Both are SIMULATED demos.

import type { Lang } from "./pipeline";

export type Fit = "nature" | "culture" | "food";
export const FIT_BY_CHOICE: Record<string, Fit> = { "1": "nature", "2": "culture", "3": "food" };

export const MORE_ASK =
  "Do you prefer nature, culture or food? Reply 1, 2 or 3 and YES to allow us to suggest a partner (opt-in). Example: 1 YES. (Simulated)";

// Visitor-facing copy in the visitor's language (machine-written German and Dutch, like every other visitor message).
const MORE_ASK_L: Record<Lang, string> = {
  en: MORE_ASK,
  de: "Bevorzugen Sie Natur, Kultur oder Essen? Antworten Sie 1, 2 oder 3 und YES, damit wir einen Partner vorschlagen dürfen (Opt-in). Beispiel: 1 YES. (Simuliert)",
  nl: "Heb je liever natuur, cultuur of eten? Antwoord 1, 2 of 3 en YES zodat we een partner mogen voorstellen (opt-in). Voorbeeld: 1 YES. (Gesimuleerd)",
};
export const moreAsk = (l: Lang = "en") => MORE_ASK_L[l];

const NO_OPT_IN_L: Record<Lang, string> = {
  en: "No suggestion made (no opt-in). (Simulated)",
  de: "Kein Vorschlag (kein Opt-in). (Simuliert)",
  nl: "Geen suggestie (geen opt-in). (Gesimuleerd)",
};
export const noOptIn = (l: Lang = "en") => NO_OPT_IN_L[l];

const CONNECT_NOTED_L: Record<Lang, string> = {
  en: "Noted (Simulated). Noor or the champion will pass on the contact. Your number is not shared automatically. No payment involved.",
  de: "Notiert (simuliert). Noor oder die Vertrauensperson gibt den Kontakt weiter. Ihre Nummer wird nicht automatisch geteilt. Keine Bezahlung.",
  nl: "Genoteerd (gesimuleerd). Noor of de vertrouwenspersoon geeft het contact door. Je nummer wordt niet automatisch gedeeld. Geen betaling.",
};
export const connectNoted = (l: Lang = "en") => CONNECT_NOTED_L[l];

const FIT_LABEL: Record<Lang, Record<Fit, string>> = {
  en: { nature: "nature", culture: "culture", food: "food" },
  de: { nature: "Natur", culture: "Kultur", food: "Essen" },
  nl: { nature: "natuur", culture: "cultuur", food: "eten" },
};

export type Partner = { id: string; name: string; tour_type: string; fit: string; language_support: string[] };

/** Round-robin: among partners that fit, the one with the fewest ledger entries this month; ties by name. */
export function pickPartner(partners: Partner[], countsThisMonth: Record<string, number>, fit: Fit): Partner | null {
  const fitting = partners.filter((p) => p.fit === fit);
  if (!fitting.length) return null;
  return [...fitting].sort((a, b) => (countsThisMonth[a.id] ?? 0) - (countsThisMonth[b.id] ?? 0) || a.name.localeCompare(b.name))[0]!;
}

export function suggestionText(p: Partner | null, l: Lang = "en"): string {
  if (!p) {
    return { en: "Simulated: no partner fits that choice yet. Nothing was shared.", de: "Simuliert: Dazu passt noch kein Partner. Es wurde nichts geteilt.", nl: "Gesimuleerd: daar past nog geen partner bij. Er is niets gedeeld." }[l];
  }
  const langs = p.language_support.map((x) => x.toUpperCase()).join(", ");
  const fit = FIT_LABEL[l][p.fit as Fit] ?? p.fit;
  if (l === "de") {
    return [
      `Vorschlag (simulierter Partner): ${p.name}, ${p.tour_type}. Sprachen: ${langs}. Passt zu: ${fit}.`,
      "Keine Bezahlung. Ihre Nummer wird mit niemandem geteilt.",
      "Antworten Sie CONNECT, wenn Noor oder die Vertrauensperson den Kontakt weitergeben soll.",
    ].join("\n");
  }
  if (l === "nl") {
    return [
      `Suggestie (gesimuleerde partner): ${p.name}, ${p.tour_type}. Talen: ${langs}. Past bij: ${fit}.`,
      "Geen betaling. Je nummer wordt met niemand gedeeld.",
      "Antwoord CONNECT als Noor of de vertrouwenspersoon het contact mag doorgeven.",
    ].join("\n");
  }
  return [
    `Suggestion (Simulated partner): ${p.name}, ${p.tour_type}. Languages: ${langs}. Fits: ${fit}.`,
    "No payment involved. Your number is not shared with anyone.",
    "Reply CONNECT if you want Noor or the champion to pass on the contact.",
  ].join("\n");
}

export type ApprovedByTopic = Record<string, string | undefined>;
const NI = "needs input";

/** Draft listing from APPROVED answers only. Never invents: missing fields read "needs input". */
export function buildListing(a: ApprovedByTopic): string {
  const f = (t: string) => a[t]?.trim() || NI;
  return [
    "DRAFT, Simulated: not published to Google. A person must submit and verify it.",
    "",
    "Business name: [Noor's tour name]",
    "Category: Tour operator",
    `Short description: ${NI}`,
    `Services / what's included: ${f("whats included")}`,
    `Meeting point: ${f("meeting point")}`,
    `Duration: ${f("duration")}`,
    `Price range: ${f("price")}`,
    "Languages offered: English, German, Dutch (machine-translated)",
    `How to book: ${f("how to book")}`,
    `Hours: ${NI}`,
    "",
    "To claim for real: the owner signs in at business.google.com, adds or claims the business, and verifies it",
    "(Google chooses the method: phone, SMS, email, video or postcard). Nothing is sent to Google from here.",
  ].join("\n");
}

/** Champion view of the referral ledger. connectRequests = visitors who asked for the contact to be passed on. */
export function ledgerText(rows: Array<{ name: string; received: number }>, given: number, connectRequests = 0): string {
  return [
    "LEDGER (Simulated, this month, no money involved)",
    `Given by Noor: ${given}`,
    ...rows.map((r, i) => `${i + 1}. ${r.name}: received ${r.received}`),
    ...(connectRequests > 0
      ? ["", `Contact requests waiting: ${connectRequests}. A person passes on the contact; nothing is shared automatically.`]
      : []),
  ].join("\n");
}
