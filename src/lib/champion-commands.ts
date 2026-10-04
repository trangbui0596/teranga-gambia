// Text commands that work during a recording round (pure, unit-tested).
export type RecordingCommand = "review" | "stop" | "help" | "digit" | null;

export function recordingCommand(upper: string, hasReviewItem: boolean): RecordingCommand {
  const u = upper.trim();
  if (u === "REVIEW") return "review";
  if (u === "STOP" || u === "DONE" || u === "EXIT") return "stop";
  if (u === "HELP" || u === "STATUS") return "help";
  if (hasReviewItem && /^[123]\b/.test(u)) return "digit";
  return null;
}

// NOT "STOP": Twilio's WhatsApp sandbox (and production opt-out handling) intercepts STOP and disconnects the user.
export const ROUND_HINT = "Send DONE when you are done, or REVIEW to review.";

export const roundStoppedText = (saved: number) =>
  `Round stopped. ${saved} answer${saved === 1 ? "" : "s"} saved. Send REVIEW to review them.`;

export const recordingHelpText = (n: number, total: number) =>
  [
    `Recording: question ${n} of ${total}. Send a voice note to answer it.`,
    "DONE = end the round (answers are kept)",
    "REVIEW = review answers",
    "1 / 2 / 3 = approve / re-record / bilingual reviewer (during review)",
    "HELP = this list",
  ].join("\n");
