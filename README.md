# Annona

**Good food finds its way.**

Annona is a messaging-native coordination prototype for last-minute surplus food from licensed kitchens. A kitchen texts a photo of what's left over. Annona drafts a description, the kitchen verifies it, a deterministic gate decides whether the lot may be offered, and exactly one courier wins the pickup.

Built at **DubHacks 2026** for the **Community Kitchen** track.

> **Annona never decides that food is safe.** A photo or an LLM can't establish ingredients, allergens or handling. "Eligible" means *eligible for dispatch under a prototype operator policy*, based on facts the donor attested. It does not mean safe, allergen-free or compliant. This is a hackathon prototype running on synthetic data. It isn't certified and isn't ready for real food.

## How it works

1. **Photo.** A donor texts a food photo over iMessage (via Photon). A web upload is the fallback.
2. **Draft.** Gemini returns an editable guess at the dish, servings and possible allergens. The reply labels it a guess and includes a one-time checklist link.
3. **Verify.** The donor confirms ingredients, all nine major US allergens and how the food was held. Anything left as `unknown` stays unknown.
4. **Gate.** A deterministic, fail-closed policy returns `eligible`, `needs_review` or `rejected`, with plain-language reasons. The AI has no say.
5. **Offer.** An approved recipient's cold-capable courier gets a time-limited iMessage offer and replies `YES <code>` or `NO <code>`.
6. **Claim.** The first valid claim wins, atomically. Later, duplicate or expired replies get a clear "no assignment".
7. **Dashboard.** The operator sees server truth: reviews, offers, countdowns, claims and an audit trail. Handoffs are simulated and labeled.

**AI describes, humans verify, the backend enforces.**

## Safety design

- Each fact is `suggested`, `donor_verified`, `unknown`, `rejected` or `needs_review`. Unknown never silently becomes safe.
- There's no AI shelf-life estimate and no "dispatch anyway" control.
- Safety and the donor's pickup cutoff are separate checks. Both are re-evaluated at claim time.
- Claims are idempotent and first-claim-wins in a transaction. A delayed job or a repeated message can't create a second assignment.
- Deadlines are persisted UTC timestamps checked on the server. The UI countdown has no authority.
- Contact details are minimized. Couriers see only an area label until they claim.
- Every external provider (Gemini, Photon) has a `real` and a deterministic `fake` adapter. The UI and logs show which one is active, and demo mode is labeled.

## Stack

TypeScript, Next.js 16 (React 19), Tailwind and shadcn/ui, Drizzle ORM on Postgres (PGlite for local development), Zod, Vitest. Gemini (`@google/genai`) handles vision. Photon handles iMessage.

## Getting started

Requires Node 22+ and pnpm.

```bash
pnpm install
cp .env.example .env.local     # empty provider vars default to the fake adapters
pnpm db:migrate
pnpm db:seed                   # synthetic donors, recipients and couriers
pnpm dev                       # http://localhost:3000
pnpm worker                    # in a second terminal: timers, offer expiry, message relay
```

With no keys set, Annona runs entirely on fakes. The operator dashboard includes a simulated phone for the whole flow, with no external accounts.

### Configuration

Set these in `.env.local`. Values are never committed.

| Variable | Purpose |
|---|---|
| `VISION_PROVIDER` | `fake` (default) or `gemini` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini access when using the real provider |
| `MESSAGING_PROVIDER` | `fake` (default) or `photon` |
| `PHOTON_PROJECT_ID`, `PHOTON_API_KEY`, `PHOTON_WEBHOOK_SECRET` | Photon credentials |
| `PHOTON_INBOUND_MODE` | `webhook`, `socket` or `poll` (default) |
| `STORE`, `DATABASE_URL`, `PGLITE_DIR` | `pglite` (default) or `postgres` |
| `DEMO_DONOR_HANDLE`, `DEMO_COURIER_A_HANDLE`, `DEMO_COURIER_B_HANDLE` | iMessage handles of opted-in teammates used by the seed |
| `ANNONA_DEMO_MODE`, `DEMO_PASSCODE`, `SESSION_SECRET`, `APP_BASE_URL` | Demo and session settings |

`.env.example` lists every variable. Handles are personal data. Keep them out of git and logs.

### Scripts

| Command | Does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js app |
| `pnpm worker` | Background worker for timed offers and messaging |
| `pnpm test` | Vitest suite |
| `pnpm typecheck`, `pnpm lint` | Static checks |
| `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed` | Database tooling |
| `pnpm eval:intake` | Evaluate the intake prompt against fixtures |

## Demo scenarios

All data is synthetic.

1. **Success.** A caterer texts a photo of a refrigerated sandwich platter. The donor verifies it, the gate passes it, and courier A gets an offer and replies `YES`. A claims the lot and receives the pickup address.
2. **No response.** Courier A ignores a 60-second accelerated offer. The offer expires and goes to courier B. A's late `YES` gets "This offer expired. No assignment was made."
3. **Responsible refusal.** A cooked-then-cooled pasta tray has no temperature history and an unknown sesame status. The gate returns `needs_review` with its reasons, and no offer is sent.

## Repository layout

| Path | Contents |
|---|---|
| `src/features/intake`, `src/lib/ai` | Photo intake, Gemini vision adapter, donor verification |
| `src/core`, `src/db` | Eligibility gate, matching, state machine, schema, migrations |
| `src/integrations/photon`, `src/workflows` | Photon gateway, offer grammar, scheduled offers and expiry |
| `src/app`, `src/components` | Next.js routes, operator dashboard, simulated phone |
| `src/contracts` | Shared types, enums and ports |
| `tests/` | Tests per area |
| `docs/` | Product brief, scope, architecture, contracts and decisions |

For design details start with `docs/PRODUCT_BRIEF.md`, `docs/ARCHITECTURE.md` and `docs/CONTRACTS.md`. `docs/KICKOFF.md` is a one-page orientation for contributors, and `CLAUDE.md` is the operating contract for AI-assisted sessions.

## Honesty notes

- Gemini vision and Photon iMessaging both work end to end. Set `VISION_PROVIDER=gemini` and `MESSAGING_PROVIDER=photon` with credentials to use them. Without those settings Annona runs on labeled fakes.
- Simulated pickup and delivery states are labeled as simulation.
- No real donors, recipients or couriers are involved. Only opted-in teammates receive messages.
- "Annona" is a project codename with no trademark clearance.
