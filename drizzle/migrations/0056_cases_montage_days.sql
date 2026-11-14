ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS montage_days integer NULL;
ALTER TABLE public.cases ADD CONSTRAINT cases_montage_days_range CHECK (montage_days IS NULL OR montage_days BETWEEN 1 AND 30);
COMMENT ON COLUMN public.cases.montage_days IS 'Antal arbetsdagar som montaget tar; NULL betyder 1.';

CREATE OR REPLACE VIEW public.cases_montor WITH (security_invoker = true) AS
SELECT id,created_at,address,customer_name,customer_phone,customer_email,seller,team,status,offer_number,
       extra_hours_requested,extra_hours_approved,km_date,montage_date,delivery_date,notes,updated_at,visit_id,
       imported,media_consent,carry_help_needed,city,scheduled_delivery,km_time,montage_time,delivery_time,
       delivery_week,delivery_year,km_team,units,order_number,status_changed_at,public_token,montor_notes,
       is_gotland,klimat_status,montage_partial_note,montage_partial_at,extra_hours_approved_amount,
       waste_pickup_requested_at,waste_pickup_requested_by,waste_pickup_note,waste_pickup_earliest,
       waste_pickup_booked_at,waste_pickup_booked_by,waste_pickup_date,
       montage_days
FROM public.cases;