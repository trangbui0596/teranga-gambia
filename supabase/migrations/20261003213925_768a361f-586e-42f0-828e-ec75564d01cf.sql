CREATE OR REPLACE FUNCTION public.claim_outbound(_max int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF _max <= 0 THEN RETURN false; END IF;
  INSERT INTO public.outbound_daily(day, sent) VALUES (current_date, 1)
  ON CONFLICT (day) DO UPDATE SET sent = outbound_daily.sent + 1
  WHERE outbound_daily.sent < _max
  RETURNING sent INTO n;
  RETURN n IS NOT NULL;
END $$;
DELETE FROM public.outbound_daily WHERE day = current_date;