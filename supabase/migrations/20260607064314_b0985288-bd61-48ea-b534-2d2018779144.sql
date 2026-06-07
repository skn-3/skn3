
-- 1. Helper function: returns 'seller'|'montor'|'coordinator' or null
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid()
$$;

-- 2. case_documents table (if missing)
CREATE TABLE IF NOT EXISTS public.case_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_path text NOT NULL,
  file_name text,
  order_number text,
  invoice_number text,
  customer_name text,
  invoice_date date,
  total_amount numeric,
  currency text DEFAULT 'SEK',
  line_items jsonb,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_documents_case_id_idx ON public.case_documents(case_id);
CREATE INDEX IF NOT EXISTS case_documents_doc_type_idx ON public.case_documents(doc_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_documents TO authenticated;
GRANT ALL ON public.case_documents TO service_role;

ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "case_documents access for authorized roles" ON public.case_documents;
CREATE POLICY "case_documents access for authorized roles"
ON public.case_documents
FOR ALL
TO authenticated
USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));

DROP TRIGGER IF EXISTS case_documents_set_updated_at ON public.case_documents;
CREATE TRIGGER case_documents_set_updated_at
BEFORE UPDATE ON public.case_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Storage policies for case-documents bucket
DROP POLICY IF EXISTS "case-documents select for authorized roles" ON storage.objects;
CREATE POLICY "case-documents select for authorized roles"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'case-documents' AND (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator')));

DROP POLICY IF EXISTS "case-documents insert for authorized roles" ON storage.objects;
CREATE POLICY "case-documents insert for authorized roles"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'case-documents' AND (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator')));

DROP POLICY IF EXISTS "case-documents update for authorized roles" ON storage.objects;
CREATE POLICY "case-documents update for authorized roles"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'case-documents' AND (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator')))
WITH CHECK (bucket_id = 'case-documents' AND (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator')));

DROP POLICY IF EXISTS "case-documents delete for authorized roles" ON storage.objects;
CREATE POLICY "case-documents delete for authorized roles"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'case-documents' AND (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator')));
