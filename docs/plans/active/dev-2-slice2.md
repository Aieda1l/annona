# Dev 2 plan: slice 2(a) intake-facing and 2(b) dispatch-facing core (prompt section 6)

Outcome: the core functions below work against the PGlite store with the test clock; `pnpm typecheck`, `pnpm lint`, `pnpm test` stay green.

Base: `feat/dispatch-slice2` = #21 (hardening) + main + contracts #9/#10 (types). At PR time: cherry-pick only this lane's commits onto main (squash merges would conflict).
Layout: `src/core/service/{runtime,map,audit,cards,...}.ts`; `src/core/index.ts` re-exports the real functions. Tests in `tests/core/service-*.test.ts`, test clock, `deps` always passed.

2(a): storeDonationImage, createDraft (source_ref idempotency), attachAiResult, submitVerification (session path; link path is 2(d)), getDonationCard (operator and owning-donor projections).
2(b): identities (resolve, get, join, optOut with S-15/S-16/S-17, findOpenOffersForCourier), messages (recordInbound with 30 s reclaim, saveInboundResult, recordIgnoredInbound, recordOutbound, hasOutboundMessage, listMessages, recordStatusEvent, recordDeliveryStatus), dispatch (createNextOffers, openOfferForSend, markOfferSendFailed, recordOfferProviderMessage, expireDue, listPendingSendOffers, listDispatchableDonations), claimOffer and declineOffer (CONTRACTS 8.1, full result matrix).
Also from Dev 3's request: hasOutboundMessage; status events + delivery update in one transaction; recordDeliveryStatus returns { offer_id, offer_status }; openOfferForSend for a non-joined courier marks send_failed and returns a non-OK result with details.reason = "courier_not_joined".
Not in this plan: recordHandoff, operatorAction, dashboard snapshot, verification links (2(c), 2(d)); T-CO-17 on real Postgres (needs TEST_DATABASE_URL).

Done when: each function has RED-first tests for its guards and edge cases (T-CO-14, 16, 19-22, 24-27 on PGlite), reviewed by someone other than Dev 2, handoff written.
