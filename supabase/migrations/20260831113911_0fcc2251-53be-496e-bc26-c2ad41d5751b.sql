ALTER TABLE public.montor_teams ADD COLUMN IF NOT EXISTS phone text;
UPDATE public.montor_teams SET email = COALESCE(email, 'gvmo.bygg@gmail.com'), phone = COALESCE(phone, '0707654751') WHERE name = 'GVMO';
UPDATE public.montor_teams SET email = COALESCE(email, 'info@smtmbygg.se'), phone = COALESCE(phone, '0733930666') WHERE name = 'Samy';
UPDATE public.montor_teams SET email = COALESCE(email, 'alex@nbdentreprenad.com'), phone = COALESCE(phone, '0707808026') WHERE name = 'Alex NBD';
UPDATE public.montor_teams SET email = COALESCE(email, 'jerk.ryttman@mockfjards.se'), phone = COALESCE(phone, '0705799711') WHERE name = 'Jerk';
UPDATE public.montor_teams SET email = COALESCE(email, 'Edvin@villaspecialisten.se') WHERE name = 'Villaspecialisten';