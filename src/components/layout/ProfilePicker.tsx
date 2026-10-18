"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Bike, Building2, KeyRound, LayoutDashboard, LoaderCircle, Store, UserRound } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type ActorOption = { role: string; actor_id: string; display_name: string };

/** The page each role works in. Couriers and recipients act by message, so they have no web page. */
const HOME_BY_ROLE: Record<string, { href: string; label: string } | undefined> = {
  operator: { href: "/operator", label: "Open the operator dashboard" },
  donor: { href: "/donor/new", label: "Start a new donation" },
};

const ROLE_INFO: Record<string, { icon: typeof Store; where: string }> = {
  operator: { icon: LayoutDashboard, where: "Web dashboard: watch every donation, act on exceptions" },
  donor: { icon: Store, where: "Web upload: share a photo, confirm the details" },
  courier: { icon: Bike, where: "By message: accept or decline pickup offers" },
  recipient: { icon: Building2, where: "By message: receives assigned pickups" },
};

const ROLE_ORDER = ["donor", "operator", "courier", "recipient"];

export function ProfilePicker() {
  const router = useRouter();
  const [actors, setActors] = useState<ActorOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actorId, setActorId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/session/actors", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => (b?.ok ? setActors(b.data.actors) : setError(b?.error?.message ?? "Profiles unavailable")))
      .catch(() => setError("Profiles unavailable (server unreachable)"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!actorId) {
      setError("Choose a demo profile first.");
      return;
    }
    setError(null);
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  }

  const sorted = actors
    ? [...actors].sort((a, b) => {
        const ra = ROLE_ORDER.indexOf(a.role);
        const rb = ROLE_ORDER.indexOf(b.role);
        return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
      })
    : null;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Choose a demo profile</h2>
        <p className="text-sm text-muted-foreground">Every profile is synthetic. Pick a role to see its side of the flow.</p>
      </div>

      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 text-sm font-medium">Profile (synthetic)</legend>
        {sorted === null && !error && (
          <div role="status" aria-label="Loading profiles" className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        )}
        {sorted?.map((a) => {
          const info = ROLE_INFO[a.role] ?? { icon: UserRound, where: "Synthetic demo profile" };
          const Icon = info.icon;
          const checked = actorId === a.actor_id;
          return (
            <label
              key={a.actor_id}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3 py-2.5 transition-[border-color,box-shadow,background-color] duration-200 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/40",
                checked ? "border-primary bg-secondary/60 shadow-sm" : "border-border hover:border-input hover:bg-muted/40",
              )}
            >
              <input
                type="radio"
                name="actor"
                value={a.actor_id}
                checked={checked}
                onChange={() => setActorId(a.actor_id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {a.display_name} <span className="font-normal text-muted-foreground">— {a.role}</span>
                </span>
                <span className="block text-xs text-muted-foreground">{info.where}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "size-4 shrink-0 rounded-full border-2 transition-colors",
                  checked ? "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--card)]" : "border-input",
                )}
              />
            </label>
          );
        })}
      </fieldset>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium" htmlFor="passcode">
          <KeyRound aria-hidden className="size-4 text-muted-foreground" />
          Demo passcode
        </label>
        <Input
          id="passcode"
          type="password"
          autoComplete="current-password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          required
        />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
        Sign in
        {!busy && <ArrowRight aria-hidden />}
      </Button>

      {signedIn && (
        <div role="status" className="space-y-1 rounded-xl border border-border bg-muted/50 p-3 text-sm">
          <p className="font-medium">Signed in as {signedIn}.</p>
          {HOME_BY_ROLE[signedIn] ? (
            <Link href={HOME_BY_ROLE[signedIn]!.href} className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">
              {HOME_BY_ROLE[signedIn]!.label}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : (
            <p className="text-muted-foreground">
              This role acts by message and has no web page here. Sign in as the operator to watch the simulated phone.
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
