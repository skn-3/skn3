-- Bara administratör godkänner priser. En rad utan pris får aldrig vara godkänd.
-- Säljare och koordinatorer får fortfarande ändra priser (raden går då till utkast) och arkivera.
-- Tjänstekontot och migreringar (inte rollerna authenticated/anon) omfattas inte av admin-kravet, men av pris-kravet.
CREATE OR REPLACE FUNCTION public.price_items_guard_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  needs_admin boolean;
BEGIN
  IF NEW.status = 'godkand' AND NEW.price_ex_vat IS NULL THEN
    RAISE EXCEPTION 'En prisrad utan pris kan inte vara godkänd. Lägg in priset först.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF current_user NOT IN ('authenticated', 'anon') OR public.auth_is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    needs_admin := NEW.status = 'godkand';
    IF needs_admin THEN
      RAISE EXCEPTION 'Bara administratör kan godkänna priser. Spara raden som utkast.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    IF NEW.status = 'godkand' AND OLD.status IS DISTINCT FROM 'godkand' THEN
      RAISE EXCEPTION 'Bara administratör kan godkänna priser. Spara raden som utkast.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status = 'godkand' AND OLD.status = 'godkand' AND NEW.price_ex_vat IS DISTINCT FROM OLD.price_ex_vat THEN
      RAISE EXCEPTION 'Bara administratör kan ändra ett godkänt pris. Spara ändringen som utkast.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.price_items_guard_approval() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER price_items_guard_approval
  BEFORE INSERT OR UPDATE ON public.price_items
  FOR EACH ROW EXECUTE FUNCTION public.price_items_guard_approval();