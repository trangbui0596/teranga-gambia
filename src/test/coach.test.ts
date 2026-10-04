import { describe, expect, it } from "vitest";
import { buildActions, countThemes, formatCoach, isFresh, toStoredRun, verifiedPrices, MAX_MSG, MAX_MSG_WO, THEMES, type StoredRun } from "@/lib/coach";
import { getCoaching } from "@/lib/coach.server";
import { BACK_TRANSLATION_DRIFT_KEYS, COACH_TEMPLATES, THEME_TEMPLATES, TOPIC_TEMPLATES } from "@/lib/coach.templates";

// Test data only (hand-written labels, not real reviews).
const lab = (themes: Array<[string, string]>) => ({ themes: themes.map(([theme, sentiment]) => ({ theme, sentiment })), prices: [] });

const base = (over: Partial<StoredRun> = {}): StoredRun => ({
  place_ids: ["p1"], places_count: 3, reviews_count: 12, date_from: "2024-01-01", date_to: "2025-06-01",
  price_count: 0, price_min: null, price_max: null, price_currency: null, actions: [], api_calls: 9, api_errors: [],
  themes: [{ theme: "guide_quality", sentiment: "positive", count: 7 }], ...over,
});

describe("coach theme counting", () => {
  it("counts each theme once per review and ignores unknown themes", () => {
    const t = countThemes([
      lab([["guide_quality", "positive"], ["guide_quality", "positive"]]),
      lab([["guide_quality", "positive"], ["punctuality", "negative"]]),
      lab([["made_up", "positive"], ["food", "neutral"]]),
    ]);
    expect(t).toEqual([
      { theme: "guide_quality", sentiment: "positive", count: 2 },
      { theme: "punctuality", sentiment: "negative", count: 1 },
    ]);
  });
  it("keeps only prices literally in the text", () => {
    expect(verifiedPrices("We paid 1,500 dalasi", [{ amount: 1500, currency: "dalasi" }, { amount: 900, currency: "D" }]))
      .toEqual([{ amount: 1500, currency: "GMD" }]);
  });
});

describe("thin data rule", () => {
  it("under 10 reviews: warning and no actions", () => {
    expect(buildActions([{ theme: "price_value", sentiment: "negative", count: 3 }], 9)).toEqual([]);
    const [msg] = formatCoach(base({ reviews_count: 9, actions: [] }), "en");
    expect(msg).toContain("Not enough real review data to coach reliably (9 reviews from 3 places)");
    expect(msg).not.toContain("Actions:");
  });
  it("10+ reviews: actions tied to counts and topics; message has source, label, limits", () => {
    const a = buildActions([{ theme: "price_value", sentiment: "negative", count: 3 }], 12);
    expect(a[0]).toBe('Price/value: 3 of 12 reviews complain. Record or improve your "price" answer.');
    const [msg] = formatCoach(base({ actions: a }), "en");
    expect(msg).toContain("Source: Google Maps public reviews");
    expect(msg).toContain("may be wrong");
    expect(msg).toContain("not complete");
    expect(msg.length).toBeLessThanOrEqual(MAX_MSG);
  });
  it("no reviews: says so", () => {
    expect(formatCoach(base({ reviews_count: 0, themes: [] }), "en")[0]).toContain("returned no reviews");
  });
});

describe("fixed bilingual coaching templates", () => {
  const placeholders = (value: string) => [...value.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
  const digits = (value: string) => value.match(/\d+/g) ?? [];

  it("has Wolof and English with matching placeholders and digits for every template", () => {
    for (const template of Object.values(COACH_TEMPLATES)) {
      expect(template.wo).toBeTruthy();
      expect(template.en).toBeTruthy();
      expect(placeholders(template.wo)).toEqual(placeholders(template.en));
      expect(digits(template.wo)).toEqual(digits(template.en));
    }
    for (const theme of THEMES) {
      for (const sentiment of ["positive", "negative"] as const) {
        expect(THEME_TEMPLATES[theme].wo[sentiment]).toBeTruthy();
        expect(THEME_TEMPLATES[theme].en[sentiment]).toBeTruthy();
      }
    }
    for (const topic of Object.values(TOPIC_TEMPLATES)) {
      expect(topic.wo).toBeTruthy();
      expect(topic.en).toBeTruthy();
    }
    expect(BACK_TRANSLATION_DRIFT_KEYS).toEqual(["header", "source", "recordImprove", "ensureCovers", "notReady", "loadError"]);
  });

  it("renders identical data numbers under both language caps and labels Wolof", () => {
    const run = base({
      places_count: 15, reviews_count: 70, date_from: "2019-04-06", date_to: "2026-08-12",
      price_count: 4, price_min: 1500, price_max: 2500, price_currency: "GMD",
      themes: THEMES.map((theme, i) => ({ theme, sentiment: i % 2 ? "negative" as const : "positive" as const, count: 60 - i })),
      actions: ["legacy persisted action", "legacy persisted action", "legacy persisted action", "legacy persisted action", "legacy persisted action"],
    });
    const wo = formatCoach(run, "wo");
    const en = formatCoach(run, "en");
    for (const message of wo.filter((x): x is string => x !== null)) {
      expect(message.length).toBeLessThanOrEqual(MAX_MSG_WO);
      expect(message).toContain("Machine-translated Wolof, unverified");
    }
    for (const message of en.filter((x): x is string => x !== null)) expect(message.length).toBeLessThanOrEqual(MAX_MSG);
    const dataNumbers = [15, 70, 2019, 4, 6, 2026, 8, 12, 1500, 2500, ...run.themes.map((t) => t.count)];
    const joinedWo = wo.filter(Boolean).join("\n");
    const joinedEn = en.filter(Boolean).join("\n");
    for (const number of dataNumbers) {
      expect(joinedWo).toContain(String(number));
      expect(joinedEn).toContain(String(number));
    }
    expect(joinedWo).not.toContain("legacy persisted action");
    expect(joinedEn).not.toContain("legacy persisted action");
  });

  it("renders without calling AI", async () => {
    let calls = 0;
    const ai = async () => { calls++; return ""; };
    const cached = { ...base(), fetched_at: new Date().toISOString() };
    const store = { latest: async () => cached, save: async () => undefined };
    const result = await getCoaching(ai, 1000, store, undefined, true, "wo");
    expect(result.messages[0]).toContain("Wolof bu masin tekki, wóoragul");
    expect(calls).toBe(0);
  });
});

describe("no raw text stored", () => {
  it("toStoredRun keeps only whitelisted derived fields", () => {
    const dirty = { ...base(), reviews: [{ text: "SECRET REVIEW TEXT", author: "Jane" }] } as unknown as StoredRun;
    const s = JSON.stringify(toStoredRun(dirty));
    expect(s).not.toContain("SECRET REVIEW TEXT");
    expect(s).not.toContain("Jane");
  });
});

describe("cache", () => {
  it("fresh for 24 h, then refetched", async () => {
    expect(isFresh(new Date(Date.now() - 23 * 3600e3))).toBe(true);
    expect(isFresh(new Date(Date.now() - 25 * 3600e3))).toBe(false);
    let fetches = 0;
    let stored: (StoredRun & { fetched_at: string }) | null = null;
    const store = { latest: async () => stored, save: async (r: StoredRun) => { stored = { ...r, fetched_at: new Date().toISOString() }; } };
    const fetcher = async () => { fetches++; return base(); };
    const ai = async () => "";
    expect((await getCoaching(ai, 1000, store, fetcher)).cached).toBe(false);
    expect((await getCoaching(ai, 1000, store, fetcher)).cached).toBe(true);
    expect(fetches).toBe(1);
  });
});
