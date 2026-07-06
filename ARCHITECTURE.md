# ARCHITECTURE.md — N3prenad (CaseFlow)

> Systemkarta för SmartKlimat N3prenad AB:s interna verktyg.
> Syftet med detta dokument är att kunskapen om systemet ska bo i repot — inte bara i en chatt eller i någons huvud.
> **Håll det uppdaterat:** när en ny tabell, edge-funktion, fakturatyp eller nummerserie tillkommer, lägg in den här i samma veva.

Senast större uppdatering: juli 2026.

---

## 1. Översikt

Internt verktyg för fönster-/dörrmontageverksamheten. Hanterar hela kedjan: ärenden (pipeline) → kontrollmätning → produktion → leverans → montage → fakturering, plus ett separat offert-/entreprenadspår och ett A-ordersystem för montörsersättning.

**Viktig namnkonvention:** I all text som användare ser heter systemet **"N3prenad"**. Namnet **"CaseFlow"** är bara Lovables projektnamn och förekommer i admin-/utvecklarsammanhang — aldrig mot montörer, säljare eller kunder.

**Företagsuppgifter (avsändare på fakturor m.m.):**
- SmartKlimat N3prenad AB, org.nr 559026-6630
- Morsstigen 3, 141 71 Segeltorp
- Momsreg.nr SE559026663001, Godkänd för F-skatt
- Bankgiro **5032-4573** (företagets eget — används när *vi* fakturerar)
- Tel 070-719 72 35, n3prenad@smartklimat.org

---

## 2. Teknisk stack

| Lager | Teknik |
|---|---|
| Frontend | Vite + React + TypeScript |
| UI | shadcn/ui + Tailwind |
| Datahämtning | TanStack Query |
| Backend / DB | **Lovable Cloud** (managed Supabase/Postgres) |
| Auth | Supabase Auth (e-post + PIN som lösenord) |
| Edge-funktioner | Deno (Supabase Edge Functions) |
| E-post | Resend (via Lovable connector-gateway), avsändare `SmartKlimat N3prenad <noreply@smartklimat.org>` |
| AI | google/gemini-2.5-flash via Lovable AI-gateway |
| PDF | jsPDF (A-order/faktura), pdfmake (offert) |
| Live | smartklimatentreprenad.com |

**Databasen lever utanför koden** (managed Postgres) — inget nollställs vid deploy. Detta är INTE SQLite.

### Utvecklingsmodell
Ändringar görs via Lovable: paste-färdiga prompter skrivs, klistras in en i taget, verifieras sekventiellt. Koden auto-committas till GitHub (`github.com/skn-3/skn3`). Ändra ett område i taget; läs faktisk kod före ändring.

---

## 3. Roller och åtkomst

Tre roller, lagrade i tabellen **`user_roles`** (kolumnerna `role` + `is_admin`). Detta är källan både frontend (`useRole`) och databasen (`auth_is_admin()`, `auth_user_role()`) läser. `profiles.is_admin` finns INTE längre (flyttades till user_roles i säkerhetsfix 1).

| Roll | Personer | Åtkomst |
|---|---|---|
| **seller** | Daniel Malke (`is_admin = true`), Gabriel Hanna | Full åtkomst till pipeline, offerter, A-ordrar, ekonomi. Admin-funktioner endast för is_admin. |
| **coordinator** | Mirna Malke | Koordinatorvy, reklamationer, samma dataåtkomst som seller. |
| **montor** | GVMO, Samy, Alex NBD, Jerk, Villaspecialisten | Endast egna teamets ärenden. **Ingen** åtkomst till A-ordrar, montörsteam, prislista, ekonomi eller interna vinstfält. |

Inloggning sker med namn + PIN (4–6 siffror). PIN lagras som Supabase Auth-lösenord. `must_change_pin` tvingar personligt PIN-byte vid nästa inloggning (se PIN-kampanjen).

---

## 4. Datamodell

Tabeller (Postgres, samtliga med RLS aktiverat):

### Ärende-/pipeline-domän
- **`cases`** — kärnan. Mockfjärds-jobb: kund, adress, `order_number` (Mockfjärds försäljningsorder), team, km_team, status, ekonomifält (`order_value`, `extra_hours_sold`, `extra_hours_approved`), montage-/leveransdatum, `status_changed_at` (sätts av trigger vid statusbyte; driver liggetids-chippen i pipelinen), `public_token` (kundstatussidans token).
- **`case_events`** — händelselogg per ärende.
- **`case_costs`** — kostnader per ärende. `category`: `ovrigt` | `reklamation`; `responsible`: fabrik/saljare/montor/okant (styr om kostnaden belastar teamet i statistiken).
- **`case_documents`** — metadata för uppladdade filer (kopplade till privata bucketen).
- **`visits`** — registrerade besök/kontrollmätningar.
- **`deviations`** — reklamationer/avvikelser. `append_deviation_log` är en hjälpfunktion.
- **`sheet_metal_orders`** — plåtbeställningar (skickas till joakim@byggplatar.se).
- **`insight_history`** — AI-genererade insikter (endast personal).

