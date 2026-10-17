"use client";

import { useEffect, useState } from "react";

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
    <span>
      {label}: {m}:{String(s % 60).padStart(2, "0")} left
    </span>
  );
}
