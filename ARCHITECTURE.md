# ARCHITECTURE.md — SmartKlimat N3prenad

> Systemkarta för SmartKlimat N3prenad AB:s interna verktyg.
> Syftet med detta dokument är att kunskapen om systemet ska bo i repot — inte bara i en chatt eller i någons huvud.
> **Håll det uppdaterat:** när en ny tabell, edge-funktion, fakturatyp eller nummerserie tillkommer, lägg in den här i samma veva.

Senast större uppdatering: juli 2026.

---

## 1. Översikt

Internt verktyg för fönster-/dörrmontageverksamheten. Hanterar hela kedjan: ärenden (pipeline) → kontrollmätning → produktion → leverans → montage → fakturering, plus ett separat offert-/entreprenadspår och ett A-ordersystem för montörsersättning.

**Viktig namnkonvention:** I all text som användare ser heter systemet **"SmartKlimat N3prenad"**. Namnet **"CaseFlow"** är bara Lovables projektnamn och förekommer i admin-/utvecklarsammanhang — aldrig mot montörer, säljare eller kunder.

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
- **`cases`** — kärnan. Mockfjärds-jobb: kund, adress, `order_number` (Mockfjärds försäljningsorder), team, km_team, status, ekonomifält (`order_value`, `extra_hours_sold`, `extra_hours_approved`), montage-/leveransdatum, `status_changed_at` (sätts av trigger vid statusbyte; driver liggetids-chippen i pipelinen), `public_token` (kundstatussidans token). Kundavstämning: `customer_followup_contacted_at`, `customer_followup_signed_at`, `customer_followup_done_at`, `customer_followup_done_by` (nullbara; skrivs bara av personal — triggern `cases_protect_followup_fields` stoppar montörer; fakturerade ärenden före funktionen backfylldes som klara med `done_by = 'Före funktionen'`). Skräphämtning: `waste_pickup_requested_at/_by`, `waste_pickup_note`, `waste_pickup_earliest` (montör eller personal begär) och `waste_pickup_booked_at/_by`, `waste_pickup_date` (bara personal — triggern `cases_protect_waste_booking`). Fälten finns även i vyn `cases_montor` (security_invoker).
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
- **`offers.calc_data` / `calc_version`** — (nullbara, migration 0050) kalkyl per rum och yta (`KalkylData` från `src/lib/kalkyl`), belopp exklusive moms. Skrivs av kalkylvyn (`src/components/kalkyl/`, öppnas med "Ny kalkyl" eller "Kalkyl" i Offerter); radernas `line_items` och alla summor kommer då från `buildOfferPayloadFromKalkyl` (via `toOfferLineItems` + `calcOfferTotals`), och OfferForm visar raderna skrivskyddade. Offerter med `calc_data` får bara skickas när `runKontroller` ger `canSend` (gemensam spärr i `src/components/kalkyl/sendGate.ts`, både i listan och i formuläret, med offertens status som `ctx`); PDF går att skapa med samma varning. Kontrollen `pris_andrat` stoppar utkast vars sparade à-pris inte längre är prislistans pris (regeln i `priceCheck.ts`, löses med "Uppdatera priser" = `repriceKalkyl`). `atgang_saknas` stoppar färgrader utan åtgång i prislistan och `laggning_saknas` golvmaterial utan arbetsrad för läggning; `rot_bostadsratt_utvandigt` (utvändigt arbete i bostadsrätt) och `el_behorighet` (elarbete) varnar utan att stoppa. `send-offer` har en egen serverspärr (`supabase/functions/_shared/offerSendGate.ts`): rad utan pris eller pris som inte är godkänt ger 400. Ny offert från kalkylen skapas som utkast med `source = 'kalkyl'` och standardvillkoren i `terms_text`. Sparar kalkylvyn en befintlig offert med ändringar sätts `pdf_path = null` i samma sparning (ny PDF krävs). UE-importen i OfferForm visas inte för offerter med kalkyl. Lokal kopia i webbläsaren: nyckel `n3prenad-kalkyl:<användare>:<id|ny>`, aldrig personnummer, tas bort efter 14 dagar. Grenrader (sedan etapp 2c, ingen migration, `calc_version` fortfarande 1): en kalkylrad med `trade: 'fri'` och `gren` (fasad, tak, altan, mark, el, badrum, kok, renovering) samt valfria `measure` (`area` m², `length` m, bara förslag på mängd) och `rot_off`. All logik för fria rader gäller oförändrat (prislistepriser, omprisning, kontroller, offertrader, serverspärren). Mängdlistan, måtten och ROT-reglaget räknas i `src/lib/kalkyl/gren.ts`; med `rot_off` räknas radens arbete som övrigt i `rowLines`, så summering, ROT-underlag, `line_items` och kontroller följer med medan sparad ROT-klass och prislistan är orörda.
- **`offers.customer_view`** — (nullbar jsonb, migration 0054, etapp 3a) kundvyn för offerter från kalkylen, version 1: `intro` (säljarens egen beskrivning, null = automatisk), `sections` (en per kalkylrad: rum, benämning, typ, belopp ex moms = summan av radens offertrader, kundtext från `rowScopeText`, uppgifter och valbrickor med kulör/provbit/bildsökväg), `common` (gemensamma rader och justeringar) och `totals` (arbete/material/övrigt efter sparad klass). Byggs bara av `buildCustomerView` i `src/lib/kalkyl/customerView.ts` och sparas av `kalkylSaveFields` i samma sparning som `line_items`; innehåller aldrig kostnad, timmar, prisstatus, prisdatum, koder, anteckningar, kontroller eller favoriter. När `intro` är null räknas beskrivningen som automatisk: fältet är tomt i kalkylens offertuppgifter och texten byggs om från kalkylen vid varje sparning. Ändras beskrivningen i OfferForm uppdateras `intro` (`customerViewWithFormIntro`). Kundsidan visar "Det här ingår" (`src/components/public/CustomerOfferSections.tsx`) och prisraderna Arbete/Material/Övrigt i stället för offertraderna; samma komponent visas i kalkylens "Förhandsvisa" (`CustomerPreview.tsx`, byggd från osparad kalkyl). Offerter utan `customer_view`, eller med okänd version, visas som förut. Sedan etapp 3c har kundvyn också `options` (tillval, samma form som `sections`, högst 50; saknas i äldre kundvyer och blir då en tom lista); kundsidan och förhandsvisningen visar dem i kortet "Tillval" ("Lägg till om du vill") efter "Det här ingår", med plustecken före priset. Kunden väljer aldrig tillval (se Tillval). I brickan (`Tile` i `CustomerOfferSections.tsx`) står beskrivning och kulörnamn åtskilda med " · " och kulörkoden som en egen del med bara mellanslag före (ingen avskiljare strax före koden, koden bryts aldrig mitt i och flyttar till egen rad utan hängande tecken när den inte får plats); i kontaktkortet på kundsidan står telefon och e-post på var sin rad utan avskiljare.
- **Tillval** (etapp 3c del 1) — `KalkylRow.optional = true` (calc_data fortfarande version 1; en rad utan fältet ingår). Regeln ligger bara i `kalkyl.ts`: `includedRows`/`includedLines` (underlag för `toOfferLineItems`, `buildOfferPayloadFromKalkyl`, `kalkylTotals`, `summarizeKalkyl`, marginal, kostnad saknas, kundvyns `sections`/`totals`, offertens automatiska titel och beskrivning) och `optionalRows`/`optionTotals` (tillvalens belopp ex moms, totalt och per rad). Priskontrollerna (pris saknas, inte godkänt, ändrat, gammalt, åtgång, arbetsrad) gäller alla rader, även tillval, och stoppar utskick som förut; serverspärren `offerSendGate` läser alla rader i calc_data och är oförändrad. `setRowOptional` märker en rad; reglaget "Tillval" finns i varje rads inställningar (`RowOptionalSwitch` i `ConfiguratorShell`) och i radens meny i översikten ("Gör till tillval"/"Räkna in i summan"). Översikten visar brickan "Tillval" och dämpat belopp med plustecken; sammanfattningen visar "Tillval, ingår inte" (`optionSummaryLine`). PDF:en visar tillvalen bara när kundvyn finns (etapp 3d, se nedan). **Regel (beslut 14 november 2026, etapp 3e): kunden väljer aldrig tillval.** Kundsidan och det signerade avtalet visar tillval bara som information, med pris och utan val. Säljaren väljer i kalkylen: reglaget på raden, radens meny i översikten och knappen "Lägg till i offerten" vid varje tillval i förhandsvisningen "Kundens offert" (`CustomerPreviewSheet`; `setRowOptional(data, id, false)` där tillvalets id i kundvyn är kalkylradens id, raden "Tillagt i offerten: …" med Ångra och `role="status"`, bara när kalkylen går att ändra). Fokus sätts aldrig programmatiskt på en knapp som ändrar kalkylen: panelen själv får fokus när den öppnas, statusraden efter "Lägg till", avsnittet Tillval efter "Ångra" (alla `tabIndex={-1}` utan ram), och knappen som öppnade panelen får fokus igen när den stängs. Knappen kommer in via `CustomerOfferOptions.renderAction`, som bara förhandsvisningen skickar in; kundsidan gör det aldrig. `accept-offer` räknar aldrig om en offert efter kundens val. AI-kontrollen får `optional` per rad i underlaget och föreslår aldrig att en rad ska bli tillval eller räknas in.
- **Offert-PDF rum för rum** (etapp 3d) — `buildOfferDocDef` i `src/lib/offerPdf.ts` bygger både offert-PDF:en (OfferForm/OffersView) och det signerade avtalet (kundsidan); anroparna skickar hela offerten inklusive `customer_view`. Kundvyn används bara när `offerPdfCustomerView` (= `sanitizeCustomerView`, version 1; kundsidans variant med `image_url` godtas) ger ett värde. Då ersätts "Omfattning" av "Det här ingår" (intro, ett odelbart block per avsnitt med rubrik och belopp, text, uppgifter och valrader med färgruta från kulörens hex eller provbitens färg, tunna linjer mellan blocken, gemensamma rader och justeringar), "Tillval, ingår inte i priset" när tillval finns, och pristabellen visar Arbete/Material/Övrigt från kundvyns totals. Bilder ritas aldrig. Summor, totalruta, betalplan, "Så accepterar du offerten", villkor och signeringsverifikat räknas som förut från `line_items` med `calcOfferTotals`. Gemensamma rader och justeringar ligger i samma odelbara block som sista avsnittet (finns inga avsnitt: med rubriken), så de hamnar aldrig ensamma överst på en sida. Valrader skriver namn, beskrivning och kulörkod åtskilda med " · " (`offerPdfItemText`). Utan giltig kundvy är dokumentdefinitionen identisk med före 3d; `offerPdfCustomerView.test.ts` jämför mot en fryst kopia (`src/lib/__tests__/fixtures/offerPdfLegacy.ts`, ändras aldrig).
- **AI-kontroll i kalkylen** (etapp 3b) — knappen "AI-kontroll" i kalkylvyns topprad (dold i kundläget) öppnar `AiPanel.tsx` med tre avsnitt: Tolka underlag (anteckning, upp till fyra foton nedskalade till 1 600 px JPEG, UE-offert som PDF högst 10 MB → förslag på rum och rader), Kontroller (samma `KontrollCard` som i översikten plus "AI-granskning" med högst åtta iakttagelser) och Fråga om offerten. All logik i `src/lib/kalkyl/ai.ts`: `buildAiContext` (katalog utan priser/kostnader, kalkyl utan kunduppgifter, kostnad, timmar, anteckningar och prisstatus), `validateAiProposal`, `proposalStatus`, `applyAiRow` (bara de vanliga state-/gren-funktionerna, priser bara från prislistan, rum med saknade mått får standardmått och anteckningen "Mått saknas, kontrollera rummet"), `validateAiReview`, `applyAiSuggestion` och `findCustomerData` (personnummer och offertens kunduppgifter stoppar anropet). Ingenting ändras förrän säljaren trycker "Lägg till"; AI-förslag stoppar aldrig utskick. I en skrivskyddad offert visas bara frågeavsnittet. Foton och PDF:er sparas aldrig.
- **`price_items`** — prislistan för entreprenadkalkylen (migration 0050). Stabil `code` (gemener), `trade` (golv/malning/fasad/tak/altan/mark/el/badrum/kok/renovering/gemensamt; `mark` och `el` sedan migration 0053), `kind`, `rot_class` (bara `arbete` ger ROT och blir `is_labor`), `slot` (valgrupp), kundpris `price_ex_vat` och intern `cost_ex_vat` (exklusive moms; NULL = saknas, hittas aldrig på), förpackning/spill/åtgång, kulör (NCS/RAL), ritad `swatch` eller `image_path` i `catalog-images`, `status` utkast/godkand/arkiverad med `approved_by/_at`, `meta` (receptkopplingar: golvmaterialets läggningsrad `lay_code`, väljs i Prislista som "Arbetsrad vid läggning" eller med importkolumnen `arbetskod`; övriga nycklar lämnas orörda). Enheter: m², m, st, tim, l, kg, fast, m³, ton, vecka. Valgrupperna `golv.underlag`, `golv.sockel`, `golv.troskel`, `malning.vaggfarg`, `malning.takfarg` och `malning.snickerifarg` är valbara i kalkylen: kalkylraden sparar valet i `input.selections` och `resolveSlotCode` (`src/lib/kalkyl/slots.ts`) avgör koden (valet, annars dagens fasta kod, annars första icke arkiverade i valgruppen). Bara godkända priser kan skickas. Bara administratör godkänner: triggern `price_items_guard_approval` (migration 0052) stoppar godkänd status vid insert, byte till godkänd och ändrat pris på en rad som förblir godkänd om inte `auth_is_admin()`; en rad utan pris kan aldrig vara godkänd (gäller alla, även tjänstekontot). Säljare och koordinatorer kan ändra priser (raden blir utkast) och arkivera. Startdata: 29 exempelpriser som utkast.
- **`price_log`** — spårbarhet: triggern `price_items_log_changes` (security definer) skriver en rad när kundpris, kostnad eller status ändras. Personal läser, ingen skriver direkt (migration 0051 återkallar alla ärvda skrivrättigheter för anon/authenticated; bara SELECT finns kvar).
- **`kalkyl_settings`** — en rad (id = 1) med marginalmål, max prisålder och standardmått för dörr och fönster.
- Åtkomst: personal (admin, säljare, koordinator) för alla tre; montörer har ingen åtkomst.

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

