import { describe, expect, it } from "vitest";
import { looksArabicScript, looksNonLatinScript } from "@/lib/script-guard";

describe("looksArabicScript", () => {
  it("flags a transcript written in Arabic script", () => {
    expect(looksArabicScript("توربٍ دفاعي يگنت واختو")).toBe(true);
  });
  it("accepts Latin-script Wolof", () => {
    expect(looksArabicScript("Dinanu daje ci Tanji Bridge")).toBe(false);
  });
  it("accepts empty text", () => {
    expect(looksArabicScript("")).toBe(false);
  });
  it("ignores a stray Arabic word in an otherwise Latin transcript", () => {
    expect(looksArabicScript("Njëg bi mooy junni dalasi سلام")).toBe(false);
  });
});

describe("looksNonLatinScript", () => {
  it("flags a Wolof transcript written in Cyrillic letters", () => {
    expect(looksNonLatinScript("Ньек би мой юниак юром тхемер Даласи.")).toBe(true);
  });
  it("accepts Latin Wolof with accents", () => {
    expect(looksNonLatinScript("Njëg bi mooy junni ak juróom téeméer dalasi.")).toBe(false);
  });
});
