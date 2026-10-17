import type { OfferSummary } from "@/contracts";
import { Countdown } from "./Countdown";
import { formatPacific } from "./format";

const STATUS: Record<OfferSummary["status"], string> = {
  pending_send: "Pending send",
  open: "Open",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  superseded: "Superseded",
  send_failed: "Send failed",
  canceled: "Canceled",
};

const DELIVERY: Record<OfferSummary["delivery_status"], string> = {
  unknown: "delivery unknown",
  accepted: "provider accepted",
  delivered: "delivered to device",
  failed: "delivery failed",
};

export function OfferList({ offers }: { offers: readonly OfferSummary[] }) {
  if (offers.length === 0) return null;
  return (
    <ul className="space-y-1" aria-label="Offers">
      {offers.map((o) => (
        <li key={o.id} data-testid={`offer-${o.id}`} className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm">
          <span className="font-mono font-semibold">{o.short_code}</span> · {o.courier_display_name} →{" "}
          {o.recipient_display_name} · <span className="font-medium">{STATUS[o.status]}</span>
          <span className="block text-xs text-slate-700">
            {o.provider_mode === "fake" ? "Simulated message" : "Real message"} · {DELIVERY[o.delivery_status]} · sent{" "}
            {formatPacific(o.sent_at)} · expires {formatPacific(o.expires_at)}
            {o.status === "open" && (
              <>
                {" "}
                · <Countdown until={o.expires_at} label="Offer" />
              </>
            )}
            {o.close_reason ? ` · closed: ${o.close_reason}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
