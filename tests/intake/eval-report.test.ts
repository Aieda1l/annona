import { describe, expect, it } from "vitest";
import { err, ok, scene1_vision_suggestion } from "@/contracts";
import { EVAL_CASES, scoreRun, summarizeCase } from "@/lib/ai/eval-cases";
import { buildYamlRecord, formatTable, type CaseResult, type RunContext } from "@/lib/ai/eval-report";

const real: RunContext = {
  prompt_version: "v1", model: "gemini-3.5-flash-lite", mode: "real", auth: "vertex_adc", location: "global",
  run_at: "2026-10-17 15:00 PDT", commit_sha: "abc1234", command: "pnpm eval:intake", runs: 2,
};
const fake: RunContext = { ...real, mode: "fake", model: null, auth: "none (fake)", location: null };
const c1 = EVAL_CASES[0]!;
const good = { ...scene1_vision_suggestion, provider: "gemini" as const, mode: "real" as const, model: "m" };

function ran(ctxCase = c1): CaseResult {
  const scores = [scoreRun(ctxCase, ok(good), 1200), scoreRun(ctxCase, err("PROVIDER_UNAVAILABLE", "x"), 15000)];
  return { status: "ran", case: ctxCase, scores, summary: summarizeCase(ctxCase, scores) };
}
const skipped: CaseResult = { status: "skipped", case: EVAL_CASES[2]!, reason: "fixtures/intake/images/dessert_bars.jpg is missing" };

describe("buildYamlRecord", () => {
  it("has every PROMPT_EVAL §10 key", () => {
    const rec = buildYamlRecord(real, ran());
    for (const k of ["prompt_id", "prompt_version", "prompt_file", "case_id", "fixture", "provider", "model", "api_surface", "settings", "mode", "run_at", "commit_sha", "command", "runs", "expected", "observed", "scores", "verdict", "edits_made", "notes"]) {
      expect(rec).toMatch(new RegExp(`^${k}: `, "m"));
    }
  });

  it("every value is valid JSON, so the record is valid YAML", () => {
    for (const line of buildYamlRecord(real, ran()).split("\n")) {
      expect(() => JSON.parse(line.slice(line.indexOf(": ") + 2))).not.toThrow();
    }
  });

  it("a real run reports the verdict and the failed provider run by code only", () => {
    const rec = buildYamlRecord(real, ran());
    expect(rec).toContain('"verdict"'.replace(/"/g, "") + ': "fail"');
    expect(rec).toContain("PROVIDER_UNAVAILABLE");
    expect(rec).toContain('"U1":"1/2"');
    expect(rec).toContain('"M4_p95_ms":15000');
  });

  it("a fake run is never reported as a model result", () => {
    const rec = buildYamlRecord(fake, ran());
    expect(rec).toContain('verdict: "not_run"');
    expect(rec).toContain("fake harness check only");
    expect(rec).toContain('provider: "fake"');
    expect(rec).toContain("model: null");
  });

  it("a skipped case is not_run with the reason", () => {
    const rec = buildYamlRecord(real, skipped);
    expect(rec).toContain('verdict: "not_run"');
    expect(rec).toContain("dessert_bars.jpg is missing");
    expect(rec).toContain("observed: []");
  });

  it("holds no credential-shaped text", () => {
    const rec = buildYamlRecord(real, ran());
    expect(rec).not.toMatch(/AIza|ya29\.|Bearer|api[_-]?key|authorization/i);
  });
});

describe("multi-fixture cases", () => {
  const c2 = EVAL_CASES[1]!;
  const amb = { ...good, dish_suggestions: [{ name: "buffet", confidence: "low" as const }], uncertainty_notes: ["a", "b"] };
  const two: CaseResult = (() => {
    const scores = [scoreRun(c2, ok(amb), 1000, "buffet_ambiguous"), scoreRun(c2, ok(amb), 1100, "buffet_closed")];
    return { status: "ran", case: c2, scores, summary: summarizeCase(c2, scores) };
  })();

  it("lists every fixture path and tags each observed run with its fixture", () => {
    const rec = buildYamlRecord(real, two);
    expect(rec).toContain('fixture: ["fixtures/intake/images/buffet_ambiguous.jpg","fixtures/intake/images/buffet_closed.jpg"]');
    expect(rec).toContain('"fixture":"buffet_closed"');
  });

  it("shows both fixtures in the table, with a pass count per image", () => {
    const t = formatTable(real, [two]);
    expect(t).toMatch(/buffet_ambiguous\+buffet_closed/);
    expect(t).toMatch(/per image: buffet_ambiguous 1\/1, buffet_closed 1\/1/);
  });

  it("reports retried runs in the table and in each observed run", () => {
    const scores = two.status === "ran" ? two.scores.map((s, i) => ({ ...s, attempts: i === 0 ? 2 : 1 })) : [];
    const withRetry: CaseResult = { status: "ran", case: c2, scores, summary: summarizeCase(c2, scores) };
    expect(formatTable(real, [withRetry])).toMatch(/1 run\(s\) retried/);
    expect(buildYamlRecord(real, withRetry)).toContain('"attempts":2');
  });
});

describe("formatTable", () => {
  it("labels fake runs as a harness check", () => {
    expect(formatTable(fake, [ran()])).toMatch(/FAKE HARNESS CHECK \(not a model result\)/);
  });

  it("labels real runs and reports unrun cases against the release rule", () => {
    const t = formatTable(real, [ran(), skipped]);
    expect(t).toMatch(/REAL MODEL EVAL/);
    expect(t).toMatch(/T-PE-03 .*NOT RUN/);
    expect(t).toMatch(/1 case\(s\) not run: the release rule needs all eight/);
    expect(t).toMatch(/errors: PROVIDER_UNAVAILABLE/);
  });
});
