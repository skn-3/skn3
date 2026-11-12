# Roadmap

- [x] Offertsystem etapp 1: prislista (price_items, price_log, kalkyl_settings, offers.calc_data/calc_version, migration 0050), kalkylmotorn i src/lib/kalkyl med tester och underfliken Prislista i offerthubben.
- [ ] Offertsystem etapp 1: prislistan inloggad mot riktig databas (spara, godkänna, import, bilduppladdning) — preview-session saknas (--self utan konto).
- [x] Offertsystem etapp 2: rättningar (källtexter, price_log-rättigheter migration 0051, favorites), state/offer/plan/view/offerMeta-logik med tester, kalkylvyn (översikt, golv, målning, fri rad, galleri, kundläge, spara lokalt och i databasen), kopplingar i OffersView/OfferForm och skicka-spärr, dokumentation. 717 tester gröna; provad med simulerad data i 1194×834, 834×1194 och 390×844, ljust och mörkt.
- [ ] Offertsystem etapp 2: inloggad sparning mot riktig databas (ny offert, uppdatering, Klar → formulär) — preview-session saknas (--self utan konto).
- [x] Offertsystem etapp 2b del 1: spärr pris_andrat + Uppdatera priser (även egna rader), serverspärr i send-offer (driftsatt), UE-import dold för kalkyloffert, pdf_path nollas vid ändrad sparning, ny text för skickad offert, mängd låses inte av ändrat à-pris, kostnad/timmar på fria rader, säkrare lokal kopia, bara admin godkänner priser (migration 0052, trigger provad), femårsregeln och standardvillkor. 738 tester gröna.
- [ ] Offertsystem etapp 2b del 1: inloggad kontroll mot riktig databas (sparning med pdf_path, serverspärren med riktig offert, godkännande som säljare/admin i Prislista) — preview-session saknas (--self utan konto).
- [x] Offertsystem etapp 2b del 2: valgrupper (selections + resolveSlotCode, Byt-sheet, galleri, kundtexter), atgang_saknas, arbetskod i import och "Arbetsrad vid läggning", laggning_saknas, enheter m³/ton/vecka, grenar mark och el (migration 0053), kontrollerna rot_bostadsratt_utvandigt och el_behorighet. 761 tester gröna.
- [ ] Offertsystem etapp 2b del 2: inloggad kontroll mot riktig databas (import med arbetskod, spara gren mark/el, byte av produkt i sparad offert) — preview-session saknas (--self utan konto).
- [x] Offertsystem etapp 2c: grenrader med mängdlista (AddRowSheet med grenbrickor, GrenConfigurator, gren.ts), mått som förslag på mängd, ROT per grenrad i rowLines, grenens etikett i översikt och radhuvud, parseSvNumber med både komma och punkt. 793 tester gröna; provad med simulerad data i 1280 och 390 px.
- [ ] Offertsystem etapp 2c: inloggad kontroll mot riktig databas (spara och läsa tillbaka en grenrad med mått och ROT av, import av prisark med amerikanskt talformat) — preview-session saknas (--self utan konto).
- [x] Offertsystem etapp 3a: kundvyn som data (customerView.ts, offers.customer_view migration 0054), automatisk beskrivning fryses inte längre, public-offer med sanerad kundvy och signerade katalogbilder (driftsatt; svaret utan kundvy identiskt, visat med test och live-anrop), kundsidans "Det här ingår" och prisrader Arbete/Material/Övrigt, "Förhandsvisa" i kalkylen. 817 tester gröna; provad med simulerad data i 1280 och 390 px.
- [ ] Offertsystem etapp 3a: inloggad kontroll mot riktig databas (spara kalkyloffert så att customer_view skrivs, öppna riktig kundlänk med kundvy och katalogbild) — preview-session saknas (--self utan konto).
- [x] Offertsystem etapp 3b: AI-kontroll i kalkylen — kalkyl-ai (tolka/granska/fråga, driftsatt, bara personal), samma logg och tak som N3prenad-AI (migration 0055, ai_reserve_kalkyl, provat i återställd transaktion), ai.ts med validering och tillämpning, panelen AI-kontroll. 846 tester gröna; riktiga gatewayanrop per läge från sandlådan, panelen provad med simulerade svar i 1280 och 390 px.
- [ ] Offertsystem etapp 3b: inloggat anrop genom kalkyl-ai från panelen (riktig session, foto från iPad-kamera, riktig UE-PDF) — preview-session saknas (--self utan konto).
- [ ] Offertsystem etapp 3: tillval — väntar.

