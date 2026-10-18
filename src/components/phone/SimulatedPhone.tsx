"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardSnapshot, InboundResult } from "@/contracts";
import { FlaskConical, ImageIcon, Reply, SendHorizontal } from "lucide-react";
import { initials } from "@/components/dashboard/IdentityList";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { ClaimResultView } from "./ClaimResultView";
import { PhoneThread, normalizeMessages, type PhoneMessage } from "./PhoneThread";

const POLL_MS = 2000;
const DISABLED = "Simulated phone disabled: real messaging is active";
const chip =
  "h-9 shrink-0 rounded-full border border-input bg-background px-3.5 font-mono text-xs font-semibold tracking-wider transition-colors hover:border-primary hover:bg-secondary disabled:opacity-50";

type Failure = { code: string; message: string };

async function failureOf(res: Response): Promise<Failure> {
  const body = await res.json().catch(() => null);
  if (body?.ok === false && body.error) return { code: body.error.code, message: body.error.message };
  return { code: `HTTP_${res.status}`, message: "Unexpected response from the server." };
}

/**
 * SIMULATED PHONE. Posts { identity_id, text, fixture_id? } to the same inbound handler a real Photon message
 * reaches. It is not Photon and not iMessage, and it is only usable when the server runs fake messaging.
 */
