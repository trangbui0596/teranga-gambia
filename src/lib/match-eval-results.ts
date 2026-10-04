// Scores of the keyword matcher (src/lib/match.ts) on the 82 real visitor-style questions in
// src/test/fixtures/gambia_tour_questions.json: public FAQ questions from 10 Gambian operator and tourism sites,
// collected 2026-10-04. Page text that quotes these numbers must import them from here, because
// src/test/real-questions-matcher.test.ts fails whenever they stop matching what the matcher really scores.
//
// How to read the fields (same names as evaluateMatcher in ./match-eval):
//   inScope     questions that one of Noor's ten answers covers (topic_label is not "other")
//   correct     ... answered with the right topic
//   wrong       ... answered with a different topic (a wrong answer)
//   declined    ... "Not sure, Noor will answer" (safe, but a miss)
//   outOfScope  questions her ten answers do not cover (topic_label "other"): visa, vaccines, currency, weather ...
//   outDeclined ... correctly declined
//   outAnswered ... wrongly answered by some topic (this is the "never guesses" promise being broken)
export type MatcherScore = {
  inScope: number;
  correct: number;
  wrong: number;
  declined: number;
  outOfScope: number;
  outDeclined: number;
  outAnswered: number;
};

export const REAL_QUESTION_RESULTS: {
  questions: number;
  sources: number;
  firstPass: MatcherScore;
  current: MatcherScore;
} = {
  questions: 82,
  sources: 10,
  // First pass: the matcher exactly as it was before the precision rules were added. Measured on the unchanged
  // code before any edit: 17 of the 37 out-of-scope questions (46%) were answered by some topic.
  firstPass: {
    inScope: 45,
    correct: 32,
    wrong: 2,
    declined: 11,
    outOfScope: 37,
    outDeclined: 20,
    outAnswered: 17,
  },
  // Current matcher on the same questions. The same questions were used to find the problems and to pick the new
  // vocabulary, so these numbers are optimistic. A fresh question set (not used for tuning) is the real test.
  current: {
    inScope: 45,
    correct: 40,
    wrong: 0,
    declined: 5,
    outOfScope: 37,
    outDeclined: 37,
    outAnswered: 0,
  },
};

// UNTUNED check: 103 real questions from 14 other sites (src/test/fixtures/gambia_tour_questions_holdout.json), collected
// after the matcher was fixed and evaluated once, without any change to the matcher afterwards. Labels are the collector's
// judgment; most records are search-tool text extracts (see docs/data/README.md in the docs repo).
export const HOLDOUT_RESULTS: { questions: number; sites: number; score: MatcherScore } = {
  questions: 103,
  sites: 14,
  score: { inScope: 45, correct: 33, wrong: 0, declined: 12, outOfScope: 58, outDeclined: 54, outAnswered: 4 },
};
