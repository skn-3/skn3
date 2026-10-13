-- ROT-avdraget begränsas av Skatteverkets tak per person och år. Offerten sparar förutsättningarna
-- så att avdraget på offert, PDF, kundsida, uppdrag och faktura aldrig överstiger kundens utrymme.
-- Se src/lib/offerCalc.ts (rotRoom/calcOfferTotals). Befintliga offerter påverkas inte förrän de sparas om.
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS rot_persons integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rot_cap_per_person numeric NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS rot_used numeric NOT NULL DEFAULT 0;

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_rot_persons_check;
ALTER TABLE public.offers ADD CONSTRAINT offers_rot_persons_check CHECK (rot_persons >= 1 AND rot_persons <= 10);
ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_rot_cap_check;
ALTER TABLE public.offers ADD CONSTRAINT offers_rot_cap_check CHECK (rot_cap_per_person >= 0 AND rot_used >= 0);