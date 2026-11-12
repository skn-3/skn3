# Kalkyl (offer calculation engine)

- All quantity, packaging, price, total, offer-line and check logic lives here as pure, tested functions; components only call them, so stage 2/3 views and the customer page can never diverge.
- Prices in price_items, KalkylLine and calc_data are always ex VAT; incl. VAT is computed only for display (inclVat).
- Never invent a price: a missing price_items row or NULL price_ex_vat gives unit_price null and amount 0, and runKontroller flags it as blocking.
- Only approved prices can be sent: pris_ej_godkant blocks every priced line whose item is not 'godkand' (draft or archived).
- Price import and "Spara som utkast" never approve; changed rows become drafts. Approval only via applyPriceEdit(..., approve = true).
- Keep exported signatures in types.ts/index.ts stable; later stages build on them. Seed fixture for tests mirrors migration 0050 (src/lib/__tests__/kalkylFixture.ts).
- Kalkylvyn (src/components/kalkyl) ändrar KalkylData bara via state.ts och läser tal bara via view.ts/offer.ts; sparad payload kommer alltid från buildOfferPayloadFromKalkyl så kalkyl, formulär, PDF och kundsida visar samma summor.
- Egna rader i golv-/målningsrader har nyckelprefixet OWN_LINE_PREFIX ('egen.') och överlever computeRow; manuella värden (setOverride) behålls vid repriceKalkyl och ingår inte i priceChanges.
- Prisändringar räknas aldrig om tyst: hela kalkylen räknas om endast via repriceKalkyl ("Uppdatera priser").
- Skicka-spärren för offerter med calc_data går via sendCheck/checkKalkylSend; lägg inte till en andra spärr i en vy.
