# Task 16 V1 gate evidence protocol

This repository enforces Task 16 mandatory V1 thresholds using package-level gate suites and a shared verifier script.

## Gate command

```bash
pnpm -w turbo run e2e:web e2e:desktop
```

## Thresholds

- `login-flow-ms <= 45000`
- `offline-cached-first-paint-ms <= 5000`
- `token-revoked-recovery-ms <= 60000`
- `logout-cleanup-ms <= 1000`

`logout-cleanup-ms` is measured at session artifact removal. Remembered field restoration checks are required and validated separately.

Threshold validation is implemented in:

- `scripts/verify-thresholds.mjs`

## Deterministic baseline naming

All mandatory baseline artifacts follow `milestone-scene-version` naming with fixed seed `v1-fixed-seed`:

- `v1-mandatory-gates-r1-web-1080p60-30s.webm`
- `v1-mandatory-gates-r1-web-segment-1.png`
- `v1-mandatory-gates-r1-web-segment-2.png`
- `v1-mandatory-gates-r1-web-segment-3.png`
- `v1-mandatory-gates-r1-desktop-1080p60-30s.webm`
- `v1-mandatory-gates-r1-desktop-segment-1.png`
- `v1-mandatory-gates-r1-desktop-segment-2.png`
- `v1-mandatory-gates-r1-desktop-segment-3.png`

## Metrics payloads

Gate suites write deterministic JSON payloads consumed by the verifier:

- `.sisyphus/evidence/task-16-web-gates.metrics.json`
- `.sisyphus/evidence/task-16-desktop-gates.metrics.json`

## Failure-mode run

Use forced gate failure to produce threshold-specific error logs:

```bash
MPS_GATE_FORCE_FAIL=logout-cleanup pnpm -w turbo run e2e:web e2e:desktop
```

`MPS_GATE_FORCE_FAIL` is part of Turbo env hashing for gate tasks, so forced-failure runs execute instead of replaying a cached success.

Supported force-fail values:

- `login-flow`
- `offline-cached-first-paint`
- `token-revoked-recovery`
- `logout-cleanup`
- `visual-baseline`

## Privacy posture

Gate logs and metrics must not contain raw credentials, auth headers, or tokens. Keep diagnostics evidence limited to elapsed timing and deterministic artifact paths.
