import { notImplemented } from "@/server/http";

// Stub: the owning lane replaces this handler (CONTRACTS §10).
export async function POST(_request: Request): Promise<Response> {
  return notImplemented("POST /api/messaging/photon/inbound", "Dev 3");
}
