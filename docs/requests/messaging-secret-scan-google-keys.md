# Request: the secret scan does not match the Google API key now being issued

From: Dev 3 (messaging). To: the captain (owns `docs/ARCHITECTURE.md`, section 9). Status: ACCEPTED by the captain (2026-10-18): a captain PR will add a shape-independent pattern (a `*_API_KEY` / `*_SECRET` / `*_TOKEN` / `*_PASSWORD` assignment of 16+ key characters) and a test, so the exact prefix is not needed; until it merges, the rule below stands. Found 2026-10-17 while setting up the real Gemini run.

## What I found

`SECRET_RE` in ARCHITECTURE section 9 matches Google API keys with `AIza[0-9A-Za-z_-]{35}`. The Gemini key issued for this project does **not** start with `AIza` (it is longer, 53 characters, and begins with a different prefix), so a line holding it, for example `GEMINI_API_KEY=<key>` in a diff, is **not matched** by the current scan. I checked this locally against the real key and printed only the result (not matched). Nothing was committed: the key lives in the macOS Keychain and in a git-ignored `.env.local`.

## Why it matters

The scan is what stops a key reaching a commit or a PR (IB-12 asks for it before any real Gemini key is used in a shared environment). Today it would let this key through.

## Proposed fix

Add a pattern for the new key shape to `SECRET_RE` and to anything that copies it (CI, hooks, the per-lane scan commands). I deliberately did not read the key again to derive the exact pattern, so it needs someone who can look at the key's format in Google AI Studio: take its fixed prefix and length, and match `<prefix>[A-Za-z0-9._-]{N,}` with some slack. Keep the old `AIza` branch too, since older keys still exist. Add a test line to whatever checks the scan so a key of the new shape is caught.

Until then, treat the Gemini key as unprotected by the scan: never paste it into a file other than the git-ignored `.env.local`, and never into a PR or comment.
