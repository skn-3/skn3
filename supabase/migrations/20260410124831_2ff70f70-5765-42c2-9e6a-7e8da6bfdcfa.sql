CREATE TABLE public.case_costs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  receipt_url text,
  created_by text NOT NULL
);

ALTER TABLE public.case_costs DISABLE ROW LEVEL SECURITY;