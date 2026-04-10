ALTER TABLE case_events DROP CONSTRAINT case_events_case_id_fkey;
ALTER TABLE case_events ADD CONSTRAINT case_events_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;

ALTER TABLE deviations DROP CONSTRAINT deviations_case_id_fkey;
ALTER TABLE deviations ADD CONSTRAINT deviations_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;