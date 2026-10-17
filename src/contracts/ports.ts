import type { ProviderMode, StoreKind } from "./enums";
import type { Actor, OutboundMessage, SendResult, VisionSuggestion } from "./entities";
import type { Result } from "./result";

// CONTRACTS §9.0 / §9.1. Every external provider gets a real and a deterministic fake implementation.

export type { Actor };

export type ProviderStatus = "ok" | "misconfigured";

export type Clock = { now(): Date };

export type VisionProvider = {
  readonly mode: ProviderMode;
  readonly model: string | null;
  readonly status: ProviderStatus;
  analyzeFoodImage(input: {
    image: { mime: string; bytes_base64: string };
    donor_hint?: string;
  }): Promise<Result<VisionSuggestion>>;
};

export type MessagingGateway = {
  readonly mode: ProviderMode;
  readonly channel: "imessage" | "simulated";
  readonly status: ProviderStatus;
  send(message: OutboundMessage): Promise<SendResult>;
};

/** Opaque handle. Internals (Drizzle client, repositories) are private to Dev 2. */
export type DispatchStore = { readonly kind: StoreKind };

/** Factory config types (§9.0). `mode` is the env selector, not the ProviderMode. */
export type VisionProviderConfig = { mode: "fake" | "gemini"; api_key: string | undefined; model: string | undefined };
export type DispatchStoreConfig = { kind: StoreKind; database_url: string | undefined; pglite_dir: string | undefined };
export type MessagingGatewayConfig = {
  mode: "fake" | "photon";
  project_id: string | undefined;
  api_key: string | undefined;
};

export type Services = {
  vision: VisionProvider;
  messaging: MessagingGateway;
  store: DispatchStore;
  clock: Clock;
};

/** Optional trailing argument of core and workflow functions (CONTRACTS §9.0). */
export type Deps = { store?: DispatchStore; clock?: Clock; messaging?: MessagingGateway; vision?: VisionProvider };
