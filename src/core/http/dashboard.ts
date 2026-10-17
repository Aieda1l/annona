import { notImplemented } from "@/server/http";

// Stub: the owning lane replaces this handler (CONTRACTS §10).
export async function GET(_request: Request): Promise<Response> {
  return notImplemented("GET /api/dashboard", "Dev 2");
}
