import type { CaseSummary, EvalCase, RunScore } from "./eval-cases";

// Formats eval results as the PROMPT_EVAL §10 record and a console table. Pure. Values are written as JSON
// (a YAML subset). Records hold outputs and model IDs only: never keys, tokens or request headers.

export type RunContext = {
  prompt_version: string;
  model: string | null;
  mode: "real" | "fake";
  auth: string;
  location: string | null;
  run_at: string;
  commit_sha: string;
  command: string;
  runs: number;
};

export type CaseResult =
  | { status: "ran"; case: EvalCase; scores: RunScore[]; summary: CaseSummary }
  | { status: "skipped"; case: EvalCase; reason: string };

const frac = (scores: RunScore[], pick: (r: RunScore) => boolean) => `${scores.filter(pick).length}/${scores.length}`;
const mean = (xs: number[]) => (xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100);
const qualityCheck = (r: RunScore) => r.checks.some((c) => /^image_quality is /.test(c.name) && c.pass);

export function buildYamlRecord(ctx: RunContext, result: CaseResult): string {
  const c = result.case;
  const ran = result.status === "ran";
  const scores = ran ? result.scores : [];
  const verdict = !ran ? "not_run" : ctx.mode === "fake" ? "not_run" : result.summary.verdict;
  const notes = !ran
    ? `not run: ${result.reason}`
    : ctx.mode === "fake"
      ? `fake harness check only (${result.summary.verdict}); not a model result`
      : `${result.summary.pass_count}/${result.summary.runs} runs passed`;
  const m1 = mean(scores.map((r) => r.M1).filter((v): v is number => v !== null));
  const observed = scores.map((r) =>
    r.suggestion
      ? { image_quality: r.suggestion.image_quality, dish_suggestions: r.suggestion.dish_suggestions, estimated_servings: r.suggestion.estimated_servings, possible_allergens: r.suggestion.possible_allergens, uncertainty_notes: r.suggestion.uncertainty_notes, questions_for_donor: r.suggestion.questions_for_donor, failed_checks: r.checks.filter((k) => !k.pass).map((k) => k.name) }
      : { error_code: r.error_code ?? "UNKNOWN" },
  );
  const line = (k: string, v: unknown) => `${k}: ${JSON.stringify(v)}`;
  return [
    line("prompt_id", "annona-intake"),
    line("prompt_version", ctx.prompt_version),
    line("prompt_file", `src/lib/ai/prompts/annona-intake.${ctx.prompt_version}.md`),
    line("case_id", c.id),
    line("fixture", `fixtures/intake/images/${c.fixture}.jpg`),
    line("provider", ctx.mode === "fake" ? "fake" : "gemini"),
    line("model", ctx.model),
    line("api_surface", "generate_content"),
    line("settings", { thinking: "default", store: false, image_px: "as stored in fixtures", temperature: "default", auth: ctx.auth, location: ctx.location }),
    line("mode", ctx.mode),
    line("run_at", ctx.run_at),
    line("commit_sha", ctx.commit_sha),
    line("command", ctx.command),
    line("runs", ctx.runs),
    line("expected", c.expected),
    line("observed", observed),
    line("scores", {
      U1: ran ? frac(scores, (r) => r.U1) : null,
      U2: ran ? frac(scores, (r) => r.U2) : null,
      U3: ran ? frac(scores, (r) => r.U3) : null,
      U4: ran ? frac(scores, (r) => r.U4) : null,
      M1: m1,
      M2: ran && (c.id === "T-PE-02" || c.id === "T-PE-04") ? frac(scores, (r) => r.expectations_ok) : null,
      M3: ran && (c.id === "T-PE-04" || c.id === "T-PE-05") ? frac(scores, qualityCheck) : null,
      M4_p50_ms: ran ? result.summary.latency_p50_ms : null,
      M4_p95_ms: ran ? result.summary.latency_p95_ms : null,
    }),
    line("verdict", verdict),
    line("edits_made", "none"),
    line("notes", notes),
  ].join("\n");
}

export function formatTable(ctx: RunContext, results: CaseResult[]): string {
  const head = `${ctx.mode === "fake" ? "FAKE HARNESS CHECK (not a model result)" : "REAL MODEL EVAL"} | prompt ${ctx.prompt_version} | model ${ctx.model ?? "n/a"} | auth ${ctx.auth} | ${ctx.runs} run(s) per case`;
  const rows = results.map((r) => {
    if (r.status === "skipped") return `${r.case.id}  ${r.case.fixture.padEnd(17)} NOT RUN  ${r.reason}`;
    const s = r.summary;
    const failed = [...new Set(r.scores.flatMap((x) => x.checks.filter((k) => !k.pass).map((k) => k.name)))];
    const flags = (["U1", "U2", "U3", "U4"] as const).filter((u) => r.scores.some((x) => !x[u]));
    const errs = [...new Set(r.scores.map((x) => x.error_code).filter(Boolean))];
    const why = [...(flags.length ? [`universal: ${flags.join(",")}`] : []), ...failed, ...(errs.length ? [`errors: ${errs.join(",")}`] : [])];
    return `${r.case.id}  ${r.case.fixture.padEnd(17)} ${s.verdict.toUpperCase().padEnd(5)}  ${s.pass_count}/${s.runs} runs  p50 ${s.latency_p50_ms ?? "-"}ms p95 ${s.latency_p95_ms ?? "-"}ms${why.length ? "  <- " + why.join("; ") : ""}`;
  });
  const notRun = results.filter((r) => r.status === "skipped").length;
  return [head, ...rows, notRun ? `\n${notRun} case(s) not run: the release rule needs all eight.` : ""].join("\n");
}