- [x] Slå ihop dubblett: merge_cases (migration 0045, admin/koordinator, dynamiska kopplingar, provläge), panel i ärendet och "Möjliga dubbletter" i pipelinevalideringen; provläge och riktig sammanslagning testade på två tillfälliga testärenden (borttagna), montör nekas; 501 tester gröna.
- [ ] Slå ihop dubblett: klicka igenom panelen inloggad — preview-session saknas (--self utan konto).
- [x] F-skatt-sidfot i fakturamejl: send-a-order-invoice och send-montor-debit-invoice ändrade.
- [ ] Driftsätt send-a-order-invoice och send-montor-debit-invoice — väntar på klartecken.

- [x] N3prenad-AI etapp 2 del 3: säljåtgärder (skapa ärende, ändra orderuppgifter med vitlista, status via samma grind som statusRules, godkända extra timmar), anteckning öppnad för seller/koordinator/admin, skicka till kollega via start_conversation och samma meddelandeinsert, list_my_cases med 50 rader och missing-filter. Ren logik i sellerLogic.ts, executors i executeSeller.ts, skicka till kollega öppet för alla roller inklusive montör; n3-ai driftsatt; 387 tester och automatisk typkontroll gröna, inga paket eller publicering. Telefonflöde med lokala uppgifter i ljust/mörkt: fyra förslagskort (skapa ärende, ändra orderuppgifter, status, meddelande till kollega) bekräftade utan runtimefel, skärmbilder i docs/screens/n3-ai.
- [ ] N3prenad-AI etapp 2 del 3: verklig säljarkonversation med skapande/ändring/meddelande och databas-readback — kräver inloggat säljarkonto (--self saknar konto, n3-ai svarar 401 utan session).

- [x] N3prenad-AI etapp 2 del 2: generiska kort, atomiska nya förslag som avbryter tidigare pending, problem/anteckning/delrapport/slutfört/start/KM-/montagebokning/ombokning, datumkontroll och säkra formulärlänkar. Migration 0037 och service-only RPC-rättigheter verifierade; 350 tester och automatisk typkontroll gröna. Telefonflöden med lokala uppgifter i ljust/mörkt, inga runtimefel; inga paket eller publicering. Problemtypen är Övrigt, ansvar Okänt, prioritet Medium (visas i kortet); slutfört montage har bara valfri slutkommentar. Mejlen använder fasta befintliga mottagare via en avgränsad sändare eftersom notify-email nekar montörer; dess behörighet är oförändrad.
- [ ] N3prenad-AI etapp 2 del 2: verklig konversation, sparning/notiser och mejlleverans — --self saknar konto och n3-ai svarar 401 utan session; kräver inloggat valt montörkonto. Lokala notiser är simulerade, inte verifierad leverans.

- [x] N3prenad-AI etapp 2 del 1: sparade kostnadsförslag, 15 min bekräftelse/avbryt med atomisk reservation och dubblettskydd, privat ai-receipts/receipt_path samt befintliga kostnads-/händelse-/aktivitetsinserts via userClient. Migration 0035–0036 och service-only skrivrättigheter verifierade, n3-ai driftsatt, 335 tester och automatisk typkontroll gröna. Åtta telefonbilder med lokala uppgifter visar motfrågor, kort, bekräftelse/omladdning och kostnadslista i ljust/mörkt utan runtimefel; inga paket eller apppublicering.
- [ ] N3prenad-AI kostnad: verklig modellkonversation, kvittouppladdning och bekräftelse med databas-readback — eget appkonto saknas, därför endast lokala uppgifter och executortest verifierade.

