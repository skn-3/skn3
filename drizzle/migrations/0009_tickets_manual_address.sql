-- Ärenden utan kopplat pipeline-ärende: adress och kund skrivs in manuellt (t.ex. kundtjänst för kunder
-- som inte finns i pipelinen). Montörer rapporterar alltid på ett kopplat ärende (deras insert-policy kräver case_id).
-- Se src/lib/tickets.ts (ticketAddress/ticketCustomer) och NewTicketDialog.

-- 1) deviations: case_id får vara tom, manuella kunduppgifter läggs till
ALTER TABLE public.deviations
  ALTER COLUMN case_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_email text;

-- Antingen ett kopplat ärende eller en adress – aldrig inget av dem.
ALTER TABLE public.deviations DROP CONSTRAINT IF EXISTS deviations_case_or_address;
ALTER TABLE public.deviations
  ADD CONSTRAINT deviations_case_or_address
  CHECK (case_id IS NOT NULL OR (address IS NOT NULL AND btrim(address) <> ''));

-- 2) case_events: händelser på okopplade ärenden saknar case_id men har deviation_id
ALTER TABLE public.case_events ALTER COLUMN case_id DROP NOT NULL;
ALTER TABLE public.case_events DROP CONSTRAINT IF EXISTS case_events_case_or_deviation;
ALTER TABLE public.case_events
  ADD CONSTRAINT case_events_case_or_deviation
  CHECK (case_id IS NOT NULL OR deviation_id IS NOT NULL);