import { describe, it, expect } from "vitest";
import { formatPendingQueue, NO_PENDING_MSG, type PendingItem } from "@/lib/review-queue";

const heard = (t: string | null) => (t ? t : "none found");
const item = (id: string, sample: boolean, extra: Partial<PendingItem> = {}): PendingItem => ({
  id, transcript_src: "wolof text " + id, flags: [], is_sample: sample, position: 5, topic: "children", ...extra,
});

describe("champion review queue", () => {
  it("never lists or counts seeded sample answers", () => {
    const { text, answerId } = formatPendingQueue([item("s1", true), item("s2", true), item("r1", false)], 0, "unverified", heard);
    expect(answerId).toBe("r1");
    expect(text).toContain("Answer 1 of 1");
    expect(text).not.toContain("Sample");
    expect(text).not.toContain("s1");
  });

  it("keeps real answers oldest first", () => {
    const { answerId, text } = formatPendingQueue([item("old", false), item("new", false)], 0, "unverified", heard);
    expect(answerId).toBe("old");
    expect(text).toContain("Answer 1 of 2");
  });

  it("says no pending answers without mentioning samples", () => {
    const { text, answerId } = formatPendingQueue([item("s1", true)], 0, "unverified", heard);
    expect(answerId).toBeNull();
    expect(text).toBe(NO_PENDING_MSG);
    expect(text.toLowerCase()).not.toContain("sample");
  });

  it("reports still-processing count when nothing is ready", () => {
    const { text, answerId } = formatPendingQueue([], 2, "unverified", heard);
    expect(answerId).toBeNull();
    expect(text).toContain("2 still processing");
  });
});
