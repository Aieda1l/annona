import type { Allergen, ClaimResult, DraftReadyView, OfferMessageView } from "@/contracts";

// Deterministic message templates (CONTRACTS §3.10). Pure: text is built only from the view passed in, so identical
// input gives byte-identical output (Photon rejects a reused Idempotency-Key with a different body, 422).
// No template says safe, allergen-free, certified, compliant or verified, and none carries a handle or an address.

const LA_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });

/** "6:12 PM" in America/Los_Angeles. Newer ICU puts a narrow no-break space before PM; normalize it to a plain space. */
const laTime = (iso: string): string => LA_TIME.format(new Date(iso)).replace(/ /g, " ");

const allergenList = (allergens: readonly Allergen[]): string =>
  allergens.map((allergen) => allergen.replace(/_/g, " ")).join(", ");

const disclosure = (demo: boolean): string => (demo ? "automated assistant, DEMO" : "automated assistant");

export function formatOfferMessage(view: OfferMessageView): string {
  const contains = view.allergens_present.length > 0 ? allergenList(view.allergens_present) : "none declared";
  const crossContact =
    view.cross_contact_status === "unknown"
      ? "unknown"
      : view.cross_contact_allergens.length > 0
        ? allergenList(view.cross_contact_allergens)
        : "none known to donor";
  const handling =
    view.handling_mode === "refrigerated" ? "Needs cold transport." : `Handling: ${view.handling_mode.replace(/_/g, " ")}.`;
  const servings = view.servings === 1 ? "1 serving" : `${view.servings} servings`;

  return [
    `Annona (${disclosure(view.demo_mode)}): pickup offer ${view.short_code}.`,
    `${view.dish_name}, ${servings}. ${handling}`,
    `Contains (donor-declared): ${contains}. Other major allergens: not in the donor's listed ingredients — not a guarantee. Cross-contact: ${crossContact}.`,
    `For ${view.recipient_display_name}. Pickup area: ${view.pickup_area_label}.`,
    `Reply YES ${view.short_code} or NO ${view.short_code} by ${laTime(view.expires_at)}. Text STOP to opt out.`,
  ].join("\n");
}

export function formatDraftReadyMessage(view: DraftReadyView): string {
  const opening = `Annona (${disclosure(view.demo_mode)})`;
  const expires = `(link expires ${laTime(view.link_expires_at)})`;

  if (view.ai_status !== "succeeded") {
    return [
      `${opening}: we couldn't analyze your photo.`,
      `You can still enter the details yourself on this checklist: ${view.link_url} ${expires}`,
    ].join("\n");
  }

  const allergens =
    view.possible_allergens.length > 0
      ? `Possible allergens: ${allergenList(view.possible_allergens)} (AI guess, may be wrong).`
      : "The AI guess suggests no allergens; please check all nine major allergens yourself.";

  return [
    `${opening}: here is an AI guess from your photo: ${view.dish_guess ?? "no dish identified"}.`,
    allergens,
    `Please confirm every detail on this checklist: ${view.link_url} ${expires}`,
  ].join("\n");
}

export const joinAckText = (): string =>
  "Annona (automated assistant, DEMO): you're opted in to pickup messages. Text STOP anytime to opt out or HELP for help.";

export const stopAckText = (): string => "Annona: you're opted out and won't get more messages. Text JOIN to opt back in.";

export const helpText = (): string =>
  "Annona (automated assistant, DEMO). Reply YES <code> to accept an offer or NO <code> to decline. Text STOP to opt out, JOIN to opt in. Donors: text a photo of your food to start a listing.";

export const declineAckText = (): string => "Annona: offer declined. No assignment was made to you.";

export const intakeFailedText = (): string =>
  "Annona: we couldn't use that photo. Please send another photo or use the web upload.";

/** The photo arrived and was drafted, but core cannot issue the checklist link yet. Honest, and it moves the relay on. */
export const linkUnavailableText = (): string =>
  "Annona: we got your photo, but the checklist link isn't available yet. Please use the web upload.";

export const askForCodeText = (): string =>
  "Annona: which offer? Reply YES or NO followed by the 4-character code from the offer text.";

/** For not_authorized and offer_not_found: no offer, donor or recipient details. */
export const genericNoAssignmentText = (): string =>
  "Annona: we couldn't match that to an offer for you. No assignment was made.";

/** A fault on our side while answering YES or NO: nothing is revealed, and the courier is told to send it again. */
export const tryAgainText = (): string => "Annona: something went wrong on our side. Please try again in a minute.";

/**
 * The reply to a claim. Addresses and pickup instructions appear only for `claimed` and `already_claimed_by_you`
 * (CONTRACTS §11), even if core handed back an assignment for another code.
 */
export function formatClaimReply(result: ClaimResult): string {
  const holdsClaim = result.code === "claimed" || result.code === "already_claimed_by_you";
  if (!holdsClaim || result.assignment === null) return result.message_for_actor;

  const { pickup, recipient } = result.assignment;
  return [
    result.message_for_actor,
    `Pickup: ${pickup.display_name}, ${pickup.address_line}. ${pickup.pickup_instructions}. Pick up by ${laTime(pickup.donor_pickup_by)}.`,
    `Deliver to: ${recipient.display_name}, ${recipient.address_line}.`,
  ].join("\n");
}
