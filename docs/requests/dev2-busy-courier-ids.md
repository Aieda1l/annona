# Request: `busy_courier_ids` on `findCandidates` (CONTRACTS §6, M-09)

Lane: Dev 2. Status: approved by the captain in review of PR #3 (recommendation 1); contract text not yet updated.

- Change: `findCandidates` input gains `busy_courier_ids: string[]`.
- Why: the partial unique index on `offers(courier_id) WHERE status IN ('pending_send','open')` covers only part of M-09. A courier with a `claimed` or `collected` assignment is not covered.
- Meaning: couriers holding any `pending_send`/`open` offer or a `claimed`/`collected` assignment, on any donation. The caller (Dev 2 store) computes it.
- Behavior: those couriers are never candidates. A missing list returns no candidates (fails closed).
- Needed from captain: add the field to CONTRACTS §6 and the change log.
