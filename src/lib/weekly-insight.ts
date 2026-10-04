// Weekly sync: what visitors asked and said this week, plus how the public reviews moved since the last run, turned
// into a few plain coaching actions. Pure functions over counts, no I/O, no AI, no review text: every line traces back
// to a number. UNVERIFIED Wolof: written by Claude, not checked by a native speaker (see champion.templates.ts).
import { MIN_REVIEWS, THEME_TOPIC, type Sentiment, type StoredRun, type Theme } from "./coach";
import { THEME_TEMPLATES } from "./coach.templates";
import { UNVERIFIED_FOOTER, sl, topicEn, topicWo } from "./champion.templates";
import { withOptOut } from "./sms-text";

export type WeekVisitors = {
  /** Visitor questions in the last 7 days, and how many of them per matched topic. */
  total: number;
  byTopic: Record<string, number>;
  /** Questions nobody could answer, and answers a visitor marked "not clear". */
  unanswered: number;
  notClear: number;
};

export type Shift = { theme: Theme; sentiment: Sentiment; before: number; now: number };
export type Action =
  | { kind: "asked_and_complained"; topic: string; asked: number; complaints: number }
  | { kind: "answer_gap"; n: number }
  | { kind: "unclear"; n: number }
  | { kind: "rising_complaint"; shift: Shift };

export type Insight = {
  total: number;
  asked: Array<{ topic: string; count: number }>;
  unanswered: number;
  notClear: number;
  shifts: Shift[];
  actions: Action[];
  hasReviews: boolean;
};

