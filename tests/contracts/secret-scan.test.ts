// The canonical secret scan (ARCHITECTURE section 9) must catch a key of any shape that is assigned to a secret-named
// variable, not only the shapes we happen to know (AIza..., pho_sk_...). The test reads the regex out of the doc, so the
// doc and the test cannot drift apart. The regex is POSIX ERE for `grep -E` and must also be valid JavaScript here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const doc = readFileSync(join(process.cwd(), "docs/ARCHITECTURE.md"), "utf8");
const found = doc.match(/SECRET_RE='([^']+)'/);
const SECRET_RE = new RegExp(found?.[1] ?? "(?!)");
const hit = (line: string) => SECRET_RE.test(line);

// Fake values built from parts so this file does not itself look like a leaked key.
const longKey = (prefix: string) => `${prefix}${"Ab3dE6gH9jK2mN5pQ8sT1vW4yZ7".repeat(2)}`.slice(0, prefix.length + 40);

describe("SECRET_RE in ARCHITECTURE section 9", () => {
  it("is present in the doc and compiles", () => {
    expect(found).not.toBeNull();
  });

  it("still catches the shapes it caught before", () => {
    expect(hit(`const k = "AIza${"A".repeat(35)}"`)).toBe(true);
    expect(hit(`x = pho_sk_${"a".repeat(20)}`)).toBe(true);
    expect(hit(["DATABASE_URL=postgresql", "://postgres.ref:", "pw", "@host.example:6543/postgres"].join(""))).toBe(true);
    expect(hit(`whsec_${"a".repeat(20)}`)).toBe(true);
    expect(hit(["handle +1", "206555", "0123"].join(""))).toBe(true);
  });

  it.each([
    ["an env line with an unknown key shape", `GEMINI_API_KEY=${longKey("zz")}`],
    ["a quoted env line", `GEMINI_API_KEY="${longKey("AQ.")}"`],
    ["a JSON entry", `"PHOTON_API_KEY": "${longKey("")}"`],
    ["a secret", `ANNONA_INTERNAL_SECRET=${longKey("")}`],
    ["a token", `export VERCEL_TOKEN=${longKey("")}`],
    ["a password", `SUPABASE_DB_PASSWORD=${longKey("")}`],
    ["the demo passcode", `DEMO_PASSCODE=${longKey("")}`],
  ])("catches %s", (_label, line) => {
    expect(hit(line)).toBe(true);
  });

  it.each([
    ["a variable named in prose", "Set GEMINI_API_KEY in the Vercel project settings."],
    ["an empty example", "GEMINI_API_KEY="],
    ["a schema entry", "  GEMINI_API_KEY: optional(z.string()),"],
    ["a short placeholder", "GEMINI_API_KEY=your-key-here"],
    ["a property read", "const key = process.env.GEMINI_API_KEY;"],
  ])("does not flag %s", (_label, line) => {
    expect(hit(line)).toBe(false);
  });
});
