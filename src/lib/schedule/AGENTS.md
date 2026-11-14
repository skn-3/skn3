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

## Office Schema (src/components/schedule)
- ScheduleView is the seller/admin/coordinator landing tab ("Schema"); the old CalendarView stays only for the installer tab and MyCalendarDialog until step 3.
- Components only render and wire state. Every text, label and view model (week range, event lines, summary, conflict chip, filters, board rows, placement cells/prompt, month bars, list groups, booking modes, SMS options, submit labels, confirmation, detail buttons, queue help/search, view preference) lives in src/lib/schedule (labels, board, month, list, bookingForm, queueView, viewPrefs) with tests.
- Board rows come from buildBoardRows: Logistik, active teams sorted by name, extra teams, Ej tilldelat only with bookings or while placing a KM. Week-based deliveries are merged into one bar per week in Logistik (groupWeekDeliveries). Placement cells use checkPlacement against all (unfiltered) events; Logistik is never a target.
- Booking modes: KM queue and KM without date -> bookKm; montage queue -> bookMontage; montage without date -> setMontageDate (rescheduleMontage). For setMontageDate/rescheduleMontage/rescheduleKm with a new team, changeBookingTeam runs first.
- The confirmation must reflect what was sent: bookingOutcome (src/lib/booking/outcome.ts) derives it from the service warnings plus the team's known address (montor_teams.email or the EMAIL_MAP fallback). Warning strings live in src/lib/booking/messages.ts so pure modules can read them.
- Known simplifications: the month view counts only exact-date deliveries per day; the list shows a week-based delivery once, on the first day of the week. The unbook confirmation is inline in the details panel (no modal at any width).
- Layout: from 1280 px a fixed right column (queue/booking/details); below that the queue is a right Sheet and booking/details a bottom Drawer; below 768 px the week board is not offered (Lista/Månad only) and booking from the queue uses the Team and Dag fields.
- View choice is stored per user and device under viewStorageKey(user); programmatic switches (month -> week/list, placement -> week) are not persisted.

## Coordinator inbox counter
- Inbox selections (to book, sheet metal, open deviations) and inboxOpenCount live in src/lib/coordinatorInbox.ts; CoordinatorInbox and the Min inkorg badge (useCoordinatorInboxCount, same query keys) use the same rules.

## Draft send guard
- Every outgoing mail/SMS from edge functions goes through _shared/sendMail.ts or checks isLocalBackend() (_shared/localBackend.ts) first. On a local draft backend (SUPABASE_URL is localhost/127.x/kong/private IP) nothing is sent; the function answers { skipped: 'local_backend' } and logs what would have been sent. *.supabase.co never matches (tested). Clients treat the skip as not sent and show LOCAL_BACKEND_WARNING.

## Installer Schema (src/components/montor/MontorSchedule)
- Data and texts come from src/lib/schedule/montorSchedule.ts; KM belongs to km_team, falling back to team, so self-booked KM without km_team still shows. Deliveries and pickups are not shown.
- Which cases an installer may book is decided only by canMontorBookKm/canMontorBookMontage (montorBooking.ts), shared with MontorCaseDetail.
- The calendar popup decision lives in src/lib/calendar/popup.ts; Index passes calendarPopupAllowed only after PIN change and welcome screen are settled, so the popup never covers them.

## Calendar feed and connection
- calendar-ics builds its ICS only through _shared/calendarFeed.ts (re-exported as src/lib/calendarFeed.ts); its montage day rule is tested against src/lib/schedule/dates. Viewer scope comes from profiles/user_roles or an active montor_teams row, never hardcoded name lists. Feeds never contain amounts.
- Fetches are logged in calendar_connections only for calendar clients (calendarClient) via the service-only calendar_record_fetch RPC; logging never blocks the response. "Connected" = isConnected (latest calendar-client fetch within CONNECTED_DAYS).
- Tokens for other users are created and read only server-side (calendar-connect); responses carry masked addresses, never tokens. Guide texts and states live in src/lib/calendar/guide.ts; admin overview texts in src/lib/calendar/overview.ts.
