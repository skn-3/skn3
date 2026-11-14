# Utredning: säkerhetsfynden (inga ändringar gjorda)

Inget är ändrat: ingen kod, ingen migration, ingen inställning, inga fynd markerade.

## 1. Fynden (säkerhetsgenomgången, lov_pgscan, hämtad 14 nov 10:32 UTC)

| id / internal_id | nivå | text | berörs |
|---|---|---|---|
| AUTH_CONFIG / lov_db_auth_leaked_password_protection_v1 | warn | "People can choose a password that is already leaked" — "Auth setting password_hibp_enabled is off: GoTrue accepts passwords found in the Have I Been Pwned breach corpus at sign-up and password change (existing passwords are not re-checked)." | inställningen password_hibp_enabled (projekt) |
| RLS_EXPOSURE / …_1d835fc0b59d5656 | error | "Any signed-in user can read every record in ai_settings" — policy "ai_settings_read" USING (true) | public.ai_settings |
| RLS_EXPOSURE / …_4b703550584d4765 | error | "Any signed-in user can read every record in this table" — policy "auth read climate" | public.order_climate_compensation |
| RLS_EXPOSURE / …_785375929c109a61 | error | "Any signed-in user can read every record in knowledge_sources" — "knowledge_sources_read" | public.knowledge_sources |
| RLS_EXPOSURE / …_ad68cc7e8504c123 | error | "Any signed-in user can read every record in this table" — "auth read case climate" | public.case_climate_compensation |
| RLS_EXPOSURE / …_b2bdf92c71b8de94 | error | "Any signed-in user can read every record in climate_events" — "climate_events read" | public.climate_events |

Gemensam rubrik för de fem: "Some access rules let everyone through" (LOV.DB.RLS_TAUTOLOGY_PERMISSIVE.V1). Skannerns egen nivå är warn, visad nivå error. Varningen under "Authentication & account security" är alltså skyddet mot läckta lösenord (HIBP), inget annat. app_mcp: inga fynd.

## 2. Var tabellerna läses

**ai_settings**
- src/components/chat/AiConversation.tsx — `voice_enabled`, användarens inloggning. Nås av alla roller via chatten (ChatWidget monteras i alla vyer). **Montör läser den: behöver bara `voice_enabled`.**
- src/components/ai/AiUsageAdmin.tsx — `*`, användarens inloggning; admin och koordinator.
- supabase/functions/n3-ai/index.ts — `*` (läs) + update gateway_error/status, tjänstenyckel; anropas av alla roller.
- supabase/functions/kalkyl-ai/index.ts — `enabled, gateway_error, model` + update, tjänstenyckel; kalkylroller (ej montör).
- supabase/functions/n3-ai/speech.ts — bara update, tjänstenyckel.

**case_climate_compensation**
- src/components/shared/KlimatKompenseradBadge.tsx — `case_id, kompenserad_at, tree_count, verification_id, claim_url, total_trees`, användarens inloggning; visas i CaseDetailPanel och CaseCard (säljare, koordinator, admin).
- supabase/functions/public-case-status — `tree_count, verification_id, kompenserad_at`, tjänstenyckel (publik kundlänk via token).
- supabase/functions/klimatkompensera — `case_id` + insert/update, tjänstenyckel.
- **Ingen montörsvy läser den.**

**climate_events**
- src/components/shared/KlimatStats.tsx (useClimateEvents, KlimatStatsBlock, MinaTradBadge) — `created_at, tree_count, seller, event_type, status`, alla rader, användarens inloggning; WelcomeDashboard (säljardelen) och SellerDashboard → säljare/admin.
- src/components/seller/SignedCaseDialog.tsx — `id` (filter event_type, visit_id/upstream_key), användarens inloggning; säljare/admin.
- supabase/functions/klimatkompensera — `case_id` m.fl. + insert/update, tjänstenyckel.
- **Ingen montörsvy läser den** (montörens välkomstsida visar inte KlimatStatsBlock).

