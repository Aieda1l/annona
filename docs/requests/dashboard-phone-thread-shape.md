# Request: dashboard-phone-thread-shape

From: Dev 4 (dashboard) To: captain (contracts), Dev 3 (owner of the handler)

CONTRACTS §10 says `GET /api/messaging/simulated/thread?identity_id=` returns `{ messages: [...] }` without defining the element. The simulated phone page (`/operator/phone`) needs a stable shape, and `@/contracts` has no type for it.

Proposed element (additive, no change to existing types):

```ts
ThreadMessage = {
  id: string;                          // outbound_messages / inbound_messages row id
  direction: "inbound" | "outbound";
  text: string;                        // as sent/received; draft_ready link token unmasked in fake mode (§8.4)
  purpose: MessagePurpose | null;      // outbound only
  created_at: UtcString;
}
```

Until this is agreed the UI parses tolerantly (`direction` + `text` required, `created_at`/`at`/`sent_at`/`received_at` for time) and shows "Unreadable message" for anything else. It never invents content. No contract was changed by Dev 4.

Also noting: the phone's "Send fixture photo" needs valid `fixture_id` values from Dev 1's `fixtures/intake/images/`, which is empty on `main` today. The input is free text until Dev 1 publishes the ids.
