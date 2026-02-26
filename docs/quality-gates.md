# V1 quality gates

V1 release quality is gate-driven. If a gate fails, release work is not complete.

## Must-pass command

```bash
pnpm -w turbo run e2e:web e2e:desktop
```

CI compatibility for this command depends on Turbo env hashing for `MPS_GATE_FORCE_FAIL` on `e2e`, `e2e:web`, and `e2e:desktop` tasks.

## Timing thresholds

Threshold enforcement is implemented in `scripts/verify-thresholds.mjs`.

- `login-flow-ms <= 45000`
- `offline-cached-first-paint-ms <= 5000`
- `token-revoked-recovery-ms <= 60000`
- `logout-cleanup-ms <= 1000`

## Mandatory evidence naming

Visual baseline artifacts use fixed seed `v1-fixed-seed` and `milestone-scene-version` naming.

- `v1-mandatory-gates-r1-web-1080p60-30s.webm`
- `v1-mandatory-gates-r1-web-segment-1.png`
- `v1-mandatory-gates-r1-web-segment-2.png`
- `v1-mandatory-gates-r1-web-segment-3.png`
- `v1-mandatory-gates-r1-desktop-1080p60-30s.webm`
- `v1-mandatory-gates-r1-desktop-segment-1.png`
- `v1-mandatory-gates-r1-desktop-segment-2.png`
- `v1-mandatory-gates-r1-desktop-segment-3.png`

Metrics payloads consumed by threshold verification:

- `.sisyphus/evidence/task-16-web-gates.metrics.json`
- `.sisyphus/evidence/task-16-desktop-gates.metrics.json`

## Docs parity check

```bash
pnpm -w verify:docs-parity
pnpm -w verify:docs-parity --strict
```

Use strict mode to detect drift where documentation starts claiming unsupported capabilities.

## Failure-path contract

Use this command to validate deterministic non-zero gate failures:

```bash
MPS_GATE_FORCE_FAIL=logout-cleanup pnpm -w turbo run e2e:web e2e:desktop
```

Supported force-fail values are `login-flow`, `offline-cached-first-paint`, `token-revoked-recovery`, `logout-cleanup`, and `visual-baseline`.

## Known non-blocking warning

Web builds may report unresolved `/fonts/soehne-*.woff2` warnings when those static font files are not present in the deploy target. This warning is currently non-blocking for build completion.
