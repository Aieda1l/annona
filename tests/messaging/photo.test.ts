import { describe, expect, it, vi } from "vitest";
import {
  DONATION_CARD_FIXTURES,
  scene1_vision_suggestion,
  type DonationCard,
  type InboundMessage,
  type Result,
} from "@/contracts";
import type { FetchImageResult } from "@/integrations/photon/attachments";
import type { IdentityView } from "@/workflows/core-port";
import { createPhotoHandler } from "@/workflows/photo";

// T-MS-18: a joined donor texts a photo -> download the exact bytes -> Dev 1 draft -> one-time checklist link -> reply
// draft_ready. All failures before a draft exists become intake_failed. Dev 1 and Dev 2 are doubles here: FAKE evidence.

const DONATION_ID = "d0000000-0000-4000-8000-0000000000d1";
const DONOR: IdentityView = {
  id: "b0000000-0000-4000-8000-0000000000b1",
  handle: "donor@example.invalid",
  provider: "photon",
  actor_role: "donor",
  actor_id: "a0000000-0000-4000-8000-0000000000a1",
  status: "joined",
  provider_space_id: "pho_spc_1",
  provider_sender_id: "pho_usr_line",
};
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const msg = (attachments: InboundMessage["attachments"], over: Partial<InboundMessage> = {}): InboundMessage => ({
  provider: "photon",
  provider_message_id: "pho_msg_photo1",
  provider_event_id: null,
  received_at: "2026-10-17T22:00:00.000Z",
  sender_handle: DONOR.handle,
  provider_space_id: "pho_spc_1",
  provider_line_sender_id: "pho_usr_line",
  text: null,
  attachments,
  ...over,
});
const image = (id = "pho_att_1") => [{ kind: "image" as const, provider_attachment_id: id, mime: null }];
const card = (over: Partial<DonationCard> = {}): DonationCard => ({
  ...DONATION_CARD_FIXTURES[0],
  id: DONATION_ID,
  ai_status: "succeeded",
  ai_suggestion: scene1_vision_suggestion,
  ...over,
});
const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const bad = (code: "VALIDATION_FAILED" | "NOT_AUTHORIZED" | "INTERNAL" | "NOT_IMPLEMENTED" | "NOT_FOUND" | "INVALID_TRANSITION" | "CONFLICT"): Result<never> => ({
  ok: false,
  error: { code, message: code, retryable: false },
});
const TOKEN = "TOKEN_abc123";

function setup(over: {
  fetchImage?: () => Promise<FetchImageResult>;
  createDraft?: () => Promise<Result<DonationCard>>;
  issueLink?: () => Promise<Result<{ link_id: string; token: string; expires_at: string }>>;
  sent?: boolean;
  appBaseUrl?: string | undefined;
  demo?: boolean;
} = {}) {
  const fetchImage = vi.fn(over.fetchImage ?? (async (): Promise<FetchImageResult> => ({ ok: true, image: { mime: "image/jpeg", bytes: BYTES } })));
  const createDraft = vi.fn(over.createDraft ?? (async () => ok(card())));
  const issueLink = vi.fn(
    over.issueLink ?? (async () => ok({ link_id: "l0000000-0000-4000-8000-0000000000e1", token: TOKEN, expires_at: "2026-10-17T22:30:00.000Z" })),
  );
  const hasOutboundMessage = vi.fn(async () => over.sent ?? false);
  const handle = createPhotoHandler({
    fetchImage: fetchImage as never,
    createDraft: createDraft as never,
    issueLink: issueLink as never,
    hasOutboundMessage,
    appBaseUrl: () => ("appBaseUrl" in over ? over.appBaseUrl : "https://app.example.invalid"),
    demoMode: () => over.demo ?? true,
  });
  return { handle, fetchImage, createDraft, issueLink, hasOutboundMessage };
}

const suggestion = scene1_vision_suggestion;
const dish = suggestion.dish_suggestions[0]?.name ?? "";
const allergens = [...new Set(suggestion.possible_allergens.map((a) => a.allergen.replace(/_/g, " ")))].join(", ");

