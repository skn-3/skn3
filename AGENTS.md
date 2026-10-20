Use the same ProfileSvg rendering for the sheet-metal form and the order PDF, rasterized in the browser before PDF generation; this keeps measurements and angle annotations identical in both places.
Keep logical PDF download and attachment names in pdfNames, separate from storage paths; this keeps naming consistent without moving saved documents.
Keep A-order PDF regeneration in a dedicated PDF-only service that updates only pdf_path; this prevents invoice status, dates, counters and case history from changing during layout refreshes.
Keep A-order rich-text parsing and browser/PDF rendering in shared modules, with equivalent escaped email rendering; this preserves consistent formatting without changing description storage.
Keep offer description, terms and date text logic in offerText for PDF and customer-page reuse; this keeps their presentation consistent.
Keep payout grouping, explicit inclusion, totals and per-team invoice plans in payoutGroups; shared pure logic prevents duplicate extra-work payments and KM-only hour supplements from diverging between review and booking.
In installer submit flows, create the primary row first and treat later steps (events, logging, image uploads) as non-fatal, with duplicate detection in deviationDedup; a late failure must never invite a retry that duplicates the submission.
- Only case_documents with payout_kind='montage' mean the installation is paid (classification and paid-date maps live in src/lib/payoutKind.ts); KM/extra payouts are already self-billed and must never trigger installer-invoicing prompts.
