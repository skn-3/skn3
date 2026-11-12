-- Grenarna mark och el läggs till. Alla tidigare värden gäller fortfarande (additivt).
ALTER TABLE public.price_items DROP CONSTRAINT IF EXISTS price_items_trade_check;
ALTER TABLE public.price_items ADD CONSTRAINT price_items_trade_check
  CHECK (trade IN ('golv','malning','tak','fasad','badrum','kok','altan','renovering','gemensamt','mark','el'));