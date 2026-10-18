# fixtures/intake provenance

The repo is public (D-023). Per D-040, **every committed image is team-made or CC0**. Photos of unverified licence are kept out of version control in `fixtures/intake/eval-local/` (gitignored).

## Committed: `fixtures/intake/images/` (team-made, CC0)

The fake vision provider recognizes these by the SHA-256 of their bytes, so **do not re-encode or edit them** without re-running `pnpm vitest run tests/intake`. The map is built from the files at runtime.

| File | Made by | License | Content check |
|---|---|---|---|
| `sandwich_platter.jpg` | Colin (Dev 1), generated drawing (Pillow), 2026-10-17 | Original work, CC0 | Abstract placeholder; no personal or brand content. Fake-provider scene-1 image. |
| `buffet_ambiguous.jpg` | same | same | Abstract placeholder for covered dishes. |
| `blurry.jpg` | same | same | Abstract placeholder, out of focus. |
| `pasta_tray.jpg` | same | same | Abstract placeholder. |
| `malformed_output.jpg` | same | same | Plain gradient; fake-only trigger for malformed model text. |

These are drawings, not photos. They exercise the fake path and the demo flow's mechanics; they are not evidence about real-model accuracy.

## Local only: `fixtures/intake/eval-local/` (not committed)

Used by `pnpm eval:intake` (default `--images-dir`) and the gated smoke test `tests/intake/gemini.smoke.test.ts`. When a case's photos are absent the runner records the case as **skipped**, never failed, and the smoke test throws a message naming the missing file.

Expected files: `sandwich_platter`, `buffet_ambiguous`, `buffet_closed`, `dessert_bars`, `blurry`, `non_food`, `sushi_tray`, `packaged_label`, `injection_note` (all `.jpg`, at most 1024 px on the long side). Colin (Dev 1) supplied the set on 2026-10-17; sources were not recorded and **licences are unverified** (seven appear to be web-sourced stock or marketing photos; `buffet_closed.jpg` carries a visible stock watermark). Never commit them, and do not describe them as original work.

The nine photos were added by earlier commits of PR #30 and remain in that branch's history on the public remote; D-040 covers that limit. Eval results in `docs/PROMPT_EVAL.md` were produced with these local photos and cannot be reproduced from a clean checkout.
