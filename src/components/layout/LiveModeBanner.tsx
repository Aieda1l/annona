"use client";

import { useEffect, useState } from "react";
import type { SystemModes } from "@/contracts";
import { ModeBanner } from "./ModeBanner";

type Health = { modes: SystemModes; generated_at: string } | { error: string };

/** Polls GET /api/health. The server `Date` header is the clock; nothing is fabricated on failure. */
export function LiveModeBanner() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const body = await res.json();
        if (!alive) return;
        if (body?.ok) {
          const date = res.headers.get("date");
          setHealth({ modes: body.data, generated_at: date ? new Date(date).toISOString() : new Date().toISOString() });
        } else setHealth({ error: body?.error?.code ?? `HTTP ${res.status}` });
      } catch {
        if (alive) setHealth({ error: "UNREACHABLE" });
      }
    };
    void load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!health)
    return (
      <div role="status" aria-label="System mode" className="border-b border-slate-400 bg-slate-100 px-4 py-2 text-xs">
        Checking system mode…
      </div>
    );
  if ("error" in health)
    return (
      <div role="status" aria-label="System mode" className="border-b border-amber-700 bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-950">
        System mode unavailable ({health.error}). Showing no provider labels.
      </div>
    );
  return <ModeBanner modes={health.modes} generated_at={health.generated_at} />;
}
