import { describe, expect, it, vi } from "vitest";
import { createAttachmentFetcher } from "@/integrations/photon/attachments";

// T-MS-18 (download part): fetch an inbound photo's exact bytes through the Photon API. Behavior measured live at the
// kickoff spike (docs/handoffs/dev-3.md): metadata then content, ready on the first try, 409 ATTACHMENT_NOT_READY with
// Retry-After if not. fetch is stubbed here, so these results are FAKE evidence.

const KEY = "pho_sk_TEST_not_a_real_key";
const ID = "pho_att_test1";
const META = `https://api.photon.codes/v1/projects/pho_prj_test/attachments/${ID}`;
const CONTENT = `${META}/content`;
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const bytesResponse = (bytes: Uint8Array, type: string | null = "image/jpeg") =>
  new Response(bytes as unknown as BodyInit, { status: 200, headers: type ? { "content-type": type } : {} });
const meta = (over: Record<string, unknown> = {}) =>
  json(200, { id: ID, contentType: "image/jpeg", sizeBytes: BYTES.length, filename: "IMG.jpeg", ...over });

function setup(routes: (url: string, n: number) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const hits: Record<string, number> = {};
  const sleeps: number[] = [];
  const fetchStub = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    hits[u] = (hits[u] ?? 0) + 1;
    return routes(u, hits[u] as number);
  });
  const fetcher = createAttachmentFetcher(
    { project_id: "pho_prj_test", api_key: KEY },
    { fetch: fetchStub as unknown as typeof fetch, sleep: async (ms) => void sleeps.push(ms) },
  );
  return { fetcher, calls, sleeps, hits };
}

describe("T-MS-18 attachment download", () => {
  it("asks for metadata then content with the project key, and returns the exact bytes and MIME type", async () => {
    const { fetcher, calls } = setup((u) => (u === META ? meta() : bytesResponse(BYTES)));
    const result = await fetcher.fetchImage(ID);
    expect(result).toEqual({ ok: true, image: { mime: "image/jpeg", bytes: BYTES } });
    expect(calls.map((c) => c.url)).toEqual([META, CONTENT]);
    for (const c of calls) expect(new Headers(c.init?.headers).get("authorization")).toBe(`Bearer ${KEY}`);
  });

  it("keeps a HEIC as HEIC, byte for byte", async () => {
    const heic = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    const { fetcher } = setup((u) =>
      u === META ? meta({ contentType: "image/heic", sizeBytes: heic.length }) : bytesResponse(heic, "image/heic"),
    );
    const result = await fetcher.fetchImage(ID);
    expect(result).toMatchObject({ ok: true, image: { mime: "image/heic" } });
    expect(result.ok && Array.from(result.image.bytes)).toEqual(Array.from(heic));
  });

  it("takes the MIME type from the content header and ignores parameters", async () => {
    const { fetcher } = setup((u) => (u === META ? meta() : bytesResponse(BYTES, "image/jpeg; charset=binary")));
    expect(await fetcher.fetchImage(ID)).toMatchObject({ ok: true, image: { mime: "image/jpeg" } });
  });

  it("falls back to the metadata MIME type when the content has no header", async () => {
    const { fetcher } = setup((u) => (u === META ? meta() : bytesResponse(BYTES, null)));
    expect(await fetcher.fetchImage(ID)).toMatchObject({ ok: true, image: { mime: "image/jpeg" } });
  });
});

