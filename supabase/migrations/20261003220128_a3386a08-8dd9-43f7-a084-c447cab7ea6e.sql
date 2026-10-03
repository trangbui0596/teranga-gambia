CREATE TABLE public.partner_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tour_type text NOT NULL,
  fit text NOT NULL,
  language_support text[] NOT NULL DEFAULT '{}',
  is_sample boolean NOT NULL DEFAULT true
);
GRANT ALL ON public.partner_operators TO service_role;
ALTER TABLE public.partner_operators ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.recommendation_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_operator text NOT NULL,
  to_operator_id uuid NOT NULL REFERENCES public.partner_operators(id) ON DELETE CASCADE,
  visitor_hash text NOT NULL,
  connect_requested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_sample boolean NOT NULL DEFAULT true
);
GRANT ALL ON public.recommendation_ledger TO service_role;
ALTER TABLE public.recommendation_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_recommendation_id uuid REFERENCES public.recommendation_ledger(id) ON DELETE SET NULL;
INSERT INTO public.partner_operators (name, tour_type, fit, language_support) VALUES
 ('Sunbird Trails (fictional sample)', 'birdwatching', 'nature', '{en,de}'),
 ('Mangrove Drift Cruises (fictional sample)', 'river cruise', 'nature', '{en,nl}'),
 ('Kora Village Visits (fictional sample)', 'village culture', 'culture', '{en,de,nl}');