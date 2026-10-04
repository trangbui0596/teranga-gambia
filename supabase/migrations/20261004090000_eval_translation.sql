-- Stores a small Wolof to English translation check (FLEURS/FLORES sentences). Server code only.
CREATE TABLE IF NOT EXISTS public.eval_translation (
  id text PRIMARY KEY,
  wolof text NOT NULL,
  reference text NOT NULL,
  hypothesis text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.eval_translation ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.eval_translation TO service_role;
