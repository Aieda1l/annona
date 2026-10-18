"use client";

import { useId, useState, type ChangeEvent } from "react";
import type { DonationCard } from "@/contracts";
import { Camera, ImageUp, LoaderCircle } from "lucide-react";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { browserIO, downscaleToJpeg, type ImageIO } from "./photo-downscale";

// Web fallback photo upload (Dev 1). Downscales in the browser, then POSTs { image } to the drafts endpoint.
// Dev 4 pages mount this and receive the draft card through onDraft.

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const GENERIC_ERROR = "Something went wrong. Please try again.";
const UPLOADED_BUT_NOT_SHOWN = "Your photo was uploaded, but this page could not show the draft. Reload the page before uploading again.";

export type PhotoUploadProps = {
  onDraft: (card: DonationCard) => void;
  endpoint?: string;
  /** Injectable for tests. */
  io?: ImageIO;
  fetchImpl?: typeof fetch;
};

type ApiResponse = { ok: true; data: DonationCard } | { ok: false; error: { code: string; message: string } };

function messageFor(error: { code: string; message: string }): string {
  if (error.code === "NOT_AUTHORIZED") return "Please sign in as a donor to upload a photo.";
  if (error.code === "VALIDATION_FAILED") return error.message;
  return GENERIC_ERROR;
}

export function PhotoUpload({ onDraft, endpoint = "/api/intake/drafts", io = browserIO, fetchImpl }: PhotoUploadProps) {
  const inputId = useId();
  const [phase, setPhase] = useState<"idle" | "preparing" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = phase !== "idle";

  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("Please choose a JPEG, PNG or WebP photo.");
      input.value = "";
      return;
    }
    try {
      setPhase("preparing");
      const image = await downscaleToJpeg(file, io);
      setPhase("uploading");
      const res = await (fetchImpl ?? fetch)(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const json = (await res.json()) as ApiResponse;
      if (json.ok) {
        // The draft exists now. A parent that throws is not an upload failure, and retrying would make a duplicate.
        try {
          onDraft(json.data);
        } catch {
          setError(UPLOADED_BUT_NOT_SHOWN);
        }
      } else setError(messageFor(json.error));
    } catch (err) {
      // Only our own downscale message is safe to show; anything else (network, parse) stays generic.
      setError(err instanceof Error && /smaller one/.test(err.message) ? err.message : GENERIC_ERROR);
    } finally {
      setPhase("idle");
      input.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The native file input stays the control (camera on phones, keyboard and screen readers everywhere); the
          large label around it is the visible target. */}
      <label
        htmlFor={inputId}
        aria-busy={busy}
        className={cn(
          "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-input bg-card px-6 py-10 text-center transition-colors has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/40 hover:border-primary hover:bg-secondary/40",
          busy && "pointer-events-none opacity-80",
        )}
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-transform group-hover:scale-105">
          {busy ? <LoaderCircle aria-hidden className="size-6 animate-spin" /> : <Camera aria-hidden className="size-6" />}
        </span>
        <span className="space-y-1">
          <span className="block font-heading text-base font-semibold">Choose a photo of the food</span>
          <span className="block text-sm text-muted-foreground">JPEG, PNG or WebP. On a phone you can take one now.</span>
        </span>
        <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs">
          <ImageUp aria-hidden className="size-4" />
          {busy ? (phase === "preparing" ? "Preparing photo…" : "Uploading…") : "Select photo"}
        </span>
        <input
          id={inputId}
          type="file"
          accept={ACCEPTED.join(",")}
          disabled={busy}
          onChange={onChange}
          className="sr-only"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Demo tip: photograph the food only, with no people, faces, brand labels or addresses in the frame.
      </p>
      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm font-medium">
          <LoaderCircle aria-hidden className="size-4 animate-spin text-primary" />
          {phase === "preparing" ? "Preparing photo…" : "Uploading…"}
        </p>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
