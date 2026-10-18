import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import type { VisionProvider } from "@/contracts";
import { EVAL_CASES, scoreRun, summarizeCase, type RunScore } from "./eval-cases";
import { buildYamlRecord, formatTable, type CaseResult, type RunContext } from "./eval-report";
import { createFakeVisionProvider } from "./fake";
import { createGeminiProvider, DEFAULT_PROMPT_VERSION, PROMPT_VERSIONS, resolveEscalationModel, type GeminiAttemptEvent, type PromptVersion } from "./gemini";

// Prompt eval runner (PROMPT_EVAL §5-§6, T-PE-01..08).
//   pnpm eval:intake                         fake provider: a HARNESS CHECK only, never a model result
//   VISION_PROVIDER=gemini GEMINI_API_KEY=… pnpm eval:intake          real model, API key
//   VISION_PROVIDER=gemini GOOGLE_CLOUD_PROJECT=<id> pnpm eval:intake real model, Vertex AI with ADC (no key)
// Options: --prompt-version v1|v2 (default: the adapter default)  --runs N (default 3)  --cases T-PE-01,T-PE-03  --out <file> (YAML records; otherwise printed)
//          --escalation-model <id|off>  (default: GEMINI_ESCALATION_MODEL, else gemini-3.8-flash, as in production)
//          Cases with several fixtures run --runs times per image. --images-dir <dir>  read <fixture>.jpg from another directory (default fixtures/intake/eval-local, which is gitignored)
// Use synthetic photos only. Credentials are never printed or written; failures are reported by error code.

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_IMAGES = "fixtures/intake/eval-local"; // gitignored (D-040); cases whose photos are absent are skipped, never failed

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return argv[i]!.includes("=") ? argv[i]!.split("=").slice(1).join("=") : argv[i + 1];
}

function fail(message: string, code = 2): never {
  console.error(message);
  process.exit(code);
}

function pdtNow(): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} PDT`;
}

function commitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

type Built = {
  provider: VisionProvider;
  mode: "real" | "fake";
  configuredModel: string | null;
  auth: string;
  location: string | null;
  escalation: string;
};

function buildProvider(promptVersion: PromptVersion, onAttempt: (e: GeminiAttemptEvent) => void): Built {
  if (process.env.VISION_PROVIDER !== "gemini") {
    return { provider: createFakeVisionProvider(), mode: "fake", configuredModel: null, auth: "none (fake)", location: null, escalation: "off" };
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const escalationModel = resolveEscalationModel(model, arg("escalation-model") ?? process.env.GEMINI_ESCALATION_MODEL);
  const escalation = escalationModel ?? "off";
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey) {
    return { provider: createGeminiProvider({ client: new GoogleGenAI({ apiKey }), model, promptVersion, onAttempt, escalation_model: escalationModel }), mode: "real", configuredModel: model, auth: "api_key", location: null, escalation };
  }
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    // Never fall back to fake when the real model was requested.
    fail("VISION_PROVIDER=gemini needs GEMINI_API_KEY, or GOOGLE_CLOUD_PROJECT for Vertex AI with Application Default Credentials.");
  }
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global";
  const client = new GoogleGenAI({ vertexai: true, project, location });
  return { provider: createGeminiProvider({ client, model, promptVersion, onAttempt, escalation_model: escalationModel }), mode: "real", configuredModel: model, auth: "vertex_adc", location, escalation };
}

async function main() {
  const runs = Number(arg("runs") ?? 3);
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) fail("--runs must be a whole number from 1 to 10.");
  const wanted = arg("cases")?.split(",").map((s) => s.trim().toUpperCase());
  const cases = wanted ? EVAL_CASES.filter((c) => wanted.includes(c.id)) : EVAL_CASES;
  if (cases.length === 0) fail(`No matching cases. Known: ${EVAL_CASES.map((c) => c.id).join(", ")}`);

  const imagesDir = join(process.cwd(), arg("images-dir") ?? DEFAULT_IMAGES);
  const requested = arg("prompt-version") ?? DEFAULT_PROMPT_VERSION;
  if (!(PROMPT_VERSIONS as readonly string[]).includes(requested)) fail(`--prompt-version must be one of ${PROMPT_VERSIONS.join(", ")}.`);
  const promptVersion = requested as PromptVersion;
  let attemptsInRun = 0;
  let escalatedInRun = false;
  const built = buildProvider(promptVersion, (e) => {
    // Retries of the first model count as attempts; the stronger-model second opinion is tracked separately.
    if (e.escalated) escalatedInRun = true;
    else attemptsInRun++;
  });
  const results: CaseResult[] = [];
  const modelsSeen = new Set<string>();

  for (const c of cases) {
    const missing = c.fixtures.filter((f) => !existsSync(join(imagesDir, `${f}.jpg`)));
    if (missing.length > 0) {
      const where = arg("images-dir") ?? DEFAULT_IMAGES;
      results.push({ status: "skipped", case: c, reason: `${missing.map((f) => `${f}.jpg`).join(", ")} missing from ${where}` });
      continue;
    }
    const scores: RunScore[] = [];
    for (const fixture of c.fixtures) {
      const bytes_base64 = readFileSync(join(imagesDir, `${fixture}.jpg`)).toString("base64");
      for (let i = 0; i < runs; i++) {
        attemptsInRun = 0;
        escalatedInRun = false;
        const started = performance.now();
        const outcome = await built.provider.analyzeFoodImage({ image: { mime: "image/jpeg", bytes_base64 } });
        const score = scoreRun(c, outcome, Math.round(performance.now() - started), fixture);
        if (attemptsInRun > 0) score.attempts = attemptsInRun;
        if (escalatedInRun) score.escalated = true;
        if (score.suggestion?.model) modelsSeen.add(score.suggestion.model);
        scores.push(score);
      }
    }
    results.push({ status: "ran", case: c, scores, summary: summarizeCase(c, scores) });
  }

  const ctx: RunContext = {
    prompt_version: promptVersion,
    // The model ID the API reported, not the one we asked for.
    model: built.mode === "fake" ? null : modelsSeen.size > 0 ? [...modelsSeen].join(", ") : built.configuredModel,
    mode: built.mode,
    auth: built.auth,
    escalation: built.escalation,
    location: built.location,
    run_at: pdtNow(),
    commit_sha: commitSha(),
    command: ["pnpm eval:intake", ...process.argv.slice(2)].join(" "),
    runs,
  };

  console.log(formatTable(ctx, results));
  const records = results.map((r) => buildYamlRecord(ctx, r)).join("\n---\n");
  const out = arg("out");
  if (out) {
    writeFileSync(out, records + "\n");
    console.log(`\nWrote ${results.length} record(s) to ${out}`);
  } else {
    console.log(`\n${records}`);
  }

  const ran = results.filter((r) => r.status === "ran");
  if (ran.length === 0) fail("No case could run: every fixture is missing.", 2);
  if (ran.some((r) => r.status === "ran" && r.summary.verdict === "fail")) process.exit(1);
}

main().catch(() => fail("Eval runner crashed. Run with a single case to narrow it down.", 3));
