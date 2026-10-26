# Röstagent för N3prenad-AI (Live-samtal) – plan

## Viktigt först: plattformsbesked
Lovables Live-dokumentation säger uttryckligen att GPT Live (`openai/gpt-live-1`, `/v1/live/sessions`) **kräver TanStack Start** och inte stöds i ett klassiskt Vite-projekt. Det gäller även om modellen syns i katalogen. Dokumentationen förbjuder också uttryckligen en lösning via edge-funktion i Lovable Cloud.

Svar på fråga 1 (transport):
- **Edge-funktion med `Deno.upgradeWebSocket` och utgående WebSocket:** stöds inte för Live. Jag har inte testat det och tänker inte göra det, eftersom dokumentationen säger nej.
- **Kortlivad sessionsnyckel som webbläsaren använder för att ansluta direkt:** det finns inget sådant dokumenterat för Lovables gateway. Ett sätt att lösa det på egen hand skulle betyda att nyckeln eller motsvarande behörighet når klienten. Det är inte acceptabelt.
- **Gränser för hur länge en WebSocket får leva i edge-funktioner:** dokumenterade gränser saknas för det här fallet. Jag kan alltså inte lova 5-minuterssamtal där.
- **Stödd väg:** migrera projektet på plats till TanStack Start via "/"-menyn → "Migrate to TanStack Start". Då används samma relay-mönster som i Visionary Consult Hub och Ringlabbet (`live-relay.server.ts` + `use-live-voice.ts`). Gränsen för samtalets längd ligger då i vår egen relay: max samtalstid, tystnadsgräns och att servern stänger samtalet.

Det betyder att hela arbetet nedan förutsätter migreringen. Lovable Cloud (databas, inloggning, lagring och n3-ai) finns kvar oförändrat efter migreringen.

## Steg (efter godkänd migrering)

### 0. Migrering till TanStack Start
- Gör migreringen på plats och behåll alla routes, rollvyer, offentliga sidor, PDF-flöden och edge-funktioner.
- Kör hela testsviten (396 tester) och gör en snabb genomgång i förhandsvisningen innan röstarbetet börjar.

### 1. Relay (server)
- `src/lib/live-relay.server.ts`: WebSocket mellan webbläsare och server samt WebRTC/WebSocket från servern till `/v1/live/sessions` med `Lovable-API-Key` på servern.
- Webbläsaren skickar `access_token` i `app.start`, som i Ringlabbet. Servern validerar JWT:n och läser `ai_settings` (av/på, `max_call_minutes`, `daily_voice_minutes`) och dagens förbrukade minuter innan samtalet öppnas.
- Servern äger tidsgränserna: varning 1 minut före max via `session.commentary.append`, ingen röst i 2 minuter avslutar samtalet, och samtalet stängs hårt vid max.

### 2. Delegering till befintlig verktygsslinga (fråga 2)
- Live-modellen får ett enda verktyg, `ask_n3`, med fältet `{question}`, och sköter bara själva samtalet.
- Relayn anropar n3-ai med användarens JWT och en ny body-variant: `{mode:'voice', message}`. Samma systemprompt, readTools, actionTools, get_links, search_knowledge och samma RLS gäller, utan dubbel logik.
- Backendmodellen behåller dagens Chat Completions med den Google-modell som valts i ai_settings, i enlighet med AGENTS-regeln om rått Chat Completions-kontrakt och sex rundor. Det passar delegering eftersom ett anrop ger ett färdigt textsvar. Responses-API behövs inte.
- Svaret förs tillbaka till Live-sessionen som verktygsresultat. Statusmeddelanden som "Jag kollar ärendet…" skickas via `session.commentary.append`.
- n3-ai lägger till en röstinstruktion: korta svar som går att säga högt och inga markdown-listor. Ärende- och länkmarkörer sparas men läses inte upp.

### 3. Bekräftelser i röst (fråga 3)
- Ett propose_*-verktyg skapar `ai_actions` som i dag. Servern skickar `action_id` till klienten och kortet syns direkt i samtalskortet och i AI-tråden.
- Live-modellen läser upp sammanfattningen ("Ska jag lägga till 2 500 kr på Storgatan 3?").
- Live-modellen får verktyget `decide_action({decision})` utan `action_id`. Relayn hämtar då trådens enda väntande förslag, eftersom regeln om ett enda väntande kort redan gäller, och anropar `decideAction` med användarens JWT.
- Om användaren trycker på kortet går det genom samma `decideAction`. `ai_claim_action` gör att ett röst-"ja" och ett tryck aldrig kan utföras två gånger. Det som inte vinner får beskedet "redan beslutad".
- Skydd: röstbekräftelse godtas bara om det finns ett väntande förslag som är yngre än 15 minuter. Det tydliga ordet ska komma efter att sammanfattningen lästs upp. Servern skriver kvittensen, som läses upp ordagrant.

