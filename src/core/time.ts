// CONTRACTS section 1: every instant is a UTC ISO-8601 string ending in Z, exactly what z.iso.datetime() accepts.
// Date.parse alone is too lenient: it turns the number 12345 or the string "1" into a real date, and it rolls
// impossible dates over (Feb 30 becomes Mar 2, 24:00 becomes the next day).
const UTC_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

/** Milliseconds since epoch, or NaN for anything that is not a well-formed, real UTC instant. Callers fail closed on NaN. */
export function parseUtc(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const m = UTC_ISO.exec(value);
  if (!m) return NaN;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return NaN;
  // Out-of-range parts roll over into the next unit, so a real date reads back with the same parts.
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const t = new Date(ms);
  const same =
    t.getUTCFullYear() === y && t.getUTCMonth() + 1 === mo && t.getUTCDate() === d &&
    t.getUTCHours() === h && t.getUTCMinutes() === mi && t.getUTCSeconds() === s;
  return same ? ms : NaN;
}