- [x] N3prenad-AI: händelser berikade med synliga adresser/ort/kund/status, id-regeln skärpt, migration 0034 och befintlig rad bytta till google/gemini-3-flash-preview (3.1 Flash saknas); admin listar Flash/Lite och behåller fritt modellfält. 321 tester och automatisk typkontroll gröna, n3-ai driftsatt, riktigt gateway-verktygsanrop/följdsvar med syntetisk adress verifierat; ingen apppublicering eller paket. Inloggat appflöde fortsatt ej verifierat, eget konto saknas.

- [x] Chattbilder: migration 0033 (0030 redan upptagen), privat chat-images med 10 MB och JPEG/PNG/WebP verifierad samt medlemsstyrda INSERT/SELECT-policyer; komprimering, bilagor, batchsignering, fullskärmsbild och nedladdning klara. 318 tester och automatiskt bygge gröna; lokalt bildskick och uppladdningsfel verifierade på 390/1280 px. Notiser oförändrade, inga paket eller publicering.
- [x] Chatt: Enter skickar alltid (Shift+Enter radbryter, IME skyddat) på alla skärmstorlekar, enterKeyHint="send" i meddelandefältet och ren shouldSendOnKey med test; 319 tester och typkontroll gröna, inget publicerat.
- [ ] Chatt: Enter-sändning i inloggad förhandsvisning på snal bredd — session kunde inte skapas (flera auth-användare, --self utan konto); kräver att användaren anger konto.

- [ ] Chattbilder: verklig uppladdning och mottagning mellan konton — saknar godkänd kontosession; kräver inloggning i förhandsvisningen.

- [x] N3prenad-AI etapp 1: migration 0032, privat läschatt, fyra RLS-läsverktyg och kontorets användning/inställningar; aktuell Gemini Flash Lite verifierad med riktigt verktygsanrop och följdsvar, 310 tester gröna. Telefon/dator i ljust/mörkt kontrollerade med lokala simulerade svar; inga paket eller publicering.
- [ ] N3prenad-AI: verklig montör-/säljarsession, sparade ai_usage-rader och nekad åtkomst till annat team — session kunde inte skapas (kontogodkännande otillgängligt); kräver inloggning i förhandsvisningen.
- [x] N3prenad-AI etapp 2 fortsättning: rapportering och bokningar via bekräftelsekort; plåt och kontrollmätningsformulär via länkar enligt del 2.
- [x] N3prenad-AI etapp 3: exakt käll-/textbitsschema, migration 0038–0039, rollstyrd fulltext→OR→trigramsökning, två kunskapsverktyg, källhänvisningsprompt och rollchips; adminsidan under AI-användning med .md/.txt-import, avstängning, sökprov och bekräftad radering. Schema/index/RLS och SECURITY INVOKER verifierade; import och AI-funktion driftsatta, inga paket eller publicering. Lokal adminfixture verifierade import, sökprov, AI-svar med källa och radering (inga testkällor kvar); skärmbilder i docs/screens/n3-ai. Atomisk ersättning och separat adminräkning tillagda för att skydda tidigare text vid importfel och visa korrekt antal även när källan är avstängd.
- [ ] N3prenad-AI etapp 3 verkligt end-to-end: --self saknar konto, knowledge-import ger 401 utan session. Verklig adminimport, sökträff/AI-svar och radering kräver inloggat adminkonto; inga riktiga kunskapstexter eller testkällor har skapats i databasen.
- [ ] N3prenad-AI etapp 4: eskalering till admin — inväntar separat beställning.