export function SimulatedPhone() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loadError, setLoadError] = useState<Failure | null>(null);
  const [identityId, setIdentityId] = useState("");
  const [messages, setMessages] = useState<PhoneMessage[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [result, setResult] = useState<InboundResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [fixtureId, setFixtureId] = useState("");
  const [text, setText] = useState("");

  const loadSnapshot = useCallback(async () => {
    if (document.hidden) return;
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) return setLoadError(await failureOf(res));
      const body = await res.json();
      if (body?.ok) {
        setSnapshot(body.data);
        setLoadError(null);
      } else setLoadError({ code: body?.error?.code ?? "INTERNAL", message: body?.error?.message ?? "Request failed." });
    } catch {
      setLoadError({ code: "UNREACHABLE", message: "The server could not be reached." });
    }
  }, []);

  const selected = identityId || snapshot?.identities[0]?.identity_id || "";
  // Guards against a slow thread response for a previously selected contact overwriting the current thread.
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const loadThread = useCallback(async () => {
    if (document.hidden || !selected) return;
    try {
      const res = await fetch(`/api/messaging/simulated/thread?identity_id=${encodeURIComponent(selected)}`, {
        cache: "no-store",
      });
      if (selectedRef.current !== selected) return;
      if (res.status === 403) return setForbidden(true);
      const body = await res.json().catch(() => null);
      if (selectedRef.current !== selected) return;
      if (body?.ok) {
        setForbidden(false);
        setMessages(normalizeMessages(body.data?.messages));
      }
    } catch {
      /* keep the last thread; the dashboard load reports connectivity */
    }
  }, [selected]);

  useEffect(() => {
    const first = setTimeout(() => void loadSnapshot(), 0);
    const t = setInterval(() => void loadSnapshot(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadSnapshot]);

  useEffect(() => {
    const first = setTimeout(() => void loadThread(), 0);
    const t = setInterval(() => void loadThread(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadThread]);

  async function send(body: { text: string; fixture_id?: string }): Promise<boolean> {
    setSendError(null);
    setResult(null);
    try {
      const res = await fetch("/api/messaging/simulated/inbound", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identity_id: selected, ...body }),
      });
      if (res.status === 403) {
        setForbidden(true);
        return false;
      }
      if (!res.ok) {
        const f = await failureOf(res);
        setSendError(`${f.code}: ${f.message}`);
        return false;
      }
      const parsed = await res.json();
      if (parsed?.ok) {
        setResult(parsed.data);
        void loadThread();
        void loadSnapshot();
        return true;
      }
      setSendError(`${parsed?.error?.code ?? "INTERNAL"}: ${parsed?.error?.message ?? "Request failed."}`);
    } catch {
      setSendError("UNREACHABLE: The server could not be reached.");
    }
    return false;
  }

  const realMessaging = snapshot ? snapshot.modes.messaging.mode !== "fake" : false;
  const disabled = realMessaging || forbidden;
  const codeUpper = code.trim().toUpperCase();
  const contact = snapshot?.identities.find((i) => i.identity_id === selected);

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        eyebrow="Demo tools"
        title="Simulated phone"
        description="Plays a contact's side of the conversation through the same inbound handler a real Photon message reaches. Nothing here is sent over iMessage."
      />

      {loadError && (
        <Notice role="alert" tone="warning">
          Contacts unavailable: {loadError.code}. {loadError.message}
        </Notice>
      )}

      {disabled ? (
        <Notice tone="neutral">{DISABLED}</Notice>
      ) : (
        snapshot && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            {/* The phone */}
            <section
              aria-label="Simulated phone"
              className="mx-auto flex h-[min(44rem,calc(100dvh-12rem))] min-h-[30rem] w-full max-w-[26rem] flex-col overflow-hidden rounded-[2rem] border-[6px] border-foreground/85 bg-card shadow-lg"
            >
              <div className="flex items-center justify-center gap-2 bg-foreground/85 px-3 pb-1.5 text-[11px] font-bold tracking-wider text-background uppercase">
                <FlaskConical aria-hidden className="size-3.5" />
                <span>SIMULATED PHONE — not iMessage</span>
              </div>
              <div className="flex items-center gap-3 border-b border-border bg-background/80 px-3 py-2.5">
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-heading text-sm font-semibold text-secondary-foreground"
                >
                  {contact ? initials(contact.actor_display_name) : "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <label htmlFor="contact" className="block text-[11px] font-medium text-muted-foreground">
                    Simulated contact
                  </label>
                  <select
                    id="contact"
                    value={selected}
                    onChange={(e) => {
                      setIdentityId(e.target.value);
                      setMessages([]);
                      setResult(null);
                    }}
                    className="-ml-1 h-8 w-full truncate rounded-md bg-transparent px-1 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {snapshot.identities.map((i) => (
                      <option key={i.identity_id} value={i.identity_id}>
                        {i.actor_display_name} ({i.actor_role}) · {i.handle_masked} · {i.status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-[linear-gradient(to_bottom,var(--background),var(--card))] px-3 py-4">
                <PhoneThread messages={messages} />
              </div>

              <div className="space-y-2 border-t border-border bg-card px-3 py-2.5">
                <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Quick replies">
                  <button type="button" className={chip} onClick={() => send({ text: "JOIN" })}>
                    JOIN
                  </button>
                  <button type="button" className={chip} onClick={() => send({ text: "STOP" })}>
                    STOP
                  </button>
                  <button type="button" className={chip} onClick={() => send({ text: "HELP" })}>
                    HELP
                  </button>
                </div>
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) void send({ text: text.trim() }).then((ok) => ok && setText(""));
                  }}
                >
                  <label htmlFor="free" className="sr-only">
                    Message text
                  </label>
                  <input
                    id="free"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message"
                    className="h-11 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 sm:text-sm"
                  />
                  <button
                    type="submit"
                    aria-label="Send"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs transition-colors hover:bg-forest"
                  >
                    <SendHorizontal aria-hidden className="size-5" />
                  </button>
                </form>
              </div>
            </section>

            {/* Tools beside the phone */}
            <div className="space-y-4">
              <section aria-label="Answer an offer" className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-xs">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Reply aria-hidden className="size-4 text-muted-foreground" />
                  Answer an offer
                </h2>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <label htmlFor="code" className="block text-sm font-medium">
                      Offer code
                    </label>
                    <input
                      id="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      maxLength={4}
                      placeholder="K7M3"
                      className="h-10 w-28 rounded-lg border border-input bg-card px-3 font-mono text-base tracking-widest uppercase shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
                    />
                  </div>
                  <Button type="button" disabled={!codeUpper} onClick={() => send({ text: `YES ${codeUpper}` })}>
                    YES
                  </Button>
                  <Button type="button" variant="outline" disabled={!codeUpper} onClick={() => send({ text: `NO ${codeUpper}` })}>
                    NO
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Sends &ldquo;YES CODE&rdquo; or &ldquo;NO CODE&rdquo; as this contact. The server decides who wins.</p>
              </section>

              <section aria-label="Send a fixture photo" className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-xs">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <ImageIcon aria-hidden className="size-4 text-muted-foreground" />
                  Send a fixture photo
                </h2>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <label htmlFor="fixture" className="block text-sm font-medium">
                      Fixture photo id
                    </label>
                    <input
                      id="fixture"
                      value={fixtureId}
                      onChange={(e) => setFixtureId(e.target.value)}
                      placeholder="pasta-tray"
                      className="h-10 w-full rounded-lg border border-input bg-card px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 sm:text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!fixtureId.trim()}
                    onClick={() => send({ text: "", fixture_id: fixtureId.trim() })}
                  >
                    Send fixture photo
                  </Button>
                </div>
              </section>

              {sendError && (
                <p role="alert" className="rounded-xl border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger">
                  {sendError}
                </p>
              )}
              {result && (
                <section aria-label="Last inbound result" className="animate-rise space-y-2 rounded-xl border border-border bg-card p-4 text-sm shadow-xs">
                  <p className="text-muted-foreground">
                    Result: <strong className="text-foreground">{result.outcome}</strong> · command{" "}
                    <strong className="text-foreground">{result.command}</strong>
                  </p>
                  {result.claim_result && <ClaimResultView result={result.claim_result} />}
                  {result.decline_result && (
                    <p className="rounded-lg border border-neutral-border bg-neutral-subtle p-2.5 text-neutral">
                      Decline: {result.decline_result.code} — {result.decline_result.message_for_actor}
                    </p>
                  )}
                </section>
              )}
            </div>
          </div>
        )
      )}
    </PageContainer>
  );
}
