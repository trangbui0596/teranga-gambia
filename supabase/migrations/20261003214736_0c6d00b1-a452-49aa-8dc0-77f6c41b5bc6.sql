CREATE TABLE public.voice_calls (call_sid text PRIMARY KEY, answered int NOT NULL DEFAULT 0, summary_sent boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.voice_calls TO service_role;
ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.voice_call_answered(_sid text) RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.voice_calls(call_sid, answered) VALUES (_sid, 1)
  ON CONFLICT (call_sid) DO UPDATE SET answered = voice_calls.answered + 1
  RETURNING answered;
$$;
CREATE OR REPLACE FUNCTION public.voice_call_claim_summary(_sid text) RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.voice_calls(call_sid, summary_sent) VALUES (_sid, true)
  ON CONFLICT (call_sid) DO UPDATE SET summary_sent = true WHERE voice_calls.summary_sent = false
  RETURNING answered;
$$;
REVOKE ALL ON FUNCTION public.voice_call_answered(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_call_claim_summary(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_call_answered(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_call_claim_summary(text) TO service_role;