describe("T-MS-18 donor photo", () => {
  it("downloads the first image, drafts it, issues a link and replies draft_ready once", async () => {
    const { handle, fetchImage, createDraft, issueLink } = setup();
    const reply = await handle(DONOR, msg(image()));
    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(fetchImage).toHaveBeenCalledWith({ provider_attachment_id: "pho_att_1", fixture_id: undefined });
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(issueLink).toHaveBeenCalledWith({ donation_id: DONATION_ID });
    expect(reply).toMatchObject({ purpose: "draft_ready", idempotency_key: `draft_ready:${DONATION_ID}:v1` });
    expect(reply?.text).toContain("AI guess");
    expect(reply?.text).toContain(dish);
    expect(reply?.text).toContain(`Possible allergens: ${allergens}`);
    expect(reply?.text).toContain(`https://app.example.invalid/v#${TOKEN}`);
    expect(reply?.text).toContain("DEMO");
  });

  it("hands the bytes and MIME type to intake exactly as downloaded, as the donor, with a stable source_ref", async () => {
    const heic = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    const { handle, createDraft } = setup({ fetchImage: async () => ({ ok: true, image: { mime: "image/heic", bytes: heic } }) });
    await handle(DONOR, msg(image()));
    expect(createDraft).toHaveBeenCalledWith({
      actor: { role: "donor", id: DONOR.actor_id },
      image: { mime: "image/heic", bytes_base64: Buffer.from(heic).toString("base64") },
      source: "messaging",
      source_ref: "photon:pho_msg_photo1",
    });
  });

  it("uses only the first image when several are sent", async () => {
    const { handle, fetchImage } = setup();
    await handle(DONOR, msg([...image("pho_att_first"), ...image("pho_att_second")]));
    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(fetchImage).toHaveBeenCalledWith({ provider_attachment_id: "pho_att_first", fixture_id: undefined });
  });

  it("passes a simulated-phone fixture id through instead of a Photon attachment id", async () => {
    const { handle, fetchImage, createDraft } = setup();
    await handle({ ...DONOR, provider: "fake" }, msg([{ kind: "image", fixture_id: "sandwich_platter" }], { provider: "fake", provider_message_id: "fake_1" }));
    expect(fetchImage).toHaveBeenCalledWith({ provider_attachment_id: undefined, fixture_id: "sandwich_platter" });
    expect((createDraft.mock.calls[0] as unknown[])[0]).toMatchObject({ source: "messaging", source_ref: "fake:fake_1" });
  });

  it("says the photo could not be analyzed, and still gives the link, when the AI failed", async () => {
    const { handle } = setup({ createDraft: async () => ok(card({ ai_status: "failed", ai_suggestion: null })) });
    const reply = await handle(DONOR, msg(image()));
    expect(reply?.purpose).toBe("draft_ready");
    expect(reply?.text).toContain("couldn't analyze");
    expect(reply?.text).toContain(`/v#${TOKEN}`);
  });

  it("handles a trailing slash on the base URL and drops DEMO outside demo mode", async () => {
    const { handle } = setup({ appBaseUrl: "https://app.example.invalid/", demo: false });
    const reply = await handle(DONOR, msg(image()));
    expect(reply?.text).toContain(`https://app.example.invalid/v#${TOKEN}`);
    expect(reply?.text).not.toContain("DEMO");
  });

  it("keeps the token out of the idempotency key", async () => {
    const { handle } = setup();
    expect((await handle(DONOR, msg(image())))?.idempotency_key).not.toContain(TOKEN);
  });
});

