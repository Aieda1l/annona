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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pathname === "/") return null;

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/session", { method: "DELETE", cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (body?.ok) {
        router.push("/");
        return;
      }
      setError("Could not sign out. Please try again.");
    } catch {
      setError("Could not sign out (server unreachable). Please try again.");
    }
    setBusy(false);
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
