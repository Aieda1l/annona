"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "cn";

/** Display only. The server enforces every deadline; this never enables or disables an action. */
export function Countdown({ until, label }: { until: string | null; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  if (!until) return <span>{label}: —</span>;
  if (now === null) return <span>{label}: …</span>;
  const s = Math.floor((Date.parse(until) - now) / 1000);
  if (s <= 0) return <span>{label}: time reached (server decides)</span>;
  const m = Math.floor(s / 60);
  return (
    <span className="tabular">
      {label}: {m}:{String(s % 60).padStart(2, "0")} left
    </span>
  );
}

/** The same countdown as a pill, for card headers. Urgency styling starts under 5 minutes; still display only. */
export function CountdownPill({ until, label }: { until: string; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const urgent = now !== null && Date.parse(until) - now < 5 * 60_000;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        urgent ? "border-review-border bg-review-subtle text-review" : "border-border bg-card text-foreground/80",
      )}
    >
      <Timer aria-hidden className="size-3.5" />
      <Countdown until={until} label={label} />
    </span>
  );
}
