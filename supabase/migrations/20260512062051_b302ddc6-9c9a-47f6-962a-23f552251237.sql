ALTER TABLE public.visits
  ADD COLUMN lost_reason text,
  ADD COLUMN lost_competitor text,
  ADD COLUMN lost_comment text;