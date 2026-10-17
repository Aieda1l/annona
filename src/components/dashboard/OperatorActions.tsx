"use client";

import { useState } from "react";
import type { DonationCard, OperatorAction } from "@/contracts";

const LABEL: Record<OperatorAction, string> = {
  reject: "Reject",
  return_to_donor: "Return to donor",
  cancel: "Cancel",
  retry_matching: "Retry matching",
};

/**
 * Which controls to OFFER (CONTRACTS §4 S-11..S-14, S-17). Display only: the server re-checks every
 * transition and its refusal is rendered verbatim. There is deliberately no dispatch/approve control here.
 */
export function availableActions(card: DonationCard): OperatorAction[] {
  const pickedUp = card.handoff.collected_at !== null;
  const afterPickupOptOut = card.decision?.reasons.some((r) => r.code === "COURIER_OPTED_OUT_AFTER_PICKUP") ?? false;
  switch (card.status) {
    case "needs_review":
      return pickedUp || afterPickupOptOut ? ["reject", "cancel"] : ["reject", "return_to_donor", "cancel"];
    case "unmatched":
      return ["retry_matching", "cancel"];
    case "draft":
    case "eligible":
    case "offered":
    case "claimed":
    case "collected":
      return ["cancel"];
    default:
      return [];
  }
}

function noteRequired(card: DonationCard, action: OperatorAction): boolean {
  if (action === "reject") return true;
  if (action !== "cancel") return false;
  return (
    card.status === "claimed" ||
    card.status === "collected" ||
    (card.status === "needs_review" && card.handoff.collected_at !== null)
  );
}

export function OperatorActions({
  card,
  onAction,
  error,
  busy = false,
}: {
  card: DonationCard;
  onAction: (action: OperatorAction, note: string) => void | Promise<void>;
  error?: string | null;
  busy?: boolean;
}) {
  const [pending, setPending] = useState<OperatorAction | null>(null);
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = error ?? localError;
  const actions = availableActions(card);
  if (actions.length === 0 && !shownError) return null;
  const needNote = pending ? noteRequired(card, pending) : false;
  const canConfirm = !busy && (!needNote || note.trim().length > 0);

  return (
    <div
      data-testid="operator-actions"
      data-tone={card.status === "unmatched" ? "neutral" : undefined}
      className="space-y-2"
    >
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a}
            type="button"
            data-action={a}
            onClick={() => {
              setPending(a);
              setNote("");
            }}
            className="rounded border border-slate-700 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {LABEL[a]}
          </button>
        ))}
      </div>

      {pending && (
        <div className="space-y-2 rounded border border-slate-300 bg-slate-50 p-3">
          <label className="block text-sm font-medium" htmlFor={`note-${card.id}`}>
            Note{needNote ? " (required)" : " (optional)"}
          </label>
          <textarea
            id={`note-${card.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded border border-slate-500 p-2 text-sm"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canConfirm}
              onClick={async () => {
                setLocalError(null);
                try {
                  await onAction(pending, note.trim());
                  setPending(null);
                } catch (e) {
                  setLocalError(e instanceof Error ? e.message : "Action failed");
                }
              }}
              className="rounded border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Confirm {pending === "return_to_donor" ? "return" : LABEL[pending].toLowerCase()}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded border border-slate-500 px-3 py-1.5 text-sm"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {shownError && (
        <p role="alert" className="rounded border border-rose-700 bg-rose-50 px-2 py-1 text-sm text-rose-950">
          {shownError}
        </p>
      )}
    </div>
  );
}
