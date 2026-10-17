import { notImplemented } from "@/server/http";

// Stub: the owning lane replaces this handler (CONTRACTS §10).
export async function POST(_request: Request): Promise<Response> {
  return notImplemented("POST /api/messaging/simulated/inbound", "Dev 3");
}

export async function GET(_request: Request): Promise<Response> {
  return notImplemented("GET /api/messaging/simulated/thread", "Dev 3");
}