**Kundavstämning efter montage:** när ärendet står i `montage_klart` (eller `fakturerad`) och `customer_followup_done_at` är null ligger det överst i koordinatorns inkorg ("Att stämma av med kund") och får chippen "Kundavstämning kvar" i pipelinen. Koordinatorn bockar i Kund kontaktad + Kund har signerat och klarmarkerar (case_event `customer_followup_done`; Ångra loggar `customer_followup_reopened`). Avstämningen är en checklista bredvid pipelinen och ändrar aldrig status. Urval och spar-logik: `src/lib/customerFollowup.ts` + `src/hooks/useCustomerFollowup.ts`.

**Skräphämtning (Ragn-Sells):** montören trycker "Boka Ragn-Sells" (montage_bokat–fakturerad) → begäransfälten sätts, case_event `waste_pickup_requested` ger notis till personal via `notify_montor_case_event`, och `notify-email` (fasta mallen `waste_pickup_requested`) mejlar koordinatorn från ärendet anroparen själv får läsa. Ärendet ligger i inkorgen ("Skräp att boka hämtning för") och får chippen "Skräp att hämta" tills kontoret markerar bokad (`waste_pickup_booked` → notis till montörsteamet). Ändrar aldrig status. Logik: `src/lib/wastePickup.ts` + `src/hooks/useWastePickup.ts`.

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
- `notify-email` — interna mejl. Fritt innehåll (`to`/`subject`/`body`/`rows`) kräver koordinator/admin (`requireCoordinator`).
  Fasta mallar får anropas av alla inloggade (även montörer) med bara `{ template, case_id[, deviation_id, images_only] }`:
  `montage_klart`, `montage_delrapport`, `kontrollmatning_inskickad`, `km_klar`, `avvikelse_rapporterad`, `km_bokad`, `montage_bokat` (`montorEmails.ts`) och `waste_pickup_requested` (`wastePickupEmail.ts`).
  Ärendet läses med anroparens JWT mot `cases_montor` (RLS avgör), mallen kräver en case_event av rätt typ skapad av anroparen de senaste 15 minuterna (annars 409; skräphämtning kräver en färsk begäran), och mottagare, ämne och innehåll byggs i funktionen – aldrig ekonomi, bara adress, kund, team, händelsen, montörens text och länken `/?case={id}`.
  Mottagare: koordinatorn (`COORDINATOR_TO` i `_shared/mailRecipients.ts`) för rapporter till kontoret, ärendets säljare för `km_klar`, teamets egen adress för `km_bokad`/`montage_bokat` (okänd adress = hoppas över); kopia alltid till `MAIL_CC`.
  Klienten anropar via `src/lib/montorEmail.ts`; huvudåtgärden sparas alltid först, misslyckat mejl ger en diskret toast-varning, och lyckat utskick loggas i `activity_log` (category `email`, action = mallen).
