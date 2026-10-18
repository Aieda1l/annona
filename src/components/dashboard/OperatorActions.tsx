"use client";

import { useState } from "react";
import { Ban, CircleSlash, RefreshCw, Undo2 } from "lucide-react";
import type { DonationCard, OperatorAction } from "@/contracts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const LABEL: Record<OperatorAction, string> = {
  reject: "Reject",
  return_to_donor: "Return to donor",
  cancel: "Cancel",
  retry_matching: "Retry matching",
};

const ICON: Record<OperatorAction, typeof Ban> = {
  reject: Ban,
  return_to_donor: Undo2,
  cancel: CircleSlash,
  retry_matching: RefreshCw,
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
        {actions.map((a) => {
          const Icon = ICON[a];
          return (
            <Button
              key={a}
              type="button"
              size="sm"
              variant={a === "reject" ? "destructive" : "outline"}
              data-action={a}
              onClick={() => {
                setPending(a);
                setNote("");
              }}
            >
              <Icon aria-hidden />
              {LABEL[a]}
            </Button>
          );
        })}
      </div>

      {pending && (
        <div className="animate-rise space-y-2 rounded-xl border border-border bg-muted/50 p-3">
          <label className="block text-sm font-medium" htmlFor={`note-${card.id}`}>
            Note{needNote ? " (required)" : " (optional)"}
          </label>
          <Textarea
            id={`note-${card.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={pending === "reject" ? "destructive" : "default"}
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
            >
              Confirm {pending === "return_to_donor" ? "return" : LABEL[pending].toLowerCase()}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPending(null)}>
              Back
            </Button>
          </div>
        </div>
      )}

      {shownError && (
        <p role="alert" className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger">
          {shownError}
        </p>
      )}
    </div>
  );
}
