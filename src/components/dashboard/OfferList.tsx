import { ArrowRight } from "lucide-react";
import type { OfferSummary } from "@/contracts";
import { cn } from "cn";
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

const STATUS_CLASS: Partial<Record<OfferSummary["status"], string>> = {
  open: "border-offer-border bg-offer-subtle text-offer",
  accepted: "border-progress-border bg-progress-subtle text-progress",
  send_failed: "border-danger-border bg-danger-subtle text-danger",
  pending_send: "border-review-border bg-review-subtle text-review",
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
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card" aria-label="Offers">
      {offers.map((o) => (
        <li key={o.id} data-testid={`offer-${o.id}`} className="space-y-1 px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider">
              {o.short_code}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1 font-medium">
              {o.courier_display_name}
              <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />
              {o.recipient_display_name}
            </span>
            <span
              className={cn(
                "ml-auto rounded-full border px-2 py-0.5 text-xs font-semibold",
                STATUS_CLASS[o.status] ?? "border-closed-border bg-closed-subtle text-closed",
              )}
            >
              {STATUS[o.status]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {o.provider_mode === "fake" ? "Simulated message" : "Real message"} · {DELIVERY[o.delivery_status]} · sent{" "}
            {formatPacific(o.sent_at)} · expires {formatPacific(o.expires_at)}
            {o.status === "open" && (
              <>
                {" "}
                · <span className="font-semibold text-offer"><Countdown until={o.expires_at} label="Offer" /></span>
              </>
            )}
            {o.close_reason ? ` · closed: ${o.close_reason}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
