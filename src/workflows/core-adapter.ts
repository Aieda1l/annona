import { z } from "zod";
import { ActorRole, MessagingIdentityStatus } from "@/contracts";
import type { IdentityView } from "./core-port";

// Reads Dev 2's untyped core records into my lane's types (CONTRACTS §3.1). The full adapter that implements
// MessagingCore / DispatchCore / DeliveryCore over `@/core` is written once sub-PR 2(b) is on main and its types land.

const nullableId = z.string().nullish().transform((value) => value ?? null);

const IdentityRecord = z.looseObject({
  id: z.string().min(1),
  handle: z.string().min(1),
  provider: z.enum(["photon", "fake"]),
  actor_role: ActorRole,
  actor_id: z.string().min(1),
  status: MessagingIdentityStatus,
  provider_space_id: nullableId,
  provider_sender_id: nullableId,
});

/** Fails closed: anything that does not match becomes null, never a guess. */
export function identityFromCore(record: unknown): IdentityView | null {
  const parsed = IdentityRecord.safeParse(record);
  if (!parsed.success) return null;
  const { id, handle, provider, actor_role, actor_id, status, provider_space_id, provider_sender_id } = parsed.data;
  return { id, handle, provider, actor_role, actor_id, status, provider_space_id, provider_sender_id };
}
