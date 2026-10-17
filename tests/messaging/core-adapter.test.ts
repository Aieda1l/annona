import { describe, expect, it } from "vitest";
import { identityFromCore } from "@/workflows/core-adapter";

// Core's identity records are untyped until contracts-2. identityFromCore reads the CONTRACTS §3.1 fields and
// fails closed (null) on anything that does not match, so a surprise shape can never look like a joined identity.

const record = {
  id: "b0000000-0000-4000-8000-000000000001",
  handle: "courier@example.invalid",
  provider: "photon",
  actor_role: "courier",
  actor_id: "a0000000-0000-4000-8000-000000000001",
  status: "joined",
  provider_space_id: "pho_spc_1",
  provider_sender_id: "pho_usr_line",
  joined_at: "2026-10-17T22:00:00.000Z",
  opted_out_at: null,
};

describe("identityFromCore", () => {
  it("reads the fields messaging needs and ignores the rest", () => {
    expect(identityFromCore(record)).toEqual({
      id: record.id,
      handle: record.handle,
      provider: "photon",
      actor_role: "courier",
      actor_id: record.actor_id,
      status: "joined",
      provider_space_id: "pho_spc_1",
      provider_sender_id: "pho_usr_line",
    });
  });

  it("treats missing or null space and sender ids as null", () => {
    const { provider_space_id: _s, provider_sender_id: _p, ...rest } = record;
    expect(identityFromCore(rest)).toMatchObject({ provider_space_id: null, provider_sender_id: null });
    expect(identityFromCore({ ...record, provider_space_id: null })).toMatchObject({ provider_space_id: null });
  });

  it.each([
    ["null", null],
    ["a string", "joined"],
    ["an unknown status", { ...record, status: "active" }],
    ["an unknown provider", { ...record, provider: "sms" }],
    ["an unknown role", { ...record, actor_role: "admin" }],
    ["no handle", { ...record, handle: undefined }],
    ["no id", { ...record, id: undefined }],
    ["no actor id", { ...record, actor_id: undefined }],
  ])("returns null for %s", (_name, input) => {
    expect(identityFromCore(input)).toBeNull();
  });
});
