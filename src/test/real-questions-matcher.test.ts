import { describe, expect, it } from "vitest";
import questions from "./fixtures/gambia_tour_questions.json";
import { KEYWORDS } from "@/lib/match";
import { evaluateMatcher } from "@/lib/match-eval";
import { REAL_QUESTION_RESULTS } from "@/lib/match-eval-results";

// The 82 real FAQ questions (public operator pages, collected 2026-10-04) scored against the keyword matcher.
// The numbers here are quoted in page text and in docs/eval/REAL_QUESTIONS_MATCHER.md, so they must not drift.
const { rows, total: _total, ...summary } = evaluateMatcher(questions);
const { firstPass, current } = REAL_QUESTION_RESULTS;
const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

describe("real-questions fixture", () => {
  it("has 82 questions from the stated number of sources", () => {
    expect(questions).toHaveLength(82);
    expect(questions).toHaveLength(REAL_QUESTION_RESULTS.questions);
    expect(new Set(questions.map((q) => host(q.source_url))).size).toBe(
      REAL_QUESTION_RESULTS.sources,
    );
  });
  it("uses only Noor's ten topics plus 'other', and has no empty or duplicate question", () => {
    const labels = new Set([...Object.keys(KEYWORDS), "other"]);
    expect(questions.filter((q) => !labels.has(q.topic_label))).toEqual([]);
    expect(questions.filter((q) => !q.question.trim())).toEqual([]);
    const texts = questions.map((q) => q.question.trim().toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });
  it("is English only and every question carries its public source link", () => {
    expect(questions.every((q) => q.language === "en")).toBe(true);
    expect(questions.every((q) => q.source_url.startsWith("https://"))).toBe(true);
  });
});

describe("REAL_QUESTION_RESULTS", () => {
  it("both rows add up to the 82 questions", () => {
    for (const r of [firstPass, current]) {
      expect(r.correct + r.wrong + r.declined).toBe(r.inScope);
      expect(r.outDeclined + r.outAnswered).toBe(r.outOfScope);
      expect(r.inScope + r.outOfScope).toBe(REAL_QUESTION_RESULTS.questions);
    }
  });
  it("the current numbers equal what the matcher really scores on the fixture (page text cannot drift)", () => {
    expect(summary).toEqual(current);
  });
});

describe("matcher on real questions", () => {
  it("gives at most 2 wrong-topic answers to in-scope questions", () => {
    expect(summary.wrong).toBeLessThanOrEqual(2);
  });
  it("answers fewer out-of-scope questions than the first pass did", () => {
    expect(summary.outAnswered).toBeLessThan(firstPass.outAnswered);
  });
  it("does not lose correct answers compared with the first pass", () => {
    expect(summary.correct).toBeGreaterThanOrEqual(firstPass.correct);
  });
  it("every row is either answered with a known topic or declined", () => {
    const topics = new Set(Object.keys(KEYWORDS));
    expect(rows.every((r) => r.answered === null || topics.has(r.answered))).toBe(true);
  });
});

import { HOLDOUT_RESULTS } from "@/lib/match-eval-results";
describe("untuned holdout", () => {
  it("scores exactly what the page quotes", async () => {
    const { readFileSync } = await import("node:fs");
    const { evaluateMatcher } = await import("@/lib/match-eval");
    const qs = JSON.parse(readFileSync("src/test/fixtures/gambia_tour_questions_holdout.json", "utf8"));
    const { rows: _rows, total, ...score } = evaluateMatcher(qs);
    expect(total).toBe(HOLDOUT_RESULTS.questions);
    expect(score).toEqual(HOLDOUT_RESULTS.score);
  });
});
