# Mörkt tema, fas 2

## Omfattning
- Söka igenom alla `src/**/*.tsx` efter färgade ljusa bakgrunder, kanter, texter och hovringslägen som omfattas av den angivna mappningen.
- Behålla samtliga befintliga klasser och endast lägga till motsvarande `dark:`-klasser.
- Undanta PDF-generatorer, de två publika sidorna samt uttryckligen alltid ljusa rit- och signaturytor.

## Genomförande
- Tillämpa mappningen konsekvent för alla förekommande Tailwind-paletter, inklusive amber, yellow, emerald, green, red, blue, orange, sky och övriga färger.
- Hantera både vanliga klasslistor och villkorliga klasssträngar utan att ändra beteende i ljust läge.
- Kontrollera efteråt att inga kvalificerade klasser saknar mörk variant och att inga undantag ändrats.

## Verifiering
- Köra projektets typkontroll.
- Öppna A-orderformulärets ruta “INTERNT — VISAS EJ FÖR MONTÖR” i mörkt läge och bekräfta mörk bärnstenston samt läsbart innehåll.
- Jämföra samma ruta i ljust läge och bekräfta att befintliga ljusa färger är oförändrade.
