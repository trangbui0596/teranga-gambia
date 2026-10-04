// The speech recognizer sometimes returns a Wolof clip in Arabic or Cyrillic letters (it hears the sounds and picks another alphabet).
// The app cannot translate or show that, so a Wolof transcript that is mostly non-Latin counts as "not understood" and the recording is retried.
const NON_LATIN_LETTER = /(?!\p{Script=Latin})\p{L}/gu;

export function looksNonLatinScript(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return false;
  const other = text.match(NON_LATIN_LETTER)?.length ?? 0;
  return other >= 3 && other / letters > 0.5;
}

/** Kept for the earlier name. */
export const looksArabicScript = looksNonLatinScript;
