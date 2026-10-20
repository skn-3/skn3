# Roadmap

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