### Offert-/entreprenaddomän
- **`offers`** — offerter. `line_items` (jsonb, med `is_labor`-flagga för ROT), `vat_mode` (vanlig/omvand), `rot_enabled`, `customer_note` (kundsynlig), interna noteringar, `pdf_path`, `signed_pdf_path`, `public_token`, status (draft/sent/accepted/declined/expired).
- **`uppdrag`** — accepterade offerter som blivit jobb. Egen `uppdrag_number`-serie, förberedda fakturafält (handpenning + slutfaktura).

### A-order-/montörsdomän (porterat från fristående n3prenad-app)
- **`montor_teams`** — montörsteam: bolagsnamn, org.nr, adress, e-post, `invoice_email`, **`bankgiro`** (teamets eget), `invoice_prefix` (GVMO/SAMY/ALEX/JERK), `next_invoice_number` (per-team fakturaräknare).
- **`a_order_products`** — prislista (45 artiklar, kategoriserade).
- **`a_orders`** — A-ordrar = montörens arbetsorder/självfaktureringsunderlag. `order_number` (heltal), `line_items`, `status` (order/invoiced/credited), `team_id`, `case_id`, `invoice_number`, **interna vinstfält** (`internal_extra_hours`, `internal_hour_rate`, `internal_extra_amount` — visas ALDRIG för montör eller i PDF/mejl), `order_kind` (standard/komplettering), `source_n3prenad_id` (importspårning), `mockfjards_invoice_number` (dubblettskydd), `credited_from_order_id`.
- **`montor_debit_invoices`** — debetfakturor *till* montören (vi fakturerar dem). Egen `N3-`-serie, valbar moms, `team_id` (montören som kund), valfri `case_id`. Se §6.

### System
- **`profiles`** — användarprofiler (id = auth user id, namn, login_email).
- **`user_roles`** — roll + is_admin (skrivskyddad; se §7).
- **`activity_log`** — aktivitetslogg (insert bunden till inloggades eget namn).
- **`user_calendar_tokens`** — kalender-tokens (ägar-låsta).

---

## 5. Ärendets livscykel (pipeline-statusar)

```
ny → vantar_km → km_bokad → km_klar → vantar_godkannande → godkand
   → i_produktion → leverans_klar → montage_bokat → montage_pagar
   → montage_klart → fakturerad
```

Statusövergångar valideras i `src/lib/statusRules.ts` (`canEnterStatus`) — t.ex. kräver `montage_bokat` ett satt montagedatum, och `fakturerad` att ärendet är `montage_klart`. Leveransstatus kan härledas från leveransdatum/-vecka (`deriveDeliveryStatus`).

### Två parallella arbetsspår
1. **Mockfjärds-ärenden** (`cases`) — fönsterjobb från Mockfjärds. KM/utbetalning/team-statistik. Mockfjärds betalar *oss* (intäkt), montören utför (A-orderkostnad).
2. **Entreprenadofferter** (`offers` → `uppdrag`) — egna offererade jobb med ROT, signering och egen fakturering. Helt skilt från Mockfjärds-spåret.

---

## 6. Fakturariktningar — VIKTIGT

Systemet har tre olika fakturatyper som går i olika riktningar i pengaflödet. Att hålla isär dem är centralt:

| # | Typ | Riktning | Avsändare / bankgiro | Nummerserie | Moms | Tabell |
|---|---|---|---|---|---|---|
| 1 | **A-orderfaktura** (självfakturering) | Pengar **ut** till montör | Utfärdad å montörens vägnar, **montörens** bankgiro | Per team: `GVMO-001`, `SAMY-001`… | 0 % (omvänd) | `a_orders` |
| 2 | **Kompletteringsfaktura** | Pengar **ut** till montör | Som #1 | Per team (samma serie) | 0 % (omvänd) | `a_orders` (`order_kind='komplettering'`) |
| 3 | **Offert-/uppdragsfaktura** | Pengar **in** från kund | SmartKlimat, **vårt** bankgiro 5032-4573 | `uppdrag_number` | Vanlig/omvänd, ROT på slutfaktura | `uppdrag` |
| 4 | **Montörsdebetfaktura** | Pengar **in** från montör | SmartKlimat, **vårt** bankgiro 5032-4573, montören som **kund** | Egen: `N3-008`… | Valbar per faktura (0 % eller 25 %) | `montor_debit_invoices` |

