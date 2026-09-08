UPDATE public.case_events
SET event_type = 'economy'
WHERE event_type = 'note'
  AND (description LIKE 'Mockfjärds-utbetalning kopplad%'
    OR description LIKE 'Egen faktura/A-order kopplad%'
    OR description LIKE 'Plåtfaktura kopplad%');

DROP POLICY "case_events_montor_select" ON public.case_events;

CREATE POLICY "case_events_montor_select" ON public.case_events
FOR SELECT
USING (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id) AND event_type NOT IN ('economy','deviation_cost'));