ALTER TABLE public.uppdrag ADD COLUMN IF NOT EXISTS paid_at timestamptz;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public' AND rel.relname = 'uppdrag' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.uppdrag DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.uppdrag
  ADD CONSTRAINT uppdrag_status_check
  CHECK (status IN ('ej_paborjad','pagar','klar','fakturerad','slutbetald'));