# Agent workspace layout (.omo / .agent)

Migrated on 2026-11-04 from the legacy oh-my-opencode layout:

| Old | New | Tracked |
|---|---|---|
| `.sisyphus/plans/` | `.omo/plans/` | yes |
| `.sisyphus/notepads/` | `.omo/notepads/` | yes |
| `.sisyphus/boulder.json` | `.omo/boulder.json` | no (runtime state, gitignored) |
| `.sisyphus/evidence/` | `.omo/evidence/` | no (gitignored) |
| `.opencode/skills/` | `.agent/skills/` | yes |

## Code that depends on `.omo/evidence`

The evidence directory is not just agent scratch space — the gate pipeline reads and writes it:

- `apps/web/playwright.config.ts` (`artifactRoot`)
- `apps/web/e2e/gates/mandatory-v1-gates.spec.ts`, `apps/desktop/test/gates/mandatory-v1-gates.test.ts` (`EVIDENCE_ROOT`)
- `e2e:web` / `e2e:desktop` scripts pass `../../.omo/evidence/task-16-*-gates.metrics.json` to `scripts/verify-thresholds.mjs`
- `turbo.json` outputs, `.github/workflows/quality-gates.yml` artifact upload
- `scripts/contracts/wall-contracts.json` and `scripts/verify-docs-parity.mjs` assert these literal paths in docs/package scripts

Renaming the directory again requires updating all of the above together; `pnpm -w verify:docs-parity` catches doc drift.

## Known pre-existing failure

`node scripts/verify-wall-contracts.mjs` fails on `web-onboarding.wall-path-constant`
(missing `const WALL_PATHNAME = ONBOARDING_WALL_PATHNAME` in `apps/web/src/onboarding/runtime.ts`).
This predates the migration (present on `d36b222`).
