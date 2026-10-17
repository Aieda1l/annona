# fixtures/intake/images provenance

Every file is public (repo is public from kickoff, D-023). Fake vision recognizes each file by the SHA-256 of its bytes, so **do not re-encode or edit them**. The hash map is built from the files at runtime, so replacing a file replaces its hash.

| File | Made by | When | License | Content check |
|---|---|---|---|---|
| `sandwich_platter.jpg` | Colin (Dev 1), generated drawing (Pillow) | 2026-10-17, after 12:30 PM PDT | Original work, CC0 | Abstract placeholder, not a photo of food. Checked: no personal or brand content. |
| `buffet_ambiguous.jpg` | same | same | same | Abstract blurred blobs. Checked: no personal or brand content. |
| `pasta_tray.jpg` | same | same | same | Abstract placeholder drawing. Checked: no personal or brand content. |
| `blurry.jpg` | same | same | same | Abstract heavily blurred shape. Checked: no personal or brand content. |
| `malformed_output.jpg` | same | same | same | Plain gradient; fake-only trigger for malformed model text. Checked: no personal or brand content. |

These are placeholders for the fake provider. Real team-taken synthetic photos for prompt evals (T-PE-*) will be listed here when added.