- `send-offer` — skickar offert till kund (publik länk + ev. PDF). Offerter med kalkyl stoppas med 400 om en rad saknar pris eller ett pris inte är godkänt (`_shared/offerSendGate.ts`, testad i `offerSendGate.test.ts`). Anropas bara från OffersView (Skicka i listan) och OfferForm (Skicka till kund), båda efter `checkKalkylSend`.
- `send-invoice` — offert-/uppdragsfaktura (handpenning/slutfaktura).
- `send-a-order` — skickar A-order till montör (PDF + bildbilagor).
- `send-a-order-invoice` — A-order-/kompletteringsfaktura. CC: n3prenad@, daniel@malke.se, mf@malke.se.
- `send-montor-debit-invoice` — debetfaktura till montör. CC: n3prenad@, daniel@malke.se.
- `send-sheet-metal-order` — plåtbeställning till joakim@byggplatar.se, CC mf@malke.se.
- `notify-email` — generella interna notiser.
- `send-montage-report` — montagerapport-PDF (klientbyggd jsPDF) till valfri mottagare, CC daniel@malke.se + mf@malke.se. Innehåller littera-utfall och avvikelser, aldrig interna kostnader.
- `send-customer-sms` — kund-SMS via 46elks (avsändare "N3prenad"). Två lägen: montage bokat (personal-JWT) och påminnelse dagen före montage (cron-secret). Kunder kontaktas ALDRIG via mail från N3prenad — endast SMS (underentreprenörsförhållande till Mockfjärds).

