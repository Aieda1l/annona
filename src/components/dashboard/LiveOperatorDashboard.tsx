"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardSnapshot, OperatorAction } from "@/contracts";
import { postJson, type Outcome } from "./api";
import { OperatorDashboard, type DemoHandlers } from "./OperatorDashboard";
import { formatPacific } from "./format";
import { PageContainer } from "@/components/layout/PageHeader";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";

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

  // Only the most recently started load may apply its result, so a slow older poll cannot overwrite newer state.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (document.hidden) return;
    const seq = ++loadSeq.current;
    const latest = () => seq === loadSeq.current;
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) {
        const f = await readFailure(res);
        if (latest()) setFailure(f);
        return;
      }
      const body = await res.json();
      if (!latest()) return;
      if (body?.ok) {
        setSnapshot(body.data);
        setFailure(null);
      } else setFailure({ code: body?.error?.code ?? "INTERNAL", message: body?.error?.message ?? "Request failed." });
    } catch {
      if (latest()) setFailure({ code: "UNREACHABLE", message: "The server could not be reached." });
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
    onReset: () => refreshAfter(postJson("/api/demo/reset")),
    onDispatch: (id) => refreshAfter(postJson(`/api/donations/${id}/dispatch`)),
  };

  const notice = failure && (
    <Notice role="alert" tone="warning" title={`Dashboard data unavailable: ${failure.code}`}>
      <p>{failure.message}</p>
      {snapshot && <p>Showing the last snapshot, stale since {formatPacific(snapshot.generated_at)}.</p>}
    </Notice>
  );

  if (snapshot)
    return (
      <OperatorDashboard
        snapshot={snapshot}
        sourceLabel={failure ? "STALE server state" : "Live server state"}
        onAction={onAction}
        actionErrors={actionErrors}
        notice={notice}
        // Demo controls are hidden while the snapshot is stale: the last-seen mode may no longer match the server.
        demo={snapshot.modes.demo_accelerated && !failure ? demo : undefined}
      />
    );

  return (
    <PageContainer size="wide" className="space-y-6">
      {notice || <DashboardSkeleton />}
    </PageContainer>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-6">
      <span className="sr-only">Loading dashboard…</span>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[4.5rem] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