**knowledge_sources**
- src/components/ai/KnowledgeSourcesAdmin.tsx — `id, key, title, audience, enabled, updated_at`, användarens inloggning; bara admin (gate i koden).
- supabase/functions/n3-ai/tools/listKnowledgeSources.ts — `key, title, audience` där enabled, **användarens JWT** (userClient); alla roller via N3prenad-AI. **Montör når den via AI-verktyget: behöver `key, title, audience` för källor med audience 'all' eller 'montor'.** (Indirekt också via knowledge_chunks_read och search_knowledge, som är SECURITY INVOKER och joinar knowledge_sources.)

**order_climate_compensation**
- Ingen läsning alls i src/ eller edge-funktionerna (bara i genererade typer). **Ingen montörsvy.**

## 3. SQL för läsreglerna (ur pg_policies)

```sql
CREATE POLICY ai_settings_read ON public.ai_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read case climate" ON public.case_climate_compensation FOR SELECT TO authenticated USING (true);
CREATE POLICY "climate_events read" ON public.climate_events FOR SELECT TO authenticated USING (true);
CREATE POLICY knowledge_sources_read ON public.knowledge_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read climate" ON public.order_climate_compensation FOR SELECT TO authenticated USING (true);
CREATE POLICY knowledge_chunks_read ON public.knowledge_chunks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM knowledge_sources s
          WHERE s.id = knowledge_chunks.source_id AND s.enabled
            AND (s.audience = 'all' OR s.audience = auth_user_role() OR auth_is_admin() OR auth_user_role() = 'coordinator')));
```
Alla PERMISSIVE. Övriga regler på tabellerna är admin-only (UPDATE/DELETE/ALL med auth_is_admin()).

## 4. Läckta lösenord och PIN

- PIN lagras som Auth-lösenord. RolePicker loggar in med `padPinForAuth` (4 siffror fylls ut med "00" till 6). ForcePinChangeGate och ChangePinDialog kräver exakt 6 siffror och anropar `auth.updateUser({ password })`. reset-user-pin och seed-users genererar slumpvis 6-siffrig PIN och sätter den via admin-API (`updateUserById` / `createUser`).
- Med skyddet på: **inloggning påverkas inte** (befintliga lösenord kontrolleras inte om, står i fyndet). **Tvingat och frivilligt PIN-byte skulle i praktiken alltid nekas** — i stort sett alla 6-siffriga sifferkoder finns i läcklistan, så `updateUser` ger fel och `must_change_pin` sätts aldrig till false; användaren fastnar i ForcePinChangeGate. reset-user-pin och seed-users: troligen samma avvisning om kontrollen också gäller admin-API — **inte verifierat**, jag har inte provat.
- Går att slå på i Lovable Cloud i dag: ja (Users → Auth settings → Email → "Password HIBP check", eller via auth-inställningsverktyget). Om "Try to fix all" slår på just den inställningen kan jag **inte verifiera** — knappens beteende syns inte för mig. Rekommendation: slå inte på den med nuvarande PIN-modell; ignorera fyndet med motivering i stället.

## 5. "Try to fix" för läsreglerna

Knappen startar en AI-rättning; exakt vilka regler den skriver bestäms då och går inte att läsa i förväg — **inte verifierat**. Fyndets eget förslag är "auth.uid() = user_id", men ingen av de fem tabellerna har kolumnen user_id, så det går inte att använda rakt av. Risker om den byter till admin-only eller ägarregler: montörens röstknapp (ai_settings.voice_enabled), N3prenad-AI:s källista och knowledge_chunks_read (som joinar knowledge_sources) samt säljarnas trädstatistik och klimatmärke slutar fungera. order_climate_compensation läses inte alls och kan stängas utan påverkan.

## Inte kontrollerat
- Hur "Try to fix"/"Try to fix all" faktiskt beter sig.
- Om HIBP-kontrollen även gäller admin-API (reset-user-pin, seed-users).
