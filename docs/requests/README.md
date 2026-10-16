# docs/requests/ — contract-change requests

> **Status:** process doc, written 2026-10-15 (pre-event), from `docs/OWNERSHIP.md` §4–§5. Aligned with the current contracts (version in the `docs/CONTRACTS.md` header). No request exists yet.

## What needs a request

Open a request for any change to a captain-controlled shared surface (OWNERSHIP §2):

- `src/contracts/**` or `docs/CONTRACTS.md`: a field, enum member, payload, function signature, error code or reason code.
- Adding or renaming an HTTP route, or changing a route's request/response shape (CONTRACTS §10).
- A new env var or provider mode (CONTRACTS §12).
- A **new dependency** or version change. `package.json` and `pnpm-lock.yaml` are captain-only (OWNERSHIP §5).
- Root config: `tsconfig`, `next.config`, eslint, vitest, `drizzle.config.ts`, `.env.example`, `.gitignore`, `src/server/**`.
- A change to file ownership or a shared doc.

**Never** edit these yourself, even "just to compile". While you wait, write a local test double inside your own `tests/<lane>/` that implements the current contract (OWNERSHIP §3).

## Naming

- File: `docs/requests/<lane-slug>-<topic>.md`. `<lane-slug>` is `intake` (Dev 1), `dispatch` (Dev 2), `messaging` (Dev 3) or `dashboard` (Dev 4), the same as your branch suffix. `<topic>` is short kebab-case. Examples: `dashboard-simulated-phone.md`, `dispatch-capacity-decrement.md`.
- All four lane prompts in `prompts/` use this same form (OWNERSHIP §2). Handoffs and plans still use `dev-N` (`docs/handoffs/dev-N.md`, `docs/plans/active/dev-N-<topic>.md`).
- One request per file. **Only the requesting lane edits its file.** The captain never edits it, which avoids add/add conflicts between branches.

## Statuses

| Status | Meaning | Set by (in the file) |
|---|---|---|
| `open` | Filed and posted in team chat | Requesting lane |
| `approved` | Captain approved, possibly with modifications quoted in DECISION | Requesting lane, quoting the captain's chat reply |
| `rejected` | Captain rejected; reason quoted | Requesting lane, quoting the reply |
| `merged` | The contract change is on `main`; MERGED SHA filled in | Requesting lane, after the captain's "merged" post |

Allowed transitions: `open → approved → merged` and `open → rejected`.

## Process (OWNERSHIP §4)

1. **File it.** Create the request file on your own branch from the template below, set `STATUS: open`, then commit and push it.
2. **Notify.** Post the file path in team chat. The captain answers within **about 20 minutes**: approve, modify or reject.
3. **Implement (captain).** For an approved change, the captain edits `src/contracts/**` and `docs/CONTRACTS.md` on `chore/integration-contract-vX`, bumps the version (CONTRACTS §15 change log) and updates `tests/contracts` (T-CT-01).
4. **Review.** One other human reviews the change. Dev 2 reviews contract diffs and env/secret handling (OWNERSHIP §6), except **Sat 4:00–6:30 PM, when Dev 3 is the contract-change reviewer** while Dev 2 is the integration bottleneck (D-027). When the requester is the captain, that reviewer reviews; the captain never approves their own request alone.
5. **Merge and announce.** The captain squash-merges and posts: `contracts vX merged at <sha>; rebase`. Every lane then runs `git fetch && git rebase origin/main` and re-runs its tests.
6. **Close.** The requesting lane sets `STATUS: merged` and fills in MERGED SHA.

Rules:

- **Prefer additive changes:** a new optional field, or a new enum member handled by a default branch.
- **A breaking change** needs an explicit acknowledgment in chat from **all four humans** before merge.
- **Dependencies** are added by the captain on `main`, pinned to an exact version. If a lockfile change appears on a lane branch, drop it with `git checkout main -- pnpm-lock.yaml` and file a request.
- **No request can weaken safety:** none may let an operator override an unknown or rejected fact, let AI output reach the gate, or add a "dispatch anyway" path (CONTRACTS §4–§5).

## Template

```text
REQUEST: <one line>
LANE: Dev N
STATUS: open
CONTRACT SECTION: docs/CONTRACTS.md §x / src/contracts/<file>
CHANGE: <exact field/enum/signature diff>
WHY (which acceptance criterion needs it): AC-xx
COMPATIBILITY: additive | breaking (who must rebase)
TESTS AFFECTED:
DECISION: <captain's reply, quoted, with time>   (filled after the reply)
MERGED SHA: <sha>                               (filled after merge)
```

For a **dependency request**, also add:

```text
PACKAGE: <name>@<exact version>
SIZE / WHY NOT ALREADY COVERED: <install size; why existing deps can't do it>
```
