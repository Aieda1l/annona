# Request: `ResetDemoFn` should carry the caller's actor

From: Dev 2 (core). To: the integration captain (owns `src/contracts/**`). Status: open. Filed 2026-10-17 (PDT) from the open
follow-ups of issue #66 (review of #40).

## Why

`resetDemo` deletes every donation, offer, link and photo. Today the contract type is
`ResetDemoFn = (input: { keep_identities: true }, deps?) => Promise<Result<{ reset_at: string }>>` (`src/contracts/functions.ts`),
so nothing in the type says who is asking. Only the HTTP handler checks the operator role, and demo mode is the only other gate.

## What core does now (no contract change)

`resetDemo` accepts `{ keep_identities: true; actor?: Actor }` and **refuses with `NOT_AUTHORIZED` unless `actor.role` is
`operator`**, so a caller that omits the actor is refused at run time. The HTTP handler passes the signed-in operator. The
tests pass `operatorActor`. This is wider than `ResetDemoFn`, so it still satisfies the contract type.

## Proposed contract change

```ts
export type ResetDemoFn = (
  input: { keep_identities: true; actor: Actor },
  deps?: Deps,
) => Promise<Result<{ reset_at: string }>>;
```

and the matching line in CONTRACTS section 9.3. Effect on other lanes: none today (the only caller is
`src/core/http/demo.ts`). Dev 4's client calls `POST /api/demo/reset` with no body, which does not change.

## Decision

(Captain fills in.)
