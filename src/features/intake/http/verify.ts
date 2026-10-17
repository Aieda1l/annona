import { notImplemented } from "@/server/http";

// Stub: the owning lane replaces this handler (CONTRACTS §10).
export async function VIEW(_request: Request): Promise<Response> {
  return notImplemented("POST /api/verify/view", "Dev 1");
}

export async function IMAGE(_request: Request): Promise<Response> {
  return notImplemented("POST /api/verify/image", "Dev 1");
}

export async function SUBMIT(_request: Request): Promise<Response> {
  return notImplemented("POST /api/verify/submit", "Dev 1");
}
