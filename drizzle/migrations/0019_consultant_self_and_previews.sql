ALTER TABLE public.consultants ADD COLUMN IF NOT EXISTS user_id uuid NULL REFERENCES public.profiles(id);
UPDATE public.consultants SET user_id = 'a17170ed-ffff-4617-90c2-cdbecea65289' WHERE company_name = 'VPLG AB' AND user_id IS NULL;

CREATE TABLE public.consultant_previews (
  consultant_id uuid PRIMARY KEY REFERENCES public.consultants(id) ON DELETE CASCADE,
  folder_id text,
  folder_name text,
  folder_created_time timestamptz,
  payout_month date,
  provision_file_id text,
  provision_file_name text,
  provision_modified_time text,
  provision_payout_date date,
  period_start date,
  period_end date,
  tb_amount numeric,
  tb_needs_review boolean DEFAULT false,
  tb_note text,
  tier_pct numeric,
  commission_gross numeric,
  standard_deductions numeric DEFAULT 0,
  deduction_file_count int DEFAULT 0,
  net_estimate numeric,
  vat_estimate numeric,
  total_estimate numeric,
  existing_payout_id uuid,
  state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready','already_invoiced','no_provision','no_folder','error')),
  error text,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultant_previews TO authenticated;
GRANT ALL ON public.consultant_previews TO service_role;
ALTER TABLE public.consultant_previews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access previews" ON public.consultant_previews FOR ALL TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
CREATE POLICY "Consultant reads own preview" ON public.consultant_previews FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.consultants c WHERE c.id = consultant_id AND c.user_id = auth.uid()));

CREATE POLICY "Consultant reads own consultant" ON public.consultants FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Consultant reads own payouts" ON public.consultant_payouts FOR SELECT TO authenticated
  USING (status <> 'draft' AND EXISTS (SELECT 1 FROM public.consultants c WHERE c.id = consultant_id AND c.user_id = auth.uid()));
CREATE POLICY "Consultant reads own payout lines" ON public.consultant_payout_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.consultant_payouts p JOIN public.consultants c ON c.id = p.consultant_id
                 WHERE p.id = payout_id AND p.status <> 'draft' AND c.user_id = auth.uid()));
CREATE POLICY "Consultant reads own loans" ON public.consultant_loans FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.consultants c WHERE c.id = consultant_id AND c.user_id = auth.uid()));