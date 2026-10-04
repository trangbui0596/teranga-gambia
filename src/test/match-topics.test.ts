import { describe, it, expect, vi } from "vitest";
import { matchQuestion, CONFIDENCE_THRESHOLD } from "@/lib/match";
import { gateApproval } from "@/lib/approval";

const TOPICS = ["price", "meeting point", "duration", "what to bring", "children", "food", "safety", "whats included", "how to book", "cancellation"];
const mk = (topic: string, is_sample: boolean, id = `${is_sample ? "s" : "r"}-${topic}`) => ({ id, is_sample, recordings: { questions: { topic } } });
const samples = TOPICS.map((t) => mk(t, true));

describe("matcher topics", () => {
  it.each([
    ["How much does it cost?", "price"], ["Wie viel kostet die Tour?", "price"], ["Hoeveel kost het?", "price"],
    ["Where do we meet?", "meeting point"], ["Can kids come?", "children"],
    ["How long is the tour?", "duration"], ["Can I cancel and get a refund?", "cancellation"], ["Is it safe?", "safety"],
  ])("%s -> %s", (q, topic) => {
    const r = matchQuestion(q, samples);
    expect(r.answer?.recordings.questions.topic).toBe(topic);
    expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
  it("prefers real over sample for the same topic (no tie)", () => {
    const r = matchQuestion("How much does it cost?", [mk("price", true), mk("price", false), mk("children", true)]);
    expect(r.answer?.id).toBe("r-price");
    expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
  it("uses sample when no real answer exists", () => {
    expect(matchQuestion("How much does it cost?", samples).answer?.id).toBe("s-price");
  });
  it("still says not sure for unrelated text", () => {
    expect(matchQuestion("Tell me a joke", samples).answer).toBeNull();
  });
});

describe("approval gate", () => {
  it("refuses while untranslated after one finish attempt", async () => {
    const finish = vi.fn(async () => {});
    const ok = await gateApproval("a", { load: async () => ({ stage: "transcribed", english: null, german: null, dutch: null }), finish }, 10);
    expect(ok).toBe(false); expect(finish).toHaveBeenCalledTimes(1);
  });
  it("approves after finish completes translation", async () => {
    let row = { stage: "transcribed", english: null as string | null, german: null as string | null, dutch: null as string | null };
    const ok = await gateApproval("a", { load: async () => row, finish: async () => { row = { stage: "checked", english: "e", german: "d", dutch: "n" }; } });
    expect(ok).toBe(true);
  });
  it("skips finish when already processed", async () => {
    const finish = vi.fn(async () => {});
    expect(await gateApproval("a", { load: async () => ({ stage: "checked", english: "e", german: "d", dutch: "n" }), finish })).toBe(true);
    expect(finish).not.toHaveBeenCalled();
  });
});

describe("tie-break and pickup wording", () => {
  it.each([
    ["Can we bring our kids?", "children"],
    ["Can you pick us up from our hotel?", "meeting point"],
    ["What should I bring with me?", "what to bring"],
    ["Is it ok to bring a baby?", "children"],
  ])("%s -> %s", (q, topic) => {
    const r = matchQuestion(q, samples);
    expect(r.answer?.recordings.questions.topic).toBe(topic);
    expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
  it("still unsure when two topics tie on non-generic words", () => {
    // 'safe' (safety) and 'lunch' (food) both strong, one each: never guess
    expect(matchQuestion("Is lunch safe?", samples).answer).toBeNull();
  });
});