- [x] Delrapportera montage: migrering 0031, schema/vy/notistrigger verifierade; formulär, kontorsblock och listchips klara; 294 tester och automatiskt bygge gröna, sparning/readback kontrollerade med lokala uppgifter. Riktigt mejlutskick ej testat.
- [x] Dela ärende i chatten: meddelandekoppling, behörighetsstyrda ärendekort/väljare och delningsknappar klara; dela/välj/skicka/kort/djuplänk verifierade på 390/1280 px med lokala uppgifter. Querynyckeln innehåller även roll och användare för säkert cacheurval. Inget publicerat; verklig sändning mellan inloggade konton ej verifierad.

- [x] Komplettera montörernas händelsenotiser och ikonval; migrering 0030 applicerad, case_events/cases-triggrar och funktioner verifierade i databasen, 282 tester och automatiskt bygge gröna. Montörkontrollens authenticated EXECUTE behölls enligt verktygets skydd; inga verkliga inlämningar eller utskick testade, ingen publicering.

- [x] Montörvy C del 1: hemskärmsapp utan service worker, säkra kanter, dra-för-att-uppdatera, migration 0029 och krediteringsfel; 259 tester och automatiskt bygge gröna, manifest/ikoner HTTP 200, draglägen verifierade med lokala testuppgifter; ingen verklig kreditering skickad, ingen publicering.

- [x] Montörlistor: nya status- och typfilter, egna summeringar, KM-flik, datumsortering och gemensamt kortspråk; 241 tester och automatisk typkontroll gröna, filter/expansion/sökning verifierade med lokala testuppgifter vid 390/768/1280 px, ingen datamodelländring eller publicering.
- [ ] Montörlistor: kontroll med riktiga inloggade uppgifter — session för användaren kunde inte skapas; kräver inloggning i förhandsvisningen.

- [x] Separera chatt från notiser: meddelandetrigger och klockkoppling borttagna, gamla chattnotiser rensade, chattens egen tryckbara toast infördes; 235 tester och automatiskt bygge gröna.

- [x] Notiser/chatt: migration 0025 och kompletterande 0026 för explicita kolumnrättigheter, mottagarregler och realtime verifierade.
- [x] Notiser/chatt: klocka, chattpanel, olästmarkeringar och djuplänkar; send-a-order driftsatt med verifierad avsändaridentitet.
- [x] Notiser/chatt: 234 tester och automatiskt bygge gröna, paneler visuellt kontrollerade på dator/telefon med lokala testuppgifter, ingen publicering.
- [ ] Notiser/chatt: verklig sändning/mottagning och djuplänkar mellan inloggade konton — eget konto saknas och session kunde inte skapas; kräver inloggning i förhandsvisningen.

- [x] Fakturamejl egna uppdrag: migration 0024 verifierad, levererad mejlmall och fakturadatum/filnamn införda, 228 tester gröna, automatiskt bygge OK och send-invoice driftsatt; dator/mobil kontrollerade utan verkligt mejlutskick eller publicering.

- [x] Drive-säkerhet: hård läsa/skapa-spärr, vakttest, admintext och bestående regel; 156 tester gröna, bygge OK, funktionen utlagd och mappåtkomst verifierad utan apppublicering.

- [x] Drive-synk: mappregler, dokumenturval, dubblettskydd och gemensamma PDF-namn.
- [x] Drive-synk: behörighetsskyddad körning, status, återförsök och adminflik; funktion utlagd.
- [x] Drive-synk: händelsestyrd automatisk start och begränsade kvartstidsåterförsök, stopp vid tom kö; aktiveras efter lyckat kopplingstest.
- [x] Drive-synk: 141 tester gröna, automatiskt bygge OK, dator/mobil visuellt kontrollerat med verkliga antal och simulerade svar.
- [x] Drive-synk: live service-kontroll hittar 331 dokument; test/run ger 503 med GOOGLE_SERVICE_ACCOUNT_JSON saknas; 401 utan behörighet, inga uppladdningar/loggrader och inget aktivt cronjobb.
- [x] Drive-synk: kopplingstestet nollställer last_error; admintext, etikett och mappsökväg säger Smartklimat N3Prenad; 156 tester gröna, bygge OK, funktion utlagd, ingen publicering.
- [ ] Drive-synk: verklig uppladdning och automatisk körning — Drive svarar "File not found" på det sparade rotmapps-id:t 1-LXD1P-l3yhmSggZQkiHy_YrFj1Wodi3 (feltsidran skrevs 16:34 UTC); nyckeln och delningen finns, men det nuvarande Smartklimat N3Prenad-mappens id måste anges i fältet på Drive-synk-sidan.
- [ ] Drive-synk: inloggat adminflöde — blockerad av saknad kontosession; eget konto saknas i appens inloggningsregister.

