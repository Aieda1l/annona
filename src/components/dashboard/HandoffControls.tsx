"use client";

import { useState } from "react";
import type { DonationCard, HandoffStep } from "@/contracts";
import type { Outcome } from "./api";

/**
 * Which simulated handoff step to OFFER (S-09 claimed -> collected, S-10 collected -> delivered). Display only:
 * the server re-checks the cutoff, discard-by and donor approval, and a refusal is shown verbatim.
 */
export function nextHandoffStep(card: DonationCard): HandoffStep | null {
  if (card.status === "claimed") return "collected";
  if (card.status === "collected") return "delivered";
  return null;
}

export function HandoffControls({
  card,
  onHandoff,
}: {
  card: DonationCard;
  onHandoff: (step: HandoffStep) => Promise<Outcome>;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);
  const step = nextHandoffStep(card);
  if (!step) return null;

  async function run(s: HandoffStep) {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await onHandoff(s));
    } catch {
      setResult({ ok: false, error: "UNREACHABLE: The server could not be reached." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Simulated handoff" className="space-y-2 rounded border border-slate-400 bg-slate-50 p-3">
      <h3 className="text-sm font-semibold text-slate-900">Simulated handoff</h3>
      <p className="text-xs text-slate-800">
        This records a simulated step for the demo. No real food moves and no one is contacted.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => run(step)}
        className="rounded border border-slate-700 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        {step === "collected"
          ? "Mark collected (simulated)"
          : "Mark delivered (simulated) — recipient accepted after inspection"}
      </button>
      {result?.ok && (
        <p role="status" className="text-sm text-slate-900">
          {result.summary}
        </p>
      )}
      {result && !result.ok && (
        <p role="alert" className="rounded border border-rose-700 bg-rose-50 px-2 py-1 text-sm text-rose-950">
          {result.error}
        </p>
      )}
    </section>
  );
}
