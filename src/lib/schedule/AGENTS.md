# Schedule and booking (Schema)

Rules for src/lib/schedule (pure logic) and src/lib/booking (shared booking service). Root AGENTS.md/ARCHITECTURE.md/roadmap.md are not edited from the schedule draft, to avoid merge conflicts.

## Pure schedule logic (src/lib/schedule)
- No React or Supabase imports; every module has vitest tests in __tests__. Office and installer views both build on these modules, so they never diverge.
- Dates are ISO strings (YYYY-MM-DD). Local dates are built with new Date(y, m - 1, d); never parse 'YYYY-MM-DD' with new Date(string). Day differences use Date.UTC so DST never shifts a day. Swedish formatting comes from src/lib/dateSv.ts.
- Montage days: the start day is always day 1 (even on a weekend); further days are the following weekdays (Mon–Fri). montage_days null or < 1 means 1. suggestedMontageDays = min(30, max(1, ceil(units / UNITS_PER_DAY))), 1 when units are missing or 0.
- Known limitation: Swedish public holidays are not handled; only Saturday/Sunday count as non-working days.
- ScheduleEvent never carries economy fields (order value, margin, hours, costs); installers use the same events. A test pins the exact key list.
- Paused cases ('pausad') never appear in events or queues.
- Deliveries and waste pickups always sit on the "Logistik" row; their team field is informational. KM/montage without team go to "Ej tilldelat". Teams with bookings that are missing from the team list get their own row: no booking may be hidden.
- KM conflicts require equal date and equal time; KM without time never conflict. Events without team never conflict.
- Placement checks: blocking delivery rule comes from canEnterStatus('montage_bokat') in src/lib/statusRules.ts; never duplicate it.

## Types for not-yet-applied columns
- New columns (cases.montage_days) exist only after the draft is accepted. src/integrations/supabase/types.ts is not regenerated for them; extensions live only in src/lib/schedule/types.ts (ScheduleExtension, WithSchedule, montageDaysOf). Read with select('*') and treat missing fields as null.

## Booking service (src/lib/booking)
- All KM/montage bookings, reschedules, team changes and unbookings go through bookingService.ts so the same events, logs, mails and SMS happen wherever the booking starts. Components only wrap them in mutations (useBookingActions or their own useMutation) and show toasts.
- Order in every function: 1) case update (throws), 2) case event, 3) activity log, 4) mails/SMS. Steps 2–4 never throw after step 1; failures are returned as warnings.
- montage_days in updates: days > 1 is sent; days 1 is sent as null only when the case already has a value; otherwise the field is omitted (so updates work before the column exists).
- origin 'office' and 'montor' keep their existing side effects: office uses notify-email with explicit recipients (coordinator mail, assignment mail, optional customer SMS); installers only trigger fixed server-side templates (sendMontorEmail) and never send customer SMS or coordinator mail.
- Team mail addresses come from resolveTeamEmail (montor_teams.email, fallback EMAIL_MAP). KM mails go to km_team with team as fallback.
- Event texts that already existed are kept verbatim (including stored time format); new texts (reschedule/unbook/move) use ISO dates like the existing ones.
