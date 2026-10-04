import { describe, expect, it } from "vitest";
import { W, bi, sl, topicWo, TOPIC_WO } from "@/lib/champion.templates";
import { formatPendingQueue, NO_PENDING_MSG } from "@/lib/review-queue";
import { STILL_PROCESSING } from "@/lib/approval";

const heard = () => "juni ak juróom téeméer dalasi (about 1500)";

describe("champion messages: Wolof first, English second", () => {
  it("bi puts Wolof first and English below, sl joins on one line", () => {
    expect(bi("wo", "en")).toBe("wo\n— en");
    expect(bi("wo", "en1\nen2")).toBe("wo\n\nEN:\nen1\nen2");
    expect(sl("wo", "en")).toBe("wo / en");
  });

  it("every question-card topic has a Wolof word", () => {
    for (const t of ["price", "meeting point", "duration", "what to bring", "children", "food", "safety", "whats included", "how to book", "cancellation"]) {
      expect(TOPIC_WO[t], t).toBeTruthy();
    }
    expect(topicWo("unknown topic")).toBe("unknown topic");
    expect(topicWo(null)).toBe("?");
  });

  it("review message keeps the English facts and adds Wolof labels, digits untouched", () => {
    const { text } = formatPendingQueue(
      [{ id: "a", transcript_src: "Njëg bi mooy 1500 dalasi", flags: ["machine-translated"], is_sample: false, position: 1, topic: "price" }],
      0, "unverified", heard);
    expect(text).toContain("Pending: 1.");
    expect(text).toContain(W.pending);
    expect(text).toContain("njekk / price");
    expect(text).toContain("1500");
    expect(text).toContain("1 approve, 2 re-record, 3 needs bilingual reviewer");
    expect(text.length).toBeLessThan(1500);
  });

  it("fixed messages are bilingual", () => {
    expect(NO_PENDING_MSG).toContain(W.noPending);
    expect(NO_PENDING_MSG).toContain("No pending answers");
    expect(STILL_PROCESSING).toContain(W.stillProcessing);
    expect(STILL_PROCESSING).toContain("Still processing");
  });

  it("command words stay exactly as the champion types them", () => {
    for (const cmd of ["START", "REVIEW", "DONE", "EXIT", "HELP"]) {
      expect(W.menu + W.help(1, 10) + W.roundHint).toContain(cmd);
    }
  });
});

describe("STOP is reserved by Twilio", () => {
  it("no champion-facing WhatsApp hint advertises STOP", async () => {
    const { ROUND_HINT, recordingHelpText } = await import("@/lib/champion-commands");
    const all = [ROUND_HINT, recordingHelpText(1, 10), W.roundHint, W.help(1, 10), W.menu].join("\n");
    expect(all).not.toMatch(/\bSTOP\b/);
  });
});
