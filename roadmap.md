# Roadmap

- [ ] Fakturamejl egna uppdrag: fakturadatum, levererad mejlmall, gemensamma filnamn, tester och driftsättning utan publicering.

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
