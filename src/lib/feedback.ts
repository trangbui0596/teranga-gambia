// Pure helpers for visitor voice reviews (phase 2C). No I/O here, so they are unit-testable.
// Safeguards: no rating is ever asked; every visitor gets the same review link; text is only lightly cleaned.

export type FbLang = "en" | "de" | "nl";

export const FEEDBACK_PROMPT: Record<FbLang, string> = {
  en: "Send a voice note or text about your tour. Nothing is posted for you. The review is yours and must reflect your real experience.",
  de: "Senden Sie eine Sprachnachricht oder einen Text über Ihre Tour. Es wird nichts für Sie veröffentlicht. Die Bewertung gehört Ihnen und muss Ihre echte Erfahrung wiedergeben.",
  nl: "Stuur een spraakbericht of tekst over je tour. Er wordt niets voor je geplaatst. De review is van jou en moet je echte ervaring weergeven.",
};

export const FEEDBACK_OPTIONS: Record<FbLang, string> = {
  en: "Reply POST to get the review link, EDIT to say it again, or NO to delete it. (SHARE = let Noor read it too.)",
  de: "Antworten Sie POST für den Bewertungslink, EDIT um es neu zu sagen, oder NO um es zu löschen. (SHARE = Noor darf es auch lesen.)",
  nl: "Antwoord POST voor de reviewlink, EDIT om het opnieuw te zeggen, of NO om het te verwijderen. (SHARE = Noor mag het ook lezen.)",
};

export const FEEDBACK_DELETED: Record<FbLang, string> = {
  en: "Deleted. Nothing was kept.",
  de: "Gelöscht. Nichts wurde gespeichert.",
  nl: "Verwijderd. Er is niets bewaard.",
};

export const FEEDBACK_SHARED: Record<FbLang, string> = {
  en: "Thank you. Noor can now read your words.",
  de: "Danke. Noor kann Ihre Worte jetzt lesen.",
  nl: "Dank je. Noor kan je woorden nu lezen.",
};

export const FEEDBACK_EMPTY: Record<FbLang, string> = {
  en: "Sorry, I could not hear that. Please send it again, or NO to stop.",
  de: "Das konnte ich leider nicht verstehen. Bitte noch einmal senden, oder NO zum Abbrechen.",
  nl: "Sorry, dat kon ik niet verstaan. Stuur het opnieuw, of NO om te stoppen.",
};

export const NO_LINK = "[review link not set yet, Simulated]";

/** Same link text for every visitor: takes no rating or sentiment input by design. */
export function reviewLinkMessage(url: string | undefined | null): string {
  return url && /^https:\/\//.test(url) ? url : NO_LINK;
}

export const CLEANUP_INSTRUCTIONS = [
  "You lightly clean up a visitor's spoken tour review.",
  "Only: fix punctuation and capitalization, remove filler words (um, uh, äh, ehm) and accidental repeats.",
  "Do NOT add, remove or change any fact, number, name, place or opinion.",
  "Do NOT make it more positive or more negative. Do NOT summarize or translate. Keep the original language.",
  "Output only the cleaned text.",
].join("\n");

const numbers = (s: string) => (s.match(/\d+(?:[.,:]\d+)?/g) ?? []).map((n) => n.replace(",", ".")).sort();
// Capitalized words not at the start of a sentence: rough proxy for names/places.
const names = (s: string) => {
  const out = new Set<string>();
  const re = /(?<![.!?]\s|^)(?<=\s)(\p{Lu}[\p{L}'-]+)/gu;
  for (const m of s.matchAll(re)) out.add(m[1]!.toLowerCase());
  return out;
};

/** Returns the cleaned text if it is safe, otherwise the raw transcript. */
export function guardCleanup(raw: string, cleaned: string | null | undefined): { text: string; usedRaw: boolean; reason?: string } {
  const r = raw.trim();
  const c = (cleaned ?? "").trim();
  if (!c) return { text: r, usedRaw: true, reason: "empty" };
  if (numbers(r).join("|") !== numbers(c).join("|")) return { text: r, usedRaw: true, reason: "numbers" };
  const rawLower = r.toLowerCase();
  for (const n of names(c)) if (!rawLower.includes(n)) return { text: r, usedRaw: true, reason: `name:${n}` };
  for (const n of names(r)) if (!c.toLowerCase().includes(n)) return { text: r, usedRaw: true, reason: `name-missing:${n}` };
  const ratio = c.length / Math.max(1, r.length);
  if (ratio > 1.1 || ratio < 0.5) return { text: r, usedRaw: true, reason: "length" };
  return { text: c, usedRaw: false };
}
