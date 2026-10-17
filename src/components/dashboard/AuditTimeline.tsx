import type { AuditEvent } from "@/contracts";
import { formatPacific } from "./format";

export function AuditTimeline({ events }: { events: readonly AuditEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ol className="space-y-0.5 text-xs text-slate-800" aria-label="Audit timeline">
      {events.map((e) => (
        <li key={e.id}>
          <span className="font-mono">{formatPacific(e.at)}</span> · {e.type} · {e.actor.role}
        </li>
      ))}
    </ol>
  );
}
