import { MAX_WEB_BYTES } from "../image-validation";

// Client-side downscale for web uploads (CONTRACTS §9.2: <= 1024 px JPEG, <= 1.5 MiB decoded).
// Re-encoding through a canvas also drops EXIF metadata such as GPS location.

export const MAX_SIDE = 1024;
export const MAX_BYTES = MAX_WEB_BYTES;

const QUALITIES = [0.85, 0.7, 0.55, 0.4];
const SHRINK_ROUNDS = 5;
const SHRINK_FACTOR = 0.75;

/** The browser-only parts, injectable so the algorithm is testable without a canvas. */
export type ImageIO = {
  decode(file: Blob): Promise<{ width: number; height: number; source: unknown }>;
  encode(source: unknown, width: number, height: number, quality: number): Promise<Uint8Array>;
};

/** Scale down to fit within `max` on the long side; never upscales and never goes below 1 px. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export const browserIO: ImageIO = {
  async decode(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { width: bitmap.width, height: bitmap.height, source: bitmap };
  },
  async encode(source, width, height, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("The photo could not be converted.");
    return new Uint8Array(await blob.arrayBuffer());
  },
};

/** Lower quality first, then shrink the dimensions, until the JPEG fits the byte limit. */
export async function downscaleToJpeg(
  file: Blob,
  io: ImageIO = browserIO,
): Promise<{ mime: "image/jpeg"; bytes_base64: string }> {
  const decoded = await io.decode(file);
  let { width, height } = fitWithin(decoded.width, decoded.height, MAX_SIDE);
  for (let round = 0; round < SHRINK_ROUNDS; round++) {
    for (const quality of QUALITIES) {
      const bytes = await io.encode(decoded.source, width, height, quality);
      if (bytes.length <= MAX_BYTES) return { mime: "image/jpeg", bytes_base64: toBase64(bytes) };
    }
    ({ width, height } = fitWithin(width * SHRINK_FACTOR, height * SHRINK_FACTOR, MAX_SIDE));
  }
  throw new Error("The photo is still too large after shrinking. Please choose a smaller one.");
}
