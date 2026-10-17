# Dev 3 — Slice 1 plan (fakes only, no network)

Restatement: build the Photon lane's pure, testable core first: grammar, event normalizer, fake/misconfigured gateway, templates, joined-only outbound helper, then `handleInbound` against a local core double. Serves AC-10..AC-13, AC-18. Tests T-MS-01..05, T-MS-14 (normalize), T-MS-15.

| # | Files (mine only) | Test first | Done when |
|---|---|---|---|
| 1 | `src/workflows/grammar.ts` | `tests/messaging/grammar.test.ts` (T-MS-01) | Commands, code rules, photo, punctuation, first-token rule green |
| 2 | `src/integrations/photon/normalize.ts` | `tests/messaging/normalize.test.ts` (T-MS-14) | 2.0 envelope maps to Inbound/DeliveryStatus/ignored; malformed gives VALIDATION_FAILED |
| 3 | `src/integrations/photon/gateway.ts`, `gateway-fake.ts` | `tests/messaging/send-failure.test.ts` (T-MS-10 part) | fake never persists; photon without key is misconfigured, never fake |
| 4 | `src/workflows/templates.ts` | `tests/messaging/templates.test.ts` (T-MS-05) | Deterministic, allergen wording, no address/handle, no "safe" |
| 5 | `src/workflows/outbound.ts` | `tests/messaging/identity.test.ts` (T-MS-15 joined-only) | Non-joined gets NOT_JOINED, send not called, one record per attempt |
| 6 | `src/workflows/inbound.ts`, `tests/messaging/doubles/core.ts` | `inbound.test.ts` (T-MS-02..04) | Dedupe, unknown sender ignored, STOP/JOIN semantics |

Evidence from the kickoff spike (real Photon Beta, outside the repo) is recorded in `docs/handoffs/dev-3.md`. Reuse `SHORT_CODE_REGEX` and `INBOUND_COMMANDS` from `@/contracts`; never redefine them.
