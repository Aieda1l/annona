"use client";

import { useEffect, useState } from "react";

type ActorOption = { role: string; actor_id: string; display_name: string };

export function ProfilePicker() {
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
      if (b?.ok) setSignedIn(b.data.actor.role);
      else setError(b?.error?.message ?? `Sign-in failed (HTTP ${res.status})`);
    } catch {
      setError("Sign-in failed (server unreachable)");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-300 bg-white p-4">
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
      {signedIn && <p role="status">Signed in as {signedIn}.</p>}
      {error && (
        <p role="alert" className="text-sm text-rose-900">
          {error}
        </p>
      )}
    </form>
  );
}
