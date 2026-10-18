"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { VerificationLinkView } from "@/contracts";
import { ReasonList } from "@/components/dashboard/ReasonList";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DraftReview } from "./DraftReview";

// The donor's one-time checklist at /v#<token> (CONTRACTS section 8.4, D-031). The token lives in the URL fragment,
// which browsers never send to a server. It is read here and sent only in POST bodies to /api/verify/*; it is never
// put in a URL or query string and never rendered. Opening never consumes the link; a successful submit does.
// The form is the same DraftReview and VerificationForm as the web path (every fact starts empty or `unknown`).

const UNIFORM_EXPIRED = "This link has expired or was already used. Text the photo again for a new link.";
const SERVER_TROUBLE = "Something went wrong. Please try again.";

type ApiResponse =
  | { ok: true; data: VerificationLinkView }
  | { ok: false; error: { code: string; message: string } };

type State =
  | { kind: "loading" }
  | { kind: "expired" }
  | { kind: "error" }
  | { kind: "ready"; view: VerificationLinkView }
  | { kind: "done"; view: VerificationLinkView };

export type LinkVerificationProps = {
  /** The URL fragment, with or without the leading `#`. Defaults to `window.location.hash`. For tests. */
  hash?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
};

function tokenFrom(hash: string): string {
  return hash.replace(/^#/, "").trim();
}

// The fragment is only known in the browser, so the server snapshot is null (shown as "loading").
const subscribeToHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const clientHash = () => window.location.hash;
const serverHash = () => null;

function post(f: typeof fetch, name: "view" | "image" | "submit", body: Record<string, unknown>): Promise<Response> {
  return f(`/api/verify/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
}

export function LinkVerification({ hash, fetchImpl }: LinkVerificationProps) {
  const fragment = useSyncExternalStore(subscribeToHash, clientHash, serverHash);
  const raw = hash ?? fragment; // null: not known yet (server render)
  const fragmentToken = raw === null ? null : tokenFrom(raw);
  const [swapped, setSwapped] = useState<string | null>(null); // the fresh link after a needs_review submit
  const token = swapped ?? fragmentToken ?? "";

  const [state, setState] = useState<State>({ kind: "loading" });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fragmentToken) return;
    const send: typeof fetch = fetchImpl ?? ((input, init) => fetch(input, init));
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const res = await post(send, "view", { token: fragmentToken });
        if (cancelled) return;
        if (res.status === 403) return setState({ kind: "expired" });
        const json = (await res.json()) as ApiResponse;
        if (!json.ok) return setState({ kind: json.error.code === "NOT_AUTHORIZED" ? "expired" : "error" });
        setState({ kind: "ready", view: json.data });

        // The photo is a convenience: failing to load it never blocks the form.
        try {
          const img = await post(send, "image", { token: fragmentToken });
          if (!cancelled && img.ok) {
            objectUrl = URL.createObjectURL(await img.blob());
            setImageUrl(objectUrl);
          }
        } catch {
          /* no photo */
        }
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fragmentToken, fetchImpl]);

  async function submit(facts: unknown) {
    setSubmitting(true);
    setError(null);
    try {
      const send: typeof fetch = fetchImpl ?? ((input, init) => fetch(input, init));
      const res = await post(send, "submit", { token, facts });
      if (res.status === 403) return setState({ kind: "expired" });
      const json = (await res.json()) as ApiResponse;
      if (!json.ok) {
        if (json.error.code === "NOT_AUTHORIZED") return setState({ kind: "expired" });
        return setError(json.error.code === "VALIDATION_FAILED" ? json.error.message : SERVER_TROUBLE);
      }
      const next = json.data;
      // needs_review comes with a fresh link: swap to it so the donor can fix the listed items on this page.
      if (next.status === "needs_review" && next.resubmit_token) {
        setSwapped(next.resubmit_token);
        setState({ kind: "ready", view: next });
      } else {
        setState({ kind: "done", view: next });
      }
    } catch {
      setError(SERVER_TROUBLE);
    } finally {
      setSubmitting(false);
    }
  }

  if (fragmentToken === null) return <Loading />;
  if (fragmentToken === "") {
    return (
      <Alert>
        <AlertDescription>
          This page needs the link we texted you. Text the photo again for a new link.
        </AlertDescription>
      </Alert>
    );
  }
  if (state.kind === "loading") return <Loading />;
  if (state.kind === "expired") {
    return (
      <Alert>
        <AlertDescription>{UNIFORM_EXPIRED}</AlertDescription>
      </Alert>
    );
  }
  if (state.kind === "error") {
    return (
      <Alert>
        <AlertDescription>Something went wrong loading this page. Please reload, or text the photo again for a new link.</AlertDescription>
      </Alert>
    );
  }

  const { view } = state;
  const reasons = view.decision?.reasons ?? [];

  if (state.kind === "done") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-xs" data-testid="link-outcome">
        {view.status === "eligible" ? (
          <p className="flex items-start gap-3 text-base">
            <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
            Thank you. Your details are recorded, and the team will offer this donation to a courier.
          </p>
        ) : (
          <p className="text-base">
            We can&apos;t offer this donation as submitted. Here is why. You can text the photo again to start a new
            draft.
          </p>
        )}
        <ReasonList reasons={reasons} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {view.status === "needs_review" && (
        <div className="flex flex-col gap-2 rounded-xl border border-review-border bg-review-subtle/60 p-4" data-testid="link-review">
          <p className="text-sm font-semibold text-review">A few items need your attention. Please update your answers below.</p>
          <ReasonList reasons={reasons} />
        </div>
      )}
      <DraftReview
        donationId={view.donation_id}
        aiStatus={view.ai_status}
        suggestion={view.ai_suggestion}
        imageUrl={imageUrl}
        onSubmit={submit}
        submitting={submitting}
        error={error}
      />
    </div>
  );
}

function Loading() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle aria-hidden className="size-4 animate-spin text-primary" />
      Loading your draft…
    </p>
  );
}
