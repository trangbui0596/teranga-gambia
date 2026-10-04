// Scores the keyword matcher on labeled questions (pure, no I/O). Used by tests and by the evaluation write-up.
// "In scope" = one of Noor's ten topics; "other" = a question her ten answers do not cover (visa, currency, weather...),
// where the right behavior is to decline ("Not sure, Noor will answer").
import { KEYWORDS, matchQuestion } from "./match";

export type LabeledQuestion = { question: string; topic_label: string };

export function evaluateMatcher(qs: LabeledQuestion[]) {
  const answers = Object.keys(KEYWORDS).map((t) => ({ id: t, is_sample: false, recordings: { questions: { topic: t } } }));
  const rows = qs.map((q) => {
    const r = matchQuestion(q.question, answers);
    return { question: q.question, label: q.topic_label, answered: r.answer ? (r.topic ?? null) : null };
  });
  const inScope = rows.filter((r) => r.label !== "other");
  const outOfScope = rows.filter((r) => r.label === "other");
  return {
    total: rows.length,
    inScope: inScope.length,
    correct: inScope.filter((r) => r.answered === r.label).length,
    wrong: inScope.filter((r) => r.answered && r.answered !== r.label).length,
    declined: inScope.filter((r) => !r.answered).length,
    outOfScope: outOfScope.length,
    outDeclined: outOfScope.filter((r) => !r.answered).length,
    outAnswered: outOfScope.filter((r) => r.answered).length,
    rows,
  };
}
