import type {
  ActorRole,
  ClaimCommand,
  ClaimResult,
  DeclineCommand,
  DeclineResult,
  InboundResult,
  MessagingIdentityStatus,
  OutboundMessage,
  Result,
} from "@/contracts";
import type { IdentityView, MessagingCore } from "@/workflows/core-port";

// In-memory double of the slice of Dev 2's core that messaging uses, until the real core is wired (CP1.5).
// It lives in my own test folder (prompt §3) and records every call so tests can assert on side effects.

export type SeedIdentity = {
  id: string;
  handle: string;
  actor_role?: ActorRole;
  actor_id?: string;
  status?: MessagingIdentityStatus;
  provider?: "photon" | "fake";
};

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const refused: Result<never> = { ok: false, error: { code: "INTERNAL", message: "store unavailable", retryable: true } };

export function createCoreDouble() {
  const identities = new Map<string, IdentityView>();
  const inbound = new Map<string, InboundResult | null>();
  const openOffers = new Map<string, { offer_id: string }[]>();
  const calls = {
    claims: [] as ClaimCommand[],
    declines: [] as DeclineCommand[],
    joins: [] as { identity_id: string; provider_space_id: string | null; provider_sender_id: string | null }[],
    optOuts: [] as string[],
    ignored: [] as { provider: string; provider_message_id: string; reason: string; handle_masked: string }[],
    saved: [] as { provider_message_id: string; result: InboundResult }[],
    outbound: [] as { message: OutboundMessage; provider_message_id: string | null }[],
    order: [] as string[],
  };
  const failures = { join: false, optOut: false };
  const scripted = {
    claim: {
      code: "offer_not_found",
      offer_id: null,
      donation_id: null,
      donation_status: null,
      assignment: null,
      message_for_actor: "scripted",
    } as ClaimResult,
    decline: {
      code: "declined",
      offer_id: null,
      donation_id: null,
      donation_status: null,
      assignment: null,
      message_for_actor: "scripted",
    } as DeclineResult,
  };

  const core: MessagingCore = {
    async recordInboundMessage(provider, provider_message_id) {
      calls.order.push("recordInboundMessage");
      const key = `${provider}:${provider_message_id}`;
      if (inbound.has(key)) return { status: "duplicate", stored_result: inbound.get(key) ?? null };
      inbound.set(key, null);
      return { status: "first", stored_result: null };
    },
    async saveInboundResult({ provider, provider_message_id, result }) {
      calls.saved.push({ provider_message_id, result });
      inbound.set(`${provider}:${provider_message_id}`, result);
    },
    async resolveIdentityByHandle(provider, handle) {
      return [...identities.values()].find((i) => i.provider === provider && i.handle === handle) ?? null;
    },
    async getIdentity(identity_id) {
      return identities.get(identity_id) ?? null;
    },
    async joinIdentity(input) {
      calls.joins.push(input);
      if (failures.join) return refused;
      const identity = identities.get(input.identity_id);
      if (identity) {
        identities.set(identity.id, {
          ...identity,
          status: "joined",
          provider_space_id: input.provider_space_id,
          provider_sender_id: input.provider_sender_id,
        });
      }
      return ok({});
    },
    async optOutIdentity({ identity_id }) {
      calls.optOuts.push(identity_id);
      if (failures.optOut) return refused;
      const identity = identities.get(identity_id);
      if (identity) identities.set(identity.id, { ...identity, status: "opted_out" });
      return ok({});
    },
    async findOpenOffersForCourier(courier_id) {
      return openOffers.get(courier_id) ?? [];
    },
    async claimOffer(command) {
      calls.claims.push(command);
      return scripted.claim;
    },
    async declineOffer(command) {
      calls.declines.push(command);
      return scripted.decline;
    },
    async recordIgnoredInbound(input) {
      calls.ignored.push(input);
    },
    async recordOutboundMessage(input) {
      calls.outbound.push(input);
    },
    async hasOutboundMessage(idempotency_key) {
      return calls.outbound.some((entry) => entry.message.idempotency_key === idempotency_key);
    },
  };

  return {
    core,
    calls,
    scripted,
    failures,
    seedIdentity(seed: SeedIdentity): IdentityView {
      const joined = seed.status === undefined || seed.status === "joined";
      const identity: IdentityView = {
        id: seed.id,
        handle: seed.handle,
        provider: seed.provider ?? "photon",
        actor_role: seed.actor_role ?? "courier",
        actor_id: seed.actor_id ?? seed.id.replace(/^.{8}/, "a0000000"),
        status: seed.status ?? "joined",
        provider_space_id: joined ? "pho_spc_seed" : null,
        provider_sender_id: joined ? "pho_usr_seed" : null,
      };
      identities.set(identity.id, identity);
      return identity;
    },
    identity: (id: string) => identities.get(id),
    seedOpenOffers(courier_id: string, offer_ids: string[]) {
      openOffers.set(courier_id, offer_ids.map((offer_id) => ({ offer_id })));
    },
  };
}
