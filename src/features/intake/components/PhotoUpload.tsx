"use client";

import { useId, useState, type ChangeEvent } from "react";
import type { DonationCard } from "@/contracts";
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
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        Choose a photo of the food
      </label>
      <input
        id={inputId}
        type="file"
        accept={ACCEPTED.join(",")}
        disabled={busy}
        onChange={onChange}
        className="text-sm file:mr-3 file:rounded-lg file:border file:bg-muted file:px-3 file:py-1.5"
      />
      <p className="text-xs text-muted-foreground">
        Demo tip: photograph the food only, with no people, faces, brand labels or addresses in the frame.
      </p>
      {busy && (
        <p role="status" className="text-sm">
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
