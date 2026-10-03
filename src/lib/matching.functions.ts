import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { matchQuestion, NOT_SURE } from "./match";

// Placeholder neutral review link — shown to everyone, never gated on feedback.
export const REVIEW_URL = "https://www.google.com/maps/search/?api=1&query=tour+guide+Kololi+Gambia";

const FIELD = { en: "english", de: "german", nl: "dutch" } as const;

/**
 * Reusable visitor-question matcher. Today: called by the champion's "Try a visitor
 * question" panel. Later: the WhatsApp/SMS handlers will use the same logic.
 * Only approved answers are considered; below threshold it never guesses and logs to `unanswered`.
 */
export const answerVisitorQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ text: z.string().trim().min(1).max(500), lang: z.enum(["en", "de", "nl"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: rows, error } = await sb
      .from("answers")
      .select("id, english, german, dutch, is_sample, recordings(questions(topic))")
      .eq("review_status", "approved");
    if (error) throw new Error("Could not load answers");
    const answers = (rows ?? []) as unknown as Array<{
      id: string; english: string | null; german: string | null; dutch: string | null; is_sample: boolean;
      recordings: { questions: { topic: string } | null } | null;
    }>;
    const { answer, confidence } = matchQuestion(data.text, answers);
    const vqId = crypto.randomUUID();
    await sb.from("visitor_questions").insert({
      id: vqId, text: data.text, lang: data.lang, matched_answer_id: answer?.id ?? null, confidence,
    });
    if (!answer) await sb.from("unanswered").insert({ visitor_question_id: vqId });
    return {
      matched: !!answer,
      confidence,
      text: answer ? answer[FIELD[data.lang]] : NOT_SURE[data.lang],
      isSample: answer?.is_sample ?? false,
      machineTranslated: true,
      reviewUrl: REVIEW_URL,
    };
  });
