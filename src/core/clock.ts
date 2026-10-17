import type { Clock } from "@/contracts";

export type TestClock = Clock & { advance(ms: number): void; set(to: Date | string): void };

/** Real server clock for production composition. */
export const systemClock: Clock = { now: () => new Date() };

/** Fixed, advanceable clock for tests (CONTRACTS §9.1). `now()` returns a fresh Date each call. */
export function createTestClock(start: Date | string): TestClock {
  let current = new Date(start).getTime();
  return {
    now: () => new Date(current),
    advance(ms) {
      current += ms;
    },
    set(to) {
      current = new Date(to).getTime();
    },
  };
}
