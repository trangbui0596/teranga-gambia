// Pure formatting for the champion's REVIEW queue. Seeded sample answers
// (is_sample = true) are never shown or counted; real answers are oldest first.

export const NO_PENDING_MSG = "No pending answers from Noor's recordings.";

export type PendingItem = {
  id: string;
  transcript_src: string | null;
  flags: string[];
  is_sample: boolean;
  position?: number | null;
  topic?: string | null;
};

/** Build the REVIEW message. items must be oldest first; samples are dropped defensively. */
export function formatPendingQueue(items: PendingItem[], busy: number, wolofLabel: string, numbersHeard: (t: string | null) => string) {
  const list = items.filter((i) => !i.is_sample);
  const still = busy > 0 ? `\n\n${busy} still processing, send REVIEW again in a minute.` : "";
  const item = list[0];
  if (!item) {
    return { text: busy > 0 ? `No answers ready yet.${still}` : NO_PENDING_MSG, answerId: null as string | null };
  }
  const text = [
    `Pending: ${list.length}. Now: question ${item.position} (${item.topic})`,
    `Wolof transcript (${wolofLabel}):`,
    item.transcript_src ?? (item.flags.includes("processing") ? "[still processing]" : "[no transcript]"),
    `Numbers heard: ${numbersHeard(item.transcript_src)}`,
    `Flags: ${item.flags.length ? item.flags.join(", ") : "none"}`,
    "",
    "Reply 1 approve, 2 re-record, 3 needs bilingual reviewer",
  ].join("\n") + still;
  return { text, answerId: item.id as string | null };
}
