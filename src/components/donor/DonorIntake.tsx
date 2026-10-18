"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ClipboardCheck, RotateCcw, Send } from "lucide-react";
import type { DonationCard } from "@/contracts";
import { DraftReview, PhotoUpload } from "@/features/intake/components";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Stepper } from "@/components/ui/stepper";

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
    <PageContainer size={card === null ? "narrow" : "wide"} className="space-y-6">
      <PageHeader
        eyebrow="New donation"
        title="Offer surplus food (web upload)"
        description="Share a photo, then confirm the details from your own records. A person and the prototype rules take it from there."
      />

      <Stepper
        label="Donation steps"
        className="mx-auto w-full max-w-xl"
        steps={[
          { label: "Photo", description: "AI drafts a guess", icon: Camera, state: card === null ? "current" : "complete" },
          { label: "Confirm details", description: "You are the source", icon: ClipboardCheck, state: card === null ? "upcoming" : "current" },
          { label: "Submitted", description: "Rules decide", icon: Send, state: "upcoming" },
        ]}
      />

      <Notice tone="synthetic">
        <strong>Synthetic demo.</strong> You are the source of the facts you enter: Annona records what you confirm and does
        not check it. The AI summary is only a guess to help you fill this in.
      </Notice>
      <p className="text-sm text-muted-foreground">
        This page needs a donor profile.{" "}
        <Link href="/" className="font-semibold text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>{" "}
        first if you have not.
      </p>

      {card === null ? (
        <PhotoUpload onDraft={setCard} />
      ) : (
        <div className="animate-rise space-y-4">
          <DraftReview
            donationId={card.id}
            aiStatus={card.ai_status}
            suggestion={card.ai_suggestion}
            imageUrl={card.image_url}
            onSubmit={submit}
            submitting={submitting}
            error={error}
          />
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={() => {
              setCard(null);
              setError(null);
            }}
          >
            <RotateCcw aria-hidden />
            Start over with another photo
          </Button>
        </div>
      )}
    </PageContainer>
  );
}