### 4. Logg och gränser (fråga 4)
- En migration (nästa nummer efter 0041, drizzle-snapshot):
  - `ai_messages.kind text not null default 'chat'` med check `('chat','voice')`, eftersom raden i dag saknar kind.
  - `ai_usage.kind`: utöka checken med `'voice'`. Kolumnen `audio_seconds` finns redan.
  - `ai_settings`: `voice_live_enabled bool default false`, `max_call_minutes int default 5`, `daily_voice_minutes int default 30`. Kolumnrättigheter för UPDATE bara för admin.
- Servern sparar transkriptet, både användarens och assistentens delar, som `ai_messages` med kind 'voice' i den aktiva tråden. Det syns sedan i textchatten.
- `ai_usage` får en rad per samtal med `kind='voice'` och `audio_seconds`, samt rader för delegeringarnas tokens som vanligt.
- Fel enligt gatewayens felregler: 402 och 403 pausar och kräver att ägaren återställer, och modellen byts aldrig ut.

### 5. UI (fråga 5)
- Knappen "Ring N3prenad-AI" (Phone, minst 48 px) i trådhuvudet. Den syns bara när `voice_live_enabled` är på och webbläsaren stöder mikrofon.
- Samtalet öppnas som bottenark på telefon och sidopanel på iPad/dator, aldrig som modal.
  - Status: Ansluter, Lyssnar, Talar, Tänker.
  - Timer och varningsbanner vid 1 minut kvar.
  - Löpande transkript.
  - Åtgärdskort (AiActionCard återanvänds).
  - Knapparna "Ljud av" och "Lägg på" (röd, minst 56 px).
- `src/hooks/useLiveVoice.ts` hanterar mikrofon, uppspelning, status och avslut vid flikbyte eller låst skärm.
- Admin: kortet AI-användning får växeln "Röstsamtal", fälten max samtalstid och dagstak i minuter samt raden "Samtal: N, M minuter".

## Filer
- Nya: `src/lib/live-relay.server.ts`, en server-route för relayn, `src/hooks/useLiveVoice.ts`, `src/components/chat/LiveCallSheet.tsx`, `src/lib/liveVoice.ts` (ren logik för timer, tystnad, varning och tolkning av bekräftelse) och tester.
- Ändras: `supabase/functions/n3-ai/index.ts` (voice-läge), `logic.ts`, `AiConversation.tsx`, `AiUsageAdmin.tsx`, `aiUsage.ts`, `AGENTS.md`, `supabase/functions/n3-ai/AGENTS.md`, `roadmap.md`.

## Risker
- Migreringen är det största ingreppet. Routing, publika sidor, hemskärmsappen och PDF-rendering måste kontrolleras igen.
- Ljud på iOS Safari: uppspelning kräver en användargest och en låst skärm bryter samtalet.
- Delegeringen tar tid, eftersom upp till sex rundor ger flera sekunders tystnad. Det täcks av "Tänker"-status och kommentarer.
- Röstbekräftelse kan tolkas fel. Det motverkas genom att bara godta en entydig bekräftelse på ett aktuellt förslag och att kortet alltid finns kvar.
- Kostnad per samtalsminut. Dagstaket i minuter skyddar mot det.
- Inloggad verifiering är fortfarande blockerad tills ett testkonto finns.

## Uppskattning av credits (byggarbete, ungefärligt)
- Migrering till TanStack Start och regressionskontroll: 15–30.
- Relay, delegering och bekräftelseflöde: 20–35.
- Migration, logg och admin: 5–10.
- Samtals-UI med telefon/iPad-kontroller: 10–20.
- Totalt cirka 50–95 credits. AI-kostnaden per samtalsminut tillkommer i drift och syns i modellkatalogens prissättning, som jag inte har kontrollerat i det här svaret.

## Beslut som behövs
Godkänner du migreringen till TanStack Start? Utan den finns ingen stödd väg för Live-samtal i det här projektet. Det enda alternativet utan migrering är den befintliga röstinmatningen, alltså tal till text.
