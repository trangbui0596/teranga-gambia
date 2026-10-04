import { describe, expect, it } from "vitest";
import { weeklyDigestWhatsApp } from "@/lib/digest.templates";

describe("weekly digest (WhatsApp, Wolof first)", () => {
  it("shows counts, Wolof topic with English gloss, and the unverified footer", () => {
    const t = weeklyDigestWhatsApp(5, [{ topic: "price", count: 3 }, { topic: "children", count: 2 }], [], 0);
    expect(t).toContain("Xibaar ayubés bi");
    expect(t).toContain("*5*");
    expect(t).toContain("Njekk _(Price)_: *3*");
    expect(t).toContain("Xale _(Children)_: *2*");
    expect(t).toContain("unverified");
    expect(t).not.toContain("Unanswered");
  });
  it("lists unanswered questions, strips links, marks samples, and says what to do", () => {
    const t = weeklyDigestWhatsApp(2, [{ topic: "unanswered", count: 2 }], [
      { text: "Do you do night tours? https://x.example/y", isSample: false },
      { text: "Sample question", isSample: true },
    ]);
    expect(t).toContain("Laaj yu amul tontu _(Unanswered)_");
    expect(t).toContain("“Do you do night tours?”");
    expect(t).not.toMatch(/https?:/);
    expect(t).toContain("“Sample question” _(Sample)_");
    expect(t).toContain("Record new answers for these");
  });
  it("handles an empty week without inventing anything", () => {
    const t = weeklyDigestWhatsApp(0, [], []);
    expect(t).toContain("No visitor questions this week.");
    expect(t).not.toMatch(/\*0\*|•/);
  });
  it("labels simulated partner suggestions and shows only the top 3 topics", () => {
    const t = weeklyDigestWhatsApp(10, [{ topic: "price", count: 4 }, { topic: "food", count: 3 }, { topic: "safety", count: 2 }, { topic: "duration", count: 1 }], [], 2);
    expect(t).toContain("(Simulated)");
    expect(t).not.toContain("Waxtu bi mu yàgg");
  });
});
