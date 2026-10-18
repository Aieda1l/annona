"use client";

import { useState } from "react";
import type { DonationCard, HandoffStep } from "@/contracts";
import { PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <section aria-label="Simulated handoff" className="space-y-3 rounded-xl border border-dashed border-progress-border bg-progress-subtle/60 p-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-progress">
          <Truck aria-hidden className="size-4" />
          Simulated handoff
        </h3>
        <p className="text-xs text-foreground/80">
          This records a simulated step for the demo. No real food moves and no one is contacted.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => run(step)}
        className="h-auto min-h-10 w-full justify-start py-2 text-left whitespace-normal sm:w-fit"
      >
        {step === "collected" ? <Truck aria-hidden /> : <PackageCheck aria-hidden />}
        {step === "collected"
          ? "Mark collected (simulated)"
          : "Mark delivered (simulated) — recipient accepted after inspection"}
      </Button>
      {result?.ok && (
        <p role="status" className="text-sm text-foreground">
          {result.summary}
        </p>
      )}
      {result && !result.ok && (
        <p role="alert" className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger">
          {result.error}
        </p>
      )}
    </section>
  );
}
