import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, confirmationText, EVAL_MESSAGES } from "@/lib/agent.server";

const row = (flags: string[]) => ({
  id: "a1", transcript_src: "x", flags, is_sample: false,
  recordings: { questions: { position: 1, topic: "price" } },
});

describe("champion agent safeguards", () => {
  it("exposes exactly the fixed tool set", () => {
    expect([...AGENT_TOOLS].sort()).toEqual([
      "get_help", "get_week_stats", "list_pending_answers", "list_unanswered_questions",
      "set_review_status", "show_answer", "start_recording_round",
    ]);
  });
  it("confirmation asks for YES and warns on round-trip mismatch", () => {
    const t = confirmationText(row(["round-trip mismatch"]), "approved");
    expect(t).toContain("Reply YES");
    expect(t).toContain("round-trip mismatch");
    expect(confirmationText(row([]), "approved")).not.toContain("WARNING");
  });
  it("evaluation script has 15 messages, last two must call no tool", () => {
    expect(EVAL_MESSAGES).toHaveLength(15);
    expect(EVAL_MESSAGES.slice(-2).every((m) => m.expectNoTool)).toBe(true);
  });
});
