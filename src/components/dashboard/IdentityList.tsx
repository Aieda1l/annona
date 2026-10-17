import type { IdentitySummary } from "@/contracts";

const STATUS_LABEL: Record<IdentitySummary["status"], string> = {
  awaiting_join: "Awaiting JOIN",
  joined: "Joined",
  opted_out: "Opted out",
};

/** Operator-only. Shows `handle_masked` as returned (last 4 characters); never a full handle. */
export function IdentityList({ identities }: { identities: readonly IdentitySummary[] }) {
  if (identities.length === 0) return <p className="text-sm text-slate-700">No messaging identities.</p>;
  return (
    <ul className="divide-y divide-slate-200 rounded border border-slate-300 bg-white" aria-label="Messaging identities">
      {identities.map((i) => (
        <li key={i.identity_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
          <span>
            <span className="font-medium">{i.actor_display_name}</span>{" "}
            <span className="text-slate-700">({i.actor_role}, {i.provider})</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs">{i.handle_masked}</span>
            <span
              data-testid={`identity-status-${i.identity_id}`}
              className="rounded border border-slate-600 bg-slate-100 px-1.5 py-0.5 text-xs"
            >
              {STATUS_LABEL[i.status]}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
