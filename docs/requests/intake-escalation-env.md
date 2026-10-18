# Request: add GEMINI_ESCALATION_MODEL to the env surface

- **From:** Dev 1 (`feat/intake-gemini`)
- **To:** integration captain (Dev 4)
- **Type:** shared-config change (`.env.example`, `src/server/env.ts`); not a contract change
- **Status:** proposed

## Need

`src/lib/ai/index.ts` reads `process.env.GEMINI_ESCALATION_MODEL` directly to decide whether the Gemini adapter asks
a stronger model for a second opinion when the first answer is unconfident (`docs/PROMPT_EVAL.md` section 13).
Unset means `gemini-3.8-flash`; `off` disables it.

## Ask

Add `GEMINI_ESCALATION_MODEL` as an optional string to `getEnv()` (alongside `GEMINI_MODEL`), document it in
`.env.example`, and pass it to `createVisionProvider` if you want it validated in one place. Until then it is read
directly in the lane-owned barrel and works as described.

## Why it matters

The measured effect on the current fixtures is 3-4x latency and no accuracy gain, so the demo may want it `off`
(`GEMINI_ESCALATION_MODEL=off`) without a code change.
