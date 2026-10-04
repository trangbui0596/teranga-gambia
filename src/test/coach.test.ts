import { describe, expect, it } from "vitest";
import { buildActions, countThemes, formatCoach, isFresh, toStoredRun, verifiedPrices, MAX_MSG, type StoredRun } from "@/lib/coach";
import { getCoaching } from "@/lib/coach.server";

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
    const [msg] = formatCoach(base({ reviews_count: 9, actions: [] }));
    expect(msg).toContain("Not enough real review data to coach reliably (9 reviews from 3 places)");
    expect(msg).not.toContain("Actions:");
  });
  it("10+ reviews: actions tied to counts and topics; message has source, label, limits", () => {
    const a = buildActions([{ theme: "price_value", sentiment: "negative", count: 3 }], 12);
    expect(a[0]).toBe('Price/value: 3 of 12 reviews complain. Record or improve your "price" answer.');
    const [msg] = formatCoach(base({ actions: a }));
    expect(msg).toContain("Source: Google Maps public reviews");
    expect(msg).toContain("may be wrong");
    expect(msg).toContain("not complete");
    expect(msg.length).toBeLessThanOrEqual(MAX_MSG);
  });
  it("no reviews: says so", () => {
    expect(formatCoach(base({ reviews_count: 0, themes: [] }))[0]).toContain("returned no reviews");
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