### AI-extraktion (Gemini, kräver inloggad personal-JWT)
- `extract-ue-offer` — UE-underentreprenörsofferter (PDF → rader, markup, ROT-split).
- `extract-payout` — Mockfjärds-utbetalningar.
- `parse-a-order-invoice` — montörers egna faktura-PDF:er.
- `parse-mockfjards-invoice` — Mockfjärds-självfaktura → A-order (förifyller, matchar ärende via order_number).
- `parse-offer-text` — fritext → strukturerad offert.
- `parse-customer-portal` — Mockfjärds kundportal → ärende.

### Publika / token-skyddade (kundflöden, ingen inloggning)
- `public-offer` — visar offert via `public_token`. Svaret byggs av `_shared/publicOffer.ts` (`PUBLIC_FIELDS` oförändrad); `customer_view` saneras av `_shared/customerView.ts` (`sanitizeCustomerView`, kända nycklar, typer och gränser, annars null) och läggs till bara när det sanerade värdet finns. Bildsökvägar som finns i `price_items.image_path` signeras från `catalog-images` (en timme) och skickas som `image_url`; själva sökvägen skickas aldrig ut. `publicOffer.test.ts` visar att svaret utan kundvy är identiskt med det tidigare. Tillvalens bilder signeras på samma sätt som avsnittens.
- `kalkyl-ai` — AI-kontrollen i kalkylen (lägena `tolka`, `granska`, `fraga`), bara admin/säljare/koordinator (`requireStaff`). Gatewayen via Chat Completions med JSON-svar och modellen i `ai_settings.model` (samma inställning som N3prenad-AI; `kalkylAiModel` faller tillbaka på `google/gemini-2.5-flash` bara när inställningen saknas eller är ogiltig, och modellen som användes skrivs i `ai_usage.model`); ren logik (gränser, sanering av underlaget på servern, svenska systemprompter, felkoder) i `kalkyl-ai/logic.ts`, testad i `src/lib/__tests__/kalkylAiFunction.test.ts`. Använder N3prenad-AI:s logg och tak: varje anrop reserveras atomiskt med `ai_reserve_kalkyl` (migration 0055) som en rad i `ai_usage` (`kind` = `kalkyl_tolka|kalkyl_granska|kalkyl_fraga`, tecken, foton, PDF, tokens) och räknas mot `ai_settings.daily_message_limit` tillsammans med dagens frågor i N3prenad-AI (`ai_begin_message` räknar nu även kalkyl-ai). Varje rad i underlaget har `optional` (true för tillval; `sanitizeAiContext` ger false när fältet saknas eller inte är `true`, så äldre klienter fungerar som förut) och alla tre prompterna har den gemensamma meningen `OPTIONAL_RULE` om tillval. `ai_settings.enabled` och `gateway_error` gäller också; 402/403 från gatewayen pausar alla AI-anrop tills administratören återställer.
- `accept-offer` — kund signerar (genererar signerad PDF, blockerar utgångna).
- `decline-offer` — kund avböjer.
- `calendar-ics` — ICS-kalenderflöde, skyddat med hemlig token i URL.
- `public-case-status` — kundstatussida för ärenden via `cases.public_token` (adress, tidslinje, leverans-/montagedatum, ev. klimatcertifikat). Läser aldrig ekonomi- eller interna fält.

