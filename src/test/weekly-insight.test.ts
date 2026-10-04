import { describe, expect, it } from "vitest";
import {
  actionText,
  formatWeeklyReport,
  reviewShifts,
  weeklyInsight,
  weeklyInsightSms,
} from "@/lib/weekly-insight";
import { smsSegments } from "@/lib/sms-text";
import type { StoredRun } from "@/lib/coach";

const run = (reviews: number, themes: StoredRun["themes"]): StoredRun => ({
  place_ids: [],
  places_count: 20,
  reviews_count: reviews,
  date_from: null,
  date_to: null,
  price_count: 0,
  price_min: null,
  price_max: null,
  price_currency: null,
  actions: [],
  api_calls: 0,
  api_errors: [],
  themes,
});
const prev = run(100, [
  { theme: "punctuality", sentiment: "negative", count: 5 },
  { theme: "guide_quality", sentiment: "positive", count: 40 },
]);
const now = run(100, [
  { theme: "punctuality", sentiment: "negative", count: 14 },
  { theme: "guide_quality", sentiment: "positive", count: 42 },
]);

describe("review shifts", () => {
  it("reports only share changes of at least 5 points between two runs with enough reviews", () => {
    const s = reviewShifts(now, prev);
    expect(s).toEqual([{ theme: "punctuality", sentiment: "negative", before: 5, now: 14 }]);
    expect(reviewShifts(now, null)).toEqual([]);
    expect(reviewShifts(run(4, now.themes), prev)).toEqual([]);
  });
});

describe("weekly insight", () => {
  const v = {
    total: 12,
    byTopic: { "meeting point": 6, price: 3, children: 2, unanswered: 1 },
    unanswered: 1,
    notClear: 2,
  };

  it("links what visitors ask to what reviews complain about, and counts gaps", () => {
    const i = weeklyInsight(v, now, prev);
    expect(i.asked[0]).toEqual({ topic: "meeting point", count: 6 });
    expect(i.asked.map((a) => a.topic)).not.toContain("unanswered");
    expect(i.actions[0]).toEqual({
      kind: "asked_and_complained",
      topic: "meeting point",
      asked: 6,
      complaints: 14,
    });
    expect(i.actions.map((a) => a.kind)).toContain("answer_gap");
    expect(i.actions.length).toBeLessThanOrEqual(3);
  });

  it("says nothing it cannot back: no reviews and no visitors gives no actions", () => {
    const i = weeklyInsight({ total: 0, byTopic: {}, unanswered: 0, notClear: 0 }, null, null);
    expect(i.actions).toEqual([]);
    expect(formatWeeklyReport(i)).toContain("No visitor questions this week");
    expect(formatWeeklyReport(i)).toContain("No new action");
  });

  it("the household champion's report is Wolof first with English glosses and the unverified footer", () => {
    const t = formatWeeklyReport(weeklyInsight(v, now, prev));
    expect(t).toContain("Li nu jàng ayubés bi");
    expect(t).toContain("*12*");
    expect(t).toContain("Tegg ci waxtu (ñaxtu) _(Punctuality (complaint))_: 5% → 14%");
    expect(t).toContain("unverified");
  });

  it("Noor's SMS is short, GSM-only and keeps the opt-out line", () => {
    for (const lang of ["wo", "en"] as const) {
      const s = weeklyInsightSms(weeklyInsight(v, now, prev), lang);
      expect(smsSegments(s)).toBeLessThanOrEqual(3);
      expect(s).toContain("Reply STOP to opt out.");
      expect(s).toMatch(/12/);
    }
    expect(actionText({ kind: "unclear", n: 2 }).en).toContain("2 visitors");
  });
});
