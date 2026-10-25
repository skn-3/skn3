Use the same ProfileSvg rendering for the sheet-metal form and the order PDF, rasterized in the browser before PDF generation; this keeps measurements and angle annotations identical in both places.
Keep messaging membership creation inside start_conversation and expose only profiles_public for recipient selection; column-level grants protect read markers and security-definer membership checks avoid recursive RLS.
Mount chat once in the authenticated Index shell and scope query keys and realtime channels to the signed-in user; this prevents public-page exposure and duplicate subscriptions.
Keep chat realtime, read markers and incoming-message toasts independent of notifications; event notifications must never read or modify conversation state.
Keep chat image validation in chatAttachments and batch signed URLs per conversation/viewer in useChatImages; upload all compressed images before inserting a message, never upsert or delete client-side, and keep image activity out of notifications.
Route installer case-event notifications through notify_montor_case_event with explicit exclusions for already-covered event types; this keeps future installer submissions covered without duplicating existing cost, deviation and status notifications.
Keep notification icon mapping in notificationKinds; one tested mapping supplies every notification row without changing bell behavior.
Keep partial montage submission and visibility rules in montagePartial and reuse MontagePartialBlock across installer and office views; this keeps status guards and retained-report visibility consistent.
Keep chat case lookup in useChatCases with role- and viewer-scoped keys, and load only public-facing case fields; case links must never expose installer-hidden financial data or reuse another viewer's cached access.
Keep assignment invoice email rendering and payment/date derivation in the function-local pure email module; this allows testing without dispatching customer emails.
Limit package-install network concurrency in bunfig.toml to reduce registry throttling without changing dependency versions or registry routing.
Keep logical PDF download and attachment names in pdfNames, separate from storage paths; this keeps naming consistent without moving saved documents.
Keep PDF name logic in the pure edge-shared module with a frontend re-export; Drive archival and existing downloads must use identical names.
Keep Drive sync isolated from invoice workflows, with service-only leases, parent-scoped paginated Drive lists and event-driven bounded retries that unschedule after drain; archival failures must never block the source document or alter its accounting state.
The Google Drive sync may only read and create in Drive (list, folder create, upload). It must never delete, trash, move, rename, overwrite or change permissions; assertAllowedDriveRequest and driveNoDelete.test.ts enforce this and must not be weakened.
Keep A-order PDF regeneration in a dedicated PDF-only service that updates only pdf_path; this prevents invoice status, dates, counters and case history from changing during layout refreshes.
Keep A-order rich-text parsing and browser/PDF rendering in shared modules, with equivalent escaped email rendering; this preserves consistent formatting without changing description storage.
Keep offer description, terms and date text logic in offerText for PDF and customer-page reuse; this keeps their presentation consistent.
Keep payout grouping, explicit inclusion, totals and per-team invoice plans in payoutGroups; shared pure logic prevents duplicate extra-work payments and KM-only hour supplements from diverging between review and booking.
In installer submit flows, create the primary row first and treat later steps (events, logging, image uploads) as non-fatal, with duplicate detection in deviationDedup; a late failure must never invite a retry that duplicates the submission.
- Only case_documents with payout_kind='montage' mean the installation is paid (classification and paid-date maps live in src/lib/payoutKind.ts); KM/extra payouts are already self-billed and must never trigger installer-invoicing prompts.
- Consultants' own pay view (Min lön) reads only through the consultant-self function and preview action; PDFs reach them solely via short-lived signed URLs, never direct storage access.
- Service orders are a_orders rows with order_kind='service' (payer, mockfjards_order_number) and reuse the whole A-order invoice/PDF/Drive flow; prefill logic lives in src/lib/serviceOrder.ts so it stays testable.
- If node_modules/canvas appears without its native build (installs run with --ignore-scripts), delete that directory; jsdom then loads and vitest runs, because a half-installed optional canvas crashes every test file.
- Keep installer list classification, summaries and date ordering in montorLists and scope persisted order filters to the viewer; this makes list rules testable and prevents cross-account filter leakage.
- Keep home-screen support manifest-only with no app-shell service worker; installed views must always load fresh data.
- Keep touch pull-to-refresh in usePullToRefresh and invalidate the installer list query families; one gesture implementation covers cases, orders, invoices and calendar without duplicating fetching logic.

## N3prenad-AI
- Keep AI persistence in ai_threads, ai_messages, ai_usage and ai_settings and calls in n3-ai; only the service client writes history/usage, while every case tool uses the caller's JWT and RLS.
- Define each read tool in its own file with name, JSON schema and handler; require a separate approval-capable layer before adding any write tool.
- Use ai_begin_message only with service_role for atomic quota reservation across archived threads; use ai_archive_thread only for the caller's active thread.
- Reuse function-local pure AI date/marker logic through the frontend re-export and render checked case references with ChatCaseCard; this keeps date boundaries and access consistent.
- Preserve existing chat primitives for this package-free phase: AI Elements requires ai/streamdown packages not installed here; the narrow escaped markdown subset avoids new dependencies and executable HTML.
- Use the documented raw Chat Completions contract for the selected fast Google models without new npm packages; preserve the six-round read-only loop and server-side key/run-ID state. This scoped exception avoids adding AI SDK and adapter packages.
- Persist gateway credit/access pauses and require owner recovery rather than automatic retries; never substitute a model after a terminal refusal or provider denial.
