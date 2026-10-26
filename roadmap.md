# Roadmap

- [x] N3prenad-AI etapp 2 del 1: sparade kostnadsförslag, 15 min bekräftelse/avbryt med atomisk reservation och dubblettskydd, privat ai-receipts/receipt_path samt befintliga kostnads-/händelse-/aktivitetsinserts via userClient. Migration 0035–0036 och service-only skrivrättigheter verifierade, n3-ai driftsatt, 335 tester och automatisk typkontroll gröna. Åtta telefonbilder med lokala uppgifter visar motfrågor, kort, bekräftelse/omladdning och kostnadslista i ljust/mörkt utan runtimefel; inga paket eller apppublicering.
- [ ] N3prenad-AI kostnad: verklig modellkonversation, kvittouppladdning och bekräftelse med databas-readback — eget appkonto saknas, därför endast lokala uppgifter och executortest verifierade.

- [x] N3prenad-AI: händelser berikade med synliga adresser/ort/kund/status, id-regeln skärpt, migration 0034 och befintlig rad bytta till google/gemini-3-flash-preview (3.1 Flash saknas); admin listar Flash/Lite och behåller fritt modellfält. 321 tester och automatisk typkontroll gröna, n3-ai driftsatt, riktigt gateway-verktygsanrop/följdsvar med syntetisk adress verifierat; ingen apppublicering eller paket. Inloggat appflöde fortsatt ej verifierat, eget konto saknas.

- [x] Chattbilder: migration 0033 (0030 redan upptagen), privat chat-images med 10 MB och JPEG/PNG/WebP verifierad samt medlemsstyrda INSERT/SELECT-policyer; komprimering, bilagor, batchsignering, fullskärmsbild och nedladdning klara. 318 tester och automatiskt bygge gröna; lokalt bildskick och uppladdningsfel verifierade på 390/1280 px. Notiser oförändrade, inga paket eller publicering.
- [x] Chatt: Enter skickar alltid (Shift+Enter radbryter, IME skyddat) på alla skärmstorlekar, enterKeyHint="send" i meddelandefältet och ren shouldSendOnKey med test; 319 tester och typkontroll gröna, inget publicerat.
- [ ] Chatt: Enter-sändning i inloggad förhandsvisning på snal bredd — session kunde inte skapas (flera auth-användare, --self utan konto); kräver att användaren anger konto.

- [ ] Chattbilder: verklig uppladdning och mottagning mellan konton — saknar godkänd kontosession; kräver inloggning i förhandsvisningen.

- [x] N3prenad-AI etapp 1: migration 0032, privat läschatt, fyra RLS-läsverktyg och kontorets användning/inställningar; aktuell Gemini Flash Lite verifierad med riktigt verktygsanrop och följdsvar, 310 tester gröna. Telefon/dator i ljust/mörkt kontrollerade med lokala simulerade svar; inga paket eller publicering.
- [ ] N3prenad-AI: verklig montör-/säljarsession, sparade ai_usage-rader och nekad åtkomst till annat team — session kunde inte skapas (kontogodkännande otillgängligt); kräver inloggning i förhandsvisningen.
- [ ] N3prenad-AI etapp 2 fortsättning: rapportera problem, delrapport, plåt och bokningar via bekräftelsekort — inväntar separat beställning.
- [ ] N3prenad-AI etapp 3: kunskapskällor med textsökning — inväntar separat beställning.
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
