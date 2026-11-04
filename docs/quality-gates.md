# V1 quality gates

V1 release quality is gate-driven. If a gate fails, release work is not complete.

## Must-pass commands

Mandatory V1 threshold gates:

```bash
pnpm -w turbo run e2e:web e2e:desktop
```

CI runs the full web Playwright suite together with the gates:

```bash
pnpm -w turbo run e2e e2e:web e2e:desktop
```

- `e2e` (`@mps/web`) runs every Playwright spec under `apps/web/e2e/` except `e2e/gates/` (project `web-chromium`).
- `e2e:web` (`@mps/web`) runs `e2e/gates/` (project `web-gates`, never retried) and then verifies the metrics it wrote. Turbo runs it after `@mps/web#e2e` because both start the dev server on port 4173.
- `e2e:desktop` (`@mps/desktop`) runs `apps/desktop/test/gates/` through `apps/desktop/vitest.gates.config.ts`; the unit config (`vitest.config.ts`) excludes that directory, so `pnpm -w test` does not launch Chromium.

All e2e tasks are uncached (`"cache": false` in `turbo.json`). `MPS_GATE_FORCE_FAIL` is listed in their `env` so Turbo's strict environment mode passes it through to the gate scripts.

## What the gates measure

Each gate suite is wrapped by `scripts/run-gates.mjs`, which records the run start, runs the suite, and then calls `scripts/verify-thresholds.mjs --since <run start>`. The verifier rejects:

- a metrics file whose `generatedAt` is missing, unparsable, older than the run start, or in the future;
- a timing that is missing, non-finite, negative, or above its threshold;
- evidence files that are missing, empty, not the expected format, or older than the run start.

Timing thresholds (wall-clock time measured by the gate around the real UI flow, against stubbed server responses):

- `login-flow-ms <= 45000`
- `offline-cached-first-paint-ms <= 5000`
- `token-revoked-recovery-ms <= 60000`
- `logout-cleanup-ms <= 1000`

Visual evidence:

- Web: three full-page screenshots of the real wall at a 1920x1080 viewport, plus a WebM recording of the gate session. The verifier reads each PNG header and requires width 1920 and height of at least 1080; it checks the recording is a WebM (EBML) file. Frame rate and clip length are not claimed or checked.
- Web seed proof: the seeded wall scene `/wall?seed=v1-fixed-seed&profile=balanced` is rendered twice and a variant seed once; the gate hashes each frame and the verifier requires the two fixed-seed hashes to match and the variant hash to differ.
- Desktop: the desktop runtime runs in jsdom (no layout or paint), so the gate renders each segment's DOM snapshot in headless Chromium and screenshots it at a 1920x1080 viewport. There is no desktop recording or seed proof.

No golden-image comparison is performed; screenshots are evidence for review, not pixel baselines.

## Mandatory evidence naming

Evidence files use `milestone-scene-version` naming (`v1-mandatory-gates-r1`):

- `v1-mandatory-gates-r1-web-session.webm`
- `v1-mandatory-gates-r1-web-segment-1.png`
- `v1-mandatory-gates-r1-web-segment-2.png`
- `v1-mandatory-gates-r1-web-segment-3.png`
- `v1-mandatory-gates-r1-desktop-segment-1.png`
- `v1-mandatory-gates-r1-desktop-segment-2.png`
- `v1-mandatory-gates-r1-desktop-segment-3.png`

Metrics payloads consumed by threshold verification:

- `.omo/evidence/task-16-web-gates.metrics.json`
- `.omo/evidence/task-16-desktop-gates.metrics.json`

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
