import { describe, expect, it } from "vitest";
import {
  isCarrierKeyword,
  SMS_OPT_OUT,
  approvalSms,
  coachSms,
  helpSms,
  listingSms,
  parseOperatorSms,
  smsSegments,
  stripWhatsAppMarkup,
  toGsm7,
  toSmsText,
  unknownSms,
  weeklyDigestSmsWo,
  withOptOut,
} from "@/lib/sms-text";
import { buildListingPack } from "@/lib/listing";
import type { StoredRun } from "@/lib/coach";

const GSM_OK = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]*$/;

const run = (over: Partial<StoredRun> = {}): StoredRun => ({
  place_ids: [],
  places_count: 24,
  reviews_count: 112,
  date_from: "2023-01-01",
  date_to: "2026-09-01",
  price_count: 0,
  price_min: null,
  price_max: null,
  price_currency: null,
  actions: [],
  api_calls: 30,
  api_errors: [],
  themes: [
    { theme: "guide_quality", sentiment: "positive", count: 41 },
    { theme: "wildlife", sentiment: "positive", count: 22 },
    { theme: "punctuality", sentiment: "negative", count: 9 },
    { theme: "price_value", sentiment: "negative", count: 6 },
  ],
  ...over,
});

describe("SMS text conversion", () => {
  it("keeps GSM letters, writes the rest plainly and drops emoji", () => {
    expect(toGsm7("Njekk/njariñ dégg")).toBe("Njekk/njariñ dégg"); // ñ and é are in the GSM alphabet
    expect(toGsm7("mën na wóor ŋaam")).toBe("men na woor ngaam");
    expect(toGsm7("🎙️ ✅ 1️⃣ Nangu ⚠️")).toBe("  1 Nangu ");
    expect(toGsm7("“quote” – dash … × ·")).toBe('"quote" - dash ... x -');
    expect(toGsm7("a|b [c] {d} ~ ^ €")).toBe("a/b (c) (d) -  EUR");
  });

  it("removes WhatsApp markup but never touches links", () => {
    expect(stripWhatsAppMarkup("*Tontu 1 ci 1* · _(Answer)_")).toBe("Tontu 1 ci 1 · (Answer)");
    expect(stripWhatsAppMarkup("Review: https://g.page/r/abc_def_ghi/review ok")).toContain(
      "https://g.page/r/abc_def_ghi/review",
    );
    expect(stripWhatsAppMarkup("snake_case stays")).toBe("snake_case stays");
  });

  it("counts SMS parts like a phone does", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("a".repeat(306))).toBe(2);
    expect(smsSegments("a".repeat(307))).toBe(3);
    expect(smsSegments("€".repeat(81))).toBe(2); // extension characters count twice
    expect(smsSegments("ë".repeat(71))).toBe(2); // not GSM: Unicode, 70 per part
    expect(smsSegments("")).toBe(0);
  });

  it("cuts long text at a line or word end and stays within the limit", () => {
    const long = Array.from({ length: 40 }, (_, i) => `line ${i} with some words`).join("\n");
    const out = toSmsText(long, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith("...")).toBe(true);
    expect(GSM_OK.test(out)).toBe(true);
  });

  it("always keeps the opt-out line, even when the body is long", () => {
    const out = withOptOut("x ".repeat(600));
    expect(out.endsWith(SMS_OPT_OUT)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(459);
  });
});

describe("coaching by SMS", () => {
  it("fits in three parts, in Wolof and English, with only GSM characters", () => {
    for (const lang of ["wo", "en"] as const) {
      const s = coachSms(run(), lang);
      expect(smsSegments(s), lang).toBeLessThanOrEqual(3);
      expect(GSM_OK.test(s), lang).toBe(true);
      expect(s.endsWith(SMS_OPT_OUT)).toBe(true);
      expect(s).not.toMatch(/[*_]/);
    }
  });

  it("states counts from the data and labels the Wolof as unverified", () => {
    const s = coachSms(run(), "wo");
    expect(s).toContain("112 xalaat ci 24 barab");
    expect(s).toContain("41 ci 112");
    expect(s).toMatch(/wooragul/);
    expect(coachSms(run(), "en")).toContain('Record or improve your "meeting point" answer.');
  });

  it("says so when there is too little data", () => {
    expect(coachSms(run({ reviews_count: 4, themes: [] }), "en")).toContain("Too few reviews");
    expect(coachSms(run({ reviews_count: 0, themes: [] }), "en")).toContain("No reviews yet.");
  });
});

