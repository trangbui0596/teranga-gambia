ALTER TABLE public.answers ADD COLUMN IF NOT EXISTS transcript_confidence numeric;
CREATE UNIQUE INDEX IF NOT EXISTS answer_audio_answer_lang_idx ON public.answer_audio(answer_id, lang);

CREATE TABLE public.outbound_daily (day date PRIMARY KEY, sent int NOT NULL DEFAULT 0);
GRANT ALL ON public.outbound_daily TO service_role;
ALTER TABLE public.outbound_daily ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_outbound(_max int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.outbound_daily(day, sent) VALUES (current_date, 1)
  ON CONFLICT (day) DO UPDATE SET sent = outbound_daily.sent + 1
  WHERE outbound_daily.sent < _max
  RETURNING sent INTO n;
  RETURN n IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.claim_outbound(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound(int) TO service_role;

-- Evaluation test data (hand-written, NOT real visitor data)
CREATE TABLE public.eval_questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), text text NOT NULL, expected_topic text NOT NULL, label text NOT NULL DEFAULT 'evaluation test data');
GRANT ALL ON public.eval_questions TO service_role;
ALTER TABLE public.eval_questions ENABLE ROW LEVEL SECURITY;
INSERT INTO public.eval_questions(text, expected_topic) VALUES
('How much does the tour cost?', 'price'),
('What is the price per person in dalasi?', 'price'),
('Where do we meet you in the morning?', 'meeting point'),
('Can you pick us up from our hotel?', 'meeting point'),
('How long is the tour?', 'duration'),
('How many hours will we be out?', 'duration'),
('What should I bring with me?', 'what to bring'),
('Do I need special shoes?', 'what to bring'),
('Can we bring our kids?', 'children'),
('Is it suitable for a baby?', 'children'),
('Is lunch provided?', 'food'),
('I am vegetarian, is there food for me?', 'food'),
('Is the tour safe?', 'safety'),
('Is anything dangerous on the river?', 'safety'),
('What is included in the price?', 'whats included'),
('Are drinks included?', 'whats included'),
('How do I book a tour?', 'how to book'),
('Can I reserve for Saturday?', 'how to book'),
('Can I cancel and get a refund?', 'cancellation'),
('What is your cancellation policy?', 'cancellation');