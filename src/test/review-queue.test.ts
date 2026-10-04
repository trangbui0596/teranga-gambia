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

import { formatReviewSms } from "@/lib/review-queue";
import { smsSegments } from "@/lib/sms-text";
describe("review card by SMS", () => {
  const base = { index: 1, total: 3, topic: "price", numbers: "yuñi ak juróom teemeer (about 1500) + dalasi", flags: ["machine-translated", "wolof unverified"] };
  it("has the Wolof transcript, the numbers and the three choices, in at most three parts", () => {
    const t = formatReviewSms({ ...base, transcript: "yuñi ak juróom teemeer daala sii" });
    expect(t).toContain("1/3 Njekk");
    expect(t).toContain("yuñi ak juroom teemeer daala sii"); // ó is written o on a feature phone
    expect(t).toContain("Limu: yuñi ak juroom teemeer (about 1500) + dalasi");
    expect(t).toContain("1 Nangu, 2 Waxaat ko, 3 Nit ku xam");
    expect(t).not.toMatch(/[*_]|🎙|1️⃣/);
    expect(smsSegments(t)).toBeLessThanOrEqual(3);
  });
  it("shortens a very long transcript but never the choices", () => {
    const t = formatReviewSms({ ...base, transcript: "waxtu ".repeat(300) });
    expect(t.length).toBeLessThanOrEqual(459);
    expect(t).toContain("...");
    expect(t).toContain("1 Nangu, 2 Waxaat ko");
  });
});
