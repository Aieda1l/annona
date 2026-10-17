/** `warn` marks a 2xx report that still carries failures (e.g. send_failures > 0), so the UI does not show it as clean. */
export type Outcome = { ok: true; summary: string; warn?: boolean } | { ok: false; error: string };

const FAILURE_COUNT_KEYS = ["send_failures", "failures", "errors"];

export function hasFailureCounts(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const rec = data as Record<string, unknown>;
  return FAILURE_COUNT_KEYS.some((k) => typeof rec[k] === "number" && (rec[k] as number) > 0);
}

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
    if (res.ok && parsed?.ok) {
      return { ok: true, summary: summarizeCounts(parsed.data) || "Done.", warn: hasFailureCounts(parsed.data) };
    }
    if (parsed?.ok === false && parsed.error) return { ok: false, error: `${parsed.error.code}: ${parsed.error.message}` };
    return { ok: false, error: `HTTP_${res.status}: Unexpected response from the server.` };
  } catch {
    return { ok: false, error: "UNREACHABLE: The server could not be reached." };
  }
}
