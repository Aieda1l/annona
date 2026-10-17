"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardSnapshot, OperatorAction } from "@/contracts";
import { postJson, type Outcome } from "./api";
import { OperatorDashboard, type DemoHandlers } from "./OperatorDashboard";
import { formatPacific } from "./format";

const POLL_MS = 2000;

type Failure = { code: string; message: string };

async function readFailure(res: Response): Promise<Failure> {
  const body = await res.json().catch(() => null);
  if (body && body.ok === false && body.error) return { code: body.error.code, message: body.error.message };
  return { code: `HTTP_${res.status}`, message: "Unexpected response from the server." };
}

/**
 * Polls GET /api/dashboard (D-006) and renders the snapshot as returned. On failure it keeps the last good
 * snapshot labeled stale and shows the ErrorCode; it never invents data. Polling pauses while the tab is hidden.
 */
export function LiveOperatorDashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (document.hidden) return;
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) {
        setFailure(await readFailure(res));
        return;
      }
      const body = await res.json();
      if (body?.ok) {
        setSnapshot(body.data);
        setFailure(null);
      } else setFailure({ code: body?.error?.code ?? "INTERNAL", message: body?.error?.message ?? "Request failed." });
    } catch {
      setFailure({ code: "UNREACHABLE", message: "The server could not be reached." });
    }
  }, []);

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

  async function onAction(donationId: string, action: OperatorAction, note: string) {
    setActionErrors((e) => ({ ...e, [donationId]: "" }));
    try {
      const res = await fetch(`/api/donations/${donationId}/operator-actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (!res.ok) {
        const f = await readFailure(res);
        setActionErrors((e) => ({ ...e, [donationId]: `${f.code}: ${f.message}` }));
        return;
      }
      await load();
    } catch {
      setActionErrors((e) => ({ ...e, [donationId]: "UNREACHABLE: The server could not be reached." }));
    }
  }

  const refreshAfter = async (o: Promise<Outcome>): Promise<Outcome> => {
    const out = await o;
    await load();
    return out;
  };
  const demo: DemoHandlers = {
    onTick: () => refreshAfter(postJson("/api/internal/tick")),
    onReset: () => refreshAfter(postJson("/api/demo/reset", { keep_identities: true })),
    onDispatch: (id) => refreshAfter(postJson(`/api/donations/${id}/dispatch`)),
  };

  return (
    <>
      {failure && (
        <div role="alert" className="mx-auto mt-4 w-full max-w-6xl rounded border border-amber-700 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Dashboard data unavailable: {failure.code}</p>
          <p>{failure.message}</p>
          {snapshot && <p>Showing the last snapshot, stale since {formatPacific(snapshot.generated_at)}.</p>}
        </div>
      )}
      {snapshot ? (
        <OperatorDashboard
          snapshot={snapshot}
          sourceLabel={failure ? "STALE server state" : "Live server state"}
          onAction={onAction}
          actionErrors={actionErrors}
          demo={snapshot.modes.demo_accelerated ? demo : undefined}
        />
      ) : (
        !failure && <p className="p-4 text-sm">Loading dashboard…</p>
      )}
    </>
  );
}
