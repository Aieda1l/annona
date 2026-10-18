# UI_REDESIGN.md — Annona interface overhaul

> **Branch:** `feat/ui-redesign` (from `main` d07eb5f, 2026-10-18 02:30 PDT). **Owner:** Dev 4 (UI lane). Dev 1 reviews every change under `src/features/intake/components/**` (see `docs/requests/dashboard-intake-restyle.md`).
> **Scope rule:** presentation only. No contract, route, handler, store, gate, timer or claim logic changes. Every data-state distinction (`suggested` / `donor_verified` / `unknown` / `needs_review` / `rejected`, real vs fake provider, simulated handoff, stale data) is kept and made more visible, never less.
> **Concurrent work:** Colin's `worktree-ui-restyle` branch (dark video palette) touches the same files. The captain chose an independent redesign from `main`; only one of the two should merge.

## 1. Audit (main @ d07eb5f, read from source)

Every page is a narrow column of hard-coded `slate-*` utility classes on white. There is no app shell, no navigation, no shared page header and no use of the semantic shadcn tokens outside Dev 1's form. The brand (green leaf logo) appears only on `/`.

| Current screen | Main UX problems | Proposed redesign | Shared components required | Priority |
|---|---|---|---|---|
| `/` Welcome + `ProfilePicker` | Logo, h1, paragraph and a native `<select>` stacked in a 2xl column; profiles shown as "Name — role" options, so the four roles and what each does are invisible; no hierarchy between the pitch and the action; error is plain red text | Split hero: brand, one-line promise and the three-step principle (AI describes → humans verify → backend enforces) beside a sign-in card. Profiles become a radio-card grid grouped by role, each card saying where that role works (web vs messages). Passcode + primary button below. Synthetic-data notice as a calm callout | `AppHeader`, `PageContainer`, `Notice`, `RoleCard` (radio card), `Button`, `Input`, BlurText headline | P0 |
| Global chrome (`LiveModeBanner`, `SignOutButton`) | Mode banner is a grey strip of bordered chips; sign out is a lone button in its own row under it; no product name, no navigation between operator pages | One sticky `AppHeader`: logo + wordmark, role-aware nav (Dashboard / Simulated phone for operators), sign-out on the right. Provider modes become a compact `SystemStatusBar` with dot + text chips (never color alone) and warn states that stay loud | `AppHeader`, `SystemStatusBar`, `StatusChip` | P0 |
| `/operator` dashboard | Header is a run-on sentence; demo controls, board and identities have equal weight; status groups are just h2 + grid; cards are long and identical in weight; no summary of what needs attention; "Open the simulated phone" is buried in text | Page header with live/stale/fixture source pill and snapshot time. KPI strip from `counts_by_status` (CountUp on change). "Needs attention" ordering kept (needs_review, eligible, unmatched first) with group headers carrying icon + count. Status filter chips (client filter over server data only). Two-column layout ≥1280px: board + side rail (demo controls, messaging identities) | `PageHeader`, `MetricTile`, `StatusBadge` (with icon), `SectionHeader`, `FilterChips`, `EmptyState`, `Panel` | P0 |
| `DonationCard` | Every section rendered at equal weight (AI note, cutoff, reasons, field states, allergen table, offers, assignment, full audit log, actions); title is an underlined link; countdown inline text | Card with clear header (title, donor · area, status), a "key facts" row (cutoff with countdown, servings, AI provenance), reasons as severity callouts, collapsible "Provenance / allergens / offers / timeline" disclosure, actions in a footer bar | `Card`, `CountdownPill`, `ReasonList`, `FieldStateBadge`, `Disclosure`, `ActionBar` | P0 |
| `/operator/donations/[id]` | Reuses the board card plus a photo and a facts `<dl>` stacked below; no breadcrumb; back link is a sentence; timeline is a dense monospace list | Breadcrumb + page header with status and cutoff. Two-column layout: main column (Eligibility decision + reasons, Donor-attested facts in grouped sections, 9-allergen matrix, Offers, Activity timeline with icons) and side rail (photo, assignment, simulated handoff, operator actions). Mobile stacks with actions first after the summary | `Breadcrumbs`, `PageHeader`, `Panel`, `DescriptionList`, `AllergenMatrix`, `Timeline`, `OfferList` | P0 |
| `/donor/new` (`DonorIntake`, `PhotoUpload`, `DraftReview`) | Native file input; "Preparing…/Uploading…" as plain text; no sense of steps; the AI panel and the long form sit side by side at md, which squeezes the form | 3-step progress (Photo → Review and confirm → Submitted). Dropzone-style upload with camera affordance and explicit preparing/uploading/AI states. Review step: photo + AI panel (clearly "AI suggested — unverified") above or beside the checklist; checklist organised into numbered sections | `Stepper`, `Dropzone` look on the existing `<input type=file>`, `AiSuggestionPanel`, `Notice` | P0 |
| `VerificationForm` (web + `/v`) | 25+ fields in one flat column; allergen radios wrap unpredictably; native selects at h-8 (below 44px touch target); AI hints and "AI filled" tags small and easy to miss | Numbered sections (1 What it is, 2 Allergens, 3 Handling, 4 Timing and pickup, 5 Attestation). Allergen rows as a segmented 3-way control per allergen with "Unknown" visibly distinct (never styled as confirmed). AI hints get a consistent "AI suggested" chip. ≥44px controls, sticky submit bar on mobile. Validation summary keeps focus behaviour | `FormSection`, `SegmentedRadio`, `AiChip`, `Field` | P0 |
| `/v` (link checklist) | Same as above plus plain h1; must stay free of third-party resources | Same form styling; minimal branded header (logo from `/public`, self-hosted font via `next/font`); no external script, font request or analytics | same as above | P0 |
| `/donor/donations/[id]` | Status explained in a bordered paragraph; offers as raw list; no progression | Status hero with explainer, progress tracker derived from the server status (Submitted → Reviewed → Offered → Claimed → Collected → Delivered, with off-path states shown as their own terminal), "What is still missing" checklist, offers list without courier identity | `ProgressTracker`, `Notice`, `PageHeader` | P1 |
| `/operator/phone` (`SimulatedPhone`) | All-caps h1 box; contact native select; buttons in rows of equal weight; thread bubbles barely distinguishable; result block below | Two-pane messaging layout: contact list (avatar initials, role, masked handle, JOIN status) + phone frame with thread, quick replies (JOIN/STOP/HELP), offer-code reply bar (YES/NO) and composer. Persistent "Simulated — not iMessage" label in the frame chrome. Claim result as a toast-like card inside the thread | `ContactList`, `PhoneFrame`, `MessageBubble`, `QuickReplies`, `ClaimResultView` | P1 |
| Loading / error / stale states | "Loading dashboard…" plain text; failure boxes amber with code lines | Skeletons for first load; one `StateNotice` pattern (warning = stale, destructive = failure) with code, message and "showing data from …" | `Skeleton`, `StateNotice` | P0 |

