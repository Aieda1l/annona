"use client";

import { useState } from "react";

/**
 * Shows the donor's photo. iPhone photos arrive from messaging as HEIC (SP-14) and are stored unchanged, and most
 * non-Safari browsers cannot decode HEIC. Instead of a broken-image icon, say so plainly and offer the file itself.
 * The image is served by GET /api/images/:id with its own authorization, so next/image (which would proxy it) is not used.
 */
export function PhotoPreview({ src }: { src: string }) {
  // Keyed by src: a different photo gets a fresh chance to load.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src) {
    return (
      <div data-testid="photo-fallback" className="space-y-1 rounded-lg border border-dashed border-input bg-muted/50 p-3 text-sm text-foreground">
        <p>
          The photo can&apos;t be previewed in this browser. Photos taken on an iPhone are often saved as HEIC, which many browsers
          cannot display.
        </p>
        <a href={src} target="_blank" rel="noopener noreferrer" className="font-medium underline">
          Open the photo file
        </a>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Donor photo (synthetic)"
      onError={() => setFailedSrc(src)}
      className="max-h-80 w-full rounded-lg bg-muted object-contain ring-1 ring-border"
    />
  );
}
