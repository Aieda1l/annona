"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ActorOption = { role: string; actor_id: string; display_name: string };

/** The page each role works in. Couriers and recipients act by message, so they have no web page. */
const HOME_BY_ROLE: Record<string, { href: string; label: string } | undefined> = {
  operator: { href: "/operator", label: "Open the operator dashboard" },
  donor: { href: "/donor/new", label: "Start a new donation" },
};

export function ProfilePicker() {
  const router = useRouter();
  const [actors, setActors] = useState<ActorOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actorId, setActorId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [signedIn, setSignedIn] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/session/actors", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => (b?.ok ? setActors(b.data.actors) : setError(b?.error?.message ?? "Profiles unavailable")))
      .catch(() => setError("Profiles unavailable (server unreachable)"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor_id: actorId, passcode }),
      });
      const b = await res.json().catch(() => null);
      if (b?.ok) {
        const role: string = b.data.actor.role;
        setSignedIn(role);
        // Navigation only: the server decided who is signed in, and every page re-checks the session on its own API calls.
        const home = HOME_BY_ROLE[role];
        if (home) router.push(home.href);
      } else setError(b?.error?.message ?? `Sign-in failed (HTTP ${res.status})`);
    } catch {
      setError("Sign-in failed (server unreachable)");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-300 bg-card p-4">
      <h2 className="text-lg font-semibold">Choose a demo profile</h2>
      <label className="block text-sm font-medium" htmlFor="actor">
        Profile (synthetic)
      </label>
      <select
        id="actor"
        value={actorId}
        onChange={(e) => setActorId(e.target.value)}
        className="w-full rounded border border-slate-500 p-2 text-sm"
        required
      >
        <option value="">Select…</option>
        {actors?.map((a) => (
          <option key={a.actor_id} value={a.actor_id}>
            {a.display_name} — {a.role}
          </option>
        ))}
      </select>
      <label className="block text-sm font-medium" htmlFor="passcode">
        Demo passcode
      </label>
      <input
        id="passcode"
        type="password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        className="w-full rounded border border-slate-500 p-2 text-sm"
        required
      />
      <button type="submit" className="rounded border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white">
        Sign in
      </button>
      {signedIn && (
        <div role="status" className="space-y-1 text-sm">
          <p>Signed in as {signedIn}.</p>
          {HOME_BY_ROLE[signedIn] ? (
            <Link href={HOME_BY_ROLE[signedIn]!.href} className="font-medium underline">
              {HOME_BY_ROLE[signedIn]!.label}
            </Link>
          ) : (
            <p>This role acts by message and has no web page here. Sign in as the operator to watch the simulated phone.</p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-900">
          {error}
        </p>
      )}
    </form>
  );
}