### Cron / schemalagda (kräver CRON_SECRET-header)
- `daily-reminders` — dagliga påminnelser (besök, leveranser, offerter, PIN-byte, kund-SMS dagen före montage). Innehåller PÅMINNELSE 1–6.
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
- **`case-images`** — privat bucket. Avvikelsefoton och kvitton; visas enbart via tidsbegränsade signerade URL:er (SignedImage / getSignedImageUrl). Gjordes privat juli 2026.
- **`sheet-metal-sketches`** — privat bucket. Plåtskisser; visas via signerade URL:er, bifogas (inte länkas) i beställningsmail. Gjordes privat juli 2026.
- **`catalog-images`** — produktbilder för prislistan (ingen persondata). Privat eftersom arbetsytan spärrar publika buckets; personal läser via signerade länkar (SignedImage) och är ensam om att skriva/radera.
- **`backups`** — privat bucket utan klientpolicys (endast service_role). Veckovisa databasbackuper (zip); åtkomst via tidsbegränsad signerad länk i backupmejlet.

### Säkerhetsmodell (genomgången juni 2026)
- **RLS aktiverat på samtliga 16 tabeller.** Montörer scopas till egna teamets ärenden; interna vinstfält och A-orderdata är personal-only.
- **`user_roles`** är skrivskyddad för alla inloggade (REVOKE + explicita deny-policys). Endast service_role kan skriva. Detta hindrar rollupptrappning.
- **Edge-funktioner** kräver giltig JWT + rollkontroll (utom de medvetet token-/secret-skyddade publika och cron-funktionerna).
- **Inga hårdkodade hemligheter** i klientbundeln. AI- och e-postanrop går via edge-funktioner.
- **SECURITY DEFINER-funktioner** har fast `search_path = public`.
- `auth_is_admin()` och `auth_user_role()` är SECURITY DEFINER och läser från `user_roles` (krävs av RLS).
- **Läsregler som stramades åt november 2026** (tidigare `USING (true)` för alla inloggade):
  - `ai_settings` — alla med en roll i appen (`auth_is_admin() OR auth_user_role() IS NOT NULL`); montörens röstknapp läser `voice_enabled`. Ändring endast admin.
  - `case_climate_compensation` — endast personal: admin, säljare, koordinator (innehåller kundernas hämtlänkar). Montörer läser den inte.
  - `climate_events` — endast personal: admin, säljare, koordinator (trädstatistik, besöksträd). Montörer läser den inte.
  - `order_climate_compensation` — endast admin; ingen kod läser tabellen.
  - `knowledge_sources` — samma villkor som `knowledge_chunks_read`: aktiv källa och målgrupp `all` eller användarens roll, eller admin/koordinator. Admin ser även avstängda källor via `knowledge_sources_admin`.
  - Edge-funktioner som skriver/läser klimattabellerna (`klimatkompensera`, `public-case-status`) använder tjänstenyckeln och påverkas inte.

