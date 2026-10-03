import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Send, Star, ThumbsDown, ThumbsUp, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MtBadge, SampleBadge, SimBadge } from "@/components/Badges";
import { Highlight } from "@/components/Highlight";
import { fetchAnswers, LANGS, matchQuestion, type AnswerRow, type Lang } from "@/lib/tour";

export const Route = createFileRoute("/ask")({
  head: () => ({
    meta: [
      { title: "Ask Fatou — TourCoach Gambia" },
      { name: "description", content: "Ask about price, meeting point, food and more in English, German or Dutch." },
      { property: "og:title", content: "Ask Fatou — TourCoach Gambia" },
      { property: "og:description", content: "Fatou's approved tour answers in English, German and Dutch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AskPage,
});

const T: Record<Lang, { ask: string; ph: string; unsure: string; clear: string; thanks: string; review: string; reviewNote: string }> = {
  en: { ask: "Your question", ph: "e.g. How much does it cost?", unsure: "Not sure — Fatou will answer this herself.", clear: "Was this clear?", thanks: "Thank you!", review: "Leave a Google review", reviewNote: "We welcome every honest review." },
  de: { ask: "Ihre Frage", ph: "z. B. Was kostet die Tour?", unsure: "Nicht sicher — Fatou wird selbst antworten.", clear: "War das verständlich?", thanks: "Danke!", review: "Google-Bewertung schreiben", reviewNote: "Wir freuen uns über jede ehrliche Bewertung." },
  nl: { ask: "Uw vraag", ph: "bv. Wat kost de tour?", unsure: "Niet zeker — Fatou beantwoordt dit zelf.", clear: "Was dit duidelijk?", thanks: "Bedankt!", review: "Schrijf een Google-review", reviewNote: "Elke eerlijke review is welkom." },
};

// Placeholder link — replace with Fatou's real Google review URL.
const GOOGLE_REVIEW_URL = "https://www.google.com/maps/search/?api=1&query=tour+guide+Kololi+Gambia";

function AskPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ vqId: string; answer: AnswerRow | null } | null>(null);
  const [clear, setClear] = useState<boolean | null>(null);
  const answers = useQuery({ queryKey: ["public-answers"], queryFn: () => fetchAnswers("approved", true) });
  const t = T[lang];
  const field = LANGS.find((l) => l.code === lang)!.field;

  async function ask() {
    const q = text.trim().slice(0, 500);
    if (!q) return;
    const { answer, confidence } = matchQuestion(q, answers.data ?? []);
    const vqId = crypto.randomUUID();
    setResult({ vqId, answer });
    setClear(null);
    await supabase.from("visitor_questions").insert({ id: vqId, text: q, lang, matched_answer_id: answer?.id ?? null, confidence });
    if (!answer) {
      await supabase.from("unanswered").insert({ visitor_question_id: vqId });
    }
  }

  async function rate(v: boolean) {
    if (!result) return;
    setClear(v);
    await supabase.rpc("record_clarity", { _id: result.vqId, _clear: v });
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl pb-12">
      <div className="pattern-kente h-3" />
      <div className="space-y-5 px-4 py-5">
        <h1 className="text-3xl font-black">Ask Fatou</h1>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {LANGS.map((l) => (
            <button key={l.code} role="radio" aria-checked={lang === l.code} onClick={() => { setLang(l.code); setResult(null); }}
              className={`tap flex flex-col items-center rounded-2xl border-4 py-3 font-bold ${lang === l.code ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>
              <span className="text-3xl">{l.flag}</span>{l.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="mb-2 block text-lg font-bold">{t.ask}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} placeholder={t.ph}
            className="w-full rounded-2xl border-4 border-input bg-card p-4 text-lg outline-none focus:border-primary" />
        </label>
        <button onClick={ask} disabled={!text.trim() || answers.isLoading} aria-label="Send"
          className="tap flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-xl font-bold text-primary-foreground disabled:opacity-50">
          <Send className="h-7 w-7" />
        </button>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">Matching uses simple keywords for now <SimBadge /></p>

        {result && (
          <div className="space-y-4 rounded-3xl border-4 border-border bg-card p-4">
            {result.answer ? (
              <>
                <div className="flex flex-wrap gap-2"><MtBadge />{result.answer.is_sample && <SampleBadge />}</div>
                <p className="text-xl leading-relaxed"><Highlight text={result.answer[field]} /></p>
              </>
            ) : (
              <p className="flex items-center gap-3 text-xl font-bold"><HelpCircle className="h-10 w-10 shrink-0 text-primary" />{t.unsure}</p>
            )}
            <div className="border-t-2 border-border pt-3">
              <p className="mb-2 font-bold">{t.clear}</p>
              {clear === null ? (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => rate(true)} aria-label="Yes" className="tap flex items-center justify-center rounded-2xl bg-success text-success-foreground"><ThumbsUp className="h-8 w-8" /></button>
                  <button onClick={() => rate(false)} aria-label="No" className="tap flex items-center justify-center rounded-2xl bg-muted"><ThumbsDown className="h-8 w-8" /></button>
                </div>
              ) : <p className="text-lg">{t.thanks}</p>}
            </div>
          </div>
        )}

        <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer"
          className="tap flex items-center justify-center gap-2 rounded-2xl border-4 border-foreground bg-card py-4 text-lg font-bold">
          <Star className="h-6 w-6" /> {t.review}
        </a>
        <p className="text-center text-sm text-muted-foreground">{t.reviewNote}</p>
      </div>
    </div>
  );
}