describe("T-MS-18 failures before a draft exists", () => {
  it.each(["not_found", "too_large", "not_image", "not_ready", "unavailable"] as const)(
    "replies intake_failed when the download fails (%s), without drafting or issuing a link",
    async (reason) => {
      const { handle, createDraft, issueLink } = setup({ fetchImage: async () => ({ ok: false, reason }) });
      const reply = await handle(DONOR, msg(image()));
      expect(reply).toMatchObject({ purpose: "intake_failed", idempotency_key: "reply:pho_msg_photo1:v1" });
      expect(reply?.text).toContain("photo");
      expect(createDraft).not.toHaveBeenCalled();
      expect(issueLink).not.toHaveBeenCalled();
    },
  );

  it.each(["VALIDATION_FAILED", "NOT_AUTHORIZED"] as const)("replies intake_failed when intake refuses with %s", async (code) => {
    const { handle, issueLink } = setup({ createDraft: async () => bad(code) });
    expect(await handle(DONOR, msg(image()))).toMatchObject({ purpose: "intake_failed" });
    expect(issueLink).not.toHaveBeenCalled();
  });

  it("throws on an unexpected intake error so the delivery is retried, with no reply", async () => {
    const { handle } = setup({ createDraft: async () => bad("INTERNAL") });
    await expect(handle(DONOR, msg(image()))).rejects.toThrow(/INTERNAL/);
  });

  it("lets a not-yet-implemented intake surface as NOT_IMPLEMENTED", async () => {
    const { handle } = setup({ createDraft: async () => bad("NOT_IMPLEMENTED") });
    await expect(handle(DONOR, msg(image()))).rejects.toThrow(/^NOT_IMPLEMENTED/);
  });

  it("throws when the link cannot be issued, so the draft is not announced without a way to confirm it", async () => {
    const { handle } = setup({ issueLink: async () => bad("INTERNAL") });
    await expect(handle(DONOR, msg(image()))).rejects.toThrow(/issueVerificationLink/);
  });

  it.each(["NOT_IMPLEMENTED", "INVALID_TRANSITION", "CONFLICT", "NOT_FOUND"] as const)(
    "answers instead of retrying forever when core refuses to issue a link (%s), so the relay moves on",
    async (code) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { handle } = setup({ issueLink: async () => bad(code) });
      const reply = await handle(DONOR, msg(image()));
      expect(reply).toMatchObject({ purpose: "intake_failed", idempotency_key: "reply:pho_msg_photo1:v1" });
      expect(reply?.text).toContain("web upload");
      expect(reply?.text).not.toContain(TOKEN);
      const line = logged.mock.calls.flat().join(" ");
      logged.mockRestore();
      expect(line).toContain("issueVerificationLink");
      expect(line).toContain(code);
      expect(line).not.toContain("pho_msg_photo1");
    },
  );

  it("does no work at all when the app's public URL is not configured, and says so loudly for the operator", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handle, fetchImage, createDraft } = setup({ appBaseUrl: undefined });
    await expect(handle(DONOR, msg(image()))).rejects.toThrow(/APP_BASE_URL/);
    expect(fetchImage).not.toHaveBeenCalled();
    expect(createDraft).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("APP_BASE_URL"));
    logged.mockRestore();
  });
});

describe("T-MS-18 reprocessing", () => {
  it("on a redelivery re-asks intake for the same source_ref (idempotent there) but issues one link and sends one reply", async () => {
    let announced = false;
    const base = setup();
    const handle = createPhotoHandler({
      fetchImage: base.fetchImage as never,
      createDraft: base.createDraft as never,
      issueLink: base.issueLink as never,
      hasOutboundMessage: async () => announced,
      appBaseUrl: () => "https://app.example.invalid",
      demoMode: () => true,
    });
    const first = await handle(DONOR, msg(image()));
    announced = first !== null; // the inbound handler records the reply it sends
    const second = await handle(DONOR, msg(image()));
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(base.createDraft).toHaveBeenCalledTimes(2);
    const refs = base.createDraft.mock.calls.map((c) => ((c as unknown[])[0] as { source_ref: string }).source_ref);
    expect(refs).toEqual(["photon:pho_msg_photo1", "photon:pho_msg_photo1"]);
    expect(base.issueLink).toHaveBeenCalledTimes(1);
  });

  it("sends nothing and issues no second link when this draft's message was already sent", async () => {
    const { handle, issueLink, hasOutboundMessage } = setup({ sent: true });
    expect(await handle(DONOR, msg(image()))).toBeNull();
    expect(hasOutboundMessage).toHaveBeenCalledWith(`draft_ready:${DONATION_ID}:v1`);
    expect(issueLink).not.toHaveBeenCalled();
  });
});
