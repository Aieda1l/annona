# CONTRACTS.md — Annona shared contracts

> **Version:** `contracts v0.5` (PROPOSED until it is merged; what each version changed is in §15).
> **This header is the only place the contracts version is stated.** Other docs and prompts say "the current contracts" and never repeat the number. At kickoff the captain posts this version together with `BASELINE_SHA`.
> **Status:** Specification for the lanes. Where `src/` or the tests differ from this file, the owning lane records the gap and the captain resolves it. Once `chore/integration-contracts-2` is merged, `src/contracts` is authoritative for types and these tables stay authoritative for rules.
> **Change control:** Only the captain changes this file or `src/contracts/**`. Request changes through `docs/requests/<lane-slug>-<topic>.md` (slugs in `docs/OWNERSHIP.md` §2) (`docs/OWNERSHIP.md` §4). Bump the version in §15.
> **Safety framing:** In this file, `eligible` means *eligible for dispatch under the prototype operator policy, based on donor-attested records*. It never means "safe to eat", "allergen-free" or "compliant". No field anywhere may state or imply food safety.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Field naming | `snake_case` for every contract field in TypeScript types, JSON over HTTP and Postgres columns. There is no mapping layer. Function names use `camelCase`. |
| IDs | UUID v4 strings. Offers also carry a 4-character `short_code` drawn from `ACDEFHJKMNPRTUVWXY3479`. It is **unique across all offers and never reused until `resetDemo`**, so a stale code always resolves to its own (expired) offer. Example codes in all docs: `K7M3`, `H4M9`. Demo personas use **fixed UUIDs** from the captain-owned fixture `src/contracts/fixtures/demo-actors`. Dev 2's seed must use the same IDs. |
| Time | Every instant is a **UTC ISO-8601 string ending in `Z`** in JSON, and `timestamptz` in Postgres. The server `Clock` (§9) is the only authority. Client clocks are display-only. Messages render local time as `America/Los_Angeles`. |
| Quantities | `servings` is an integer the donor enters. The AI `estimated_servings` range is never copied into `servings` automatically. |
| Synthetic data | Every profile and donation carries `is_synthetic: true`. The UI shows a "Synthetic data" badge. |
| Results | Lane functions return `Result<T>` (§3.15) for expected failures. They throw only on programmer error. |
| Validation | Every external input is parsed with its Zod schema: HTTP bodies, provider webhooks/events, AI model output and env vars. HTTP request bodies, `VerifiedFacts` and the model-output schema use `.strict()` (unknown keys fail). Provider webhook envelopes may carry extra keys and are parsed with passthrough. Invalid input fails closed (`VALIDATION_FAILED` / `AI_OUTPUT_INVALID`). |
| Provenance | Prompt ID/version, policy ID/version and provider mode (`real`/`fake`) are stored on every artifact they produce. |

---

## 2. Enumerations (exact string values)

