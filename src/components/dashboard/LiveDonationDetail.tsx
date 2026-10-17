"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DonationCard, HandoffStep, OperatorAction } from "@/contracts";
import type { Outcome } from "./api";
import { DonationDetail } from "./DonationDetail";
import { formatPacific } from "./format";

const POLL_MS = 2000;

type Failure = { code: string; message: string };

async function readFailure(res: Response): Promise<Failure> {
  const body = await res.json().catch(() => null);
  if (body && body.ok === false && body.error) return { code: body.error.code, message: body.error.message };
  return { code: `HTTP_${res.status}`, message: "Unexpected response from the server." };
}

/**
 * Polls GET /api/donations/:id (operator view) and renders the card as returned. On failure it keeps the last good
 * card labeled stale and shows the ErrorCode; it never invents a card. Polling pauses while the tab is hidden.
 */
export function LiveDonationDetail({ id }: { id: string }) {
  const [card, setCard] = useState<DonationCard | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Server time of the last good response (the `Date` header); the browser clock is never used for this.
  const [lastGoodAt, setLastGoodAt] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (document.hidden) return;
    const seq = ++loadSeq.current;
    const latest = () => seq === loadSeq.current;
    try {
      const res = await fetch(`/api/donations/${id}`, { cache: "no-store" });
      if (!res.ok) {
        const f = await readFailure(res);
        if (latest()) setFailure(f);
        return;
      }
      const body = await res.json();
      if (!latest()) return;
      if (body?.ok) {
        setCard(body.data);
        setFailure(null);
        const date = res.headers.get("date");
        setLastGoodAt(date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null);
      } else setFailure({ code: body?.error?.code ?? "INTERNAL", message: body?.error?.message ?? "Request failed." });
    } catch {
      if (latest()) setFailure({ code: "UNREACHABLE", message: "The server could not be reached." });
    }
  }, [id]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  async function post(path: string, body: unknown): Promise<Outcome> {
    try {
      const res = await fetch(`/api/donations/${id}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const f = await readFailure(res);
        return { ok: false, error: `${f.code}: ${f.message}` };
      }
      return { ok: true, summary: "Recorded." };
    } catch {
      return { ok: false, error: "UNREACHABLE: The server could not be reached." };
    }
  }

  async function onHandoff(step: HandoffStep): Promise<Outcome> {
    const out = await post("handoff", { step });
    await load();
    return out;
  }

  async function onAction(action: OperatorAction, note: string) {
    setActionError(null);
    const out = await post("operator-actions", { action, note });
    if (!out.ok) setActionError(out.error);
    await load();
  }

  return (
    <>
      {failure && (
        <div
          role="alert"
          className="mx-auto mt-4 w-full max-w-4xl rounded border border-amber-700 bg-amber-50 p-3 text-sm text-amber-950"
        >
          <p className="font-semibold">Donation data unavailable: {failure.code}</p>
          <p>{failure.message}</p>
          {card && (
            <p>
              Showing the last card received (stale{lastGoodAt ? ` since ${formatPacific(lastGoodAt)}` : ""}).
            </p>
          )}
        </div>
      )}
      {card ? (
        <DonationDetail card={card} onAction={onAction} onHandoff={onHandoff} actionError={actionError} />
      ) : (
        !failure && <p className="p-4 text-sm">Loading donation…</p>
      )}
    </>
  );
}