/** A share has to move by this many percentage points, in two runs with enough reviews, to count as a shift. */
export const SHIFT_POINTS = 5;
const norm = (t: string) => t.replace(/['’]/g, "");
const pct = (c: number, n: number) => Math.round((c / n) * 100);

/** Review themes whose share of reviews moved by at least SHIFT_POINTS since the previous run (largest first). */
export function reviewShifts(run: StoredRun | null, prev: StoredRun | null): Shift[] {
  if (!run || !prev || run.reviews_count < MIN_REVIEWS || prev.reviews_count < MIN_REVIEWS)
    return [];
  const before = new Map(prev.themes.map((t) => [`${t.theme}|${t.sentiment}`, t.count] as const));
  return run.themes
    .map((t) => ({
      theme: t.theme,
      sentiment: t.sentiment,
      before: pct(before.get(`${t.theme}|${t.sentiment}`) ?? 0, prev.reviews_count),
      now: pct(t.count, run.reviews_count),
    }))
    .filter((s) => Math.abs(s.now - s.before) >= SHIFT_POINTS)
    .sort((a, b) => Math.abs(b.now - b.before) - Math.abs(a.now - a.before))
    .slice(0, 3);
}

export function weeklyInsight(
  v: WeekVisitors,
  run: StoredRun | null,
  prev: StoredRun | null,
): Insight {
  const asked = Object.entries(v.byTopic)
    .filter(([t]) => t !== "unanswered")
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, 3);
  const shifts = reviewShifts(run, prev);
  const actions: Action[] = [];
  // 1. Visitors keep asking about something the public reviews complain about: the strongest signal.
  for (const a of asked) {
    const complaints =
      run?.themes
        .filter(
          (t) =>
            t.sentiment === "negative" &&
            THEME_TOPIC[t.theme] &&
            norm(THEME_TOPIC[t.theme]!) === norm(a.topic),
        )
        .reduce((n, t) => n + t.count, 0) ?? 0;
    if (complaints > 0)
      actions.push({ kind: "asked_and_complained", topic: a.topic, asked: a.count, complaints });
  }
  if (v.unanswered > 0) actions.push({ kind: "answer_gap", n: v.unanswered });
  if (v.notClear > 0) actions.push({ kind: "unclear", n: v.notClear });
  for (const s of shifts)
    if (s.sentiment === "negative" && s.now > s.before)
      actions.push({ kind: "rising_complaint", shift: s });
  return {
    total: v.total,
    asked,
    unanswered: v.unanswered,
    notClear: v.notClear,
    shifts,
    actions: actions.slice(0, 3),
    hasReviews: !!run && run.reviews_count >= MIN_REVIEWS,
  };
}

const themeWo = (s: Shift) => THEME_TEMPLATES[s.theme].wo[s.sentiment];
const themeEn = (s: Shift) => THEME_TEMPLATES[s.theme].en[s.sentiment];

/** Plain-language line for one action: Wolof, then English. */
export function actionText(a: Action): { wo: string; en: string } {
  switch (a.kind) {
    case "asked_and_complained":
      return {
        wo: `Gan yi laaj nañu ${a.asked} yoon ci "${topicWo(a.topic).toLowerCase()}" te ${a.complaints} xalaat ñaxtu nañu ci ko: gënal sa tontu.`,
        en: `Visitors asked ${a.asked} times about "${topicEn(a.topic).toLowerCase()}" and ${a.complaints} reviews complain: improve that answer.`,
      };
    case "answer_gap":
      return {
        wo: `${a.n} laaj amul tontu: waxal tontu ci kàddu.`,
        en: `${a.n} questions had no answer: record answers for them.`,
      };
    case "unclear":
      return {
        wo: `${a.n} gan nee nañu tontu bi leerul: waxaat ko.`,
        en: `${a.n} visitors said an answer was not clear: record it again.`,
      };
    case "rising_complaint":
      return {
        wo: `${themeWo(a.shift)}: ${a.shift.before}% → ${a.shift.now}% ci xalaat yi.`,
        en: `${themeEn(a.shift)}: ${a.shift.before}% → ${a.shift.now}% of reviews.`,
      };
  }
}

/** WhatsApp report for the household champion (the weekly smartphone session). */
export function formatWeeklyReport(i: Insight): string {
  const blocks: string[] = [`*Li nu jàng ayubés bi* _(What we learned this week)_`];
  if (i.total === 0)
    blocks.push(`${sl("Amul laaj ayubés bi.", "No visitor questions this week.")}`);
  else {
    const lines = [`*${i.total}* ${sl("laaj ayubés bi", "visitor questions")}`];
    for (const a of i.asked)
      lines.push(`• ${sl(topicWo(a.topic), topicEn(a.topic))}: *${a.count}*`);
    blocks.push(lines.join("\n"));
  }
  if (i.shifts.length) {
    blocks.push(
      [
        `*${sl("Xalaat yi soppiku nañu", "Review changes")}*`,
        ...i.shifts.map((s) => `• ${themeWo(s)} _(${themeEn(s)})_: ${s.before}% → ${s.now}%`),
      ].join("\n"),
    );
  } else if (!i.hasReviews) {
    blocks.push(
      sl("Xalaat yi néew nañu ngir seetlu soppiku.", "Not enough reviews to see changes."),
    );
  }
  if (i.actions.length) {
    blocks.push(
      [
        `*${sl("Jëf yi", "Actions")}*`,
        ...i.actions.map((a, n) => {
          const t = actionText(a);
          return `${n + 1}. ${t.wo} _(${t.en})_`;
        }),
      ].join("\n"),
    );
  } else {
    blocks.push(sl("Amul jëf bu bees ayubés bi.", "No new action this week."));
  }
  blocks.push(UNVERIFIED_FOOTER);
  return blocks.join("\n\n");
}

/** Short SMS for Noor: how many visitors asked, the top topic, and the first action. At most three parts. */
export function weeklyInsightSms(i: Insight, lang: "wo" | "en" = "wo"): string {
  const wo = lang === "wo";
  const lines = [wo ? "Teranga: li nu jàng ayubes bi." : "Teranga: what we learned this week."];
  if (i.total === 0) lines.push(wo ? "Amul laaj ayubes bi." : "No visitor questions this week.");
  else {
    const top = i.asked[0];
    lines.push(
      wo
        ? `${i.total} laaj${top ? `, gëna bare ci ${topicWo(top.topic).toLowerCase()} (${top.count})` : ""}.`
        : `${i.total} questions${top ? `, most about ${topicEn(top.topic).toLowerCase()} (${top.count})` : ""}.`,
    );
  }
  const first = i.actions[0];
  if (first) lines.push(`${wo ? "Jëf" : "Action"}: ${actionText(first)[lang]}`);
  if (wo) lines.push("Wolof bu masin tekki, wóoragul.");
  return withOptOut(lines.join("\n"));
}
