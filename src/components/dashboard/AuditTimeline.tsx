import type { AuditEvent } from "@/contracts";
import { formatPacific } from "./format";

/** Vertical activity rail (21st.dev timeline pattern, rebuilt on Annona tokens). Newest-last order as the server sends it. */
export function AuditTimeline({ events }: { events: readonly AuditEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ol className="relative space-y-3 border-l border-border pl-5 text-sm" aria-label="Audit timeline">
      {events.map((e, i) => (
        <li key={e.id} className="relative">
          <span
            aria-hidden
            className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-card ${
              i === events.length - 1 ? "bg-primary" : "bg-input"
            }`}
          />
          <p className="font-medium text-foreground">
            <span className="font-mono text-[13px]">{e.type}</span>
            <span className="font-normal text-muted-foreground"> · {e.actor.role}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            <time dateTime={e.at} className="font-mono">
              {formatPacific(e.at)}
            </time>
            {e.mode.vision || e.mode.messaging
              ? ` · ${[e.mode.vision && `AI ${e.mode.vision}`, e.mode.messaging && `messaging ${e.mode.messaging}`].filter(Boolean).join(", ")}`
              : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
