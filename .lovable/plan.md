# Google Drive-synk

## Resultat
- Alla angivna fakturor, kreditnotor, Mockfjärdsutbetalningar och signerade avtal kopieras till era exakta Drive-mappar.
- Befintliga års- och månadsmappar återanvänds enligt era matchningsregler, inklusive äldre namn och felaktiga månadsnummer.
- Befintliga dokument hoppas över enligt filnamn eller dokumentnummer. Originalfiler, fakturastatus och nummerserier ändras inte.
- Adminfliken **Drive-synk** visar koppling, återstående dokument, fel och senaste synkningar. Den erbjuder test, på/av, retroaktiv körning med stoppknapp och återförsök.

## Automatisk körning
Jag rekommenderar att nya dokument startar synkningen när de sparas, i stället för att kontrollera alla tabeller hela dygnet. Återförsök körs var 15:e minut endast medan kön innehåller arbete och stängs av när den är tom.

Det ersätter den begärda permanenta kvartskontrollen, som annars körs 96 gånger per dygn och kan öka Cloud-kostnader även utan nya dokument. Retroaktiv körning hittar också äldre dokument. Om en permanent kvartskontroll är ett absolut krav kan den delen av planen ändras.

## Förutsättningar
Servicekontonyckeln saknas. Lägg hela JSON-nyckelfilen i **Project Settings → Secrets** som `GOOGLE_SERVICE_ACCOUNT_JSON`; klistra inte in den i chatten. Dela både **Allt från Case-flow** och **Kunder** med servicekontots `client_email` som **Redigerare**.

Utan nyckeln kan Drive-uppladdning och automatisk körning inte aktiveras eller verifieras. Ingen apppublicering görs. Observera att nya tabeller och funktioner påverkar den gemensamma Cloud-miljön även utan apppublicering.

## Tekniskt genomförande
- Flytta den rena PDF-namnmodulen till `_shared` och behåll befintliga frontendimporter via återexport.
- Lägg till testbar mappnamnslogik och tester för årsskiftet juli/augusti, alla månadsnummer samt befintliga mappars matchning.
- Skapa `drive_sync` och `drive_sync_settings` med explicita grants och RLS: koordinator/admin läser, service role skriver och admin får endast uppdatera de tre tillåtna inställningsfälten.
- Implementera `drive-sync` med validerade `status`, `test`, `run` och `retry`, `requireCoordinator` eller service-role-autentisering, RS256-token via jose och token-cache.
- Läs samtliga kandidater och Drive-listor med paginering. Bevara korrekt riktning även för krediter av självfakturor. Bearbeta äldst först, högst 25 per körning, med högst fem automatiska försök.
- Skydda samtidiga körningar med ett lås/arbetsanspråk så manuell och automatisk körning inte laddar upp samma dokument parallellt.
- Använd händelsestyrd köstart och begränsade kvartstidsåterförsök; inga hemligheter skrivs i frontend, migrationsfiler eller loggar.
- Adminsidans körloop tar högst 40 omgångar och kan stoppas mellan omgångarna. Dokument med uttömda försök visas som fel utan att hålla körloopen aktiv.

## Kontroll
- Kör befintliga PDF-namntester, nya regeltester och relevanta regressionstester. Kontrollera automatiska byggresultat.
- Testa behörigheter, kopplingskontroll och adminflödet inloggat.
- Efter att nyckeln och mappdelningen finns: synka ett verkligt dokument och läs tillbaka dess Drive-fil och loggrad; verifiera dubblettskydd med en andra körning.
- Publicera inte appen.