CREATE TABLE public.visitor_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lang text NOT NULL DEFAULT 'en',
  transcript_raw text,
  text_cleaned text,
  media_url text,
  status text NOT NULL DEFAULT 'awaiting',
  shared_with_operator boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.visitor_feedback TO service_role;
ALTER TABLE public.visitor_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS current_feedback_id uuid REFERENCES public.visitor_feedback(id) ON DELETE SET NULL;