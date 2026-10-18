import type { ReactNode } from "react";
import { formatPacific } from "@/components/dashboard/format";

export type PhoneMessage =
  | { kind: "ok"; key: string; direction: "inbound" | "outbound"; text: string; at: string | null }
  | { kind: "unreadable"; key: string };

/**
 * The thread response shape is not yet in CONTRACTS (see docs/requests/dashboard-phone-thread-shape.md), so
 * parsing is tolerant and anything unrecognized is flagged rather than hidden or guessed.
 */
export function normalizeMessages(raw: unknown): PhoneMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m, i): PhoneMessage => {
    const o = (m ?? {}) as Record<string, unknown>;
    const direction = o.direction;
    const at = [o.created_at, o.at, o.sent_at, o.received_at].find((v) => typeof v === "string");
    if ((direction === "inbound" || direction === "outbound") && typeof o.text === "string") {
      return {
        kind: "ok",
        key: typeof o.id === "string" ? o.id : `m${i}`,
        direction,
        text: o.text,
        at: (at as string | undefined) ?? null,
      };
    }
    return { kind: "unreadable", key: `m${i}` };
  });
}

/** Only links whose path is /v are made clickable, and they are rewritten to this origin (demo-link fallback). */
export function linkify(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s]+/g)) {
    const start = match.index ?? 0;
    const raw = match[0].replace(/[.,;:!?)\]'"]+$/, "");
    let url: URL | null = null;
    try {
      url = new URL(raw);
    } catch {
      url = null;
    }
    if (!url || url.pathname !== "/v") continue;
    if (start > last) parts.push(text.slice(last, start));
    const href = `/v${url.hash}`;
    parts.push(
      <a key={start} href={href} target="_blank" rel="noopener noreferrer" className="underline">
        {href}
      </a>,
    );
    last = start + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function PhoneThread({ messages }: { messages: PhoneMessage[] }) {
  if (messages.length === 0) return <p className="text-sm text-slate-700">No messages yet.</p>;
  return (
    <ul className="space-y-2" aria-label="Simulated thread">
      {messages.map((m) =>
        m.kind === "unreadable" ? (
          <li key={m.key} className="rounded border border-amber-700 bg-amber-50 px-2 py-1 text-xs text-amber-950">
            Unreadable message (unexpected shape from the server).
          </li>
        ) : (
          <li
            key={m.key}
            data-direction={m.direction}
            className={`max-w-[85%] rounded-lg border px-3 py-1.5 text-sm ${
              m.direction === "outbound"
                ? "mr-auto border-slate-400 bg-slate-100"
                : "ml-auto border-slate-700 bg-card"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{linkify(m.text)}</p>
            <p className="text-[11px] text-slate-700">
              {m.direction === "outbound" ? "Annona → contact" : "Contact → Annona"} · {formatPacific(m.at)}
            </p>
          </li>
        ),
      )}
    </ul>
  );
}
