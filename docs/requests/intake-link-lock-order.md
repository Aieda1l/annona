# Request: lock order of link submit vs link issue (Dev 1 -> Dev 2 / captain)

Found in the review of PR #41 (slice 2(d)). Not a change to Dev 2's files; a request.

**Observed (static read, not reproduced):** the link path of `submitVerification` updates the `verification_links` row
first (`consumeLinkTx`), then locks the donation (`FOR NO KEY UPDATE`). `issueVerificationLink` / `issueLinkTx` and the
session path of `submitVerification` lock the donation first, then update the link row (revoke, S-03). Opposite
orders on the same two rows can deadlock on real Postgres (`40P01`), which would throw out of core instead of
returning a `Result`. PGlite is single-connection, so no current test can show it.

**Ask:** pick one order. Option A: link path looks up `donation_id` by `token_hash`, locks the donation, then consumes
(CONTRACTS section 8.4 rule 4 currently says consume first, so this is a contract change). Option B: keep the order
and document it beside the section 8.1 lock order, and have the caller retry on `40P01`.

**Verify with:** T-CO-17 on a disposable Postgres (D-033), adding a concurrent link-submit vs `issueVerificationLink`
case.

**Also:** the `/api/verify/*` handlers now rate-limit per client (60/min, in memory) before any core call, so
unauthenticated floods no longer write unbounded `link.rejected` rows. An edge limiter is still the real fix for a
public deployment.