- [x] PDF-namn: gemensam modul, angivna nedladdningar, metadata och mejlbilagor.
- [x] A-order: omgenerera faktura/kredit-PDF utan statusändringar, valfritt mejlutskick.
- [x] PDF-flöden: 122 tester gröna, automatiskt bygge OK, panel visuellt kontrollerad med testdata på dator/mobil; ingen publicering.
- [ ] PDF-flöden: verklig inloggad omgenerering och readback — blockerad av saknad session för användaren; behöver inloggning i preview.

- [x] Utbetalningar: aktivt valda extrajobb, gemensam självfaktura per team och oförändrad KM-logik.
- [x] Utbetalningar: sex nya enhetstester, hela sviten och typkontroll gröna.
- [ ] Utbetalningar: inloggat preview-test återstår och utelämnas på användarens uttryckliga begäran.

- [x] Offertflödet del A: levererad textlogik/PDF inlagd, fyra font-hashar matchar, public-offer deployad, typkontroll och 76 tester gröna; PDF visuellt kontrollerad (nästa-steg-rutan bryts till egen sida i testexemplet, mallen lämnad oförändrad).

- [x] Design Del B: ersätt fem filer för inloggning, pipeline och ärendekort enligt levererad text.
- [x] Design Del B: 76/76 tester och automatiskt bygge gröna; inloggning, PIN-knappar och tema verifierade vid 390/1440 px utan runtime-fel.
- [ ] Design Del B: inloggad pipeline och montörlista samt verkligt fel-PIN-svar — blockerade av att kontosession inte kan skapas för användaren.

- [x] Täta AppHeader-navigationens brytpunktsglapp på alla bredder.
- [x] Ersätt separata förhandsvyknappar med en gemensam "Byt vy"-meny.
- [x] Verifiera ljust/mörkt läge och 375 px–fullbredd i den körande appen.
- [x] Låt plåtprofilens vinklar styra skissen och visa gradbågar.
- [x] Bädda in samma skiss i beställnings-PDF:en och kontrollera visuellt.
- [x] Del 1: mobilens knapprader och viewport; fem separat renderade vyer med testdata verifierade vid 390×844.
- [ ] Del 1: inloggad mobilkontroll med riktiga ärenden — blockerad av saknat kontogodkännande.
- [x] Del 2: teamfiltrerade A-ordrar och separata PDF-länkar; typer, sex regressionstester och policydefinitioner verifierade.
- [x] A-ordrar: statusprickarna styr boxen själva med PopoverAnchor; hover, klick, pekskärm och klick utanför verifierat i isolerad miljö.

- [x] Konsultlöner 1B: adminflik, guiden, faktura-/spec-PDF, förskott, lånereskontra, inställningar
- [x] Konsultlöner 2: utskick, Drive-arkivering, loggbakfyllning

