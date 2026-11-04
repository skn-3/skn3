-- Att koppla en kostnad till en (redan fakturerad) A-order ska också väcka Drive-synken.
DROP TRIGGER IF EXISTS drive_sync_cost_receipt ON public.case_costs;
CREATE TRIGGER drive_sync_cost_receipt AFTER INSERT OR UPDATE OF receipt_path,receipt_url,a_order_id ON public.case_costs FOR EACH ROW EXECUTE FUNCTION public.drive_sync_source_changed();