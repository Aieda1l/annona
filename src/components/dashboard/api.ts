export type Outcome = { ok: true; summary: string } | { ok: false; error: string };

/** Lists the numeric fields of a server report (e.g. TickReport) as "expired offers: 1 · offers sent: 2". */
export function summarizeCounts(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  return Object.entries(data as Record<string, unknown>)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join(" · ");
}

/** POST helper for demo/operator routes. Server refusals come back as "CODE: message", verbatim. */
export async function postJson(url: string, body?: unknown): Promise<Outcome> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await res.json().catch(() => null);
    if (parsed?.ok) return { ok: true, summary: summarizeCounts(parsed.data) || "Done." };
    if (parsed?.ok === false && parsed.error) return { ok: false, error: `${parsed.error.code}: ${parsed.error.message}` };
    return { ok: false, error: `HTTP_${res.status}: Unexpected response from the server.` };
  } catch {
    return { ok: false, error: "UNREACHABLE: The server could not be reached." };
  }
}