describe("T-MS-18 not ready, missing and unusable attachments", () => {
  const notReady = () =>
    new Response(JSON.stringify({ code: "ATTACHMENT_NOT_READY" }), { status: 409, headers: { "retry-after": "2" } });

  it("retries once after ATTACHMENT_NOT_READY, waiting Retry-After, then succeeds", async () => {
    const { fetcher, sleeps, hits } = setup((u, n) => (u === META ? meta() : n === 1 ? notReady() : bytesResponse(BYTES)));
    expect(await fetcher.fetchImage(ID)).toMatchObject({ ok: true });
    expect(hits[CONTENT]).toBe(2);
    expect(sleeps).toEqual([2000]);
  });

  it("gives up after three content attempts", async () => {
    const { fetcher, hits } = setup((u) => (u === META ? meta() : notReady()));
    expect(await fetcher.fetchImage(ID)).toEqual({ ok: false, reason: "not_ready" });
    expect(hits[CONTENT]).toBe(3);
  });

  it("reports not_found when the attachment does not exist", async () => {
    const { fetcher, hits } = setup(() => json(404, { code: "ATTACHMENT_NOT_FOUND" }));
    expect(await fetcher.fetchImage(ID)).toEqual({ ok: false, reason: "not_found" });
    expect(hits[CONTENT]).toBeUndefined();
  });

  it("does not download a file larger than 5 MB", async () => {
    const { fetcher, hits } = setup((u) => (u === META ? meta({ sizeBytes: 5 * 1024 * 1024 + 1 }) : bytesResponse(BYTES)));
    expect(await fetcher.fetchImage(ID)).toEqual({ ok: false, reason: "too_large" });
    expect(hits[CONTENT]).toBeUndefined();
  });

  it("does not download something that is not an image", async () => {
    const { fetcher, hits } = setup((u) => (u === META ? meta({ contentType: "application/pdf" }) : bytesResponse(BYTES)));
    expect(await fetcher.fetchImage(ID)).toEqual({ ok: false, reason: "not_image" });
    expect(hits[CONTENT]).toBeUndefined();
  });

  it("rejects bytes that do not match the size Photon reported", async () => {
    const { fetcher } = setup((u) => (u === META ? meta({ sizeBytes: BYTES.length + 5 }) : bytesResponse(BYTES)));
    expect(await fetcher.fetchImage(ID)).toEqual({ ok: false, reason: "unavailable" });
  });

  it.each([
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["a 500", () => json(500, { code: "INTERNAL_ERROR" })],
    ["a 429", () => json(429, { code: "RATE_LIMITED" })],
  ])("reports unavailable on %s", async (_name, respond) => {
    const { fetcher } = setup(respond);
    expect(await fetcher.fetchImage(ID)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("never exposes the API key in a result", async () => {
    const { fetcher } = setup(() => Promise.reject(new Error(`boom ${KEY}`)));
    expect(JSON.stringify(await fetcher.fetchImage(ID))).not.toContain(KEY);
  });
});

// Review of PR #19 (items 1 to 3): bound the download even when Photon omits sizeBytes, re-check the MIME type of what
// was actually served, and cap Retry-After so a webhook handler can never be parked for an hour.
describe("T-MS-18 hardening", () => {
  const MB = 1024 * 1024;
  const noSize = () => meta({ sizeBytes: undefined });
  const withLength = (length: number | null, bytes = BYTES, type: string | null = "image/jpeg") =>
    new Response(bytes as unknown as BodyInit, {
      status: 200,
      headers: { ...(type ? { "content-type": type } : {}), ...(length === null ? {} : { "content-length": String(length) }) },
    });

  it("refuses by Content-Length, without reading the body, when the metadata has no size and the file is over 5 MB", async () => {
    const unreadable = new Response(
      new ReadableStream({
        pull() {
          throw new Error("the body must not be read");
        },
      }),
      { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(6 * MB) } },
    );
    const { fetcher } = setup((u) => (u === META ? noSize() : unreadable));
    expect(await fetcher.fetchImage(ID)).toEqual({ ok: false, reason: "too_large" });
  });

  it("will not buffer a body it cannot bound: no metadata size and no Content-Length means unavailable", async () => {
    const { fetcher } = setup((u) => (u === META ? noSize() : withLength(null)));
    expect(await fetcher.fetchImage(ID)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("accepts a file within the limit when Content-Length vouches for it", async () => {
    const { fetcher } = setup((u) => (u === META ? noSize() : withLength(BYTES.length)));
    expect(await fetcher.fetchImage(ID)).toMatchObject({ ok: true, image: { mime: "image/jpeg" } });
  });

  it.each(["application/octet-stream", "text/html", "application/pdf"])(
    "rejects content served as %s even though the metadata said image",
    async (type) => {
      const { fetcher } = setup((u) => (u === META ? meta() : bytesResponse(BYTES, type)));
      expect(await fetcher.fetchImage(ID)).toEqual({ ok: false, reason: "not_image" });
    },
  );

  it("caps Retry-After at 10 seconds", async () => {
    const huge = () => new Response("{}", { status: 409, headers: { "retry-after": "3600" } });
    const { fetcher, sleeps } = setup((u, n) => (u === META ? meta() : n === 1 ? huge() : bytesResponse(BYTES)));
    expect(await fetcher.fetchImage(ID)).toMatchObject({ ok: true });
    expect(sleeps).toEqual([10_000]);
  });
});
