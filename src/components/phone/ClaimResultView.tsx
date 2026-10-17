import type { ClaimResult, ClaimResultCode } from "@/contracts";

type Tone = "success" | "neutral" | "warning";

// Headlines are UI labels; `message_for_actor` is shown verbatim from the server. Claim/decline outcomes
// are 200 results, not errors (§3.15), so nothing here is styled as an app failure.
const VIEW: Record<ClaimResultCode, { headline: string; tone: Tone }> = {
  claimed: { headline: "Claimed — you have the pickup", tone: "success" },
  already_claimed_by_you: { headline: "Already yours — claim confirmed earlier", tone: "success" },
  already_claimed: { headline: "Already claimed by someone else", tone: "neutral" },
  offer_expired: { headline: "Expired — no assignment made", tone: "warning" },
  offer_closed: { headline: "Offer closed — no assignment made", tone: "neutral" },
  donation_unavailable: { headline: "Donation no longer available", tone: "warning" },
  not_authorized: { headline: "Not authorized to claim this offer", tone: "warning" },
  offer_not_found: { headline: "Offer code not recognized", tone: "neutral" },
  ineligible: { headline: "Not eligible to claim — no assignment made", tone: "warning" },
};

const TONE_CLASS: Record<Tone, string> = {
  success: "border-teal-700 bg-teal-50 text-teal-950",
  neutral: "border-slate-500 bg-slate-50 text-slate-900",
  warning: "border-amber-700 bg-amber-50 text-amber-950",
};

export function ClaimResultView({ result }: { result: ClaimResult }) {
  const v = VIEW[result.code];
  return (
    <div
      data-testid="claim-result"
      data-code={result.code}
      data-tone={v.tone}
      className={`space-y-1 rounded border-l-4 p-3 text-sm ${TONE_CLASS[v.tone]}`}
    >
      <p data-testid="claim-headline" className="font-semibold">
        {v.headline}
      </p>
      <p>{result.message_for_actor}</p>
      {result.assignment && (
        <dl data-testid="claim-assignment" className="mt-2 text-xs">
          <dt className="font-medium">Recipient</dt>
          <dd>
            {result.assignment.recipient.display_name}, {result.assignment.recipient.address_line}
          </dd>
          <dt className="font-medium">Pickup</dt>
          <dd>
            {result.assignment.pickup.display_name}, {result.assignment.pickup.address_line}
          </dd>
        </dl>
      )}
    </div>
  );
}
