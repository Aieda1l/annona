import type { Clock } from "@/contracts";

/** CONTRACTS §9.1: fixed, advanceable `Clock` for tests. `now()` returns a fresh Date each call. */
export function createTestClock(start: Date): Clock & { advance(ms: number): void } {
  let current = start.getTime();
  if (!Number.isFinite(current)) throw new Error("createTestClock: invalid start time");
  return {
    now: () => new Date(current),
    advance(ms) {
      current += ms;
    },
  };
}
