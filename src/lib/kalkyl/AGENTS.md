# Kalkyl (offer calculation engine)

- All quantity, packaging, price, total, offer-line and check logic lives here as pure, tested functions; components only call them, so stage 2/3 views and the customer page can never diverge.
- Prices in price_items, KalkylLine and calc_data are always ex VAT; incl. VAT is computed only for display (inclVat).
- Never invent a price: a missing price_items row or NULL price_ex_vat gives unit_price null and amount 0, and runKontroller flags it as blocking.
- Only approved prices can be sent: pris_ej_godkant blocks every priced line whose item is not 'godkand' (draft or archived).
- Price import and "Spara som utkast" never approve; changed rows become drafts. Approval only via applyPriceEdit(..., approve = true), and only by admins (canApprovePrices in UI, trigger price_items_guard_approval in the database; a row without price is never 'godkand').
- What is sent is the approved list price or the seller's own price: pris_andrat (drafts only) blocks list-priced lines whose saved unit price differs from price_items. The comparison lives only in priceCheck.ts and is shared by priceChanges; repriceKalkyl must reprice every list-priced line it covers (recipes, fri, 'egen.', common) so the block can always be cleared.
- The server gate in send-offer uses supabase/functions/_shared/offerSendGate.ts (missing price / not approved only); keep it pure and in line with sendCheck.
- Local drafts follow localDraft.ts: user in the key, never personnummer, expired after 14 days.
- Keep exported signatures in types.ts/index.ts stable; later stages build on them. Seed fixture for tests mirrors migration 0050 (src/lib/__tests__/kalkylFixture.ts).
- Kalkylvyn (src/components/kalkyl) ändrar KalkylData bara via state.ts och läser tal bara via view.ts/offer.ts; sparad payload kommer alltid från buildOfferPayloadFromKalkyl så kalkyl, formulär, PDF och kundsida visar samma summor.
- Egna rader i golv-/målningsrader har nyckelprefixet OWN_LINE_PREFIX ('egen.') och överlever computeRow; manuella à-priser (setOverride unit_price, manual) behålls vid repriceKalkyl och ingår inte i priceChanges; en ändrad mängd ensam gör inte priset eget. Formulärändringar går via overrideFromForm (tolerans 0,005).
- Prisändringar räknas aldrig om tyst: hela kalkylen räknas om endast via repriceKalkyl ("Uppdatera priser").
- Skicka-spärren för offerter med calc_data går via sendCheck/checkKalkylSend; lägg inte till en andra spärr i en vy.
- Selectable slots (underlag, sockel, tröskel, vägg-/tak-/snickerifärg) resolve only via resolveSlotCode in slots.ts; recipes, texts, views and the gallery use it so saved rows without selections stay identical. Line keys never change with the chosen product.
- Lay codes: meta.lay_code is read/written only via layCodeOf/withLayCode (UI) and importRowPatch (import, column arbetskod); other meta keys are preserved and an empty cell changes nothing.
- A missing lay code is reported by laggning_saknas, not pris_saknas (missingPriceLines); paint without coverage by atgang_saknas (paintCoverageMissing). sendCheck counts must use the same helpers.
- Branch-based checks look up price_items.trade through the line's code; lines without code are never affected.
