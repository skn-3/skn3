-- Ta bort klient-write-policyer; edge functions med service_role förbigår RLS
DROP POLICY IF EXISTS "auth insert case climate" ON public.case_climate_compensation;
DROP POLICY IF EXISTS "auth insert climate" ON public.order_climate_compensation;

-- Behåll läs-policyerna (för inloggade)
-- Behåll admin update/delete-policyer

-- Tvinga alla befintliga användare att välja ny PIN vid nästa inloggning
UPDATE public.profiles SET must_change_pin = true;