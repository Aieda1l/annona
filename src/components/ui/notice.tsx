import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CircleAlert, FlaskConical, Info, OctagonX } from "lucide-react";
import { cn } from "cn";

export type NoticeTone = "neutral" | "info" | "warning" | "danger" | "synthetic";

const TONE: Record<NoticeTone, { className: string; icon: typeof Info }> = {
  neutral: { className: "border-border bg-card text-foreground [&_[data-slot=notice-icon]]:text-muted-foreground", icon: Info },
  info: { className: "border-info-border bg-info-subtle text-info", icon: CircleAlert },
  warning: { className: "border-review-border bg-review-subtle text-review", icon: AlertTriangle },
  danger: { className: "border-danger-border bg-danger-subtle text-danger", icon: OctagonX },
  synthetic: { className: "border-offer-border bg-offer-subtle text-offer", icon: FlaskConical },
};

/**
 * One callout pattern for every inline message: stale data, failures, demo labels, guidance. The tone is always
 * paired with an icon and words, never color alone. `role` is passed through so callers keep their alert/status
 * semantics exactly as before.
 */
export function Notice({
  tone = "neutral",
  title,
  icon,
  children,
  className,
  ...props
}: Omit<ComponentProps<"div">, "title"> & { tone?: NoticeTone; title?: ReactNode; icon?: typeof Info | null }) {
  const t = TONE[tone];
  const Icon = icon === null ? null : (icon ?? t.icon);
  return (
    <div
      data-slot="notice"
      data-tone={tone}
      className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed", t.className, className)}
      {...props}
    >
      {Icon && <Icon data-slot="notice-icon" aria-hidden className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className="[&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-2">{children}</div>
      </div>
    </div>
  );
}
