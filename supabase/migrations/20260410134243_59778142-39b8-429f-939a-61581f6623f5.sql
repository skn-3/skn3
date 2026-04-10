ALTER TABLE public.visits ADD COLUMN lost boolean DEFAULT false;
ALTER TABLE public.deviations ADD COLUMN reminder_count integer DEFAULT 0;