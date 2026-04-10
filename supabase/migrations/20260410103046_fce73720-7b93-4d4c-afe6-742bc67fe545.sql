
CREATE TABLE public.cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  address TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  seller TEXT NOT NULL,
  team TEXT,
  status TEXT NOT NULL DEFAULT 'ny',
  offer_number TEXT,
  order_value NUMERIC,
  tb_percent NUMERIC,
  extra_hours_sold INTEGER NOT NULL DEFAULT 0,
  extra_hours_requested INTEGER NOT NULL DEFAULT 0,
  extra_hours_approved INTEGER NOT NULL DEFAULT 0,
  km_date DATE,
  montage_date DATE,
  delivery_date DATE,
  notes TEXT,
  google_drive_link TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.case_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE public.deviations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  responsible TEXT NOT NULL,
  action_needed TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
