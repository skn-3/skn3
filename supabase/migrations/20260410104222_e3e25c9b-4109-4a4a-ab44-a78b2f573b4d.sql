
CREATE TABLE public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  date date NOT NULL,
  address text NOT NULL,
  customer_name text NOT NULL,
  seller text NOT NULL,
  result text NOT NULL,
  order_value numeric,
  follow_up_date date,
  notes text,
  case_id uuid REFERENCES public.cases(id)
);

ALTER TABLE public.visits DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.cases ADD COLUMN visit_id uuid REFERENCES public.visits(id);