### Cross-cutting problems

1. **No tokens in use.** ~200 hard-coded `slate/amber/rose/teal/sky` utility classes across 30 files; shadcn tokens exist but are the neutral default.
2. **No navigation or shell.** Pages float; operators reach the phone only through a sentence link.
3. **Typography is flat.** Geist at default sizes; h1/h2/body barely differ; no tabular numerals for times and counts.
4. **Touch targets.** Most buttons are ~30px tall; selects 32px.
5. **Status meaning.** Good existing rule (no green-for-safe; text always with color) — keep it and add icons so status is never color-only.
6. **Motion.** None at all; no feedback on async actions except text.

## 2. Design direction

**Question:** what makes a community food-coordination tool feel as welcoming as a consumer app and as dependable as an operations console?

**Answer used:** a calm, warm "paper and forest" surface (approachable), strict semantic status tones with icon + text (dependable), one shared shell and page grammar across every role (cohesive), and motion only where it marks a change of state (precise, not decorative). The donor side is spacious and guided (stepper, numbered sections, one action at a time); the operator side is dense and scannable (KPI strip, grouped board, tool rail).

Alternatives considered from the skill output: the default *Non-profit* palette (compassion blue + orange, rejected: fights the green logo and reads as generic SaaS), *Real-Time Operations* dark (rejected: Colin's parallel dark restyle exists; a light theme reads better on projectors and phones in daylight), *Claymorphism* (rejected: too playful for safety-relevant facts).

Source of truth: `design-system/annona/MASTER.md` (UI/UX Pro Max output + the **Annona overrides** section at its top) and `src/app/globals.css`.

## 3. Decisions

| Decision | Why |
|---|---|
| Light theme only, polished; `.dark` tokens kept coherent but no toggle | One finished theme beats two half-done; the demo runs in daylight on phones and a projector. |
| Status tones by meaning, not by "good/bad"; eligible = blue, never green | Existing T-UI-02 rule (no green-for-safe) made a design-system rule. |
| Dashed outline = unconfirmed (AI suggestion, unknown, unanswered) | Makes "not verified" visible at a glance without color alone. |
| One `AppHeader` for all pages; `/v` shows the brand only (no nav, no sign out, no link away) | Continuity, while keeping the link page's no-session model. |
| Provider-mode strip stays wrapped on phones (not a horizontal scroller) | Warnings such as "Scheduler stalled" must never be scrolled out of view. |
| Filters and search on the dashboard narrow the view only; KPI counts always show server totals | No client-side status logic; counts stay server truth. |
| Donor progress stepper derived only from server fields; off-path endings drawn as "stopped here" (X), never complete | A canceled/expired/rejected donation must not look finished. |
| Fonts via `next/font` (self-hosted at build) | No third-party request at runtime, required for `/v`. |
| Every effect gated by `useMotionCapable()` and `prefers-reduced-motion` | Effects are optional; the page reads the same without them (and in test DOMs). |

## 4. Component guide (use these, do not invent new conventions)

| Need | Use | Notes |
|---|---|---|
| Page width + gutters | `PageContainer` (`narrow` forms, `default`, `wide` dashboards) | Renders `<main>`; one per page. |
| Page title | `PageHeader` (eyebrow, h1, description, actions, breadcrumbs, meta) | Exactly one h1 per page. |
| Section title | `SectionHeading` (h2, optional icon and `(count)`) | |
| Inline message | `Notice` tone `neutral/info/warning/danger/synthetic`; pass `role="alert"` or `role="status"` explicitly | Stale data = warning; failures = danger; demo/fixture = synthetic. |
| Donation status | `StatusBadge` (+ `statusTone`, `statusIcon`, `TONE_CLASS`, `TONE_ACCENT`) | Never color a status by hand. |
| Field provenance | `FieldStateBadge` | Dashed = suggested/unknown. |
| Server reasons | `ReasonList` | Messages verbatim; code shown small. |
| Deadlines | `Countdown` / `CountdownPill` | Display only; "time reached (server decides)". |
| Progress | `Stepper` (`complete/current/upcoming/halted`) | Derive states from server data only. |
| KPI | `MetricTile` (React Bits CountUp inside) | Value must be a server count. |
| Activity | `AuditTimeline` | Vertical rail. |
| Buttons | `Button` (`default`, `outline`, `ghost`, `destructive`; sizes `sm` 36 px, default 40 px, `lg` 44 px) | Icons: Lucide, `aria-hidden`. |
| Loading | `Skeleton` blocks inside a `role="status"` wrapper with sr-only text | |

## 5. Third-party resources

| Resource | How it was used | Result in code |
|---|---|---|
| **UI/UX Pro Max** (nextlevelbuilder/ui-ux-pro-max-skill @ 56ea9cf) | Not installed as a plugin on this machine; the official repo was shallow-cloned to the session scratchpad, its stdlib-only scripts were read, then run directly: `--design-system` (4 queries; the *non-profit* one persisted with `--persist --output-dir <repo>`), `--page operator-dashboard` and `--page donor-checklist`, `--domain color/typography/product/ux`, `--stack shadcn/nextjs`. | `design-system/annona/` (MASTER + 2 page files); tokens, fonts, 44 px targets, focus ring, error-summary focus, reduced motion, next/font. |
| **React Bits** (reactbits.dev registry JSON, MIT + Commons Clause, notice kept in each file) | Vendored `BlurText` (welcome h1), `CountUp` (dashboard KPI tiles), `SpotlightCard` (sign-in card). Adapted: React 19 refs/effect lint fixes, `as` prop on BlurText, light theme + leaf color on SpotlightCard. GSAP-based items (FadeContent, AnimatedContent) rejected to avoid a second animation library. | `src/components/reactbits/*`, dependency `motion@12.43.0`. |
| **21st.dev** | Registry installs require an `API_KEY_21ST` (verified: the registry answers "Authentication required"); no key was available and none was invented. Two patterns were chosen from the catalogue and rebuilt locally on Annona tokens: ShadcnSpace *Animated Progress Stepper* (MIT) → `Stepper`; the vertical *Timeline* pattern → `AuditTimeline`. | `src/components/ui/stepper.tsx`, `src/components/dashboard/AuditTimeline.tsx`. |

## 6. Verification (2026-10-18, local, fake providers, PGlite)

See the PR description for the exact command results. Screens were inspected in headless Edge (DevTools protocol, signed in through the real `/api/session` route) at 320, 375, 768, 1440 and 1920 px: `/`, `/operator` (live and `?fixture=1`), `/operator/donations/:id?fixture=1`, `/operator/phone` (after JOIN and a fixture photo through the simulated inbound route), `/v#<real token>`, `/donor/new`, `/donor/donations/:id`. A per-element overflow check found nothing outside its scroll container at 320/375 after the fixes in commit "simulated phone redesign and responsive fixes".

**Not verified:** real Gemini, real Photon, a screen reader pass, Safari/iOS rendering, the production build on Vercel.

## 7. Remaining trade-offs / next steps

- Dev 1 must review the four intake files (`docs/requests/dashboard-intake-restyle.md`).
- Colin's `worktree-ui-restyle` (dark video palette) touches the same files; only one of the two should merge.
- Status tones are not yet exposed in a dark theme toggle.
- A11y was checked by structure (roles, labels, focus order unchanged, contrast computed) and existing tests, not by an assistive-technology run.