describe("listing and receipts by SMS", () => {
  const none = buildListingPack({});
  const some = buildListingPack({
    price: { text: "The tour costs 1500 dalasi per adult.", sample: false },
    children: { text: "Children are welcome.", sample: false },
  });

  it("tells Noor the progress, the cards to record and what only the helper can add", () => {
    const s = listingSms(some, "en");
    expect(s).toContain("Answers approved: 2 of 10");
    expect(s).toMatch(/record card \d/);
    expect(s).toContain("business name");
    expect(smsSegments(s)).toBeLessThanOrEqual(3);
    expect(listingSms(none, "wo")).toContain("0 ci 10");
  });

  it("sends a receipt for an approved answer in Wolof first", () => {
    const s = approvalSms("price", some, "wo");
    expect(s).toContain('"Njekk" (kaartu 1) nangu nañu ko');
    expect(GSM_OK.test(s)).toBe(true);
    expect(approvalSms("price", some, "en")).toContain("was approved");
  });
});

describe("Noor's commands by SMS", () => {
  it("parses COACH, LISTING, WEEK and HELP, with EN for English", () => {
    expect(parseOperatorSms("coach")).toEqual({ cmd: "coach", lang: "wo" });
    expect(parseOperatorSms("  Coach  en ")).toEqual({ cmd: "coach", lang: "en" });
    expect(parseOperatorSms("LISTING")).toEqual({ cmd: "listing", lang: "wo" });
    expect(parseOperatorSms("week")).toEqual({ cmd: "week", lang: "wo" });
    expect(parseOperatorSms("HELP EN")).toEqual({ cmd: "help", lang: "en" });
  });

  it("ignores everything else, so a normal text is never mistaken for a command", () => {
    for (const t of [
      "",
      "hello",
      "coach more",
      "coach en please",
      "how much is the tour",
      "STOP",
      "START",
    ]) {
      expect(parseOperatorSms(t), t).toBeNull();
    }
  });

  it("help and unknown replies are short and keep the opt-out line", () => {
    for (const s of [helpSms("wo"), helpSms("en"), unknownSms("wo"), unknownSms("en")]) {
      expect(smsSegments(s)).toBeLessThanOrEqual(2);
      expect(s.endsWith(SMS_OPT_OUT)).toBe(true);
    }
  });
});

describe("weekly digest in Wolof by SMS", () => {
  it("shows counts only, never the visitors' English questions", () => {
    const s = weeklyDigestSmsWo(
      7,
      [
        { topic: "price", count: 3 },
        { topic: "children", count: 2 },
        { topic: "unanswered", count: 2 },
      ],
      2,
    );
    expect(s).toContain("7 laaj");
    expect(s).toContain("Njekk: 3. Xale: 2.");
    expect(s).toContain("Laaj yu amul tontu: 2");
    expect(smsSegments(s)).toBeLessThanOrEqual(2);
    expect(weeklyDigestSmsWo(0, [], 0)).toContain("amul laaj");
  });
});

describe("carrier keywords", () => {
  it("never answers STOP, START and the other opt-out or opt-in words", () => {
    for (const w of ["STOP", " stop ", "Unsubscribe", "START", "unstop", "CANCEL", "END", "QUIT", "STOPALL"]) expect(isCarrierKeyword(w), w).toBe(true);
    for (const w of ["COACH", "stop it", "start now", "HELP", ""]) expect(isCarrierKeyword(w), w).toBe(false);
  });
});
