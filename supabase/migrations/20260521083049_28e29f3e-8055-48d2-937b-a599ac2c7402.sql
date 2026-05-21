CREATE TABLE public.user_calendar_tokens (
  user_name TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_calendar_tokens DISABLE ROW LEVEL SECURITY;

INSERT INTO public.user_calendar_tokens (user_name) VALUES
  ('Daniel Malke'),
  ('Gabriel Hanna'),
  ('GVMO'),
  ('Samy'),
  ('Alex NBD'),
  ('Jerk')
ON CONFLICT (user_name) DO NOTHING;