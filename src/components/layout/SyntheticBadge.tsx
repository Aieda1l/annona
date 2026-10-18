import { FlaskConical } from "lucide-react";

export function SyntheticBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-offer-border bg-offer-subtle px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-offer">
      <FlaskConical aria-hidden className="size-3.5" />
      Synthetic data
    </span>
  );
}