- **#1 A-orderfaktura:** vanlig montörsersättning kopplad till en A-order. Går order → invoiced. Kan krediteras (röd KREDITFAKTURA, negativa rader) och återfaktureras efteråt (nytt nummer i serien).
- **#2 Kompletteringsfaktura:** montörsersättning UTAN A-order bakom (efterjustering m.m.). Skapas och faktureras i ETT steg ("Skapa & skicka faktura") — inget mellanliggande order-utkast. Räknas som montörskostnad i ekonomin precis som en A-order.
- **#4 Montörsdebet:** när något är montörens ansvar (reklamation de orsakat, skada). Egen tabell så den ALDRIG blandas in i montörskostnaden i ekonomivyn. Detta är en **intäkt** för bolaget — bokförs på annan kontosida än #1/#2.

**Självfaktureringstext** ("FAKTURAN HAR UTFÄRDATS AV SMARTKLIMAT N3PRENAD AB") finns på #1 och #2 (vi fakturerar å montörens vägnar). På #3 och #4 är det en helt vanlig faktura från oss — ingen sådan text.

---

## 7. Nummerserier

| Serie | Format | Källa | Nollställs per år? |
|---|---|---|---|
| Offert | `ÅÅÅÅ-NNNN` | `number_counters` via `next_yearly_number('offer')` | **Ja** (fr.o.m. juli 2026) |
| Uppdrag | `ÅÅÅÅ-NNNN` | `number_counters` via `next_yearly_number('uppdrag')` | **Ja** (fr.o.m. juli 2026) |
| A-order | heltal (löpande) | `a_order_number_seq` | Nej (fortsätter från n3prenad-importen) |
| A-orderfaktura | `{PREFIX}-NNN` per team | `montor_teams.next_invoice_number` | Nej |
| Montörsdebet | `N3-NNN` | `montor_debit_seq` | Nej |

> Debetserien hette ursprungligen `SK-` men byttes till `N3-`. Triggern `set_montor_debit_number` sätter prefixet.

---

## 8. Edge-funktioner

Samtliga ligger i `supabase/functions/`. Auth-modell anges per grupp.

### E-postutskick (kräver inloggad personal-JWT)
- `send-offer` — skickar offert till kund (publik länk + ev. PDF).
- `send-invoice` — offert-/uppdragsfaktura (handpenning/slutfaktura).
- `send-a-order` — skickar A-order till montör (PDF + bildbilagor).
- `send-a-order-invoice` — A-order-/kompletteringsfaktura. CC: n3prenad@, daniel@malke.se, mf@malke.se.
- `send-montor-debit-invoice` — debetfaktura till montör. CC: n3prenad@, daniel@malke.se.
- `send-sheet-metal-order` — plåtbeställning till joakim@byggplatar.se, CC mf@malke.se.
- `notify-email` — generella interna notiser.
- `send-montage-report` — montagerapport-PDF (klientbyggd jsPDF) till valfri mottagare, CC daniel@malke.se + mf@malke.se. Innehåller littera-utfall och avvikelser, aldrig interna kostnader.

### AI-extraktion (Gemini, kräver inloggad personal-JWT)
- `extract-ue-offer` — UE-underentreprenörsofferter (PDF → rader, markup, ROT-split).
- `extract-payout` — Mockfjärds-utbetalningar.
- `parse-a-order-invoice` — montörers egna faktura-PDF:er.
- `parse-mockfjards-invoice` — Mockfjärds-självfaktura → A-order (förifyller, matchar ärende via order_number).
- `parse-offer-text` — fritext → strukturerad offert.
- `parse-customer-portal` — Mockfjärds kundportal → ärende.

### Publika / token-skyddade (kundflöden, ingen inloggning)
- `public-offer` — visar offert via `public_token`.
- `accept-offer` — kund signerar (genererar signerad PDF, blockerar utgångna).
- `decline-offer` — kund avböjer.
- `calendar-ics` — ICS-kalenderflöde, skyddat med hemlig token i URL.
- `public-case-status` — kundstatussida för ärenden via `cases.public_token` (adress, tidslinje, leverans-/montagedatum, ev. klimatcertifikat). Läser aldrig ekonomi- eller interna fält.

### Cron / schemalagda (kräver CRON_SECRET-header)
- `daily-reminders` — dagliga påminnelser (besök, leveranser, offerter, PIN-byte). Innehåller PÅMINNELSE 1–5.
- `weekly-summary` — veckosammanfattning.
- `weekly-backup` — veckobackup till privata `backups`-bucketen; mejlar signerad nedladdningslänk (7 dagar) istället för bilaga. Gallrar backuper äldre än 90 dagar automatiskt.
- `visit-reminder`, `upcoming-deliveries` — påminnelser.

