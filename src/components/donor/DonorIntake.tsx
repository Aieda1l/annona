"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DonationCard } from "@/contracts";
import { DraftReview, PhotoUpload } from "@/features/intake/components";

/**
 * Web upload fallback for donors (same draft, checklist and gate as the messaging path). The donor uploads a
 * photo, reviews the AI's unverified guess beside their own fields, and submits the facts. This page never triggers
 * dispatch: an eligible donation waits for the next scheduler tick (D-021). The server decides every outcome.
 */
export function DonorIntake() {
  const router = useRouter();
  const [card, setCard] = useState<DonationCard | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(raw: unknown) {
    if (submitting || !card) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/donations/${card.id}/verification`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(raw),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(
          body?.ok === false && body.error
            ? `${body.error.code}: ${body.error.message}`
            : `HTTP_${res.status}: Unexpected response from the server.`,
        );
        return;
      }
      router.push(`/donor/donations/${card.id}`);
    } catch {
      setError("UNREACHABLE: The server could not be reached. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-slate-900">Offer surplus food (web upload)</h1>
      <p className="rounded border border-slate-500 bg-slate-50 p-3 text-sm text-slate-900">
        <strong>Synthetic demo.</strong> You are the source of the facts you enter: Annona records what you confirm and
        does not check it. The AI summary is only a guess to help you fill this in.
      </p>
      <p className="text-sm text-slate-800">
        This page needs a donor profile.{" "}
        <Link href="/" className="font-medium underline">
          Sign in
        </Link>{" "}
        first if you have not.
      </p>

      {card === null ? (
        <PhotoUpload onDraft={setCard} />
      ) : (
        <>
          <DraftReview
            donationId={card.id}
            aiStatus={card.ai_status}
            suggestion={card.ai_suggestion}
            imageUrl={card.image_url}
            onSubmit={submit}
            submitting={submitting}
            error={error}
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setCard(null);
              setError(null);
            }}
            className="rounded border border-slate-500 px-3 py-1.5 text-sm"
          >
            Start over with another photo
          </button>
        </>
      )}
    </main>
  );
}
