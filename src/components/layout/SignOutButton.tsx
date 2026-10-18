"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

/**
 * Ends the demo session: asks the server to clear the session cookie (DELETE /api/session, the cookie is HttpOnly so
 * the page cannot clear it itself) and only then goes to the home page. If the server does not confirm, it says so
 * instead of pretending. Not shown on the home page (it holds the profile picker) or on /v (the donor's checklist link).
 */
export function SignOutButton() {
  const router = useRouter();
  const pathname = usePathname();
  // The layout keeps this component mounted across client navigation, so busy/error are tied to the page they
  // happened on and cleared on the home page: after sign out -> home -> sign in -> another page, the button is usable again.
  const [pendingOn, setPendingOn] = useState<string | null>(null);
  const [errorOn, setErrorOn] = useState<{ path: string; message: string } | null>(null);
  const busy = pendingOn === pathname;
  const error = errorOn?.path === pathname ? errorOn.message : null;

  if (pathname === "/") {
    // Back on the profile picker: the sign out finished, so forget it (also covers signing back in on the same page).
    if (pendingOn !== null) setPendingOn(null);
    return null;
  }
  // The donor's checklist page is opened from a link in a message and is authorised by the token in that link, not a
  // session, so a "Sign out" there would only confuse (and send the donor to the profile picker mid-checklist).
  if (pathname === "/v") return null;

  async function signOut() {
    if (busy) return;
    const path = pathname;
    setPendingOn(path);
    setErrorOn(null);
    try {
      const res = await fetch("/api/session", { method: "DELETE", cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (body?.ok) {
        router.push("/");
        return;
      }
      setErrorOn({ path, message: "Could not sign out. Please try again." });
    } catch {
      setErrorOn({ path, message: "Could not sign out (server unreachable). Please try again." });
    }
    setPendingOn(null);
  }

  return (
    <div className="flex items-center justify-end gap-3 text-sm">
      {error && (
        <p role="alert" className="max-w-56 text-right text-xs font-medium text-destructive sm:max-w-none sm:text-sm">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 font-medium whitespace-nowrap text-foreground shadow-xs transition-colors hover:bg-muted disabled:opacity-60 sm:px-3"
      >
        <LogOut aria-hidden className="size-4" />
        <span className="max-sm:sr-only">Sign out</span>
      </button>
    </div>
  );
}
