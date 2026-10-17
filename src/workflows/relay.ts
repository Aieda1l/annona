import type { Clock } from "@/contracts";

// The worker's two jobs (ARCHITECTURE §6): drive the tick, and relay inbound Photon messages to the app by polling.
// Polling is the one inbound transport VERIFIED live (docs/handoffs/dev-3.md); webhook signing and Socket.IO are not.
// Logs carry only statuses and error names: never a secret, a key, a handle or a message text.

const PHOTON_BASE = "https://api.photon.codes";
const POLL_INTERVAL_MS = 2000;
const DEFAULT_RETRY_AFTER_MS = 5000;
const BACKFILL_MS = 10 * 60 * 1000; // ASSUMPTION (ARCHITECTURE §6): ten minutes
const SEEN_CAP = 500;

export type RelayDeps = {
  appBaseUrl: string;
  internalSecret: string;
  /** null means fake mode: the worker only ticks. */
  photon: { projectId: string; apiKey: string } | null;
  fetch?: typeof fetch;
  clock: Clock;
  cursor: { load(): Promise<string | null>; save(iso: string): Promise<void> };
  log?: (line: string) => void;
};

type PhotonMessage = { id: string; status?: string; createdAt?: string };

export function createRelay(deps: RelayDeps) {
  const doFetch = deps.fetch ?? fetch;
  const log = deps.log ?? ((line: string) => console.log(line));
  // The server dedupes on provider_message_id; this only avoids re-posting an overlapping window.
  const seen = new Set<string>();
  const errorName = (error: unknown) => (error instanceof Error ? error.name : "error");

  async function tickOnce(): Promise<unknown | null> {
    try {
      const response = await doFetch(`${deps.appBaseUrl}/api/internal/tick`, {
        method: "POST",
        headers: { "x-annona-internal-secret": deps.internalSecret },
      });
      if (!response.ok) {
        log(`[worker] tick failed: HTTP ${response.status}`);
        return null;
      }
      const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
      return body?.data ?? null;
    } catch (error) {
      log(`[worker] tick failed: ${errorName(error)}`);
      return null;
    }
  }

  async function relayOne(message: PhotonMessage, projectId: string): Promise<boolean> {
    // Wrapped as the same envelope a webhook would carry, so the inbound route has one code path.
    const envelope = {
      id: `poll_${message.id}`,
      type: "message.received",
      apiVersion: "2026-07-01",
      source: "imessage.photon",
      timestamp: message.createdAt,
      data: { projectId, object: message },
    };
    try {
      const response = await doFetch(`${deps.appBaseUrl}/api/messaging/photon/inbound`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-annona-internal-secret": deps.internalSecret },
        body: JSON.stringify(envelope),
      });
      if (!response.ok) log(`[worker] relay rejected: HTTP ${response.status}`);
      return response.ok;
    } catch (error) {
      log(`[worker] relay failed: ${errorName(error)}`);
      return false;
    }
  }

  async function pollOnce(): Promise<{ relayed: number; waitMs: number }> {
    const photon = deps.photon;
    if (!photon) return { relayed: 0, waitMs: POLL_INTERVAL_MS };

    const since = (await deps.cursor.load()) ?? new Date(deps.clock.now().getTime() - BACKFILL_MS).toISOString();
    const url = new URL(`${PHOTON_BASE}/v1/projects/${photon.projectId}/messages`);
    url.searchParams.set("platform", "imessage");
    url.searchParams.set("order", "asc");
    url.searchParams.set("createdSince", since);
    url.searchParams.set("pageSize", "50");

    let response: Response;
    try {
      response = await doFetch(url, { headers: { authorization: `Bearer ${photon.apiKey}` } });
    } catch (error) {
      log(`[worker] poll failed: ${errorName(error)}`);
      return { relayed: 0, waitMs: POLL_INTERVAL_MS };
    }
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"));
      return { relayed: 0, waitMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS };
    }
    if (!response.ok) {
      log(`[worker] poll failed: HTTP ${response.status}`);
      return { relayed: 0, waitMs: POLL_INTERVAL_MS };
    }

    const body = (await response.json().catch(() => null)) as { items?: unknown } | null;
    const items = (Array.isArray(body?.items) ? body.items : []) as PhotonMessage[];
    items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    let relayed = 0;
    for (const message of items) {
      // Our own sends come back in this list with other statuses; only inbound messages are relayed.
      if (message.status !== "received" || typeof message.id !== "string" || seen.has(message.id)) continue;
      if (!(await relayOne(message, photon.projectId))) break; // keep the cursor before it; retry on the next poll
      seen.add(message.id);
      if (seen.size > SEEN_CAP) seen.delete(seen.values().next().value as string);
      relayed += 1;
      if (typeof message.createdAt === "string") await deps.cursor.save(message.createdAt);
    }
    return { relayed, waitMs: POLL_INTERVAL_MS };
  }

  async function run(opts: { tickIntervalMs: number; signal: AbortSignal; sleep?: (ms: number) => Promise<void> }): Promise<void> {
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const tickLoop = async () => {
      while (!opts.signal.aborted) {
        await tickOnce();
        await sleep(opts.tickIntervalMs);
      }
    };
    const pollLoop = async () => {
      while (!opts.signal.aborted) {
        const { waitMs } = await pollOnce();
        await sleep(waitMs);
      }
    };
    await Promise.all([tickLoop(), deps.photon ? pollLoop() : Promise.resolve()]);
  }

  return { tickOnce, pollOnce, run };
}
