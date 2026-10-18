"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import CountUp from "@/components/reactbits/CountUp";
import { useMotionCapable } from "@/components/reactbits/capable";

/**
 * KPI tile. The number is always a server count passed in by the caller; React Bits CountUp only animates the change
 * between two server values (and is skipped under reduced motion / without browser support).
 */
export function MetricTile({
  label,
  value,
  icon: Icon,
  accentClass,
  hint,
  href,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Token class for the icon chip, e.g. `bg-review-subtle text-review`. */
  accentClass: string;
  hint?: string;
  href?: string;
}) {
  const capable = useMotionCapable();
  const body = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", accentClass)}>
        <Icon aria-hidden className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-2xl leading-tight font-semibold text-foreground">
          {capable ? <CountUp to={value} from={0} duration={0.8} trigger="load" /> : <span className="tabular">{value}</span>}
        </span>
        <span className="block text-xs leading-tight font-medium text-muted-foreground">{label}</span>
        {hint && <span className="sr-only">{hint}</span>}
      </span>
    </>
  );
  const cls =
    "flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs transition-[box-shadow,border-color] duration-200";
  return href ? (
    <a href={href} className={cn(cls, "hover:border-input hover:shadow-md")}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
