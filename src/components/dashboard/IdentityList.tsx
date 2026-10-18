import type { IdentitySummary } from "@/contracts";
import { cn } from "cn";

const STATUS_LABEL: Record<IdentitySummary["status"], string> = {
  awaiting_join: "Awaiting JOIN",
  joined: "Joined",
  opted_out: "Opted out",
};

const STATUS_CLASS: Record<IdentitySummary["status"], string> = {
  awaiting_join: "border-review-border bg-review-subtle text-review",
  joined: "border-neutral-border bg-neutral-subtle text-neutral",
  opted_out: "border-closed-border bg-closed-subtle text-closed",
};

export function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Operator-only. Shows `handle_masked` as returned (last 4 characters); never a full handle. */
export function IdentityList({ identities }: { identities: readonly IdentitySummary[] }) {
  if (identities.length === 0) return <p className="text-sm text-muted-foreground">No messaging identities.</p>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" aria-label="Messaging identities">
      {identities.map((i) => (
        <li key={i.identity_id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary font-heading text-xs font-semibold text-secondary-foreground"
          >
            {initials(i.actor_display_name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{i.actor_display_name}</span>
            <span className="block text-xs text-muted-foreground">
              <span className="capitalize">{i.actor_role}</span>, {i.provider} ·{" "}
              <span className="font-mono">{i.handle_masked}</span>
            </span>
          </span>
          <span
            data-testid={`identity-status-${i.identity_id}`}
            className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_CLASS[i.status])}
          >
            {STATUS_LABEL[i.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}
