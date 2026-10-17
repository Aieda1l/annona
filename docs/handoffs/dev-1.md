# Dev 1 handoff log — Vision + donor intake (`feat/intake`)

Append-only. Newest entry last.

## 2026-10-17 — SP-4 and SP-14 kickoff spikes

Scripts and raw outputs stayed outside version control (`.spikes-local/`, excluded via `.git/info/exclude`). No credentials were printed, logged or saved.

**Setup:** `@google/genai@2.30.0` in Vertex AI mode, Application Default Credentials, no API key. Project `annona-511918`. Prompt asked for a JSON description, with every observation treated as unverified. One `models.generateContent` call per file, `responseMimeType: "application/json"`.

| Test | Input | Model | Location | MIME sent | Latency | Status | JSON |
|---|---|---|---|---|---|---|---|
| SP-4 (first try) | synthetic drawing | `gemini-3.5-flash-lite` | `us-central1` | image/jpeg | 4051 ms | **404 NOT_FOUND** ("Publisher model ... not found or your project does not have access to it") | n/a |
| SP-4 | synthetic drawing, 36,203 B | `gemini-3.5-flash-lite` | `global` | image/jpeg | 5176 ms | OK | PARSED |
| Real-food check (not a spike item) | team member's own photo, 108,046 B | `gemini-3.5-flash-lite` | `global` | image/jpeg | 7073 ms | OK | PARSED |
| SP-14 JPEG | Photon-downloaded file, unchanged, 41,497 B | `gemini-3.5-flash-lite` | `global` | image/jpeg | 4773 ms | OK | PARSED |
| SP-14 HEIC | Photon-downloaded file, unchanged, 1,456,484 B | `gemini-3.5-flash-lite` | `global` | image/heic | 5444 ms | OK | PARSED |

**Verdicts:** SP-4 VERIFIED. SP-14 HEIC_ACCEPTED (original bytes, no transcoding). SP-14 JPEG ACCEPTED. Photo intake: GO.

**Caveats:**
- MIME types were taken from file magic bytes (`ffd8ffe0` JFIF; `ftypheic`), not from the MIME type Photon reported. Dev 3 has not confirmed the reported value.
- Each spike was a single call per file. Latency and reliability are not characterized.
- Model output is unverified AI observation. The JPEG sample listed eight separate "dinosaur chicken nugget" entries, so the draft step needs de-duplication or counts.

**Contract/design discrepancies for the captain (no `docs/requests/` file filed yet):**
1. D-012 and the Dev 1 prompt assume an AI Studio key (`GEMINI_API_KEY`, `apiKey` passed explicitly). The spikes used ADC on Vertex instead. The adapter needs an auth-mode decision.
2. On Vertex, `gemini-3.5-flash-lite` returned 404 at `us-central1` and worked at `global`. If Vertex is chosen, location must be configurable and default to `global`.

**Blockers + safety risks:** none new. No real donor or recipient data was used.

**Next smallest action:** captain decision on Vertex/ADC vs AI Studio key; meanwhile start slice 1 (fake vision + parsing, RED tests first).

## 2026-10-17 evening: HEIC_ACCEPTED = true (feat/intake-heic)

Flipped per CONTRACTS §9.3 on the SP-14 result above (real Photon-downloaded HEIC, 1,456,484 B, parsed by `gemini-3.5-flash-lite`). Intake now accepts `image/heic|heif` from `messaging` only, 5 MB cap. **Not yet end to end:** core `storeDonationImage` still refuses HEIC (request: `docs/requests/intake-heic-core-allowlist.md`), and the stored HEIC may not render in non-Safari browsers. Dev 3's `photo.ts` passes Photon's content-type through unfiltered and does not sniff.
