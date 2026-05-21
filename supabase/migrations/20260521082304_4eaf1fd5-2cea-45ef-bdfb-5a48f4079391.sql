ALTER TABLE public.cases
  ADD COLUMN km_time TIME,
  ADD COLUMN montage_time TIME,
  ADD COLUMN delivery_time TIME,
  ADD COLUMN delivery_week INTEGER,
  ADD COLUMN delivery_year INTEGER;

ALTER TABLE public.cases
  ADD CONSTRAINT delivery_date_xor_week CHECK (
    NOT (delivery_date IS NOT NULL AND delivery_week IS NOT NULL)
  );

ALTER TABLE public.cases
  ADD CONSTRAINT delivery_week_range CHECK (
    delivery_week IS NULL OR (delivery_week >= 1 AND delivery_week <= 53)
  );

ALTER TABLE public.cases
  ADD CONSTRAINT delivery_week_requires_year CHECK (
    delivery_week IS NULL OR delivery_year IS NOT NULL
  );