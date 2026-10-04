import { describe, expect, it } from "vitest";
import { looksArabicScript } from "@/lib/script-guard";

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
