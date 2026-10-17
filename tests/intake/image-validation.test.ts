import { describe, expect, it } from "vitest";
import { HEIC_ACCEPTED, MAX_MESSAGING_BYTES, MAX_WEB_BYTES, validateImage } from "@/features/intake/image-validation";

// T-IN-09: image validation runs before any store or AI call (CONTRACTS §9.2 createDraftFromImage).
const b64 = (bytes: number) => Buffer.alloc(bytes, 1).toString("base64");
const img = (mime: string, bytes: number) => ({ mime, bytes_base64: b64(bytes) });

function expectInvalid(r: ReturnType<typeof validateImage>, field?: string) {
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.error.code).toBe("VALIDATION_FAILED");
  if (field) expect(r.error.details).toMatchObject({ field });
}

describe("limits and defaults", () => {
  it("HEIC_ACCEPTED defaults to false (flip only in a reviewed PR citing SP-14)", () => {
    expect(HEIC_ACCEPTED).toBe(false);
  });
  it("uses 1.5 MiB for web/fixture and 5 MiB for messaging", () => {
    expect(MAX_WEB_BYTES).toBe(1.5 * 1024 * 1024);
    expect(MAX_MESSAGING_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe("MIME type", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s on every source", (mime) => {
    for (const source of ["web_upload", "fixture", "messaging"] as const) {
      expect(validateImage(img(mime, 100), source).ok).toBe(true);
    }
  });

  it.each(["text/plain", "application/pdf", "image/gif", "image/svg+xml", "image/jpg", "", "jpeg"])(
    "rejects non-accepted MIME %j",
    (mime) => expectInvalid(validateImage(img(mime, 100), "web_upload"), "image.mime"),
  );

  it("normalizes case, whitespace and parameters", () => {
    const r = validateImage(img(" Image/JPEG ; charset=binary", 100), "web_upload");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.mime).toBe("image/jpeg");
  });
});

describe("HEIC / HEIF", () => {
  it.each(["image/heic", "image/heif"])("rejects %s while HEIC_ACCEPTED is false, even on messaging", (mime) => {
    expectInvalid(validateImage(img(mime, 100), "messaging"), "image.mime");
  });

  it.each(["image/heic", "image/heif"])("with HEIC accepted, %s is allowed on messaging only", (mime) => {
    const on = { heicAccepted: true };
    expect(validateImage(img(mime, 100), "messaging", on).ok).toBe(true);
    expectInvalid(validateImage(img(mime, 100), "web_upload", on), "image.mime");
    expectInvalid(validateImage(img(mime, 100), "fixture", on), "image.mime");
  });

  it("with HEIC accepted, a 1.4 MB Photon-sized HEIC passes on messaging and keeps its original MIME", () => {
    const r = validateImage(img("image/heic", 1_456_484), "messaging", { heicAccepted: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ mime: "image/heic", decoded_bytes: 1_456_484 });
  });
});

describe("size limits (decoded bytes)", () => {
  it.each(["web_upload", "fixture"] as const)("%s: accepts exactly 1.5 MiB, rejects one byte more", (source) => {
    expect(validateImage(img("image/jpeg", MAX_WEB_BYTES), source).ok).toBe(true);
    expectInvalid(validateImage(img("image/jpeg", MAX_WEB_BYTES + 1), source), "image.bytes_base64");
  });

  it("rejects a 2 MB JPEG on web_upload", () => {
    expectInvalid(validateImage(img("image/jpeg", 2 * 1024 * 1024), "web_upload"), "image.bytes_base64");
  });

  it("messaging: a 3 MB JPEG is accepted; exactly 5 MiB is accepted; one byte more is rejected", () => {
    expect(validateImage(img("image/jpeg", 3 * 1024 * 1024), "messaging").ok).toBe(true);
    expect(validateImage(img("image/jpeg", MAX_MESSAGING_BYTES), "messaging").ok).toBe(true);
    expectInvalid(validateImage(img("image/jpeg", MAX_MESSAGING_BYTES + 1), "messaging"), "image.bytes_base64");
  });

  it("rejects a 6 MB JPEG on messaging", () => {
    expectInvalid(validateImage(img("image/jpeg", 6 * 1024 * 1024), "messaging"), "image.bytes_base64");
  });

  it.each([1, 2, 3, 4, 5])("reports the exact decoded size for a %d-byte payload (padding handled)", (n) => {
    const r = validateImage(img("image/png", n), "web_upload");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.decoded_bytes).toBe(n);
  });
});

describe("base64 payload", () => {
  it.each([
    ["empty", ""],
    ["not base64", "***not base64***"],
    ["bad length", "abcde"],
    ["data URL prefix", "data:image/jpeg;base64,AAAA"],
    ["whitespace inside", "AAAA AAAA"],
    ["misplaced padding", "AA=A"],
  ])("rejects %s", (_label, bytes_base64) => {
    expectInvalid(validateImage({ mime: "image/jpeg", bytes_base64 }, "web_upload"), "image.bytes_base64");
  });

  it("rejects non-string input without throwing", () => {
    expectInvalid(validateImage({ mime: "image/jpeg", bytes_base64: 42 as unknown as string }, "web_upload"));
    expectInvalid(validateImage(null as unknown as { mime: string; bytes_base64: string }, "web_upload"));
  });

  it("does not echo payload content in errors", () => {
    const r = validateImage({ mime: "text/plain", bytes_base64: "c2VjcmV0LXBheWxvYWQ=" }, "web_upload");
    expect(JSON.stringify(r)).not.toContain("c2VjcmV0");
  });
});
