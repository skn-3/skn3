ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_case_id_fkey;
ALTER TABLE public.visits ADD CONSTRAINT visits_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE public.case_documents DROP CONSTRAINT IF EXISTS case_documents_case_id_fkey;
ALTER TABLE public.case_documents ADD CONSTRAINT case_documents_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;