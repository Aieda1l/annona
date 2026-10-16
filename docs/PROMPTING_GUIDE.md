# How the bootstrap prompts apply Google's 2025 Prompt Engineering paper

**Source:** Lee Boonstra, *Prompt Engineering*, February 2025, supplied 68-page PDF. This note records specifically source-supported practices; application to Annona is our design recommendation, not a claim from the paper about Claude Code, food safety or DubHacks.

| Source in PDF | Paper's recommendation | Annona bootstrap adaptation |
|---|---|---|
| pp. 15–17 | One/few-shot examples, relevant varied edge cases | Each human prompt contains a success and failure example; AI intake eval set covers ambiguous photos and hidden allergens |
| pp. 18–24 | Separate system, contextual and role prompting | State each developer's role, shared Annona context, bounded goal and owned output paths |
| pp. 25–28 | Step-back prompting for underlying general principles | Research needs/safety/competition constraints before picking architecture or tools |
| pp. 54–57 | Give examples; use simple, clear instructions and explicit outputs; prefer affirmative instructions, while keeping constraints when needed for safety | Write actionable outcomes and acceptance gates; preserve strict safety prohibitions |
| p. 58 | Use variables to reuse prompts | Lane, branch, the `baseline` git tag (the prompts themselves are never edited; the captain posts `BASELINE_SHA = git rev-parse 'baseline^{commit}'`, D-023), typed contract files and architecture baseline; intake prompt slots `{{donor_hint}}`, `{{allergen_list}}` |
| pp. 59–60 | Experiment with input/output formats; use schema-oriented outputs for extraction | Schema-driven AI intake (model-facing `VisionModelOutput`, adapter-stamped provenance; CONTRACTS v0.2 §3.3), consistent structured contracts and typed event results |
| pp. 61–63 | JSON can fail/truncate; schema can clarify structured input | Runtime strict parse/validate plus a claim-word guard (T-IN-11); fail closed for invalid output and unknown information |
| pp. 64–66 | Document versions, outputs, test feedback and prompt attempts | `docs/PROMPT_EVAL.md` and eval fixtures with model/version, expected output, pass/fail |

The February 2025 paper describes model parameters (temperature, top-p, top-k) in Gemini-era examples. Do **not** copy those numbers as universal defaults into current Claude Code settings; model availability/configuration changes. For this project, prioritize empirical validations of images, structured outputs and edge cases. JSON structure makes errors easier to detect; it does **not** verify allergen presence, compliance or safe food handling.

## Short, reusable evaluation record

The prompt registry, few-shot set, eval cases T-PE-01..T-PE-08, scoring rubric and full record template live in `docs/PROMPT_EVAL.md`.

```yaml
prompt_id: annona-intake
prompt_version: v1
case_id: T-PE-02
purpose: create an uncertain, editable food-photo draft
model: provider/model/version actually used
input_fixture: fixtures/intake/images/buffet_ambiguous.jpg
expected: dish confidence low; >=2 uncertainty_notes; requires_donor_confirmation true
observed: # record real output only
schema_valid: false # update after actual test
safety_regression: unknown # update after actual test
notes: not yet executed
```

Recommended first evaluations: the eight synthetic cases **T-PE-01..T-PE-08** in `docs/PROMPT_EVAL.md` §5 (clear sandwich/wrap platter, ambiguous buffet, plain dessert bars that may contain nuts, blurry photo, non-food photo, sushi-style tray, team-made ingredient label, prompt-injection text in the image). The expected behavior is **honest uncertainty**, not unearned food-safety confidence. Handling and holding history are never inferred from a photo; the donor attests them and the deterministic gate decides.
