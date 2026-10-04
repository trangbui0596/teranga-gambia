// TEST DATA ONLY: sample strings, not real visitor reviews.
import { describe, expect, it } from "vitest";
import { guardCleanup, reviewLinkMessage, FEEDBACK_PROMPT, FEEDBACK_OPTIONS, CLEANUP_INSTRUCTIONS, NO_LINK } from "@/lib/feedback";

describe("visitor review safeguards", () => {
  it("never asks for a rating", () => {
    for (const s of [...Object.values(FEEDBACK_PROMPT), ...Object.values(FEEDBACK_OPTIONS)]) {
      expect(s).not.toMatch(/rate|rating|stars?\b|sterne|sterren|bewerten Sie|1-5|1 to 5/i);
    }
  });
  it("tells visitors the review is theirs and must be real", () => {
    expect(FEEDBACK_PROMPT.en).toMatch(/yours.*real experience/);
  });
  it("same link for everyone, Simulated placeholder when unset", () => {
    expect(reviewLinkMessage(undefined)).toBe(NO_LINK);
    expect(reviewLinkMessage("https://g.page/r/x")).toBe("https://g.page/r/x");
    expect(reviewLinkMessage.length).toBe(1); // takes no rating/sentiment argument
  });
  it("cleanup prompt forbids adding facts or changing sentiment", () => {
    expect(CLEANUP_INSTRUCTIONS).toMatch(/Do NOT add, remove or change/);
    expect(CLEANUP_INSTRUCTIONS).toMatch(/more positive or more negative/);
  });
  const raw = "um the tour with Noor was uh was good, we paid 1500 dalasi and saw Tanji";
  it("accepts a light clean-up", () => {
    const r = guardCleanup(raw, "The tour with Noor was good, we paid 1500 dalasi and saw Tanji.");
    expect(r.usedRaw).toBe(false);
  });
  it("falls back to raw when a number changes", () => {
    expect(guardCleanup(raw, "The tour with Noor was good, we paid 1200 dalasi and saw Tanji.").usedRaw).toBe(true);
  });
  it("falls back to raw when a name is added or dropped", () => {
    expect(guardCleanup(raw, "The tour with Noor and Lamin was good, we paid 1500 dalasi and saw Tanji.").usedRaw).toBe(true);
    expect(guardCleanup(raw, "The tour with Noor was good, we paid 1500 dalasi.").usedRaw).toBe(true);
  });
  it("falls back to raw when text is padded (e.g. made more positive)", () => {
    expect(guardCleanup(raw, "The tour with Noor was absolutely amazing and wonderful, truly the best ever, we paid 1500 dalasi and saw Tanji.").usedRaw).toBe(true);
  });
  it("falls back to raw on empty model output", () => {
    expect(guardCleanup(raw, "").text).toBe(raw);
  });
});

import { reviewStepsMessage, REVIEW_STEPS } from "@/lib/feedback";
describe("review steps message", () => {
  it("tells the visitor to post it themselves and gives the same link to everyone", () => {
    for (const l of ["en", "de", "nl"] as const) {
      const m = reviewStepsMessage(l, "https://g.page/r/x");
      expect(m).toContain(REVIEW_STEPS[l]);
      expect(m.endsWith("https://g.page/r/x")).toBe(true);
    }
    expect(reviewStepsMessage("en", undefined)).toContain(NO_LINK);
    expect(REVIEW_STEPS.en).toMatch(/Nothing is posted for you/);
    expect(reviewStepsMessage.length).toBe(2); // language and link only: no rating or sentiment input
  });
});