### Medvetet accepterade avvägningar
- Personnummer synligt för all personal (litet betrott team).
- Skyddet mot läckta lösenord (`password_hibp_enabled`) går numera att slå på i Lovable Cloud men ska vara **avstängt** så länge PIN lagras som lösenord: i stort sett alla sexsiffriga koder finns i läcklistan, så tvingat och frivilligt PIN-byte skulle nekas. Fyndet är markerat som medvetet accepterat i säkerhetsgenomgången.
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

## Testsvit (regressionsskydd på pengaflödena)
Beräkningslogiken för ekonomi bor i rena moduler: `src/lib/caseEconomy.ts` (marginalformeln — enda källan för EconomyView OCH CaseMarginBlock), `src/lib/invoiceMath.ts` (moms + radbelopp) och `src/lib/litteraDiff.ts` (kontrollmätningens diff, delas av personalvy/montörsvy/montagerapport). Testerna ligger i `src/lib/__tests__/`. Entreprenadkalkylen bor i `src/lib/kalkyl/` (geometri, förpackningar, recept för golv och målning, summering, offertrader till `calcOfferTotals`, kontroller, kulörer, prisändring och prisimport) med tester i `src/lib/__tests__/kalkyl*.test.ts` och startdatan som fixtur (`kalkylFixture.ts`); prislistans admin (`PriceListAdmin`) testas i `src/components/offers/__tests__/`. Kalkylvyns logik — oföränderliga uppdateringar (`state.ts`), offertpayload/titel/beskrivning (`offer.ts`), ritningens geometri (`plan.ts`), visningsvärden och skicka-spärr (`view.ts`) samt kunduppgifter/sparfält (`offerMeta.ts`) — testas i `kalkylState.test.ts`; prisjämförelsen (`priceCheck.ts`), lokala kopior (`localDraft.ts`) och rättningarna från granskningen av etapp 2 testas i `kalkylRattningar.test.ts`; valgrupper, åtgång, arbetskod, enheter/grenar och de nya kontrollerna testas i `kalkylValgrupper.test.ts` (med receptens rader före valgrupperna som referens i `kalkylLegacyRows.ts`); grenrader (mängdlista, mått, ROT per grenrad) och talformatet i importen (`parseSvNumber`, både komma och punkt) testas i `kalkylGrenrader.test.ts`; kundvyn (summor mot `total_ex_vat`, rekursiv nyckellista, intro och automatisk beskrivning) testas i `kalkylCustomerView.test.ts` och saneringen i `supabase/functions/_shared/customerView.test.ts`; AI-kontrollens förslag, granskning och underlag testas i `kalkylAi.test.ts`; tillvalen (summor, av/på, kontroller, kundvyns `options` och saneringen) testas i `kalkylTillval.test.ts`; offert-PDF:en med och utan kundvy testas i `offerPdfCustomerView.test.ts`; komponenterna i `src/components/kalkyl/` innehåller inga formler. **Regel: varje ändring som rör ekonomi, fakturering eller littera-diff avslutas med `npm test` — alla tester ska passera före commit. Ändra aldrig en formel i en vy; ändra i lib-modulen så följer alla konsumenter med.**

---

*Detta dokument speglar systemets tillstånd juni 2026. Uppdatera vid varje strukturell ändring.*
