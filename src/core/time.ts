// CONTRACTS §1: every instant is a UTC ISO-8601 string ending in Z. Date.parse alone is too lenient
// (it turns the number 12345 or the string "1" into a real date), which would let junk read as a valid time.
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;

/** Milliseconds since epoch, or NaN for anything that is not a well-formed UTC string. Callers fail closed on NaN. */
export function parseUtc(value: unknown): number {
  return typeof value === "string" && UTC_ISO.test(value) ? Date.parse(value) : NaN;
}
