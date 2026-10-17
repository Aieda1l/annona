import type { Clock } from "@/contracts";

export type TestClock = Clock & { advance(ms: number): void; set(to: Date | string): void };

/** Real server clock for production composition. */
export const systemClock: Clock = { now: () => new Date() };

/** Fixed, advanceable clock for tests (CONTRACTS §9.1). `now()` returns a fresh Date each call. */
export function createTestClock(start: Date | string): TestClock {
  let current = new Date(start).getTime();
  if (!Number.isFinite(current)) throw new Error("createTestClock: invalid start time");
  return {
    now: () => new Date(current),
    advance(ms) {
      current += ms;
    },
    set(to) {
      const next = new Date(to).getTime();
      if (!Number.isFinite(next)) throw new Error("createTestClock: invalid time");
      current = next;
    },
  };
}
