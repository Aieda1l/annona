"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquareText, PackagePlus } from "lucide-react";
import { cn } from "cn";
import { SignOutButton } from "./SignOutButton";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; match: (p: string) => boolean };

// Navigation only. Which pages a person may use is decided by the server on every API call, not by this menu.
const OPERATOR_NAV: NavItem[] = [
  {
    href: "/operator",
    label: "Dashboard",
    icon: LayoutDashboard,
    match: (p) => p === "/operator" || p.startsWith("/operator/donations"),
  },
  { href: "/operator/phone", label: "Simulated phone", icon: MessageSquareText, match: (p) => p === "/operator/phone" },
];
const DONOR_NAV: NavItem[] = [
  { href: "/donor/new", label: "New donation", icon: PackagePlus, match: (p) => p === "/donor/new" },
];

function navFor(pathname: string): NavItem[] {
  if (pathname.startsWith("/operator")) return OPERATOR_NAV;
  if (pathname.startsWith("/donor")) return DONOR_NAV;
  return [];
}

export function Brand({ asLink = true }: { asLink?: boolean }) {
  const inner = (
    <>
      {/* Decorative: the wordmark beside it names the product. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/apple-icon.png"
        alt=""
        width={32}
        height={32}
        className="size-8 rounded-lg bg-white shadow-xs ring-1 ring-border"
      />
      <span className="font-heading text-lg font-semibold tracking-tight text-forest">Annona</span>
    </>
  );
  if (!asLink) return <span className="flex items-center gap-2">{inner}</span>;
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md">
      {inner}
    </Link>
  );
}

/**
 * The one header every page shares. The donor's checklist link page (/v) gets the brand only: no navigation, no
 * sign out and no link away, because the donor arrives there from a message and has no session.
 */
export function AppHeader() {
  const pathname = usePathname() ?? "/";
  const isLinkPage = pathname === "/v";
  const nav = navFor(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Brand asLink={!isLinkPage} />
        {nav.length > 0 && (
          <nav aria-label="Main" className="ml-2 flex min-w-0 items-center gap-1 overflow-x-auto sm:ml-4">
            {nav.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    active && "bg-secondary text-secondary-foreground hover:bg-secondary",
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                  <span className="max-sm:sr-only">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!isLinkPage && <SignOutButton />}
        </div>
      </div>
    </header>
  );
}