- [x] N3prenad-AI röstinmatning: mikrofonknapp (MediaRecorder, 60 s/2 MB, avbryt, aldrig autoskick), transkribering via gatewayen (openai/gpt-transcribe) med vokabularhint, eget dagstak 150, ai_usage kind/audio_seconds, voice_enabled i ai_settings, adminväxel och röststatistik; migration 0041, 396 tester gröna, gateway-anrop verifierat med genererad ljudfil, funktionen kräver inloggning (401 utan).
- [ ] N3prenad-AI röstinmatning: inloggat flöde med riktig svensk talinspelning och knappens tillstånd i appen — blockerat av att kontosession inte kan skapas (ditt konto saknas i appens inloggningsregister).

- [x] N3prenad-AI Samtalsläge: migration 0042, röstbeslut med samma atomiska skydd, TTS-karaktärreservation, delade inspelnings-/uppspelningshooks, automatisk lyssning, Läs upp och adminfält. OpenAI GPT-4o mini TTS/marin gav svensk MP3 (200, 1,419 s). 420 tester gröna; telefon/iPad simulerat röstflöde i ljust/mörkt utan runtimefel. Inga paket eller publicering.
- [ ] Samtalsläge verklig inloggad sparning/TTS-logg och fysisk iOS-ljudupplåsning: testsession saknas (--self har inget konto); automatiskt tystnadsflöde ej end-to-end verifierat på fysisk enhet.

- [x] Timrättning: begärda-spärr borttagen i orderinfo och AI-proposal/executor; gemensam 0–500-kontroll och mjuk varning, oförändrad resultatberäkning. Migration 0043–0044 för additivt decimalstöd (gamla heltalsfältet kompatibelt), 436 tester och automatisk typkontroll gröna. Orderinfo sparar 23 i fallet 53/0/23 och visar varning för 54 med simulerad post, utan runtimefel.
- [ ] Timrättning verklig inloggad sparning/readback: --self saknar appkonto; verifierat UI-anrop men inte verklig kundpost. Inga paket eller publicering.

- [x] Ärendematchning: gemensam modul caseMatching (edge-delad) med 27 tester.
- [x] Ärendematchning: CoupleAOrderDialog + CaseCombobox (tokensök).
- [x] Ärendematchning: AOrderForm "Ärende hittat" med Koppla/Ångra.
- [x] Ärendematchning: PayoutUploadView alla vägar, avbockad skapa-ruta.
- [x] Ärendematchning: CaseDetailPanel alla A-ordrar + Flytta hit.
- [x] Ärendematchning: dubblettvarning i SignedCaseDialog/NewTicketDialog/övriga skapanden.
- [x] Ärendematchning: FutureJobDialog, KmPayoutView, LinkOrdersView, ImportInvoicesView och N3prenad-AI.
- [x] Ärendematchning: provkörd mot 150 kopplade A-ordrar (137 rätt topp, alla felaktiga auto-träffar är kända dubbletter/felkopplingar); 488 tester gröna; n3-ai deployad.
- [ ] Ärendematchning: inloggad kontroll i förhandsvisningen (dialog, formulärrad, utbetalning, Flytta hit) — blockerad av att ditt konto saknas i appens inloggningsregister.

- [x] Drive-bokföring v2: nya utgiftstyper och kvitton, granskningskö (review/out_of_range), earliest_open_date, aldrig skapa årsmapp, ordgränsdubbletter, drive_misfiled + daglig audit (cron 03:15 UTC), händelsestyrd väckning för alla uppladdningar och kvitton, deterministisk Mockfjärds-tolkning med varningar och Spara ändå, adminflik (månadsöversikt, Att granska, felplacerade). Migration 0046; tre MIKH-datum rättade och loggade. 546 tester, typkontroll och Deno-kontroll gröna.
- [ ] Drive-bokföring v2: driftsätt drive-sync, extract-payout och parse-mockfjards-invoice — väntar på ditt klartecken. Därefter kör audit (knapp eller nattjobb) för att lägga MIKH0334/0343/0349 i okt 2026.
- [ ] Drive-bokföring v2: inloggad kontroll i adminfliken och uppladdningsvyn samt test mot en riktig Mockfjärds-PDF — kräver driftsättning och testsession.
