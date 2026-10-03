ALTER TABLE public.answers
  ADD COLUMN stage text NOT NULL DEFAULT 'checked',
  ADD COLUMN attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN notify_hash text,
  ADD COLUMN notified_at timestamptz,
  ADD COLUMN lease_until timestamptz;
ALTER TABLE public.answers ALTER COLUMN stage SET DEFAULT 'received';
UPDATE public.answers SET stage = 'received' WHERE is_sample = false AND transcript_src IS NULL AND 'processing' = ANY(flags);
CREATE INDEX answers_stage_idx ON public.answers(stage, created_at) WHERE stage IN ('received','transcribed','translated');