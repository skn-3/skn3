# kalkyl-ai edge function

- Staff only (requireStaff); never accept customer fields. The request context is rebuilt server-side by sanitizeAiContext, so unknown keys never reach the model.
- Share N3prenad-AI's ai_usage log and daily cap: reserve every call with service-only ai_reserve_kalkyl before the gateway call and update that row afterwards; keep ai_begin_message counting kalkyl_* rows so the cap stays shared.
- Respect ai_settings.enabled and gateway_error; persist 402/403 as gateway_error (owner recovery), never retry or switch model.
- Photos and PDFs are forwarded to the gateway and dropped; never write them to storage or logs.
- The client always validates replies against the price list (src/lib/kalkyl/ai.ts); the function only parses JSON.
