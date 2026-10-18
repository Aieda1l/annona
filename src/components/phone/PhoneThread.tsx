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
      <a key={start} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold break-all underline underline-offset-2">
        {href}
      </a>,
    );
    last = start + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function PhoneThread({ messages }: { messages: PhoneMessage[] }) {
  if (messages.length === 0)
    return (
      <p className="mx-auto mt-10 max-w-56 text-center text-sm text-muted-foreground">
        No messages yet. Send JOIN to opt this contact in.
      </p>
    );
  return (
    <ul className="flex flex-col gap-2" aria-label="Simulated thread">
      {messages.map((m) =>
        m.kind === "unreadable" ? (
          <li key={m.key} className="rounded-lg border border-review-border bg-review-subtle px-3 py-1.5 text-xs text-review">
            Unreadable message (unexpected shape from the server).
          </li>
        ) : (
          // The phone belongs to the contact: their own messages sit on the right, Annona's on the left.
          <li
            key={m.key}
            data-direction={m.direction}
            className={`flex max-w-[85%] animate-rise flex-col gap-0.5 ${m.direction === "outbound" ? "mr-auto items-start" : "ml-auto items-end"}`}
          >
            <p
              className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap shadow-xs ${
                m.direction === "outbound"
                  ? "rounded-bl-md border border-border bg-muted text-foreground"
                  : "rounded-br-md bg-primary text-primary-foreground"
              }`}
            >
              {linkify(m.text)}
            </p>
            <p className="px-1 text-[11px] text-muted-foreground">
              {m.direction === "outbound" ? "Annona → contact" : "Contact → Annona"} · {formatPacific(m.at)}
            </p>
          </li>
        ),
      )}
    </ul>
  );
}
