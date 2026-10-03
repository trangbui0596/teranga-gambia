// TEST DATA ONLY: invented topics and questions; no messages are sent.
import { describe, expect, it, vi } from "vitest";
import { callSummarySms, weeklyDigestSms, sendSmsWithFallback } from "@/lib/sms";

describe("Teranga A2P message formats", () => {
  it("formats the exact call summary", () => {
    expect(callSummarySms(7)).toBe("Teranga: Got 7 of 10 answers from your call. Your family helper will check them. Reply STOP to opt out.");
  });

  it("formats the digest with three topics and questions at most", () => {
    const body = weeklyDigestSms(6, [
      { topic: "price", count: 3 }, { topic: "duration", count: 2 }, { topic: "meeting", count: 1 }, { topic: "extra", count: 8 },
    ], [
      { text: "Can we meet at the market?", isSample: true },
      { text: "Are there benches?", isSample: false },
      { text: "Can children join?", isSample: false },
      { text: "Fourth question", isSample: false },
    ]);
    expect(body).toBe("Teranga weekly digest: 6 visitor questions in 7 days. price: 3. duration: 2. meeting: 1. Unanswered: Can we meet at the market? (Sample); Are there benches?; Can children join? Reply STOP to opt out, HELP for help.");
    expect(body).not.toContain("extra");
    expect(body).not.toContain("Fourth");
  });

  it("removes links, truncates questions and caps the whole digest strictly below 320", () => {
    const body = weeklyDigestSms(999999, [
      { topic: "A".repeat(200), count: 999 }, { topic: "B".repeat(200), count: 999 }, { topic: "C".repeat(200), count: 999 },
    ], Array.from({ length: 4 }, (_, i) => ({ text: `${"Q".repeat(100)} https://example.com/${i}`, isSample: true })));
    expect(body.length).toBeLessThan(320);
    expect(body).not.toMatch(/https?:|www\.|demo/i);
    expect(body).toContain("Reply STOP to opt out, HELP for help.");
    expect(weeklyDigestSms(0, [], [])).toBe("Teranga weekly digest: 0 visitor questions in 7 days. Unanswered: none. Reply STOP to opt out, HELP for help.");
  });
});

describe("one-time failed SMS fallback", () => {
  it("uses SMS only on success", async () => {
    const sms = vi.fn().mockResolvedValue(true), whatsapp = vi.fn(), log = vi.fn();
    expect(await sendSmsWithFallback("same", sms, whatsapp, log)).toEqual({ sent: true, channel: "sms" });
    expect(sms).toHaveBeenCalledOnce();
    expect(whatsapp).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("SMS"));
  });

  it("falls back exactly once for error 30034, then reports WhatsApp", async () => {
    const sms = vi.fn().mockRejectedValue(new Error("30034")), whatsapp = vi.fn().mockResolvedValue(true), log = vi.fn();
    expect(await sendSmsWithFallback("same", sms, whatsapp, log)).toEqual({ sent: true, channel: "whatsapp" });
    expect(sms).toHaveBeenCalledOnce();
    expect(whatsapp).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("WhatsApp"));
  });

  it("does not retry after fallback failure or bypass the outbound cap", async () => {
    const sms = vi.fn().mockRejectedValue(new Error("send error")), whatsapp = vi.fn().mockRejectedValue(new Error("send error"));
    expect(await sendSmsWithFallback("same", sms, whatsapp, vi.fn())).toEqual({ sent: false, channel: "none" });
    expect(whatsapp).toHaveBeenCalledOnce();
    whatsapp.mockClear();
    sms.mockResolvedValue(false);
    expect(await sendSmsWithFallback("same", sms, whatsapp, vi.fn())).toEqual({ sent: false, channel: "none" });
    expect(whatsapp).not.toHaveBeenCalled();
  });
});