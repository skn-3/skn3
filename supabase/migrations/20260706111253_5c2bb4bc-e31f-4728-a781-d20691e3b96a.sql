CREATE TABLE public.number_counters (
  series text NOT NULL,
  year int NOT NULL,
  counter int NOT NULL DEFAULT 0,
  PRIMARY KEY (series, year)
);

ALTER TABLE public.number_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_yearly_number(p_series text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := extract(year from (now() at time zone 'Europe/Stockholm'))::int;
  v_counter int;
BEGIN
  INSERT INTO public.number_counters (series, year, counter)
  VALUES (p_series, v_year, 1)
  ON CONFLICT (series, year)
  DO UPDATE SET counter = number_counters.counter + 1
  RETURNING counter INTO v_counter;
  RETURN v_year::text || '-' || lpad(v_counter::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_yearly_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_yearly_number(text) TO authenticated, service_role;

INSERT INTO public.number_counters (series, year, counter)
SELECT 'offer',
       extract(year from (now() at time zone 'Europe/Stockholm'))::int,
       COALESCE(MAX(substring(offer_number from '^\d{4}-(\d+)$')::int), 0)
FROM public.offers
WHERE offer_number ~ ('^' || extract(year from (now() at time zone 'Europe/Stockholm'))::int::text || '-\d+$')
ON CONFLICT (series, year) DO NOTHING;

INSERT INTO public.number_counters (series, year, counter)
SELECT 'uppdrag',
       extract(year from (now() at time zone 'Europe/Stockholm'))::int,
       COALESCE(MAX(substring(uppdrag_number from '^\d{4}-(\d+)$')::int), 0)
FROM public.uppdrag
WHERE uppdrag_number ~ ('^' || extract(year from (now() at time zone 'Europe/Stockholm'))::int::text || '-\d+$')
ON CONFLICT (series, year) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_offer_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.offer_number IS NULL THEN
    NEW.offer_number := public.next_yearly_number('offer');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_uppdrag_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.uppdrag_number IS NULL THEN
    NEW.uppdrag_number := public.next_yearly_number('uppdrag');
  END IF;
  RETURN NEW;
END;
$$;

DROP SEQUENCE IF EXISTS public.offer_number_seq;
DROP SEQUENCE IF EXISTS public.uppdrag_number_seq;