| Enum | Values | Notes |
|---|---|---|
| `Allergen` | `milk`, `eggs`, `fish`, `crustacean_shellfish`, `tree_nuts`, `peanuts`, `wheat`, `soybeans`, `sesame` | The FDA's nine major allergens. Sesame was added by the FASTER Act, effective 2023-01-01 (RESEARCH R-REG-9). The UI always shows all nine. |
| `DonorAllergenStatus` | `present`, `not_in_listed_ingredients`, `unknown` | Donor-declared. `not_in_listed_ingredients` does not mean "allergen-free". The default is `unknown`. |
| `CrossContactStatus` | `declared`, `unknown` | `declared` with an empty list means "none known to the donor". |
| `HandlingMode` | `refrigerated`, `hot_held`, `ambient`, `frozen`, `unknown` | The food's current holding. The P0 policy allows `refrigerated` only. |
| `PreparationType` | `prepared_cold`, `commercially_packaged`, `cooked_then_cooled`, `other`, `unknown` | P0 allows `prepared_cold` (e.g. sandwiches, salads) and `commercially_packaged`. Cooling history for cooked food is not verifiable in the prototype (RESEARCH R-REG-4). |
| `YesNoUnknown` | `yes`, `no`, `unknown` | Used for every donor attestation. `unknown` is always explicit. |
| `FieldState` | `suggested`, `donor_verified`, `unknown`, `needs_review`, `rejected` | Per-field data state (CLAUDE.md safety rule 2). See §3.6. |
| `DonationStatus` | `draft`, `needs_review`, `eligible`, `unmatched`, `offered`, `claimed`, `collected`, `delivered`, `rejected`, `canceled`, `expired` | Canonical. Terminal states: `delivered`, `rejected`, `canceled`, `expired`. See §4. **`needs_review` is a safety or human-review outcome** (incomplete verification, a review rule, or food in an unreachable courier's hands). **`unmatched` is a dispatch outcome**: the latest gate outcome is `eligible`, but no feasible recipient/courier pair is available right now. |
| `OfferStatus` | `pending_send`, `open`, `accepted`, `declined`, `expired`, `superseded`, `send_failed`, `canceled` | Every value except `pending_send` and `open` is terminal. |
| `DeliveryStatus` | `unknown`, `accepted`, `delivered`, `failed` | Provider delivery signal for an offer message. Informational only; never drives correctness (§7). |
| `EligibilityOutcome` | `eligible`, `needs_review`, `rejected` | An `unknown` input never yields `eligible`. |
| `ReasonSeverity` | `review`, `reject`, `dispatch` | `review` and `reject` come from the gate (§5) and from safety-relevant system events. **`dispatch` is never produced by the gate**: it records a matching or assignment outcome and never affects `EligibilityDecision.outcome`. The UI styles it neutrally, never as a safety warning. |
| `AiStatus` | `pending`, `succeeded`, `failed`, `skipped` | `failed` covers provider errors, timeouts, safety blocks and schema-invalid output. |
| `ImageQuality` | `usable`, `poor`, `not_food` | AI-reported; advisory only. |
| `Confidence` | `low`, `medium`, `high` | AI self-report; advisory only. The gate never uses it. |
| `ActorRole` | `donor`, `recipient`, `courier`, `operator`, `system` | |
| `ProviderMode` | `real`, `fake` | |
| `StoreKind` | `pglite`, `postgres` | One Drizzle implementation with two drivers (§9.1). |
| `MessagingIdentityStatus` | `awaiting_join`, `joined`, `opted_out` | Photon shared iMessage lines cannot send first, so a participant (courier **or donor**) must text `JOIN` (RESEARCH R-PH-4). |
| `ClaimResultCode` | `claimed`, `already_claimed_by_you`, `already_claimed`, `offer_expired`, `offer_closed`, `donation_unavailable`, `not_authorized`, `offer_not_found`, `ineligible` | §8. |
| `DeclineResultCode` | `declined`, `already_declined`, `offer_expired`, `offer_closed`, `not_authorized`, `offer_not_found` | |
| `InboundOutcome` | `processed`, `duplicate`, `ignored`, `rejected` | |
| `HandoffStep` | `collected`, `delivered` | **Simulated** in the hackathon. Always stored with `simulated: true`. `delivered` means the recipient recorded acceptance after its own receiving inspection (WAC 246-215-09420). |
| `OperatorAction` | `reject`, `cancel`, `return_to_donor`, `retry_matching` | No action can override an unknown or rejected fact (§4). |
| `MessagePurpose` | `offer`, `claim_result`, `decline_ack`, `offer_closed`, `join_ack`, `stop_ack`, `draft_ready`, `intake_failed`, `donor_update`, `recipient_update`, `help` | `draft_ready` = AI summary + verification link (§8.4). `intake_failed` = the photo could not be used. `donor_update` (claim notices etc.) is P1. |
| `InboundIgnoreReason` | `unknown_sender`, `not_joined` | Recorded on ignored/rejected inbound rows (§11). |
| `ErrorCode` | `VALIDATION_FAILED`, `NOT_FOUND`, `NOT_AUTHORIZED`, `INVALID_TRANSITION`, `CONFLICT`, `AI_OUTPUT_INVALID`, `PROVIDER_UNAVAILABLE`, `RATE_LIMITED`, `DUPLICATE_EVENT`, `NOT_IMPLEMENTED`, `INTERNAL` | §3.15 |

### 2.1 ReasonCode catalogue

Every reason has the shape `{ code, severity, field?, allergen?, message }`. The `message` is plain language a donor or operator can act on. Test IDs are listed in `docs/TEST_PLAN.md`.

| Code | Severity | Raised by | Meaning |
|---|---|---|---|
| `DONOR_NOT_APPROVED` | reject | G-01 | Donor is `suspended`, missing, or not a licensed food establishment. |
| `DONOR_APPROVAL_PENDING` | review | G-01 | Donor is `pending`. |
| `HANDLING_OUT_OF_SCOPE` | reject | G-02 | `hot_held`, `ambient` or `frozen`. Outside the prototype policy; this is a prototype restriction, not law. |
| `HANDLING_UNKNOWN` | review | G-02 | |
| `COOLING_HISTORY_REVIEW` | review | G-03 | `cooked_then_cooled`. The prototype cannot verify the cooling history required by WAC 246-215-03515; a qualified partner must review. |
| `PREPARATION_TYPE_REVIEW` | review | G-03 | `other`. |
| `PREPARATION_UNKNOWN` | review | G-03 | |
| `EXCLUDED_CATEGORY` | reject | G-04 | Prototype exclusion list, stricter than the law (D-007): raw milk, any infant formula, home-prepared or home-canned food, damaged cans, distressed food, donor-applied reduced-oxygen/vacuum packaging. For the legal basis, see WAC 246-215-09425 (home-canned, donor-kitchen ROP, damaged cans, unapproved distressed food, expired infant formula, raw milk) and -09415/-09420 for home-kitchen limits (R-REG-6, R-REG-8). |
| `EXCLUDED_CATEGORY_UNKNOWN` | review | G-04 | |
| `COLD_HOLDING_NOT_CONFIRMED` | reject | G-05 | Donor says cold holding was **not** continuous. |
| `COLD_HOLDING_UNKNOWN` | review | G-05 | |
| `TEMPERATURE_LOG_MISSING` | review | G-06 | `no` or `unknown`. |
| `PREVIOUSLY_SERVED` | reject | G-07 | Food was served to or handled by consumers (WAC 246-215-09415/09420). |
| `PREVIOUSLY_SERVED_UNKNOWN` | review | G-07 | |
| `PACKAGING_NOT_COVERED` | review | G-08 | Not in covered food-grade containers. The donor may repackage and resubmit. |
| `PACKAGING_UNKNOWN` | review | G-08 | |
| `DISCARD_BY_MISSING` | review | G-09 | No discard-by or date-mark time from the kitchen. |
| `DISCARD_BY_PASSED` | reject | G-09 | `discard_by <= now`. |
| `PICKUP_WINDOW_PASSED` | reject | G-10 | `donor_pickup_by <= now`. |
| `PICKUP_WINDOW_TOO_SHORT` | reject | G-10 | `donor_pickup_by < now + min_pickup_lead_minutes`. |
| `ALLERGEN_UNKNOWN` | review | G-11 | One reason per allergen still `unknown` (`allergen` is set). |
| `CROSS_CONTACT_UNKNOWN` | review | G-12 | |
| `INGREDIENTS_MISSING` | review | G-13 | `ingredients_text` has fewer than 3 non-space characters. |
| `NO_ELIGIBLE_MATCH` | dispatch | S-05 (matching) | No feasible recipient and courier pair in the first round. The donation becomes `unmatched`. |
| `CANDIDATES_EXHAUSTED` | dispatch | S-05 (matching) | Every feasible courier was already offered this donation and declined, timed out or failed. The donation becomes `unmatched`. |
| `CUTOFF_REACHED` | reject | S-08 (sweeper) | Recorded when a donation expires at its effective cutoff. |
| `PICKUP_NOT_COLLECTED` | reject | S-16 (sweeper) | A `claimed` donation reached `effective_cutoff_at` (the earlier of `donor_pickup_by` and `discard_by`) without a recorded collection. |
| `COURIER_OPTED_OUT` | dispatch | S-15 | The assigned courier texted STOP **before any collection was recorded**. The assignment is released and the donation returns to `eligible`; the next tick re-runs the gate and offers the next feasible courier. |
| `COURIER_OPTED_OUT_AFTER_PICKUP` | review | S-17 | The assigned courier texted STOP **after** `collected` was recorded. The food is with that courier, so nothing is reassigned automatically. The operator follows up off-platform and closes the donation with `cancel` (note required) or `reject`. |

---

## 3. Entities and payloads

The "writer" named in each heading is the lane that writes the entity. All lanes may read it through the contract.

### 3.1 Profiles (synthetic seed; writer: Dev 2)

**DonorProfile**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `display_name` | string ≤ 80 | e.g. "Rainier Catering (synthetic)". Never a real organization's name. |
| `org_type` | `restaurant` \| `caterer` \| `campus_dining` | |
| `licensed_food_establishment` | boolean | Operator-verified; **simulated** in the demo. G-01 requires `true`. |
| `approval_status` | `approved` \| `pending` \| `suspended` | |
| `location` | `{ lat, lng, area_label, address_line }` | `address_line` is disclosed to a courier only after a successful claim (§11). |
| `is_synthetic` | `true` | |

**RecipientOrg** (a donated-food distributing organization, DFDO)

| Field | Type | Notes |
|---|---|---|
| `id`, `display_name`, `approval_status`, `location`, `is_synthetic` | as above | |
| `registered_dfdo` | boolean | Operator-verified registration as a DFDO with the local health jurisdiction (WAC 246-215-09400; King County annual registration). **Simulated** in the demo. |
| `serves_highly_susceptible_population` | boolean | Under the P0 policy, `true` excludes the recipient from prepared-food matching (WAC 246-215-01115 definition). |
| `accepts_handling_modes` | `HandlingMode[]` | Depends on equipment, e.g. `["refrigerated"]`. |
| `excluded_allergens` | `Allergen[]` | e.g. a youth program that excludes `peanuts` and `tree_nuts`. |
| `capacity_servings_available` | int ≥ 0 | Refrigerated receiving capacity. |
| `receiving_closes_at` | UTC | Seeded relative to the demo reset time. |

The operator enters standing acceptance criteria for an approved recipient. For P0, these criteria count as the recipient's agreement (`docs/DECISIONS.md` D-009).

**CourierProfile**

| Field | Type | Notes |
|---|---|---|
| `id`, `display_name`, `approval_status`, `location`, `is_synthetic` | as above | Real couriers in the demo are **opted-in team members** acting as synthetic couriers. |
| `affiliated_recipient_ids` | uuid[] | Recipients that authorized this courier. |
| `capabilities` | `{ cold_transport: boolean }` | Insulated or cold transport, attested by the recipient org. Simulated. |
| `available_until` | UTC | |

**MessagingIdentity** (writer: Dev 2 store, called by Dev 3)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `actor_role`, `actor_id` | `ActorRole`, uuid | Courier or donor in P0 (recipient is P1). The demo donor identity is seeded for the approved donor from `DEMO_DONOR_HANDLE` (§12). |
| `provider` | `photon` \| `fake` | |
| `handle` | string | E.164 phone number or Apple-ID email. Must be iMessage-capable for `photon`. |
| `status` | `MessagingIdentityStatus` | `joined` only after an inbound `JOIN` from this handle. `STOP` sets `opted_out`. |
| `provider_space_id`, `provider_sender_id` | string \| null | Photon `space.id` and `receivedBy.id` captured from the JOIN message. Replies require them. |
| `joined_at`, `opted_out_at` | UTC \| null | |

### 3.2 Donation (created by Dev 1; status and persistence by Dev 2)

| Field | Type | Notes |
|---|---|---|
| `id`, `donor_id` | uuid | |
| `status` | `DonationStatus` | Changed **only** by Dev 2 core functions (§4). |
| `version` | int | Incremented on every status change. |
| `source` | `web_upload` \| `messaging` \| `fixture` | `messaging` is the primary demo path (D-031); `web_upload` is the fully supported fallback and uses the same draft, checklist and gate code. |
| `source_ref` | string \| null | For `messaging`: `<provider>:<provider_message_id>` of the inbound photo. `UNIQUE (source, source_ref)` where non-null, so a reprocessed inbound photo (§8.2) returns the existing draft instead of creating a second one. `null` for `web_upload` and `fixture`. |
| `image_id` | uuid \| null | Synthetic image bytes, stored in `donation_images`. |
| `ai_status` | `AiStatus` | |
| `ai_suggestion` | `VisionSuggestion` \| null | Immutable snapshot. **The gate never reads it.** |
| `verified_facts` | `VerifiedFacts` \| null | Present only after the donor submits. |
| `edited_from_ai` | string[] | Fields where the donor's value departs from the AI suggestion. Computed server-side by Dev 1 with exactly these rules:<br>• `dish_name` is listed when it matches no `dish_suggestions[].name` (trimmed, case-insensitive).<br>• `servings` is listed when `estimated_servings` is non-null, unless `min = max = servings`.<br>• `allergens.<name>` is listed when the AI listed that allergen as possible and the donor declared `not_in_listed_ingredients`. This is shown to the operator as a provenance signal; it does not change the gate.<br>The list is empty when `ai_suggestion` is null. |
| `latest_decision` | `EligibilityDecision` \| null | |
| `effective_cutoff_at` | UTC \| null | `min(donor_pickup_by, discard_by)` once verified. |
| `claimed_offer_id` | uuid \| null | Set only by a successful claim (§8). Cleared by S-15 and S-17. After S-15 the donation can be claimed again by another courier. |
| `collected_at` | UTC \| null | Set by S-09. Once set, the donation is never reassigned (S-17) and never returns to the donor for edits (S-03, S-13 guards). |
| `created_at`, `updated_at` | UTC | |
| `is_synthetic` | `true` | |

### 3.3 VisionSuggestion — AI output, untrusted (writer: Dev 1)

The model generates only the **`VisionModelOutput`** subset: every key below **except** the five provenance keys `prompt_id`, `prompt_version`, `provider`, `model`, `mode`. `src/contracts` exports `VisionModelOutput` (the VisionSuggestion schema with those keys omitted, `.strict()`), and it is used as the provider response schema. The adapter (Dev 1) parses the model text against `VisionModelOutput`, then stamps the five provenance keys from its own configuration, giving a `VisionSuggestion`. The model is never asked to state its own model ID. A parse failure, timeout, provider error or safety block sets `ai_status = failed`, and the donor enters every value manually. No suggestion value can set a verified field.

```json
{
  "prompt_id": "annona-intake",
  "prompt_version": "v1",
  "provider": "gemini",
  "model": "<model id actually called>",
  "mode": "real",
  "image_quality": "usable",
  "dish_suggestions": [{ "name": "assorted deli sandwiches and wraps", "confidence": "medium" }],
  "visible_components": ["sliced bread sandwiches", "tortilla wraps", "lettuce", "sliced cheese"],
  "estimated_servings": { "min": 18, "max": 30 },
  "possible_allergens": [
    { "allergen": "wheat", "basis": "bread and tortillas are typically wheat-based" },
    { "allergen": "milk", "basis": "visible sliced cheese" },
    { "allergen": "eggs", "basis": "spreads such as mayonnaise commonly contain egg" }
  ],
  "uncertainty_notes": ["Fillings and spreads cannot be identified from a photo."],
  "questions_for_donor": ["Which spreads and fillings are used? Do any contain sesame, soy, nuts or fish?"],
  "ingredients_verified": false,
  "handling_verified": false,
  "requires_donor_confirmation": true
}
```

| Field | Rule |
|---|---|
| `dish_suggestions` | 0–3 items. An empty list is allowed when `image_quality != usable`. |
| `estimated_servings` | `{min,max}` with `1 <= min <= max <= 500`, or `null`. |
| `possible_allergens` | Each `allergen` must be an `Allergen`. `basis` is ≤ 120 characters of externally checkable visual or typical-recipe evidence. **An allergen absent from this list means nothing; it is never treated as absent.** |
| `uncertainty_notes`, `questions_for_donor` | 0–5 strings each, ≤ 160 characters. Short decision summaries, not chain-of-thought. |
| `ingredients_verified`, `handling_verified` | Schema literal `false`. Any other value fails parsing. |
| `requires_donor_confirmation` | Schema literal `true`. |
| Forbidden content | No `safe`, `allergen_free`, temperature, shelf-life, discard-time or legal-status keys. The Zod object is `.strict()`, so unknown keys fail parsing. |

### 3.4 VerifiedFacts — donor-submitted (Dev 1 validates; Dev 2 evaluates)

Every key is **required** in the payload. Uncertainty is expressed with explicit `unknown`, never by omission.

| Field | Type | Donor-facing question / notes |
|---|---|---|
| `dish_name` | string 1–80 | |
| `description` | string ≤ 300 | The key must exist; it may be `""`. |
| `servings` | int 1–500 | |
| `ingredients_text` | string ≤ 1000 | From the recipe or label. Empty triggers G-13 review. |
| `allergens` | `Record<Allergen, DonorAllergenStatus>` | **All nine keys.** The UI starts each one at `unknown`. |
| `cross_contact_status` | `CrossContactStatus` | |
| `cross_contact_allergens` | `Allergen[]` | Allowed only when `declared`. |
| `handling_mode` | `HandlingMode` | "How is this food being held right now?" |
| `preparation_type` | `PreparationType` | "How was it prepared?" |
| `contains_excluded_category` | `YesNoUnknown` | "Does this include raw/unpasteurized milk, infant formula, home-prepared or home-canned food, damaged cans, food damaged by fire, flood or temperature, or anything you vacuum- or reduced-oxygen-packaged yourself?" |
| `continuous_cold_holding` | `YesNoUnknown` | "Held at 41 °F (5 °C) or below continuously since preparation, per your establishment's procedures?" (WAC 246-215-03525) |
| `temperature_log_available` | `YesNoUnknown` | |
| `previously_served` | `YesNoUnknown` | "Was any of this food served to or handled by customers (e.g. on a buffet line)?" |
| `covered_food_grade_containers` | `YesNoUnknown` | |
| `discard_by` | UTC \| null | From the kitchen's own date-marking or discard procedure. **Never computed or extended by Annona.** |
| `donor_pickup_by` | UTC | The latest time the kitchen can hand the food over. This is **not** a safety time. |
| `pickup_instructions` | string ≤ 200 | Disclosed only to the claiming courier. |
| `attestation` | `{ attested: true, attested_by_label, attested_at }` | Accurate to the donor's knowledge. **`attested_at` is overwritten by core with the server `Clock` in `submitVerification`.** Any client value is ignored. |

### 3.5 MatchCandidate (writer: Dev 2, pure)

| Field | Type | Notes |
|---|---|---|
| `recipient_id`, `courier_id` | uuid | |
| `eta_to_pickup_minutes`, `transit_minutes` | int | Haversine distance ÷ `policy.average_speed_kmh`, rounded up. A synthetic estimate, labeled as such in the UI. |
| `estimated_pickup_at`, `estimated_dropoff_at` | UTC | Computed per M-10. |
| `slack_minutes` | int | `min(effective_cutoff_at, receiving_closes_at, available_until) − estimated_dropoff_at` |
| `rank` | int | 1 is best. Sorted by `estimated_dropoff_at` ascending, then `courier_id` ascending, so ranking is deterministic. |

### 3.6 FieldState map

`EligibilityDecision.field_states: Record<FactField, FieldState>`. A `FactField` is any key of §3.4 (except `allergens`), or `allergens.<name>` for each allergen, e.g. `allergens.sesame`. The same path string is used in `field_states`, in `reasons[].field` and in `edited_from_ai`.

| State | When |
|---|---|
| `suggested` | Shown on a draft (before submission) where an AI value exists. Never appears in a decision computed from VerifiedFacts. |
| `donor_verified` | A concrete donor value that passes its rule. |
| `unknown` | The donor chose `unknown`, or `null` where null is allowed. Raises a review reason. |
| `needs_review` | A concrete value that needs human attention, e.g. `temperature_log_available = no`. |
| `rejected` | A concrete value that triggers a reject reason, e.g. `previously_served = yes`. |

The UI renders badges from this map only. It never recomputes safety logic.

### 3.7 EligibilityDecision (writer: Dev 2, pure)

```json
{
  "outcome": "needs_review",
  "reasons": [
    { "code": "COOLING_HISTORY_REVIEW", "severity": "review", "field": "preparation_type",
      "message": "Cooked-then-cooled food needs a verified cooling history, which this prototype can't check. A partner must review it." },
    { "code": "COLD_HOLDING_UNKNOWN", "severity": "review", "field": "continuous_cold_holding",
      "message": "We can't offer this until continuous cold holding is confirmed." },
    { "code": "ALLERGEN_UNKNOWN", "severity": "review", "field": "allergens.sesame", "allergen": "sesame",
      "message": "Please confirm whether sesame is in the listed ingredients." }
  ],
  "field_states": { "preparation_type": "needs_review", "continuous_cold_holding": "unknown", "allergens.sesame": "unknown", "dish_name": "donor_verified" },
  "policy_id": "annona-prototype-refrigerated",
  "policy_version": "2026-10-17.1",
  "evaluated_at": "2026-10-17T23:10:00.000Z"
}
```

Outcome precedence: any `reject` reason makes the outcome `rejected`. Otherwise any `review` reason makes it `needs_review`. Otherwise it is `eligible`. All rules are evaluated (no short-circuit), so the donor sees every missing item at once.

### 3.8 Offer (Dev 2 persists; Dev 3 sends)

| Field | Type | Notes |
|---|---|---|
| `id`, `short_code` | uuid, string | |
| `donation_id`, `recipient_id`, `courier_id` | uuid | |
| `status` | `OfferStatus` | |
| `wave_no` | int ≥ 1 | |
| `created_at` | UTC | |
| `sent_at` | UTC \| null | Set when the offer moves to `open`, immediately before the provider send (§7). |
| `expires_at` | UTC \| null | **Offer response deadline**: `min(sent_at + response_window, donor_pickup_by − eta_to_pickup)` |
| `responded_at` | UTC \| null | |
| `close_reason` | string \| null | e.g. `superseded_by_claim`, `cutoff_reached`, `provider_send_failed`, `courier_not_joined`, `recheck_failed`. On an `accepted` offer, `null` means the assignment is **active**; a value (`courier_opted_out`, `pickup_not_collected`, `donation_canceled`) means the assignment ended and the row is history (§4.2). |
| `provider_mode` | `ProviderMode` | |
| `provider_message_id` | string \| null | The Photon message ID returned by a real send. This is the evidence for the Photon track. |
| `delivery_status` | `DeliveryStatus` | Updated from provider status events. Informational. |
| `candidate` | `MatchCandidate` | Snapshot taken at creation. |

### 3.9 Claim and decline (Dev 2)

**ClaimCommand**: `{ offer_ref: { offer_id } | { short_code }, actor: Actor, source: "messaging" | "simulated_messaging", source_event_id: string | null }`

**ClaimResult**:

```json
{ "code": "already_claimed", "offer_id": "…", "donation_id": "…", "donation_status": "claimed",
  "assignment": null, "message_for_actor": "This pickup was already claimed by another volunteer. No assignment was made for you." }
```

`assignment` is populated only for `claimed` and `already_claimed_by_you`: `{ donation_id, recipient: { display_name, address_line }, pickup: { display_name, address_line, pickup_instructions, donor_pickup_by } }`. For every other code it is `null`, and no address is disclosed.

**DeclineCommand** and **DeclineResult** have the same shape, using `DeclineResultCode`.

### 3.10 Messaging payloads (Dev 3)

**InboundMessage** (normalized `message.received`):

| Field | Type | Notes |
|---|---|---|
| `provider` | `photon` \| `fake` | |
| `provider_message_id` | string | **Dedupe key**, combined with `provider`. Photon `data.object.id` (`pho_msg_…`). The same message arriving by webhook and by poll is processed once. |
| `provider_event_id` | string \| null | Envelope `id`, kept for audit. |
| `received_at` | UTC | Server receive time. Never the client's time. |
| `sender_handle` | string | Normalized E.164 or email (`sentBy.handle`). |
| `provider_space_id`, `provider_line_sender_id` | string \| null | Photon `space.id` and `receivedBy.id`. Needed to reply. |
| `text` | string \| null | |
| `attachments` | `{ kind: "image", provider_attachment_id, mime \| null }[]` | Bytes are fetched lazily, by Dev 3 for Photon, and **only** after the sender resolves to a `joined` donor identity. In fake mode the simulated phone supplies `{ fixture_id }` instead (§10). |

**DeliveryStatusEvent** (normalized Photon status events): `{ provider, provider_event_id, provider_message_id, status: "accepted" | "delivered" | "failed", failure_code: string | null, at }`. Mapping: `message.accepted` → `accepted`, `message.delivered` → `delivered`, `message.failed` → `failed`. `message.dispatched` and any other type → `{ ignored: true }`.

**OutboundMessage**: `{ to_identity_id, text, purpose: MessagePurpose, correlation: { donation_id?, offer_id?, inbound_message_id? }, idempotency_key }`. **Every outbound message except `stop_ack` requires `to_identity.status = joined`.** Otherwise `send` is not called, the result is `NOT_JOINED`, and the attempt is audited. The `idempotency_key` is deterministic, e.g. `offer:<offer_id>:v1` or `reply:<inbound provider_message_id>:v1`. Photon rejects a reused key sent with a different body (422 `IDEMPOTENCY_KEY_REUSED`), so text for a given key must be byte-identical on retry.

**SendResult**: `{ ok: true, provider_message_id, mode }` or `{ ok: false, error_code: "PROVIDER_UNAVAILABLE" | "RATE_LIMITED" | "NOT_JOINED" | "INVALID_HANDLE" | "NOT_IMPLEMENTED", retryable: boolean, mode }`. **`ok: true` means the provider accepted the message (HTTP 202), not that it was delivered.**

**ThreadMessage** (element of the simulated-thread response; see `docs/requests/dashboard-phone-thread-shape.md`): `{ id: uuid, direction: "inbound" | "outbound", text: string, purpose: MessagePurpose | null, created_at: UTC string }`. `purpose` is set only for outbound messages. For an inbound message `created_at` is its `received_at`. `text` is exactly what was sent or received, except that a `draft_ready` verification token is shown in full only when `MESSAGING_PROVIDER=fake` (§8.4). No field holds a handle; the message text itself is not scanned for one.

**InboundResult**: `{ outcome: InboundOutcome, command: "accept" | "decline" | "join" | "stop" | "help" | "photo" | "unknown", claim_result?, decline_result?, reply: OutboundMessage | null }`. A duplicate `provider_message_id` returns the stored first result with `outcome: "duplicate"` and sends **no** new reply.

**Inbound command grammar** (case-insensitive; surrounding punctuation ignored; first token decides, except the opt-out rule below, D-039):

| Text | Command | Effect |
|---|---|---|
| `JOIN` | join | A seeded identity (`awaiting_join` **or** `opted_out`) becomes `joined`. The space and sender IDs and a new `joined_at` are recorded. Reply `join_ack` with the automated-assistant disclosure and STOP instructions. |
| `YES [CODE]`, `ACCEPT [CODE]` | accept | `claimOffer` |
| `NO [CODE]`, `DECLINE [CODE]` | decline | `declineOffer` |
| `STOP` | stop | Core `optOutIdentity` runs in one transaction. The identity becomes `opted_out`. This courier's `open`/`pending_send` offers become `canceled`. If the courier holds a `claimed` assignment with no collection recorded, the assignment is released and the donation returns to `eligible` (S-15, `COURIER_OPTED_OUT`); the next tick offers another feasible courier. If the courier holds a `collected` donation, it goes to `needs_review` with `COURIER_OPTED_OUT_AFTER_PICKUP` (S-17) and is never reassigned automatically. A donor's STOP revokes that donor's unconsumed verification links (§8.4). The only reply is `stop_ack`; no further messages go to that handle. |
| `HELP` | help | Help text. |
| Image from a `joined` donor identity | photo | **P0 (D-031).** The first image is used; any text is ignored. Dev 3 fetches the bytes, calls Dev 1 `createDraftFromImage({ source: "messaging", source_ref })`, then core `issueVerificationLink`, and replies `draft_ready` (§8.4). If the bytes cannot be fetched or used (`ATTACHMENT_NOT_READY` after Dev 3's bounded retries, unsupported MIME, too large, `VALIDATION_FAILED`), or the donor may not create drafts (S-01 guard), the reply is `intake_failed` and no draft exists. An image from a courier identity is `unknown` (help text). |
| Anything else | unknown | Help text. Never assigns. |

**Opt-out rule (D-039).** A message of 8 words or fewer that contains `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END` or `QUIT` as a whole word is the `stop` command, unless an earlier word is `YES`, `ACCEPT`, `NO`, `DECLINE` or `JOIN` (a leading `HELP` does not block it). Longer messages keep the first-token rule. If the message also carries an image, the opt-out wins: the sender is opted out and no draft is created.

`CODE` may be omitted when the sender has exactly one `open` offer. Otherwise the reply asks for the code. CODE is uppercased and must be 4 characters from the §1 alphabet; anything else is treated as "no code". A message from a handle with no seeded identity gets outcome `ignored` and `reply: null`, and is never auto-registered; it is stored per the §11 logging rule (no handle, no text, no attachment bytes). On Photon shared lines, unassigned senders cannot reach the line at all (R-PH-5).

**DraftReadyView** (the only input to `formatDraftReadyMessage`): `{ ai_status, dish_guess: string | null, possible_allergens: Allergen[], link_url, link_expires_at, demo_mode: boolean }`. The text says the summary is an AI guess that the donor must confirm, lists possible allergens as "possible", gives the link and its expiry in `America/Los_Angeles`, and carries the automated-assistant (+ DEMO) disclosure. When `ai_status = failed` it says the photo could not be analyzed and the donor can enter the details at the link. It never says safe, allergen-free or verified, and never contains a handle or address.

**OfferMessageView** (returned by `openOfferForSend`; the only input to `formatOfferMessage`):

`{ short_code, dish_name, servings, allergens_present: Allergen[], cross_contact_status, cross_contact_allergens: Allergen[], handling_mode, recipient_display_name, pickup_area_label, expires_at, demo_mode: boolean }`

It never contains `address_line`, `pickup_instructions` or any handle. Required allergen wording in the offer text: "Contains (donor-declared): <list or 'none declared'>. Other major allergens: not in the donor's listed ingredients — not a guarantee. Cross-contact: <declared list | none known to donor>."

### 3.11 AuditEvent (writer: Dev 2 store; append-only)

`{ id, at, donation_id | null, offer_id | null, type, actor: { role, id | null }, mode: { vision?, messaging? }, data: object }`

**Content rule:** `data` never contains a full messaging handle, message text, `address_line` or `pickup_instructions`. Use `identity_id` and a handle masked to its last 4 characters. Message text lives only in `inbound_messages` and `outbound_messages`, which are operator-only.

Types: `donation.created`, `ai.suggestion_attached`, `ai.suggestion_failed`, `donor.verification_submitted`, `eligibility.evaluated`, `operator.action`, `matching.completed`, `matching.unmatched`, `offer.created`, `offer.opened`, `offer.send_failed`, `offer.delivery_status`, `offer.declined`, `offer.expired`, `offer.superseded`, `claim.accepted`, `claim.rejected`, `assignment.released`, `donation.expired`, `handoff.recorded`, `donation.canceled`, `inbound.received`, `inbound.duplicate`, `inbound.ignored`, `intake.failed`, `link.issued`, `link.consumed`, `link.rejected`, `outbound.sent`, `identity.joined`, `identity.opted_out`, `tick.completed`, `demo.reset`. `link.*` events carry `link_id` only, never the token or its hash. `link.rejected` records `reason` (`invalid`, `expired`, `used`, `revoked`) without the token.

### 3.12 PolicyConfig (writer: Dev 2; one active row, seeded)

**This is a prototype operator policy, not a regulation.** Thresholds echo the WAC sections cited in RESEARCH and need qualified partner review before any real use.

| Field | Demo value |
|---|---|
| `policy_id` / `policy_version` | `annona-prototype-refrigerated` / `2026-10-17.1` |
| `allowed_handling_modes` | `["refrigerated"]` |
| `allowed_preparation_types` | `["prepared_cold", "commercially_packaged"]` |
| `require_temperature_log` | `true` |
| `min_pickup_lead_minutes` | `15` |
| `response_window_seconds` | `60` in demo mode (accelerated and labeled), `600` otherwise |
| `offer_wave_size` | `1` (sequential). Core logic must stay correct for values > 1; the race test uses 2. |
| `handoff_buffer_minutes` | `10` |
| `max_transit_minutes` | `45`. An operational constraint, not a food-safety limit. WA rule text sets no transport time limit (RESEARCH R-REG-7). |
| `average_speed_kmh` | `25`. Synthetic ETA model. |
| `max_servings` | `500` |
| `demo_accelerated` | `true` |

### 3.13 Read models for the UI (Dev 2 produces; Dev 4 renders)

**SystemModes** (`GET /api/health`):

```json
{ "vision": { "mode": "fake", "provider": "fake", "model": null, "status": "ok" },
  "messaging": { "mode": "real", "provider": "photon", "channel": "imessage", "status": "ok" },
  "store": "postgres", "demo_accelerated": true, "last_tick_at": "2026-10-17T23:41:05.000Z",
  "policy_version": "2026-10-17.1" }
```

The provider `status` is `ok` or `misconfigured` (real provider selected but a required key is missing; see §12). The captain's health handler combines the container's provider modes with Dev 2's `getSystemStatus()` (§9.3). Until that lands, health reports `last_tick_at: null` and `policy_version: "unavailable"`.

**DashboardSnapshot** (`GET /api/dashboard`, operator only): `{ generated_at, modes: SystemModes, counts_by_status: Record<DonationStatus, int>, donations: DonationCard[], identities: IdentitySummary[] }`

**DonationCard**: `{ id, status, version, donor_display_name, donor_area_label, image_url | null, ai_status, ai_suggestion | null, verified_facts | null, edited_from_ai, decision: EligibilityDecision | null, effective_cutoff_at, active_offers: OfferSummary[], offer_history: OfferSummary[], assignment: { courier_display_name, recipient_display_name } | null, handoff: { collected_at | null, delivered_at | null, simulated: true }, timeline: AuditEvent[] (latest 30), is_synthetic: true }`

**DonationCard projections** (applied by Dev 2's read models; CONTRACTS §11):

- **Operator** sees the full card. Handles appear only masked.
- **Owning donor** sees the card with:
  - `active_offers`/`offer_history` reduced to `{ status, sent_at, expires_at }`;
  - `courier_display_name` and `provider_message_id` omitted until `claimed`;
  - `timeline` limited to `donation.*`, `ai.*`, `donor.*`, `eligibility.*`, `claim.accepted`, `handoff.*` events.

**OfferSummary**: `{ id, short_code, courier_display_name, recipient_display_name, status, wave_no, sent_at, expires_at, responded_at, close_reason, provider_mode, provider_message_id, delivery_status }`

**IdentitySummary** (operator only): `{ identity_id, actor_role, actor_id, actor_display_name, provider, status, joined_at, handle_masked }`. `handle_masked` shows only the last 4 characters.

### 3.14 Ports

See §9.1.

### 3.15 Result and error envelope

`Result<T>` is either `{ ok: true, data: T }` or `{ ok: false, error: { code: ErrorCode, message: string, details?: object, retryable: boolean } }`.

HTTP status mapping:

| ErrorCode | HTTP |
|---|---|
| `VALIDATION_FAILED` | 400 |
| `NOT_AUTHORIZED` | 403 |
| `NOT_FOUND` | 404 |
| `INVALID_TRANSITION`, `CONFLICT`, `DUPLICATE_EVENT` | 409 |
| `RATE_LIMITED` | 429 |
| `AI_OUTPUT_INVALID`, `PROVIDER_UNAVAILABLE` | 502 |
| `NOT_IMPLEMENTED` | 501 |
| `INTERNAL` | 500 |

**Claim and decline outcomes are not errors.** They return 200 with a `ClaimResult` or `DeclineResult`.

### 3.16 VerificationLink (writer: Dev 2; semantics in §8.4)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Appears in audit events. Never in a URL. |
| `donation_id`, `donor_id` | uuid | The link authorizes exactly this donor for exactly this donation. |
| `token_hash` | string | Hex SHA-256 of the raw token. **The raw token is never stored** in this table, in audit events or in logs. `UNIQUE`. |
| `issued_at`, `expires_at` | UTC | `expires_at = min(issued_at + 30 min, donation.effective_cutoff_at)` when a cutoff is already stored (re-issue after `needs_review`); otherwise `issued_at + 30 min`. |
| `consumed_at`, `revoked_at` | UTC \| null | At most one live link per donation: partial `UNIQUE (donation_id) WHERE consumed_at IS NULL AND revoked_at IS NULL`. |

**VerificationLinkView** (returned to the checklist page; the page never gets a `DonationCard`): `{ donation_id, donor_display_name, status, ai_status, ai_suggestion, verified_facts | null, decision | null, link_expires_at, resubmit_token: string | null, is_synthetic: true }`. It never contains a messaging handle, the donor's `address_line`, offers, couriers, recipients, `provider_message_id`s or the audit timeline. The image comes from `POST /api/verify/image`.

---

## 4. State machine

### 4.1 Donation transitions (Dev 2 is the only writer of `donations.status`)

| # | From | To | Trigger / actor | Guard (all server-side) | Effects |
|---|---|---|---|---|---|
| S-01 | — | `draft` | core `createDraft` (called by Dev 1 `createDraftFromImage`) / donor | Actor is an `approved` or `pending` donor | `ai_status = pending`; audit |
| S-02 | `draft` | `draft` | core `attachAiResult` (called by Dev 1) / system | Parsed suggestion, or a recorded failure | `ai_suggestion` set, or `ai_status = failed` |
| S-03 | `draft`, `needs_review` | `eligible` / `needs_review` / `rejected` | `submitVerification` / owning donor, authorized by session **or** a valid verification link (§8.4) | VerifiedFacts schema-valid; actor owns the donation; `collected_at IS NULL`; for the link path the link is consumed atomically in the same transaction | Gate (§5) runs with the server `now`; decision and `effective_cutoff_at` stored; every other live link for the donation is revoked; on `needs_review` via the link path a fresh link is issued (`resubmit_token`) |
| S-04 | `eligible` | `offered` | `createNextOffers` / system | Conditional `WHERE status='eligible'`; the gate re-runs with current `now` and must return `eligible` (otherwise S-18); ≥ 1 feasible candidate | Inserts `pending_send` offers (≤ wave size) |
| S-05 | `eligible` | `unmatched` | `createNextOffers` / system | Gate still `eligible`, but no feasible candidate | `NO_ELIGIBLE_MATCH` or `CANDIDATES_EXHAUSTED` (severity `dispatch`) |
| S-06 | `offered` | `eligible` | `expireDue`, `declineOffer`, `markOfferSendFailed` / system | No `open` or `pending_send` offers remain, and `now < effective_cutoff_at` | The next tick dispatches the next wave |
| S-07 | `offered` | `claimed` | `claimOffer` / courier | §8 transaction | Sibling offers become `superseded` |
| S-08 | `eligible`, `unmatched`, `offered`, `needs_review` | `expired` | `expireDue` / system | `now >=` the effective cutoff, **resolved as in §7** (D-038: an unknown cutoff counts as reached, so it can never keep a donation alive) | Open offers become `expired` (`cutoff_reached`); `CUTOFF_REACHED` |
| S-09 | `claimed` | `collected` | `recordHandoff(collected)` / claiming courier or operator | `simulated: true`; `now < effective_cutoff_at` (the earlier of `donor_pickup_by` and `discard_by`); G-01 re-checked. Otherwise `INVALID_TRANSITION`. | `collected_at` set; audit |
| S-10 | `collected` | `delivered` | `recordHandoff(delivered)` / assigned recipient or operator | `simulated: true`; `now < discard_by` when set. Otherwise `INVALID_TRANSITION`, and the operator must cancel (S-11). | Terminal |
| S-11 | `draft`, `needs_review`, `eligible`, `unmatched`, `offered`, `claimed`, `collected` | `canceled` | Operator cancel (any listed state; `note` required for `claimed`/`collected`, and for `needs_review` when `collected_at` is set); or donor cancel of own donation before `claimed` | — | Open offers become `canceled`; an active accepted offer gets `close_reason = donation_canceled`; live verification links revoked; audited. Notifying an assigned courier is **P1**; when built, only `joined` identities are messaged. |
| S-12 | `needs_review` | `rejected` | `operatorAction(reject)` | `note` required | Terminal |
| S-13 | `needs_review` | `draft` | `operatorAction(return_to_donor)` | `collected_at IS NULL` | Donor edits and resubmits via S-03 (web session; a new link by message is P1) |
| S-14 | `unmatched` | `eligible` | `operatorAction(retry_matching)` | `now < effective_cutoff_at`, and the gate re-run now on the stored facts returns `eligible` (otherwise S-18). | For when a new courier joins or capacity frees up. Couriers already offered stay in `excluded_courier_ids`. |
| S-15 | `claimed` | `eligible` | `optOutIdentity` (assigned courier texts STOP) / system | `collected_at IS NULL` and `now < effective_cutoff_at` (at or after the cutoff, S-16 applies in the same transaction instead) | Assignment released: accepted offer gets `close_reason = courier_opted_out`; `claimed_offer_id` cleared; the courier is `opted_out` and stays excluded; reason `COURIER_OPTED_OUT` (`dispatch`); `assignment.released` audited; no message to that courier. The next tick re-runs the gate (S-04) and offers the next feasible courier, or S-05 → `unmatched`. |
| S-16 | `claimed` | `expired` | `expireDue` / system; or `optOutIdentity` at or after the cutoff | `now >= effective_cutoff_at` and not `collected` (no-show) | Accepted offer gets `close_reason = pickup_not_collected`; reason `PICKUP_NOT_COLLECTED`; audited and shown on the dashboard. A courier `offer_closed` notice is **P1** (P0 sends none). |
| S-17 | `collected` | `needs_review` | `optOutIdentity` (the collecting courier texts STOP) / system | `collected_at` set | Accepted offer gets `close_reason = courier_opted_out`; `claimed_offer_id` cleared; reason `COURIER_OPTED_OUT_AFTER_PICKUP` (`review`); **no automatic reassignment**. The operator follows up off-platform, then `cancel` (note) or `reject` (note). S-03, S-13 and S-14 are not available for it. |
| S-18 | `eligible`, `unmatched` | `needs_review` / `rejected` | `createNextOffers` or `operatorAction(retry_matching)` / system | The gate re-run with current `now` on the stored facts is not `eligible` (e.g. `PICKUP_WINDOW_TOO_SHORT`, donor suspended) | New decision stored with its reasons; no offer created |

**Forbidden by design:**

- Leaving a terminal state.
- An operator action that edits `VerifiedFacts` or turns a review/reject reason into `eligible`.
- A transition caused by client time.
- A transition caused directly by AI output.
- Reassigning a donation after a collection was recorded.
- Reaching `unmatched` (or leaving it for `eligible`) without a current gate outcome of `eligible`.

### 4.2 Offer transitions

| From | To | Trigger | Guard |
|---|---|---|---|
| — | `pending_send` | `createNextOffers` | Same transaction as S-04 |
| `pending_send` | `open` | `openOfferForSend` (Dev 3 calls it just before the provider send) | Conditional `WHERE status='pending_send'`. The courier's identity must be `joined`; otherwise the offer becomes `send_failed` with `courier_not_joined`. |
| `open` | `send_failed` | `markOfferSendFailed` (synchronous error or a `failed` delivery event) | Not retried for the same courier in P0 |
| `open` | `accepted` | `claimOffer` | §8 |
| `open` | `declined` | `declineOffer` | Actor is the offer's courier and `now < expires_at` |
| `open` | `expired` | `expireDue`, or lazily inside claim/decline | `now >= expires_at` |
| `open`, `pending_send` | `superseded` | A sibling offer is claimed | Same transaction as the claim |
| `open`, `pending_send` | `canceled` / `expired` | Donation canceled, cutoff reached, or courier sent STOP | |
| `open` | `canceled` | Claim-time re-check failed (§8.1 step 8) | `close_reason = recheck_failed` |
| `accepted` | `accepted` (unchanged) | S-15 / S-16 / S-17 / S-11 after a claim | The accepted row stays as history; `close_reason` (non-null) records why the assignment ended. Only accepted rows with `close_reason IS NULL` count as active assignments (§8.1 index). |

---

## 5. Eligibility gate (`evaluateEligibility`, Dev 2)

Input: `{ facts: VerifiedFacts, donor: DonorProfile, policy: PolicyConfig, now }`. **The signature does not accept a `VisionSuggestion`.** The function is pure: no I/O, no clock reads.

| Rule | Condition → result |
|---|---|
| G-01 | `approved` and `licensed_food_establishment` → ok. `pending` → review `DONOR_APPROVAL_PENDING`. Anything else → reject `DONOR_NOT_APPROVED`. |
| G-02 | `handling_mode` in `allowed_handling_modes` → ok. `unknown` → review `HANDLING_UNKNOWN`. Otherwise → reject `HANDLING_OUT_OF_SCOPE`. |
| G-03 | `preparation_type` in `allowed_preparation_types` → ok. `cooked_then_cooled` → review `COOLING_HISTORY_REVIEW`. `other` → review `PREPARATION_TYPE_REVIEW`. `unknown` → review `PREPARATION_UNKNOWN`. |
| G-04 | `contains_excluded_category`: `no` → ok. `yes` → reject `EXCLUDED_CATEGORY`. `unknown` → review `EXCLUDED_CATEGORY_UNKNOWN`. |
| G-05 | `continuous_cold_holding`: `yes` → ok. `unknown` → review `COLD_HOLDING_UNKNOWN`. `no` → reject `COLD_HOLDING_NOT_CONFIRMED`. |
| G-06 | If `require_temperature_log`: `temperature_log_available = yes` → ok. Otherwise → review `TEMPERATURE_LOG_MISSING`. |
| G-07 | `previously_served`: `no` → ok. `unknown` → review `PREVIOUSLY_SERVED_UNKNOWN`. `yes` → reject `PREVIOUSLY_SERVED`. |
| G-08 | `covered_food_grade_containers`: `yes` → ok. `no` → review `PACKAGING_NOT_COVERED`. `unknown` → review `PACKAGING_UNKNOWN`. |
| G-09 | `discard_by`: `null` → review `DISCARD_BY_MISSING`. `<= now` → reject `DISCARD_BY_PASSED`. Otherwise ok. |
| G-10 | `donor_pickup_by <= now` → reject `PICKUP_WINDOW_PASSED`. `< now + min_pickup_lead_minutes` → reject `PICKUP_WINDOW_TOO_SHORT`. Otherwise ok. |
| G-11 | For each of the nine allergens, `unknown` → review `ALLERGEN_UNKNOWN` (with `allergen`). |
| G-12 | `cross_contact_status = unknown` → review `CROSS_CONTACT_UNKNOWN`. |
| G-13 | `ingredients_text.trim().length < 3` → review `INGREDIENTS_MISSING`. |

The gate re-runs with the current `now` at S-04 (each dispatch round) and at S-14 (`retry_matching`); a non-`eligible` result applies S-18. The claim transaction re-checks G-01, G-09 and G-10. A verification submitted through a link (§8.4) only stores a decision; it never dispatches by itself.

---

## 6. Matching and feasibility (`findCandidates`, Dev 2, pure)

Input: `{ donation: { id, donor_location }, facts, recipients, couriers, identities, policy, now, excluded_courier_ids, busy_courier_ids, committed_servings, active_provider }`. Output: `MatchCandidate[]`, sorted. (D-037.)

- `donor_location` is `{ lat, lng }` copied by the caller from the donation's `DonorProfile.location` (§3.1). The function reads no store.
- `busy_courier_ids` (M-09): every courier that holds a `pending_send` or `open` offer on any donation, **or** a `claimed` or `collected` assignment. The partial unique index in M-09 covers only the first half, so the second half must come in through this input.
- `committed_servings` (M-04): `Record<recipient_id, number>`, the Σ defined in M-04. A missing key means 0.
- `active_provider` (M-05): the configured `MESSAGING_PROVIDER` value, `"photon"` or `"fake"`. It is **not** the gateway's `mode` (`real` / `fake`). Every entry in `identities` carries `provider`, and only identities whose `provider` equals `active_provider` count as joined. Switching the provider therefore needs a fresh `JOIN` for each persona: identities of the other provider are skipped, never reused.
- **Fail closed:** the whole call returns `[]` when a top-level input is malformed: `now` is an invalid Date; `active_provider` is not exactly `photon` or `fake`; `busy_courier_ids` or `excluded_courier_ids` is not an array of strings; `committed_servings` is not a plain object or holds a value that is not finite and >= 0; an identity has an unknown `provider`. A single recipient or courier with unusable fields is skipped. A missing recipient key in `committed_servings` means 0, but the object itself is required. The claim transaction re-checks M-04 under the recipient lock and G-01, G-09, G-10 regardless (§8.1).

| Rule | Condition |
|---|---|
| M-01 | Recipient is `approved`, `registered_dfdo = true` and `serves_highly_susceptible_population = false` (P0 restriction). |
| M-02 | `facts.handling_mode ∈ recipient.accepts_handling_modes` |
| M-03 | `recipient.excluded_allergens ∩ ({a : allergens[a] = present} ∪ cross_contact_allergens) = ∅` |
| M-04 | `recipient.capacity_servings_available − committed_servings(recipient) >= facts.servings`, where `committed_servings` = Σ `verified_facts.servings` of donations in `claimed`, `collected` or `delivered` whose active accepted offer has this `recipient_id`. Derived, never decremented; re-checked under a recipient row lock at claim (§8.1 step 8). Seed capacities must cover every demo scene. |
| M-05 | Courier is `approved` and has a `MessagingIdentity` with `status = joined` for the active messaging provider. |
| M-06 | `recipient.id ∈ courier.affiliated_recipient_ids` |
| M-07 | If `handling_mode = refrigerated`: `courier.capabilities.cold_transport = true` |
| M-08 | `courier.id ∉ excluded_courier_ids` (couriers already offered this donation) |
| M-09 | The courier holds no other `pending_send` or `open` offer (any donation) and no `claimed` or `collected` assignment. Backstop: partial unique index `offers(courier_id) WHERE status IN ('pending_send','open')`. `createNextOffers` inserts with `ON CONFLICT DO NOTHING` on that index and moves to the next candidate when a row is not inserted. |
| M-10 | Feasibility. With `est_pickup = now + response_window + eta_to_pickup` and `est_dropoff = est_pickup + transit + handoff_buffer`, all must hold: `est_pickup <= donor_pickup_by`, `est_dropoff <= min(discard_by, recipient.receiving_closes_at, courier.available_until)`, and `transit <= max_transit_minutes`. |

M-10 is an operational invariant, not proof of safety. It restates PROJECT_IDEA §5: `estimated_pickup + travel + handoff + buffer <= applicable_verified_cutoff`.

---

## 7. Timers and deadlines

| Name | Field | Set by | Meaning | Enforced in |
|---|---|---|---|---|
| Donor pickup cutoff | `verified_facts.donor_pickup_by` | Donor | Latest handover time. **Not a safety time.** | G-10, M-10, via effective cutoff |
| Kitchen discard-by | `verified_facts.discard_by` | Donor (own date-marking procedure) | Never computed or extended by Annona | G-09, M-10, S-10, via effective cutoff |
| Effective cutoff | `donations.effective_cutoff_at` | Core | `min(donor_pickup_by, discard_by)` (a null `discard_by` is ignored). **Resolution (D-038):** use `effective_cutoff_at`; if it is null, compute the same `min` from the stored facts; if that is also unknown, the cutoff is **reached**. Reached means S-08 and S-16 fire, S-06, S-09, S-14 and S-15 refuse, and claim step 6 returns `offer_expired`. The pure guards take optional `donor_pickup_by` and `discard_by` in `TransitionContext`; `undefined` or unparseable counts as unknown. | S-06, S-08, S-09, S-14, S-15, S-16 + lazy checks in claim/decline |
| Verification link expiry | `verification_links.expires_at` | Core | `min(issued_at + 30 min, effective_cutoff_at)` | Checked inside the S-03 link-consumption transaction (§8.4) |
| Offer response deadline | `offers.expires_at` | Core, when the offer opens | Courier must answer before this time | Lazy check in claim/decline + sweeper |
| Recipient receiving close | `recipients.receiving_closes_at` | Seed / operator | | M-10 |

- **Correctness never depends on a timer firing.** `claimOffer` and `declineOffer` compare `now` against `expires_at` and `effective_cutoff_at` inside the transaction (lazy expiry). A late reply loses even if no sweeper ever ran.
- **Liveness depends on `tick`.** Dev 3's `tick()` (time from the injected `Clock`) calls `expireDue`, then `createNextOffers` for every `eligible` donation, then sends every `pending_send` offer. `tick` is idempotent and safe to run concurrently because every step is a conditional update. Tick drivers are described in ARCHITECTURE §6.
- Opening order: `openOfferForSend` sets `open` and `expires_at` and commits **before** the provider send. A crash after opening but before sending only lets that offer expire; the next candidate follows.
- Provider delivery events never start, extend or stop a deadline. A `failed` delivery event closes the offer early via `markOfferSendFailed`.
- An acceptance never resets or extends any food-related time.

---

## 8. Claim, idempotency and concurrency

### 8.1 `claimOffer` transaction (Postgres `READ COMMITTED`; PGlite serializes, with the same logic)

1. Resolve `offer_ref`. A `short_code` resolves to exactly one offer **of any status**, because codes are never reused before `resetDemo`. If nothing is found → `offer_not_found`. If the actor is not this offer's courier → `not_authorized`. Neither response leaks details.
2. `BEGIN`, then `SELECT … FROM donations WHERE id=$d FOR UPDATE`. This serializes every claim, decline and expiry for the donation.
3. If the offer is `accepted` and `donation.claimed_offer_id = offer.id` → `already_claimed_by_you`. Idempotent, no writes.
4. If the donation is `claimed`, `collected` or `delivered` with a different `claimed_offer_id` → `already_claimed`.
5. If the donation status is not `offered` → `donation_unavailable`.
6. If `now >= offer.expires_at` or `now >= donation.effective_cutoff_at` → mark the offer `expired` and return `offer_expired`. The effective cutoff is resolved as in §7: an unknown cutoff counts as reached (in SQL, `now >= NULL` is NULL, so the check must use the resolved value, not the raw column).
7. If `offer.status != open` → `offer_closed`.
8. Lock the offer's recipient row (`SELECT … FROM recipients WHERE id=$r FOR UPDATE`; always taken after the donation lock, so the lock order is fixed). Re-check, using current rows:
   - G-01, G-09, G-10, and the recipient's and courier's approval;
   - M-04 capacity, with `committed_servings` read under the recipient lock;
   - M-10 feasibility for this offer's recipient/courier pair only, with `est_pickup = now + eta_to_pickup` (the response window is spent), against the current `receiving_closes_at` and `available_until`.

   On failure: set the offer to `canceled` (`close_reason = recheck_failed`), apply S-06 if no open offers remain, and return `ineligible`.
9. `UPDATE offers SET status='accepted', responded_at=$now WHERE id=$o AND status='open'` (must affect 1 row). `UPDATE donations SET status='claimed', claimed_offer_id=$o, version=version+1 WHERE id=$d AND status='offered'` (must affect 1 row). Supersede sibling offers. Write the audit event, `COMMIT`, and return `claimed`.

A partial unique index on `offers(donation_id) WHERE status='accepted' AND close_reason IS NULL` is a backstop: at most one **active** assignment per donation. Ended assignments (S-11, S-15, S-16, S-17) keep their accepted rows as history without blocking a later claim (e.g. by the next courier after S-15). A unique violation maps to `already_claimed`.

**Guarantee (to be tested):** if N concurrent `claimOffer` calls hit open offers of one donation, exactly one returns `claimed`. The others get `already_claimed` or `offer_expired`. Replays by the winner return `already_claimed_by_you`, and no second active assignment can exist. A courier holds at most one live offer (M-09 index), so one courier cannot claim two donations at once.

**Verification rule (D-033).** This guarantee counts as verified **only** when T-CO-17 passes on real PostgreSQL: independent connections (one postgres.js client each, not one pooled client) racing one donation, through the same connection mode as the deployed demo (Supabase transaction pooler, port 6543, `prepare: false`), on a disposable database. PGlite (T-CO-16) serializes and proves the logic, not concurrency. Until T-CO-17 passes, first-claim-wins is **UNVERIFIED** and must not be described as race-safe or concurrency-tested in the pitch, README, video or Devpost.

### 8.2 Inbound idempotency

- `recordInboundMessage(provider, provider_message_id, payload)` runs `INSERT … ON CONFLICT (provider, provider_message_id) DO NOTHING` (setting `processing_started_at = now`) and returns `first` or `duplicate`. Delivery status events dedupe the same way on `(provider, provider_event_id)`.
- **Incomplete rows are reclaimed.** If the row exists with `result IS NULL` and `processing_started_at < now − 30 s` (`INBOUND_REPROCESS_AFTER_SECONDS`, a constant in `@/contracts`), `recordInboundMessage` claims it with a conditional `UPDATE … SET processing_started_at = now WHERE id=$i AND result IS NULL AND processing_started_at < $threshold` and returns `first` when 1 row changed. A fresh in-flight row (< 30 s) still returns `duplicate`.
- On `first`, the message is processed, the reply is sent (§8.3), and then `saveInboundResult(...)` runs (conditional on `result IS NULL`). On `duplicate`, the stored result (or `null` while in flight) comes back with `outcome: "duplicate"`, and no reply is sent.
- Reprocessing is safe because every effect is idempotent: claim replays give `already_claimed_by_you` (§8.1 step 3); decline replays give `already_declined`; JOIN and STOP are idempotent; the reply reuses `reply:<provider_message_id>:v1`, so it is sent at most once. A crash at any point therefore delays a courier's reply by at most 30 s plus the provider's redelivery or the next poll; it never loses it.

### 8.3 Outbound idempotency

- Each `pending_send → open` transition produces at most one send (conditional update), with Photon `Idempotency-Key: offer:<offer_id>:v1`.
- Replies are sent only on `first` processing (including a reclaimed incomplete row, §8.2), with key `reply:<provider_message_id>:v1`, **before** `saveInboundResult`. If `outbound_messages` already holds that key, the reply was already sent: do not send again.
- There is no automatic resend to the same courier in P0. A failure becomes `send_failed`, and the next candidate is tried.
- Only `joined` identities receive messages, except `stop_ack` (§3.10).
- The **workflow layer** (Dev 3) calls `recordOutboundMessage` exactly once per send attempt in both modes, so `outbound_messages` is unique on `idempotency_key`. The fake gateway persists nothing itself. The simulated phone reads the thread through `listMessages`.
- The reply to an inbound photo is the `draft_ready` message, keyed `draft_ready:<link_id>:v1` (not `reply:…`), because a reprocessed photo may need a new link (§8.4 step 9).

### 8.4 Verification links (messaging-first intake; D-031)

1. **Issue.** Core `issueVerificationLink({ donation_id })` (Dev 2). Guard: donation in `draft` or `needs_review`, `collected_at IS NULL`, and the donor has a `joined` identity. The token is 32 bytes from the Node CSPRNG (`crypto.randomBytes(32)`), encoded base64url (43 characters). Only `token_hash` is stored (§3.16). Any previous live link for the donation is revoked in the same transaction. Returns `{ link_id, token, expires_at }`; the raw token exists only in that return value, the outbound text and the donor's phone. Audit `link.issued` (link ID only).
2. **URL.** `<APP_BASE_URL>/v#<token>`. The token sits in the URL **fragment**, which browsers never send to a server, so it stays out of request logs, `Referer` headers and link-preview fetches. The `/v` page reads the fragment and sends the token only in `POST` bodies. The page responds with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, and loads no third-party scripts.
3. **Open (never consumes).** `POST /api/verify/view { token }`: hash, look up, check `consumed_at IS NULL`, `revoked_at IS NULL`, `now < expires_at`, donation in `draft`/`needs_review` with `collected_at IS NULL`. Returns `VerificationLinkView`. Opening the page any number of times does not consume the link. `POST /api/verify/image { token }` returns the image bytes under the same checks.
4. **Submit (consumes only on success).** `POST /api/verify/submit { token, facts }`. Dev 1 parses `facts` first; a schema-invalid body returns `VALIDATION_FAILED` and the link stays live. Core `submitVerification({ auth: { link_token }, … })` then runs **one transaction**: `UPDATE verification_links SET consumed_at = $now WHERE token_hash = $h AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > $now RETURNING donation_id, donor_id` must affect exactly one row (otherwise `NOT_AUTHORIZED`, nothing written); lock the donation row; apply S-03 with the server `now`. Any later failure rolls the consumption back. Two concurrent submits of one token: exactly one consumes it; the other gets `NOT_AUTHORIZED`.
5. **Eligibility is rechecked before dispatch.** The submission stores the gate decision only. Dispatch still requires S-04, which re-runs the gate with the current time, so an old checklist can never dispatch by itself.
6. **Uniform errors.** An invalid, expired, used or revoked token always returns `NOT_AUTHORIZED` (403) with "This link has expired or was already used. Text the photo again for a new link." The specific reason goes only to the audit event `link.rejected`.
7. **Resubmission.** When a link submission's S-03 outcome is `needs_review`, the same transaction issues a fresh link and returns it as `resubmit_token`, so the donor fixes the listed items on the same page. On `eligible` or `rejected`, `resubmit_token` is `null`.
8. **Revocation.** S-03 (either path) revokes other live links. S-08 and S-11 revoke. A donor's STOP revokes that donor's live links. `resetDemo` deletes all links.
9. **Reprocessing and storage.** The `draft_ready` text (which contains the token) is stored in `outbound_messages` as sent, because retries must be byte-identical (§3.10). `listMessages` masks the token to its last 4 characters unless `MESSAGING_PROVIDER=fake`, where the simulated phone stands in for the donor's phone and needs the working link. If a reprocessed inbound photo (§8.2) finds its existing draft by `source_ref`: when a `draft_ready` for that donation is already recorded and its link is still live, nothing is issued or sent; otherwise a new link is issued (revoking the old one) and sent under its own key. The rare cost: a donor may receive two messages, and the first link then reports "expired or already used".
10. **Time budget.** Attachment download (≤ 3 attempts within 6 s), image checks and vision (15 s timeout) keep photo handling under `INBOUND_REPROCESS_AFTER_SECONDS` (30 s), so a slow photo is not reclaimed while still in flight.

---

## 9. Ports and lane-public functions

`Actor = { role: ActorRole, id: string | null }`. `Clock = { now(): Date }`. Everything not listed here is lane-private.

### 9.0 Composition root, module paths, dependency injection

| Export | Module (owner) | Contract |
|---|---|---|
| `getServices()` | `@/server/container` (captain) | `→ { vision: VisionProvider, messaging: MessagingGateway, store: DispatchStore, clock: Clock }`. A memoized process singleton (stored on `globalThis` so Next dev reuses it). |
| `getEnv()` | `@/server/env` (captain) | Zod-parsed env (§12). Lanes never read `process.env` directly. |
| `getActor(request)` | `@/server/session` (captain) | `→ Promise<Actor \| null>`. Verifies the signed session cookie. **Ships working in the baseline.** |
| `DEMO_ACTORS` | `@/contracts/fixtures/demo-actors` (captain) | `{ key, actor_id, role, display_name }[]`: fixed UUIDs for every demo persona. No handles. Used by the session picker and Dev 2's seed. |
| Intake UI components | `@/features/intake/components` (Dev 1; client-safe barrel) | Exports `PhotoUpload`, `DraftReview`, `VerificationForm`, `LinkVerification`. `LinkVerification` is the `/v` checklist: it reads the token from the URL fragment and renders the **same** `VerificationForm` used by the web fallback. Dev 4 pages import UI only from here, never from the server-side `@/features/intake` barrel. Created at baseline as stubs. |

**Lane barrels.** Every lane-public function and factory is exported from its lane's barrel:

- `@/lib/ai` (`src/lib/ai/index.ts`)
- `@/features/intake`
- `@/core`
- `@/db`
- `@/integrations/photon`
- `@/workflows`

The captain creates each barrel at baseline with typed stubs that return `NOT_IMPLEMENTED`. Lanes may move implementation files but keep the barrel exports stable. Import other lanes **only** through their barrel.

**Factories take config objects.** The container reads env once and passes it in. The config `mode` is the env selector (`VISION_PROVIDER`: `fake` \| `gemini`; `MESSAGING_PROVIDER`: `fake` \| `photon`); the returned provider exposes `mode: ProviderMode` (`real` \| `fake`):

- `createVisionProvider({ mode, api_key, model })`
- `createDispatchStore({ kind, database_url, pglite_dir })`
- `createMessagingGateway({ mode, project_id, api_key })`

**Dependency injection for tests.** Core and workflow functions take an optional last argument `deps?: { store?, clock?, messaging?, vision? }`. When it is omitted, they use `getServices()`. Tests pass `deps` explicitly. No lane imports another lane's internals or mocks it by monkey-patching.

### 9.1 Provider ports (`src/contracts/ports`)

| Port | Methods | Real implementation (lane) | Fake implementation (lane) |
|---|---|---|---|
| `VisionProvider` | `analyzeFoodImage({ image: { mime, bytes_base64 }, donor_hint? }) → Promise<Result<VisionSuggestion>>`; plus `mode` (`ProviderMode`), `model` and `status` (`ok` \| `misconfigured`) properties | Gemini via `@google/genai` (Dev 1) | Deterministic fixture-keyed fake (Dev 1) |
| `MessagingGateway` | `send(OutboundMessage) → Promise<SendResult>`; plus `mode` (`ProviderMode`), `channel` (`imessage` for Photon, `simulated` for fake) and `status` (`ok` \| `misconfigured`) properties | Photon 2.0 Beta HTTP API (Dev 3) | Returns a synthetic `provider_message_id` and persists nothing. The workflow layer records every send (§8.3), and the simulated phone reads it (Dev 3). |
| `DispatchStore` | An **opaque handle** `{ kind: StoreKind }`. Its internals (Drizzle client, repositories) are private to Dev 2. The public surface is the §9.3 functions, which receive the handle via `deps`/`getServices()`. | **One Drizzle implementation** (Dev 2) with two drivers: `postgres` (postgres.js → Supabase) and `pglite` (in-process, for tests and local dev) | — |
| `Clock` | `now()` | System clock | `createTestClock(start)` (Dev 2), fixed and advanceable |

### 9.2 Dev 1 — `src/features/intake`, `src/lib/ai`

- `createDraftFromImage({ actor, image: { mime, bytes_base64 }, source, source_ref? }) → Promise<Result<DonationCard>>`. One implementation for both donor paths. Accepts JPEG/PNG/WebP up to **1.5 MB** of decoded bytes for `web_upload`/`fixture` (after client-side downscale) and up to **5 MB** for `messaging` (no server-side resize in P0). `image/heic` / `image/heif` are accepted **only** for `messaging`, and only if the kickoff spike SP-14 shows the real Gemini model accepts them (a `HEIC_ACCEPTED` constant in Dev 1's intake code, default `false`, flipped only by a reviewed PR citing the SP-14 result); otherwise they return `VALIDATION_FAILED` and Dev 3 replies `intake_failed`. No HEIC conversion library is added in P0. For `{ fixture_id }` requests (web) and simulated-phone photos, the fixture is `fixtures/intake/images/<fixture_id>.jpg`, which the captain includes in the deployment's file tracing. The fake vision provider recognizes fixtures by SHA-256 of their bytes. Validates the image, then calls core `storeDonationImage` and `createDraft` (S-01; idempotent on `source_ref`). Runs vision with a 15 s timeout and calls core `attachAiResult` (S-02). Returns even when AI fails.
- `parseVerifiedFacts(raw: unknown) → Result<VerifiedFacts>`.
- `submitDonorVerification({ actor, donation_id, raw }) → Promise<Result<DonationCard>>` (web session path). Parses, computes `edited_from_ai`, then calls core `submitVerification({ auth: { actor }, … })`.
- `getLinkVerification({ token }) → Promise<Result<VerificationLinkView>>` and `submitDonorVerificationByLink({ token, raw }) → Promise<Result<VerificationLinkView>>` (link path, §8.4). Same parsing and `edited_from_ai` code as the web path; calls core `getVerificationLinkView` / `submitVerification({ auth: { link_token }, … })`.
- `createVisionProvider({ mode, api_key, model }) → VisionProvider`. If `mode = gemini` and `api_key` is missing, the provider reports `status: misconfigured` and every call returns `PROVIDER_UNAVAILABLE` (§12).
- Dev 1 does **not** trigger dispatch. The tick picks up `eligible` donations (D-021).

### 9.3 Dev 2 — `src/core`, `src/db`

- `evaluateEligibility(input) → EligibilityDecision` (pure).
- `findCandidates(input) → MatchCandidate[]` (pure).
- `storeDonationImage({ mime, bytes }) → Promise<Result<{ image_id }>>`.
- `createDraft({ actor, image_id, source, source_ref }) → Promise<Result<DonationCard>>` (S-01; checks donor role/approval; returns the existing draft when `(source, source_ref)` already exists).
- `attachAiResult({ donation_id, result: { ok: true, suggestion } | { ok: false, error_code } }) → Promise<Result<DonationCard>>` (S-02). Dev 1 calls these. Dev 1 never writes donation rows directly.
- `submitVerification({ auth: { actor } | { link_token }, donation_id, facts, edited_from_ai }) → Promise<Result<{ card: DonationCard, resubmit_token: string | null }>>` (S-03; the link path consumes the link in the same transaction, §8.4).
- `issueVerificationLink({ donation_id }) → Promise<Result<{ link_id, token, expires_at }>>`, `getVerificationLinkView({ token }) → Promise<Result<VerificationLinkView>>`, `getVerificationLinkImage({ token }) → Promise<Result<{ mime, bytes }>>` (§8.4; read-only checks never consume).
- `createNextOffers({ donation_id }) → Promise<Result<Offer[]>>` (S-04 or S-05).
- `openOfferForSend({ offer_id }) → Promise<Result<{ offer, identity, message_view: OfferMessageView }>>`, `markOfferSendFailed({ offer_id, reason })`, `recordOfferProviderMessage({ offer_id, provider_message_id })`.
- `recordStatusEvent(evt: DeliveryStatusEvent) → Promise<"first" | "duplicate">`. A dedupe insert on `(provider, provider_event_id)`. On `first`, Dev 3's `handleDeliveryStatus` calls `recordDeliveryStatus(evt)`, which only updates the matching offer's `delivery_status`. Then, if `evt.status = failed` and the offer is still `open`, `handleDeliveryStatus` (not `recordDeliveryStatus`) calls `markOfferSendFailed` exactly once.
- `claimOffer(ClaimCommand) → Promise<ClaimResult>`, `declineOffer(DeclineCommand) → Promise<DeclineResult>`.
- `expireDue() → Promise<{ expired_offer_ids, expired_donation_ids, dispatchable_donation_ids }>`, `listPendingSendOffers()`, `listDispatchableDonations()`.
- `resolveIdentityByHandle(provider, handle) → Promise<MessagingIdentity | null>`, `getIdentity(identity_id)`, `joinIdentity({ identity_id, provider_space_id, provider_sender_id })`, `optOutIdentity({ identity_id })` (one transaction: cancels open offers; applies S-15, S-16 or S-17 to a held assignment; revokes a donor's live links), `findOpenOffersForCourier(courier_id)`.
- `recordInboundMessage(...)`, `recordStatusEvent(...)`, `saveInboundResult(...)`, `recordOutboundMessage(...)`, `listMessages({ identity_id? })` (masks verification tokens unless `MESSAGING_PROVIDER=fake`, §8.4), `recordIgnoredInbound({ provider, provider_message_id, reason: InboundIgnoreReason, handle_masked })` (§11 logging rule).
- `recordHandoff({ actor, donation_id, step, simulated: true })`, `operatorAction({ actor, donation_id, action, note })`.
- `getDonationCard(actor, id)` (role-projected, §3.13), `getDashboardSnapshot(actor)`, `setLastTick(at)`, `getSystemStatus() → Promise<{ last_tick_at: string | null, store: StoreKind, policy_version: string }>`, `resetDemo({ keep_identities: true })`. `resetDemo` deletes all offers, so short codes become free again.
- `createDispatchStore({ kind, database_url, pglite_dir }) → DispatchStore`, `createTestClock(start)`.

Core functions get time from the injected `Clock`. None of them accepts a client timestamp.

### 9.4 Dev 3 — `src/integrations/photon`, `src/workflows`

- `createMessagingGateway({ mode, project_id, api_key }) → MessagingGateway`. If `mode = photon` and a key is missing, the gateway reports `status: misconfigured` and `send` returns `PROVIDER_UNAVAILABLE` (§12).
- `normalizePhotonEvent(raw: unknown) → Result<InboundMessage | DeliveryStatusEvent | { ignored: true }>`.
- `handleInbound(msg: InboundMessage) → Promise<InboundResult>`. This is the **same path** for real Photon messages and simulated-phone messages, including donor photos (§3.10 `photo`, §8.4).
- `formatDraftReadyMessage(view: DraftReadyView) → string` and the `intake_failed` template. Deterministic, like `formatOfferMessage`.
- `handleDeliveryStatus(evt: DeliveryStatusEvent) → Promise<void>`.
- `tick() → Promise<TickReport>`, with `TickReport = { at, expired_offers, expired_donations, offers_created, offers_sent, send_failures }`.
- `dispatchDonation(donation_id) → Promise<TickReport>`. Used only by the operator's "Dispatch now" button. There is no post-verification hook in P0: the next tick (≤ `TICK_INTERVAL_MS`) dispatches newly `eligible` donations (D-021).
- `formatOfferMessage(view: OfferMessageView) → string`. Deterministic: identical input gives byte-identical output. It never includes a street address, pickup instructions or handles (§11). It includes the §3.10 allergen wording, the deadline in `America/Los_Angeles`, the `YES <code>` / `NO <code>` instructions, STOP, and the "automated assistant" plus DEMO disclosure.

---

## 10. HTTP routes (Next.js App Router)

Each `src/app/api/**/route.ts` file is a **thin re-export** that the captain creates at baseline, e.g. `export { POST } from "@/features/intake/http/drafts"`. The lane named below owns the handler module. Changing a path or shape is a contract change.

| Method + path | Handler module (owner) | Auth | Request | Response `data` |
|---|---|---|---|---|
| `GET /api/health` | `src/server/health` (captain) | public | — | `SystemModes` |
| `GET /api/session/actors` | `src/server/session` (captain) | public, demo mode only | — | `{ actors: { role, actor_id, display_name }[] }` from `DEMO_ACTORS` |
| `POST /api/session`, `DELETE /api/session` | `src/server/session` (captain; **working at baseline**) | demo passcode | `{ actor_id, passcode }` (`actor_id` must be in `DEMO_ACTORS`) | `{ actor }` |
| `POST /api/intake/drafts` | `src/features/intake/http/drafts` (Dev 1) | donor | `{ image: { mime, bytes_base64 } }` or `{ fixture_id }` | `DonationCard` |
| `POST /api/donations/:id/verification` | `src/features/intake/http/verification` (Dev 1) | owning donor | raw `VerifiedFacts` | `DonationCard` |
| `POST /api/verify/view` | `src/features/intake/http/verify` (Dev 1) | valid verification link token (§8.4); never consumes | `{ token }` | `VerificationLinkView` |
| `POST /api/verify/image` | `src/features/intake/http/verify` (Dev 1) | valid verification link token; never consumes | `{ token }` | image bytes |
| `POST /api/verify/submit` | `src/features/intake/http/verify` (Dev 1) | valid verification link token; consumed atomically on success | `{ token, facts }` (raw `VerifiedFacts`) | `VerificationLinkView` (with `resubmit_token` on `needs_review`) |
| `GET /api/donations/:id` | `src/core/http/donation` (Dev 2) | owning donor, operator | — | `DonationCard` (role-filtered) |
| `GET /api/dashboard` | `src/core/http/dashboard` (Dev 2) | operator | — | `DashboardSnapshot` |
| `POST /api/donations/:id/operator-actions` | `src/core/http/operator` (Dev 2) | operator | `{ action, note }` | `DonationCard` |
| `POST /api/donations/:id/handoff` | `src/core/http/handoff` (Dev 2) | claiming courier (`collected`), assigned recipient (`delivered`), operator | `{ step }` | `DonationCard` |
| `GET /api/images/:id` | `src/core/http/images` (Dev 2) | owning donor, operator | — | image bytes |
| `POST /api/demo/reset` | `src/core/http/demo` (Dev 2) | operator, demo mode only | — | `{ reset_at }` |
| `POST /api/donations/:id/dispatch` | `src/workflows/http/dispatch` (Dev 3) | operator | — | `TickReport` |
| `POST /api/internal/tick` | `src/workflows/http/tick` (Dev 3) | header `x-annona-internal-secret`, or an operator session ("Run tick now" demo control) | — | `TickReport` |
| `POST /api/messaging/photon/inbound` | `src/integrations/photon/http/inbound` (Dev 3) | A valid Photon webhook signature (Standard-Webhooks-compatible; verified at the spike), **or** `x-annona-internal-secret` from the relay worker | Photon event envelope | `{ received: true }` |
| `POST /api/messaging/simulated/inbound` | `src/integrations/photon/http/simulated` (Dev 3) | operator, demo mode **and** `MESSAGING_PROVIDER=fake` only (otherwise 403) | `{ identity_id, text, fixture_id? }` (server resolves the fake identity's handle; synthetic `provider_message_id`; `fixture_id` simulates a donor photo from `fixtures/intake/images/`) | `InboundResult` |
| `GET /api/messaging/simulated/thread?identity_id=` | `src/integrations/photon/http/simulated` (Dev 3) | operator, demo mode and `MESSAGING_PROVIDER=fake` only (otherwise 403) | — | `{ messages: ThreadMessage[] }` (§3.10) |

---

## 11. Authorization and disclosure

Demo authentication uses a signed, httpOnly session cookie `{ role, actor_id }`. The cookie is issued after the user picks a synthetic profile and enters `DEMO_PASSCODE`. Messaging actors are resolved from `sender_handle` to a `MessagingIdentity` to a profile. A handle with no seeded identity gets outcome `ignored` and `reply: null`, and is never auto-registered (§3.10). A seeded identity that is not `joined` (`awaiting_join` or `opted_out`) sending anything except JOIN gets outcome `rejected` and `reply: null`.

**Verification-link authorization.** A valid link (§8.4) authorizes only: view that one donation's `VerificationLinkView` and image, and submit its verification once. It never sets a session cookie and grants nothing else.

**Logging rule for ignored or rejected inbound messages** (unknown sender, or a non-`joined` identity). The `inbound_messages` row keeps `provider`, `provider_message_id`, `received_at` and `result`, with `sender_handle = null`, `handle_masked` (last 4 characters), `payload = null` (no text, no attachment IDs) and `ignore_reason` (`InboundIgnoreReason`). No attachment is downloaded and no AI call is made. Audit `inbound.ignored` carries the same fields. No reply is sent (B-06).

| Data / action | Donor (own) | Courier (offered) | Courier (claimed) | Recipient (assigned) | Operator |
|---|---|---|---|---|---|
| Create draft, submit verification (session, or by photo message + link) | ✓ | – | – | – | – |
| View donation card | own | – | – | – | all |
| Dish, servings, allergen declarations, handling mode | ✓ | ✓ (offer text) | ✓ | ✓ | ✓ |
| Donor `area_label` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Donor `address_line`, `pickup_instructions` | ✓ | **✗** | ✓ | – | ✓ |
| Recipient display name | after claim | ✓ | ✓ | ✓ | ✓ |
| Recipient `address_line` | – | ✗ | ✓ | ✓ | ✓ |
| Courier name | after claim | self | self | ✓ | ✓ |
| Messaging handles | ✗ | ✗ | ✗ | ✗ | masked |
| Claim / decline | – | own offer only | – | – | ✗ (operators never claim for a real courier; see the exception below) |
| Record handoff (simulated) | – | – | collected | delivered | ✓ |
| Operator actions, dispatch now, tick, dashboard, demo reset, simulated phone | – | – | – | – | ✓ |

**Simulated-phone exception.** In demo mode with `MESSAGING_PROVIDER=fake`, the operator may act *as a fake-provider courier* through the labeled simulated phone. Such claims carry `source: "simulated_messaging"`, are labeled SIMULATED everywhere, and are impossible when `MESSAGING_PROVIDER=photon` (the route returns 403).

---

## 12. Configuration, modes and secrets

| Env var | Values | Switch owner | Notes |
|---|---|---|---|
| `ANNONA_DEMO_MODE` | `1` / unset | captain | Enables demo routes, the accelerated policy and the simulated phone |
| `STORE` | `pglite` \| `postgres` | Dev 2 | `pglite` for tests and zero-setup local dev; `postgres` for the integrated demo |
| `PGLITE_DIR` | path (default `.data/pglite`) | Dev 2 | Gitignored |
| `DATABASE_URL` | Postgres URL | Dev 2 | Server-only. On Vercel, the Supabase transaction pooler (port 6543, `prepare: false`) |
| `VISION_PROVIDER` | `fake` \| `gemini` | Dev 1 | |
| `GEMINI_API_KEY` | secret | Dev 1 | Server-only. Passed explicitly to the SDK. Do not also set `GOOGLE_API_KEY`. |
| `GEMINI_MODEL` | stable model ID | Dev 1 | Default `gemini-3.5-flash-lite` (RESEARCH R-AI-1); verified at kickoff |
| `MESSAGING_PROVIDER` | `fake` \| `photon` | Dev 3 | |
| `PHOTON_PROJECT_ID`, `PHOTON_API_KEY` | `pho_prj_…`, `pho_sk_…` | Dev 3 | Photon **Beta** project (app.beta.photon.codes). Server-only. |
| `PHOTON_WEBHOOK_SECRET` | secret | Dev 3 | Returned once at destination creation |
| `PHOTON_INBOUND_MODE` | `webhook` \| `socket` \| `poll` | Dev 3 | Read by the worker |
| `TICK_INTERVAL_MS` | integer ms (default `5000`) | Dev 3 | Worker tick loop |
| `TEST_DATABASE_URL` | Postgres URL | Dev 2 | **Disposable** Postgres for gated tests only (T-CO-17, T-CO-23, T-MS-12). Never the shared demo DB. |
| `DEMO_COURIER_A_HANDLE`, `DEMO_COURIER_B_HANDLE` | E.164 / Apple-ID email | Dev 2 (seed) | Opted-in teammates' real iMessage handles, read by the seed. **Personal data: never committed.** `.env.example` leaves them **empty**. When unset, the seed uses synthetic handles such as `courier-a@example.invalid`, usable only with fake messaging. No phone-number literal appears in source, tests or docs. |
| `DEMO_DONOR_HANDLE` | E.164 / Apple-ID email | Dev 2 (seed) | The opted-in teammate handle that plays the approved donor "Rainier Catering (synthetic)". Same rules as the courier handles: personal data, never committed, empty in `.env.example`; when unset the seed uses `donor@example.invalid` (fake messaging only). It must differ from both courier handles (`UNIQUE (provider, handle)`). |
| `ANNONA_INTERNAL_SECRET` | secret | Dev 3 | Tick and relay-worker authentication |
| `APP_BASE_URL` | URL | captain | Used by the worker and as the base of verification links (`<APP_BASE_URL>/v#<token>`). Must be the URL the donor's phone can open (deployed URL or tunnel). |
| `SESSION_SECRET`, `DEMO_PASSCODE` | secrets | captain | |

**Never set `ANTHROPIC_API_KEY`** in Annona env files or shells. It would switch teammates' Claude Code from subscription to API billing (RESEARCH R-TOOL-5). Annona needs no Anthropic key.

Rules:

- `fake` is selected **only** when the provider variable (`VISION_PROVIDER`, `MESSAGING_PROVIDER`) is unset or `fake`, and that is visible: `GET /api/health` and a persistent UI banner show every fake provider.
- If a provider variable selects a real provider but a required key is missing, the provider reports `mode: "real", status: "misconfigured"`. Health and the banner show it, and every call returns `PROVIDER_UNAVAILABLE`. It is **never** silently replaced by fake.
- A failing `real` provider returns `PROVIDER_UNAVAILABLE`. It never silently falls back to fake. Switching to fake requires an explicit env change and a restart.
- Fake outputs carry `mode: "fake"` all the way into audit events and the UI.
- No secret is read in a client component or prefixed with `NEXT_PUBLIC_`.
- `.env.local` is gitignored. `.env.example` lists names only.

---

## 13. Integration contract for Dev 4 (UI and captain)

1. Build every screen against `DonationCard`, `DashboardSnapshot`, `SystemModes`, `IdentitySummary`, `ClaimResult` and `InboundResult`. Use the typed fixtures in `src/contracts/fixtures`: the baseline ships the three demo scenes and three cards (`needs_review`, `eligible`, `claimed`); `chore/integration-contracts-2` (by 2:30 PM) completes one card per `DonationStatus`.
2. Poll `GET /api/dashboard` every 2 s. Never compute status, eligibility, deadlines or allergen conclusions client-side. Countdowns are cosmetic, derived from `expires_at` and `effective_cutoff_at`.
3. Always show:
   - AI suggestion and donor-verified values side by side, with `FieldState` badges.
   - All nine allergens with their donor status.
   - Plain-language reasons on `needs_review` and `rejected` cards.
   - `unmatched` in its own neutral "Unmatched — needs couriers" group, never styled as a safety warning, with `retry_matching` and `cancel` as its only actions. `dispatch`-severity reasons (e.g. `COURIER_OPTED_OUT` on a re-offered donation) use the same neutral style.
   - A provider-mode banner.
   - The "Synthetic data", "DEMO: accelerated timers" and "Simulated" labels (handoff and simulated phone).
   - Each courier's JOIN status.
4. Never render a "safe" label, a green "allergen-free" badge, or a "dispatch anyway" control.
5. Show a late or duplicate claim by its `ClaimResult.code` (e.g. "Expired — no assignment made"), never as a success toast.
6. Donor intake components belong to Dev 1 (`src/features/intake/components`). Dev 4 mounts them in pages and provides design-system primitives in `src/components/ui`.
7. The `/v` page (Dev 4 owns the page file) only mounts Dev 1's `LinkVerification`, sets `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, and loads no analytics or third-party scripts.

---

## 14. Handoff format (all lanes)

```text
LANE / BRANCH / COMMIT:
DELIVERED:
EVIDENCE (commands, passed/failed, real vs mock):
CONTRACT CHANGES OR REQUESTS:
BLOCKERS + SAFETY RISKS:
INTEGRATION STEPS:
NEXT SMALLEST ACTION:
```

---

## 15. Change log

| Version | Date | Change | Approved by |
|---|---|---|---|
| v0.1 | 2026-10-15 | Initial proposed spec from the master bootstrap, revised after Phase A research: Photon JOIN opt-in, preparation type, excluded categories, DFDO flags, PGlite/Postgres store | Pending team review at kickoff |
| v0.2 | 2026-10-15 | Cross-document review fixes. Short codes never reused before reset. `allergens.<name>` field paths. `edited_from_ai` rules. Adapter-stamped vision provenance (`VisionModelOutput`). Server-stamped `attested_at`. S-09/S-10 time guards. S-15 courier STOP while claimed. S-16 no-show expiry. Joined-only outbound. Unknown handles ignored. JOIN re-opt-in. `OfferMessageView`. Donor card projection + audit `data` rule. Composition root, barrels, config factories, `deps` injection. `DEMO_ACTORS` + working session at baseline. `getSystemStatus`. Misconfigured providers. Env vars `TICK_INTERVAL_MS`, `TEST_DATABASE_URL`, `DEMO_COURIER_*_HANDLE`. Simulated routes fake-only. No post-verification dispatch hook. Clarified after the fix pass: VisionProvider `status`; factory config `mode` = env selector; gateway `channel` values; `DEMO_ACTORS` shape; intake UI barrel; `markOfferSendFailed` caller; S-11/S-16 courier notices are P1; non-joined identity → `rejected`; `.env.example` leaves courier handles empty. | Pending team review at kickoff |
| v0.3 | 2026-10-16 | Claim/assignment review F1–F6 (D-029). **F1:** the accepted-offer unique index covers only active assignments (`close_reason IS NULL`); S-15 clears `claimed_offer_id`; S-11/S-16 set `close_reason` on the accepted offer. **F2:** S-09 and S-16 use `effective_cutoff_at`. **F3:** claim step 8 re-runs M-04 and pair-level M-10 under a recipient row lock. **F4:** incomplete inbound rows (`result IS NULL`, > 30 s) are reclaimed and reprocessed; reply sent before `saveInboundResult`. **F5:** M-04 uses derived `committed_servings` (replaces the P1 "capacity decrement"). **F6:** M-09 counts `pending_send`; one live offer per courier (partial unique index; `ON CONFLICT DO NOTHING` in `createNextOffers`). | Pending team review at kickoff |
| v0.4 | 2026-10-16 | Kickoff review A–E (D-031..D-034). **Messaging-first donor intake (D-031):** donor identities JOIN like couriers; `photo` command is P0; `Donation.source_ref` makes draft creation idempotent; `VerificationLink` (§3.16) with CSPRNG token, hash-only storage, URL fragment, 30-min/cutoff expiry, view never consumes, atomic consume on successful submit, uniform 403, `resubmit_token` on `needs_review`; routes `/api/verify/{view,image,submit}`; `DraftReadyView`, purposes `draft_ready`/`intake_failed`; messaging images up to 5 MB, HEIC only if SP-14 passes; ignored-sender logging rule (§11); `DEMO_DONOR_HANDLE`; simulated inbound `fixture_id`; `LinkVerification` component. **`unmatched` (D-032):** new `DonationStatus`; severity `dispatch`; S-05 → `unmatched`; S-14 `unmatched → eligible`; S-08/S-11 include `unmatched`; S-18 for a non-eligible gate re-run. **Courier STOP (D-032):** S-15 releases the assignment back to `eligible` before collection; new S-17 `collected → needs_review` (`COURIER_OPTED_OUT_AFTER_PICKUP`) with no reassignment; `collected_at` guards S-03/S-13. **T-CO-17 required (D-033)** for any race-safety claim (§8.1). **Single version line** in this header (D-034). | Pending team review at kickoff |
| v0.5 | 2026-10-17 | Review of PRs #3/#5 (D-036..D-039), spec only. **§6:** `findCandidates` input gains `busy_courier_ids` (M-09, claimed/collected couriers are not covered by the index), `committed_servings` (M-04), `active_provider` (M-05); `donor_location` sourced from `DonorProfile.location`; any bad input returns `[]`. **§7 / S-06, S-08, S-09, S-14, S-15, S-16, claim step 6:** one cutoff resolution rule: `effective_cutoff_at`, else `min(donor_pickup_by, discard_by)` from the stored facts, else reached (fail closed). **§3.10/§10:** `ThreadMessage` and the typed thread response. **G-01:** the existing table is confirmed (pending, whether licensed or not, is review). **§3.10:** opt-out words are honored anywhere in a short message, and an opt-out beats an image (D-039). Types land in `src/contracts` with `chore/integration-contracts-2`. | Reviewed by Dev 2 (spec consistency) and Dev 3 (gate and expiry rules, OWNERSHIP §6) |
