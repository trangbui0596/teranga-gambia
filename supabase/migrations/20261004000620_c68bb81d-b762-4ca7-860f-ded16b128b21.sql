CREATE TABLE public.coach_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  place_ids text[] NOT NULL DEFAULT '{}',
  places_count int NOT NULL DEFAULT 0,
  reviews_count int NOT NULL DEFAULT 0,
  date_from date, date_to date,
  price_count int NOT NULL DEFAULT 0,
  price_min numeric, price_max numeric, price_currency text,
  actions jsonb NOT NULL DEFAULT '[]',
  api_calls int NOT NULL DEFAULT 0,
  api_errors text[] NOT NULL DEFAULT '{}'
);
GRANT ALL ON public.coach_runs TO service_role;
ALTER TABLE public.coach_runs ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.coach_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.coach_runs(id) ON DELETE CASCADE,
  theme text NOT NULL, sentiment text NOT NULL CHECK (sentiment IN ('positive','negative')),
  count int NOT NULL
);
GRANT ALL ON public.coach_themes TO service_role;
ALTER TABLE public.coach_themes ENABLE ROW LEVEL SECURITY;