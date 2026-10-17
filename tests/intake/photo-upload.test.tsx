import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eligibleCard } from "@/contracts";
import { PhotoUpload } from "@/features/intake/components";
import { downscaleToJpeg, fitWithin, MAX_BYTES, MAX_SIDE, type ImageIO } from "@/features/intake/components/photo-downscale";

afterEach(cleanup);

describe("fitWithin", () => {
  it.each([
    [4000, 3000, { width: 1024, height: 768 }],
    [3000, 4000, { width: 768, height: 1024 }],
    [1024, 1024, { width: 1024, height: 1024 }],
    [800, 600, { width: 800, height: 600 }], // never upscaled
    [10000, 10, { width: 1024, height: 1 }], // never below 1 px
  ])("%i x %i -> %j", (w, h, expected) => {
    expect(fitWithin(w, h, MAX_SIDE)).toEqual(expected);
  });
});

function fakeIO(sizeFor: (q: number, w: number) => number, dims = { width: 4000, height: 3000 }) {
  const encode = vi.fn(async (_src: unknown, _w: number, _h: number, quality: number) => new Uint8Array(sizeFor(quality, _w)).fill(7));
  const io: ImageIO = { decode: async () => ({ ...dims, source: "bitmap" }), encode };
  return { io, encode };
}

describe("downscaleToJpeg", () => {
  it("scales to 1024 px and returns base64 JPEG when the first quality fits", async () => {
    const { io, encode } = fakeIO(() => 1000);
    const r = await downscaleToJpeg(new Blob(["x"]), io);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode.mock.calls[0]!.slice(1, 3)).toEqual([1024, 768]);
    expect(r.mime).toBe("image/jpeg");
    expect(Buffer.from(r.bytes_base64, "base64")).toHaveLength(1000);
  });

  it("lowers quality until the result is within the byte limit", async () => {
    const { io, encode } = fakeIO((q) => (q > 0.6 ? MAX_BYTES + 1 : 1000));
    const r = await downscaleToJpeg(new Blob(["x"]), io);
    expect(encode.mock.calls.length).toBeGreaterThan(1);
    expect(Buffer.from(r.bytes_base64, "base64").length).toBeLessThanOrEqual(MAX_BYTES);
  });

  it("shrinks the dimensions when quality alone is not enough", async () => {
    const { io, encode } = fakeIO((_q, w) => (w > 600 ? MAX_BYTES + 1 : 1000));
    await downscaleToJpeg(new Blob(["x"]), io);
    const widths = encode.mock.calls.map((c) => c[1]);
    expect(Math.min(...widths)).toBeLessThanOrEqual(600);
  });

  it("throws when it can never fit", async () => {
    const { io } = fakeIO(() => MAX_BYTES + 1);
    await expect(downscaleToJpeg(new Blob(["x"]), io)).rejects.toThrow(/too large/i);
  });

  it("propagates a decode failure", async () => {
    const io: ImageIO = { decode: async () => Promise.reject(new Error("bad image")), encode: vi.fn() };
    await expect(downscaleToJpeg(new Blob(["x"]), io)).rejects.toThrow("bad image");
  });
});

function setup(overrides: Partial<React.ComponentProps<typeof PhotoUpload>> = {}) {
  const onDraft = vi.fn();
  const { io } = fakeIO(() => 1234);
  const fetchImpl = vi.fn(async () => Response.json({ ok: true, data: eligibleCard }));
  render(<PhotoUpload onDraft={onDraft} io={io} fetchImpl={fetchImpl as unknown as typeof fetch} {...overrides} />);
  const input = screen.getByLabelText(/choose a photo/i) as HTMLInputElement;
  const pick = (file: File) => fireEvent.change(input, { target: { files: [file] } });
  return { onDraft, fetchImpl, input, pick };
}
const jpeg = () => new File(["pixels"], "lunch.jpg", { type: "image/jpeg" });

describe("PhotoUpload", () => {
  it("only offers JPEG, PNG and WebP", () => {
    const { input } = setup();
    expect(input.accept).toBe("image/jpeg,image/png,image/webp");
  });

  it("downscales, posts { image } to the drafts endpoint and reports the draft", async () => {
    const { pick, fetchImpl, onDraft } = setup();
    pick(jpeg());
    await waitFor(() => expect(onDraft).toHaveBeenCalledWith(eligibleCard));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/intake/drafts");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body)).toEqual(["image"]);
    expect(body.image.mime).toBe("image/jpeg");
    expect(Buffer.from(body.image.bytes_base64, "base64")).toHaveLength(1234);
  });

  it("rejects a non-image before any network call", async () => {
    const { pick, fetchImpl, onDraft } = setup();
    pick(new File(["hi"], "notes.txt", { type: "text/plain" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/jpeg, png or webp/i);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(onDraft).not.toHaveBeenCalled();
  });

  it("shows the server's message for VALIDATION_FAILED", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Image is too large", retryable: false } }, { status: 400 }),
    );
    const { pick, onDraft } = setup({ fetchImpl: fetchImpl as unknown as typeof fetch });
    pick(jpeg());
    expect(await screen.findByRole("alert")).toHaveTextContent("Image is too large");
    expect(onDraft).not.toHaveBeenCalled();
  });

  it("asks for a donor sign-in on NOT_AUTHORIZED", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ ok: false, error: { code: "NOT_AUTHORIZED", message: "Not authorized.", retryable: false } }, { status: 403 }),
    );
    const { pick } = setup({ fetchImpl: fetchImpl as unknown as typeof fetch });
    pick(jpeg());
    expect(await screen.findByRole("alert")).toHaveTextContent(/sign in as a donor/i);
  });

  it("shows a generic error on a network failure and lets the donor retry", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json({ ok: true, data: eligibleCard }));
    const { pick, onDraft } = setup({ fetchImpl: fetchImpl as unknown as typeof fetch });
    pick(jpeg());
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/offline/);
    pick(jpeg());
    await waitFor(() => expect(onDraft).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows progress and disables the input while working", async () => {
    let release!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((res) => (release = res)));
    const { pick, input } = setup({ fetchImpl: fetchImpl as unknown as typeof fetch });
    pick(jpeg());
    expect(await screen.findByRole("status")).toHaveTextContent(/uploading|preparing/i);
    expect(input).toBeDisabled();
    release(Response.json({ ok: true, data: eligibleCard }));
    await waitFor(() => expect(input).toBeEnabled());
  });

  it("explains the photo handling in plain words, without forbidden wording", () => {
    const { input } = setup();
    expect(input).toBeInTheDocument();
    expect(document.body.textContent ?? "").toMatch(/synthetic|sample|no people|no faces/i);
    expect(document.body.textContent ?? "").not.toMatch(/\b(safe|safely|allergen[- ]free|certified|compliant)\b/i);
  });
});
