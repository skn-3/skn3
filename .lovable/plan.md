# PDF-namn och omgenerering

- Lägg in namnmodulen och testfilen exakt enligt underlaget.
- Använd gemensamma namn för öppning, nedladdning och mejlbilagor i de angivna PDF-flödena, utan att ändra lagringsnycklar.
- Lägg till omgenerering av fakturor och kreditnotor med förvalt mejlutskick och möjlighet att bara ersätta PDF:en.
- Behåll status, fakturadatum, nummerserier och ärendehistorik oförändrade vid omgenerering.
- Kontrollera tester och den körande appen. Publicera inte.

## Tekniskt
- PDF-metadata uppdateras i de angivna generatorerna.
- De tre mejlfunktionerna får validerade filnamn; fakturafunktionen får `skip_email`.
- Ingen databas- eller behörighetsändring och inga nya paket.
