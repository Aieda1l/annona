"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Ends the demo session: asks the server to clear the session cookie (DELETE /api/session, the cookie is HttpOnly so
 * the page cannot clear it itself) and only then goes to the home page. If the server does not confirm, it says so
 * instead of pretending. The home page holds the profile picker, so the button is not shown there.
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
    <div className="flex items-center justify-end gap-3 px-4 py-1 text-sm">
      {error && (
        <p role="alert" className="text-rose-900">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="rounded border border-slate-500 bg-white px-3 py-1 font-medium text-slate-900 disabled:opacity-60"
      >
        Sign out
      </button>
    </div>
  );
}