### Admin / system
- `reset-user-pin` — admin återställer en användares PIN (kräver `auth_is_admin()`, genererar ny 6-siffrig, sätter must_change_pin, loggar — aldrig PIN-värdet).
- `send-pin-change-request` — PIN-kampanj (mejl + must_change_pin).
- `seed-users` — engångsseedning (slumpmässiga PIN, inga hårdkodade).

### Legacy
- `orders-proxy` och `caseflow-gateway` **togs bort i FAS 4 (juli 2026)**. All orderläsning sker mot lokala `a_orders`. Gamla n3prenad-databasen ligger kvar orörd som passivt arkiv men nås inte längre av systemet.

---

## 9. AI-extraktion (mönster)

Alla `extract-*`/`parse-*`-funktioner följer samma mönster:
- Lovable AI-gateway, modell `google/gemini-2.5-flash`.
- PDF skickas som base64, `response_format: json_object`.
- Systemprompt definierar exakt JSON-struktur; returnerar ENBART JSON.
- Resultatet öppnar relevant formulär förifyllt — **inget sparas förrän användaren granskat och bekräftat**.
- AI hittar aldrig på priser; saknas pris i källan blir fältet tomt.

AI-gateway har separat saldo från build-credits (~$1/mån gratis räcker för nuvarande volym).

---

## 10. Lagring & säkerhet

### Storage buckets
- **`case-documents`** — **privat**. Offerter, fakturor, signerade avtal, A-order-PDF:er, bilder. PII bor här. Åtkomst via signerade URL:er, endast personal kan skriva/radera.
- **`case-images`** — publik bucket. Ärendebilder (kvitton, montagebilder). Uppladdning/läsning för inloggade, radering endast personal.
- **`sheet-metal-sketches`** — publik bucket. Plåtskisser.
- **`backups`** — privat bucket utan klientpolicys (endast service_role). Veckovisa databasbackuper (zip); åtkomst via tidsbegränsad signerad länk i backupmejlet.

### Säkerhetsmodell (genomgången juni 2026)
- **RLS aktiverat på samtliga 16 tabeller.** Montörer scopas till egna teamets ärenden; interna vinstfält och A-orderdata är personal-only.
- **`user_roles`** är skrivskyddad för alla inloggade (REVOKE + explicita deny-policys). Endast service_role kan skriva. Detta hindrar rollupptrappning.
- **Edge-funktioner** kräver giltig JWT + rollkontroll (utom de medvetet token-/secret-skyddade publika och cron-funktionerna).
- **Inga hårdkodade hemligheter** i klientbundeln. AI- och e-postanrop går via edge-funktioner.
- **SECURITY DEFINER-funktioner** har fast `search_path = public`.
- `auth_is_admin()` och `auth_user_role()` är SECURITY DEFINER och läser från `user_roles` (krävs av RLS).

### Medvetet accepterade avvägningar
- Personnummer synligt för all personal (litet betrott team).
- Leaked Password Protection går ej att aktivera i Lovable Cloud.
- PIN (4–6 siffror) — utlåsning vid upprepade fel + Supabase rate-limiting gör gissning opraktisk; svagare än lösenord men acceptabelt internt.

---

## 11. Känd teknisk skuld / att göra

| Punkt | Beskrivning | Prioritet |
|---|---|---|


| **GDPR / personnummer** | Systemet lagrar personnummer, kunduppgifter och fastighetsbeteckningar = känsliga personuppgifter. Behöver: laglig grund, gallringsrutin, personuppgiftsbiträdesavtal. **Inte en kodfråga — kräver juridisk kompetens.** | Hög (verksamhetsrisk) |

| **ErrorBoundary-täckning** | Verifiera att ErrorBoundary + loading-states täcker *alla* datahämtande vyer. | Låg |

---

## 12. Historik: n3prenad-migrationen

A-ordersystemet (montörsersättning, fakturering, kreditering) var ursprungligen en fristående app (`n3prenad.lovable.app`, egen databas). Det migrerades INTO CaseFlow under juni 2026:
- All historik kopierades (aldrig flyttades) — gamla databasen lever kvar som arkiv.
- Team och prislista (tidigare i webbläsarens localStorage) ligger nu i `montor_teams` / `a_order_products`.
- Importen är idempotent via `source_n3prenad_id`.
- Skälet: den fristående appen saknade inloggning helt (vinsttimmar skyddades bara av att ingen kände URL:en), och den korsande gateway-sömmen var systemets sköraste del.

FAS 4 genomförd juli 2026: alla vyer läser lokala `a_orders`; importverktyget, `orders-proxy` och `caseflow-gateway` är borttagna.

---

*Detta dokument speglar systemets tillstånd juni 2026. Uppdatera vid varje strukturell ändring.*
