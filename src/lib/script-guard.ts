// Wolof can be written in Arabic script, and the speech recognizer sometimes returns it for a clip we asked it to hear as Wolof.
// The app cannot translate or show that, so a Wolof transcript in Arabic script counts as "not understood", and the recording is retried.
const ARABIC_LETTER = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g;

export function looksArabicScript(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return false;
  const arabic = text.match(ARABIC_LETTER)?.length ?? 0;
  return arabic >= 3 && arabic / letters > 0.5;
}
