import { describe, expect, it } from "vitest";
import {
  FOLLOWUP_INTRO,
  NOTIFY_HINT,
  NOTIFY_OK,
  channelOf,
  followupMessage,
  plainNumber,
} from "@/lib/followup";

describe("follow-up texts", () => {
  it("are in all three languages and promise to delete the number", () => {
    for (const l of ["en", "de", "nl"] as const) {
      expect(NOTIFY_HINT[l]).toContain("NOTIFY");
      expect(NOTIFY_OK[l].length).toBeGreaterThan(40);
      expect(FOLLOWUP_INTRO[l].length).toBeGreaterThan(10);
    }
    expect(NOTIFY_OK.en).toContain("delete");
  });
  it("quotes the visitor's question, then Noor's approved answer and the translation label", () => {
    const m = followupMessage(
      "en",
      "Do you do sunset trips?",
      "Yes, at 5 pm.",
      "Machine-translated",
    );
    expect(m).toContain("Noor has now answered your question: “Do you do sunset trips?”");
    expect(m).toContain("Yes, at 5 pm.");
    expect(m.endsWith("— Machine-translated")).toBe(true);
  });
  it("tells WhatsApp and SMS numbers apart", () => {
    expect(channelOf("whatsapp:+15550003333")).toBe("whatsapp");
    expect(channelOf("+15550003333")).toBe("sms");
    expect(plainNumber("whatsapp:+15550003333")).toBe("+15550003333");
  });
});
