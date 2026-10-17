import { notImplemented } from "@/server/http";

// Stub: the owning lane replaces this handler (CONTRACTS §10).
export async function GET(_request: Request, _ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return notImplemented("GET /api/images/:id", "Dev 2");
}
