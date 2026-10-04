/** Pure Twilio Voice call flow: which card positions are asked, and the TwiML for each step. No I/O. */
export const DEFAULT_CALL_POSITIONS = [1, 5];

const SPOKEN_ORDINAL = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** Short spoken labels per card position (English for the demo audience). */
const SPOKEN_TOPIC: Record<number, string> = {
  1: "Price", 2: "Meeting point", 3: "Duration", 4: "What to bring", 5: "Children",
  6: "Food", 7: "Safety", 8: "What is included", 9: "How to book", 10: "Cancellation",
};

/** Parses CALL_QUESTION_POSITIONS ("1,5"): unique card positions 1..10, at most 10; invalid -> default. */
export function parseCallPositions(raw: string | undefined | null): number[] {
  if (!raw || !raw.trim()) return [...DEFAULT_CALL_POSITIONS];
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n < 1 || n > 10) return [...DEFAULT_CALL_POSITIONS];
    if (!out.includes(n)) out.push(n);
  }
  return out.length ? out.slice(0, 10) : [...DEFAULT_CALL_POSITIONS];
}

export function wrapTwiml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

/** TwiML body for call step `step` (1-based index into positions). */
export function questionTwimlBody(step: number, positions: number[], opts: { greet?: boolean; retry?: boolean } = {}) {
  const position = positions[step - 1];
  const r = opts.retry ? 1 : 0;
  const action = `/api/public/voice-recorded?n=${step}&amp;r=${r}`;
  // Demo only: English words for the audience. Real Noor would hear a recorded Wolof prompt (<Play>) instead.
  const spoken = `Question ${SPOKEN_ORDINAL[step - 1]}. ${SPOKEN_TOPIC[position] ?? ""}.`;
  return [
    opts.greet ? `<Say>Hello Noor. Answer each question after the beep, then press hash.</Say><Pause length="1"/>` : "",
    opts.retry ? `<Say>Please answer again.</Say>` : "",
    `<Say voice="Polly.Joanna"><prosody rate="slow">${spoken}</prosody></Say>`,
    `<Pause length="2"/>`,
    `<Record playBeep="true" timeout="8" maxLength="60" finishOnKey="#" action="${action}" method="POST"/>`,
    // Reached only when nothing was recorded: Twilio skips the action and continues here.
    `<Redirect method="POST">${action}&amp;empty=1</Redirect>`,
  ].join("");
}

export const GOODBYE_TWIML_BODY = `<Say>Thank you. Your answers were saved. Goodbye.</Say><Hangup/>`;
