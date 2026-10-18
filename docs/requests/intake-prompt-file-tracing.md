# Request: include the intake prompt file in the deployment bundle

- **From:** Dev 1 (`feat/intake-gemini`)
- **To:** integration captain (Dev 4)
- **Type:** shared-config change (`next.config.*`, deployment); not a contract change
- **Status:** proposed

## Need

`src/lib/ai/gemini.ts` reads `src/lib/ai/prompts/annona-intake.v1.md` from disk at runtime
(`process.cwd()` + `src/lib/ai/prompts/annona-intake.v1.md`). Next.js file tracing does not see a runtime
`readFileSync`, so a serverless deployment may omit the file.

## Failure mode if missing

The adapter fails closed: `status: "misconfigured"` and every call returns `PROVIDER_UNAVAILABLE`. The
manual form still works, but the real AI draft never appears. `GET /api/health` shows the vision provider
as misconfigured.

## Ask

Add `src/lib/ai/prompts/**` to `outputFileTracingIncludes` for the routes that run vision
(`/api/intake/drafts`, and the Photon inbound and simulated-inbound routes), alongside the existing
`fixtures/intake/images/**` entry the captain already adds for the fake provider.

## Verify

After deploy, `GET /api/health` reports vision `status: "ok"` in real mode, and one real draft succeeds.
