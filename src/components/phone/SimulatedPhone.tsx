"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardSnapshot, InboundResult } from "@/contracts";
import { ClaimResultView } from "./ClaimResultView";
import { PhoneThread, normalizeMessages, type PhoneMessage } from "./PhoneThread";

const POLL_MS = 2000;
const DISABLED = "Simulated phone disabled: real messaging is active";

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

  const loadThread = useCallback(async () => {
    if (document.hidden || !selected) return;
    try {
      const res = await fetch(`/api/messaging/simulated/thread?identity_id=${encodeURIComponent(selected)}`, {
        cache: "no-store",
      });
      if (res.status === 403) return setForbidden(true);
      const body = await res.json().catch(() => null);
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

  async function send(body: { text: string; fixture_id?: string }) {
    setSendError(null);
    setResult(null);
    try {
      const res = await fetch("/api/messaging/simulated/inbound", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identity_id: selected, ...body }),
      });
      if (res.status === 403) return setForbidden(true);
      if (!res.ok) {
        const f = await failureOf(res);
        return setSendError(`${f.code}: ${f.message}`);
      }
      const parsed = await res.json();
      if (parsed?.ok) {
        setResult(parsed.data);
        void loadThread();
        void loadSnapshot();
      } else setSendError(`${parsed?.error?.code ?? "INTERNAL"}: ${parsed?.error?.message ?? "Request failed."}`);
    } catch {
      setSendError("UNREACHABLE: The server could not be reached.");
    }
  }

  const realMessaging = snapshot ? snapshot.modes.messaging.mode !== "fake" : false;
  const disabled = realMessaging || forbidden;
  const codeUpper = code.trim().toUpperCase();
  const btn =
    "rounded border border-slate-700 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4">
      <h1 className="rounded border-2 border-slate-900 bg-slate-100 px-3 py-2 text-center text-lg font-bold text-slate-900">
        SIMULATED PHONE — not iMessage
      </h1>

      {loadError && (
        <p role="alert" className="rounded border border-amber-700 bg-amber-50 p-2 text-sm text-amber-950">
          Contacts unavailable: {loadError.code}. {loadError.message}
        </p>
      )}

      {disabled ? (
        <p className="rounded border border-slate-500 bg-slate-50 p-3 text-sm text-slate-900">{DISABLED}</p>
      ) : (
        snapshot && (
          <>
            <div>
              <label htmlFor="contact" className="block text-sm font-medium">
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
                className="w-full rounded border border-slate-500 p-2 text-sm"
              >
                {snapshot.identities.map((i) => (
                  <option key={i.identity_id} value={i.identity_id}>
                    {i.actor_display_name} ({i.actor_role}) · {i.handle_masked} · {i.status}
                  </option>
                ))}
              </select>
            </div>

            <PhoneThread messages={messages} />

            <div className="space-y-3 rounded border border-slate-300 bg-white p-3">
              <div className="flex flex-wrap items-end gap-2">
                <button type="button" className={btn} onClick={() => send({ text: "JOIN" })}>
                  JOIN
                </button>
                <button type="button" className={btn} onClick={() => send({ text: "STOP" })}>
                  STOP
                </button>
                <button type="button" className={btn} onClick={() => send({ text: "HELP" })}>
                  HELP
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor="code" className="block text-sm font-medium">
                    Offer code
                  </label>
                  <input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={4}
                    className="w-24 rounded border border-slate-500 p-2 font-mono text-sm uppercase"
                  />
                </div>
                <button type="button" className={btn} disabled={!codeUpper} onClick={() => send({ text: `YES ${codeUpper}` })}>
                  YES
                </button>
                <button type="button" className={btn} disabled={!codeUpper} onClick={() => send({ text: `NO ${codeUpper}` })}>
                  NO
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor="fixture" className="block text-sm font-medium">
                    Fixture photo id
                  </label>
                  <input
                    id="fixture"
                    value={fixtureId}
                    onChange={(e) => setFixtureId(e.target.value)}
                    className="rounded border border-slate-500 p-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  className={btn}
                  disabled={!fixtureId.trim()}
                  onClick={() => send({ text: "", fixture_id: fixtureId.trim() })}
                >
                  Send fixture photo
                </button>
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) void send({ text: text.trim() }).then(() => setText(""));
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
                  className="flex-1 rounded border border-slate-500 p-2 text-sm"
                />
                <button type="submit" className={btn}>
                  Send
                </button>
              </form>
            </div>

            {sendError && (
              <p role="alert" className="rounded border border-rose-700 bg-rose-50 px-2 py-1 text-sm text-rose-950">
                {sendError}
              </p>
            )}
            {result && (
              <section aria-label="Last inbound result" className="space-y-2 text-sm">
                <p>
                  Result: <strong>{result.outcome}</strong> · command <strong>{result.command}</strong>
                </p>
                {result.claim_result && <ClaimResultView result={result.claim_result} />}
                {result.decline_result && (
                  <p className="rounded border-l-4 border-slate-500 bg-slate-50 p-2">
                    Decline: {result.decline_result.code} — {result.decline_result.message_for_actor}
                  </p>
                )}
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}
