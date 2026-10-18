import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight aria-hidden className="size-3.5" />}
            {c.href ? (
              <Link href={c.href} className="rounded font-medium hover:text-foreground hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-foreground">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Every page opens with this: optional breadcrumbs/eyebrow, one h1, a short description, and page-level actions. */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  breadcrumbs,
  meta,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          {eyebrow && (
            <p className="text-xs font-semibold tracking-wider text-primary uppercase">{eyebrow}</p>
          )}
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1>
          {description && <div className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta && <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{meta}</div>}
    </header>
  );
}

/** Section heading inside a page (h2), with optional count and trailing content. */
export function SectionHeading({
  children,
  count,
  icon: Icon,
  trailing,
  id,
  className,
}: {
  children: ReactNode;
  count?: number;
  icon?: typeof ChevronRight;
  trailing?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 id={id} className="flex items-center gap-2 text-base font-semibold text-foreground sm:text-lg">
        {Icon && <Icon aria-hidden className="size-5 text-muted-foreground" />}
        {children}
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs font-semibold text-muted-foreground tabular">
            ({count})
          </span>
        )}
      </h2>
      {trailing}
    </div>
  );
}

/** Standard page width + gutters. `size` follows design-system page overrides (dashboard wide, forms narrow). */
export function PageContainer({
  children,
  size = "default",
  className,
}: {
  children: ReactNode;
  size?: "narrow" | "default" | "wide";
  className?: string;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full flex-1 px-4 py-6 sm:px-6 sm:py-8",
        size === "narrow" && "max-w-2xl",
        size === "default" && "max-w-5xl",
        size === "wide" && "max-w-7xl",
        className,
      )}
    >
      {children}
    </main>
  );
}
