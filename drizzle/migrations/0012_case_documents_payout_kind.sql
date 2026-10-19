ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS payout_kind text;
UPDATE public.case_documents d SET payout_kind = CASE
  WHEN jsonb_typeof(d.line_items) = 'array' AND jsonb_array_length(d.line_items) > 0
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.line_items) li
     WHERE lower(coalesce(li->>'name','') || ' ' || coalesce(li->>'note','')) NOT LIKE '%kontrollmätning%')
  THEN 'km' ELSE 'montage' END
WHERE d.doc_type = 'mockfjards_payout';
ALTER TABLE public.case_documents ADD CONSTRAINT case_documents_payout_kind_check CHECK (payout_kind IS NULL OR payout_kind IN ('montage','km','extra'));
COMMENT ON COLUMN public.case_documents.payout_kind IS 'Only for doc_type=mockfjards_payout: montage | km | extra. Only montage means the installation is paid.';