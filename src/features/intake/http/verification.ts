import { notImplemented } from "@/server/http";

// Stub: the owning lane replaces this handler (CONTRACTS §10).
export async function POST(_request: Request, _ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return notImplemented("POST /api/donations/:id/verification", "Dev 1");
}
