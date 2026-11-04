# Task 16 V1 gate evidence protocol

This repository enforces Task 16 mandatory V1 thresholds using package-level gate suites and a shared verifier script.

## Gate command

```bash
pnpm -w turbo run e2e:web e2e:desktop
```

Each gate suite runs through `scripts/run-gates.mjs`, which records the run start before the suite starts and passes it to `scripts/verify-thresholds.mjs --since`. Metrics or evidence files produced before that moment are rejected, so a stale payload from an earlier run cannot satisfy the gate. Gates are never retried (`retries: 0` for the `web-gates` Playwright project, `retry: 0` in `apps/desktop/vitest.gates.config.ts`).

## Thresholds

- `login-flow-ms <= 45000`
- `offline-cached-first-paint-ms <= 5000`
- `token-revoked-recovery-ms <= 60000`
- `logout-cleanup-ms <= 1000`

Timings are wall-clock durations measured by the gate around the real UI flow, with server responses stubbed by the test. The verifier rejects missing, non-finite, negative, and over-threshold values.

`logout-cleanup-ms` is measured at session artifact removal. Remembered field restoration checks are required and validated separately.

Threshold validation is implemented in:

- `scripts/verify-thresholds.mjs`

## Evidence the verifier checks

Evidence files follow `milestone-scene-version` naming (`v1-mandatory-gates-r1`):

- `v1-mandatory-gates-r1-web-session.webm`
- `v1-mandatory-gates-r1-web-segment-1.png`
- `v1-mandatory-gates-r1-web-segment-2.png`
- `v1-mandatory-gates-r1-web-segment-3.png`
- `v1-mandatory-gates-r1-desktop-segment-1.png`
- `v1-mandatory-gates-r1-desktop-segment-2.png`
- `v1-mandatory-gates-r1-desktop-segment-3.png`

What is verified, and only this:

- Screenshots: each file exists, is newer than the run start, is a PNG, and its header reports width 1920 and height of at least 1080 (full-page captures at a 1920x1080 viewport).
- Web session recording: exists, is newer than the run start, and is a WebM (EBML) file. Its frame rate and duration are not measured; Playwright records at its own fixed rate.
- Web seed proof: frame hashes of the seeded wall scene `/wall?seed=v1-fixed-seed&profile=balanced` (rendered twice) and of a variant seed. The two fixed-seed hashes must match and the variant hash must differ.
- Desktop: screenshots only. The desktop gate runs in jsdom and renders DOM snapshots in Chromium for review; it records no video and makes no seed claim.

There is no golden-image comparison.

## Metrics payloads

Gate suites write JSON payloads consumed by the verifier, stamped with `generatedAt`:

- `.omo/evidence/task-16-web-gates.metrics.json`
- `.omo/evidence/task-16-desktop-gates.metrics.json`

## Failure-mode run

Use forced gate failure to produce threshold-specific error logs:

```bash
MPS_GATE_FORCE_FAIL=logout-cleanup pnpm -w turbo run e2e:web e2e:desktop
```

`MPS_GATE_FORCE_FAIL` is declared in the `env` of the gate tasks in `turbo.json`, so Turbo's strict environment mode passes it through to the gate scripts. Gate tasks are uncached, so every run executes.

Supported force-fail values:

- `login-flow`
- `offline-cached-first-paint`
- `token-revoked-recovery`
- `logout-cleanup`
- `visual-baseline`

## Privacy posture

Gate logs and metrics must not contain raw credentials, auth headers, or tokens. Keep diagnostics evidence limited to elapsed timing and deterministic artifact paths.
