# Poster Loading Stability & No-Remount Wall Plan

## TL;DR
> **Summary**: Stabilize poster wall behavior by fixing repeat-heavy queue ingestion and eliminating idle-triggered full wall remounts, while preserving current visual design and selector contracts.
> **Deliverables**:
> - Queue/refill + pagination path that expands poster diversity instead of recycling a small pool
> - Wall interaction/render path that does not clear/rebuild the full wall on ~8s idle-hide events
> - Safer stream fallback gating with deterministic one-shot behavior
> - Regression coverage proving no periodic full remount and host parity (web/desktop)
> **Effort**: Large
> **Parallel**: YES - 3 waves
> **Critical Path**: T2 (queue policy tests) → T3/T4/T5 (refill+paging wiring) → T6/T7 (no-remount path) → T9 (full regression)

## Context
### Original Request
- 用户要先调查海报加载逻辑问题与改进思路。
- 进一步确认两个核心症状：**重复海报** + **偶发全屏刷新**。
- 用户补充：全屏刷新**更多发生在空闲约 8 秒后**。

### Interview Summary
- Repetition risk is strongly tied to missing host wiring of `createQueueRefillFetchAdapter` and first-page-heavy refresh behavior.
- Full-screen refresh correlates with `WALL_IDLE_HIDE_MS = 8_000` interaction path that can trigger `render()`, and `renderWall()` currently clears container + rebuilds wall.
- Fallback stream check is brittle (`streamApplied` + `[data-testid="poster-item-0"]` sentinel).
- Existing wall contract/e2e tests are strong but do not fully lock “no full remount on idle-hide / diagnostics tick” across both hosts.

### Metis Review (gaps addressed)
- Added explicit duplicate policy acceptance criteria (small catalog vs large catalog behavior).
- Added host parity guardrail (web/desktop idle-hide behavior must be aligned or explicitly documented).
- Added one-shot fallback criterion (prevent render-loop style fallback recursion).
- Added edge-case coverage for in-flight refill + route transition + deferred patch interactions.

## Work Objectives
### Core Objective
Ensure poster wall updates are incremental and stable: eliminate idle-triggered full remounts and reduce repeat-heavy poster rotation by fixing refill/pagination flow.

### Deliverables
- Stable queue refill integration in web + desktop onboarding runtimes.
- Cursor-aware ingestion refresh behavior with deterministic progression policy.
- Remount-safe wall update path for idle-hide/reveal/diagnostics activity.
- Hardened stream fallback readiness checks (without brittle single-tile sentinel dependence).
- End-to-end proof (tests + evidence) that no periodic full-screen refresh occurs under normal idle use.

### Definition of Done (verifiable conditions with commands)
- `pnpm -w lint` passes.
- `pnpm -w typecheck` passes.
- `pnpm -w test` passes.
- `pnpm -w build` passes.
- `pnpm -w e2e` passes.
- `node scripts/verify-wall-contracts.mjs` passes.
- Added/updated tests prove:
  - no full wall remount on idle-hide cycles;
  - stream fallback is one-shot and recovers;
  - repeat policy behaves as specified for large and small catalogs.

### Must Have
- Preserve existing wall visual style and selector contracts (`poster-wall-root`, `wall-poster-grid`, `poster-item-*`, controls).
- Preserve user-visible diagnostics interval contract (`1000ms`).
- Preserve reconnect/manual-refresh semantics.
- Keep all changes in existing architecture (no renderer rewrite).

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No broad redesign of wall UI, animation language, or controls layout.
- No unrelated onboarding/auth/platform refactors.
- No masking fix by simply increasing idle timers.
- No fallback render loops or repeated full remount cascades.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: **TDD** for queue/remount-critical logic; integration/e2e verification for host behavior.
- QA policy: Every task includes agent-executed happy + failure scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Shared dependencies are extracted into Wave 1.

Wave 1 (Foundation + contracts): T1, T2, T3, T4, T5

Wave 2 (No-remount runtime path): T6, T7, T8

Wave 3 (Stabilization + parity regression): T9

### Dependency Matrix (full, all tasks)
| Task | Depends On | Blocks |
|---|---|---|
| T1 | - | T6, T7, T8, T9 |
| T2 | - | T3, T4, T5, T9 |
| T3 | T2 | T5, T9 |
| T4 | T2 | T5, T9 |
| T5 | T3, T4 | T9 |
| T6 | T1 | T7, T8, T9 |
| T7 | T1, T6 | T8, T9 |
| T8 | T1, T6, T7 | T9 |
| T9 | T1,T2,T3,T4,T5,T6,T7,T8 | Final verification wave |

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 5 tasks → deep (3), unspecified-high (2)
- Wave 2 → 3 tasks → deep (1), unspecified-high (2)
- Wave 3 → 1 task → unspecified-high (1)

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Lock no-remount baseline and selector invariants

  **What to do**: Add deterministic regression probes that capture wall root/grid node identity over time and assert selector invariants before behavioral changes. Capture baseline evidence for web + desktop on `/wall`.
  **Must NOT do**: Do not change visual styles, timing constants, or selector names in this task.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: broad regression scaffolding across web/desktop tests.
  - Skills: [`playwright`] — needed for DOM identity + UI evidence collection.
  - Omitted: [`frontend-design`] — no UI redesign is allowed.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [6,7,8,9] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/src/onboarding/runtime.ts:803-932` — `renderWall()` clears container and remounts wall.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts:926-1023` — desktop parity path also clears/remounts.
  - Pattern: `packages/core/src/wall/constants.ts:1` — `WALL_IDLE_HIDE_MS = 8_000`.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts` — wall entry + selector usage pattern.
  - Test: `apps/desktop/test/onboarding-auth.test.ts` — desktop wall contract coverage.

  **Acceptance Criteria** (agent-executable only):
  - [x] Add no-remount probe utilities/tests in non-gating mode (baseline capture only) for `poster-wall-root` and `wall-poster-grid` identity during idle-hide cycles.
  - [x] Existing selector contracts remain intact: `poster-wall-root`, `wall-poster-grid`, `poster-item-0`, `manual-refresh-button`, `diagnostics-open`.
  - [x] Baseline evidence stored under `.sisyphus/evidence/task-1-*`.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Web idle stability baseline
    Tool: Playwright
    Steps: Complete onboarding flow to /wall; capture handles for `[data-testid="poster-wall-root"]` and `[data-testid="wall-poster-grid"]`; wait >= 10s without navigation; compare identity.
    Expected: Baseline probe output is captured deterministically; pass/fail gate is deferred to T7/T9 after runtime remount fixes.
    Evidence: .sisyphus/evidence/task-1-web-idle-baseline.json

  Scenario: Desktop selector contract baseline
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test -- test/onboarding-auth.test.ts` and extract assertions for wall selectors.
    Expected: Selector assertions pass; evidence logs contain wall selector checks.
    Evidence: .sisyphus/evidence/task-1-desktop-selector-baseline.txt
  ```

  **Commit**: YES | Message: `test(wall): add no-remount baseline probes` | Files: [`apps/web/e2e/**`, `apps/desktop/test/**`, `.sisyphus/evidence/**`]

- [x] 2. Define and test repeat policy + queue refill contract

  **What to do**: Encode repeat policy in runtime queue tests and enforce deterministic refill contract (`low < 10`, `target = 40`, single-flight refill, dedupe by media identity).
  **Must NOT do**: Do not modify host UI/runtime rendering in this task.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: policy design + deterministic queue state behavior.
  - Skills: [] — core queue modules already present.
  - Omitted: [`playwright`] — pure runtime/unit logic.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [3,4,5,9] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `packages/core/src/runtime/poster-queue.ts` — queue state and refill intent API.
  - Pattern: `packages/core/src/runtime/poster-queue-refill-adapter.ts` — refill adapter state behavior.
  - Test: `packages/core/test/runtime/poster-queue.test.ts` — queue policy constants and transitions.
  - Test: `packages/core/test/runtime/poster-queue-refill.test.ts` — low-watermark/refill/single-flight patterns.

  **Acceptance Criteria** (agent-executable only):
  - [x] Repeat policy test added: for unique pool >= 40, no duplicate emission before first cycle exhaustion.
  - [x] Small-catalog policy test added: for unique pool < 40, repeats are allowed but must remain dedupe-consistent (no duplicate enqueue inflation).
  - [x] Refill contract tests pass for size 9/10/39/40 boundary conditions.
  - [x] Single in-flight refill guarantee is preserved under concurrent calls.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Large-catalog repeat suppression
    Tool: Bash
    Steps: Run queue policy tests with fixture pool >= 40 and consume sequentially through one full cycle.
    Expected: No repeated media identity before cycle exhaustion.
    Evidence: .sisyphus/evidence/task-2-large-catalog-repeat-policy.txt

  Scenario: Refill race handling
    Tool: Bash
    Steps: Trigger concurrent refill requests while queue size is 9.
    Expected: Exactly one fetch call is in flight; resulting queue size is deterministic.
    Evidence: .sisyphus/evidence/task-2-refill-singleflight.txt
  ```

  **Commit**: YES | Message: `test(core-runtime): codify poster repeat and refill policy` | Files: [`packages/core/test/runtime/**`, `packages/core/src/runtime/**`]

- [x] 3. Wire refill fetch adapter into web runtime ingestion controller

  **What to do**: In web onboarding runtime, pass `createQueueRefillFetchAdapter` into `createOnboardingIngestionController` so queue top-ups can fetch beyond in-memory wrap-only mode.
  **Must NOT do**: Do not alter wall visuals or route structure.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: cross-module runtime wiring affecting ingestion behavior.
  - Skills: [] — local runtime contracts are sufficient.
  - Omitted: [`frontend-design`] — behavior wiring only.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [5,9] | Blocked By: [2]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/src/onboarding/runtime.ts` — ingestion controller creation and options.
  - API/Type: `packages/core/src/runtime/onboarding-ingestion.ts:76-86` — `createQueueRefillFetchAdapter` option contract.
  - Pattern: `packages/core/src/runtime/onboarding-ingestion.ts:217-222` — current fallback `allowWrap: true` when adapter absent.
  - Test: `packages/core/test/runtime/onboarding-ingestion-queue-integration.test.ts` — integration patterns for queue/refill adapter.

  **Acceptance Criteria** (agent-executable only):
  - [x] Web runtime passes a non-null refill adapter factory to ingestion controller.
  - [x] Diagnostics logs include adapter-state fields for refill completion in web flow.
  - [x] No regression in manual refresh and reconnect tests.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Web queue refill uses adapter path
    Tool: Playwright
    Steps: Enter /wall; drain stream with repeated ticks; inspect diagnostics event payloads for `queue.refill-completed` adapter state.
    Expected: Adapter state is non-null and refill source is fetch-based (not wrap-only fallback).
    Evidence: .sisyphus/evidence/task-3-web-adapter-refill.json

  Scenario: Web refresh/reconnect regression guard
    Tool: Bash
    Steps: Run `pnpm --filter @mps/web test -- -t "reconnect"` and `pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts --grep "manual refresh"`.
    Expected: Existing reconnect/manual-refresh behavior remains green.
    Evidence: .sisyphus/evidence/task-3-web-regression.txt
  ```

  **Commit**: YES | Message: `feat(web-runtime): wire queue refill adapter into ingestion controller` | Files: [`apps/web/src/onboarding/runtime.ts`, `packages/core/test/runtime/**`, `apps/web/**`]
- [x] 4. Wire refill fetch adapter into desktop runtime ingestion controller

  **What to do**: Apply the same adapter wiring in desktop runtime so queue refill behavior matches web and no longer relies on wrap-only fallback in normal operation.
  **Must NOT do**: Do not change desktop-specific platform extension flows (display/autostart/vault) in this task.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: host parity at runtime integration boundary.
  - Skills: [] — local code patterns already established.
  - Omitted: [`frontend-design`] — no styling changes.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [5,9] | Blocked By: [2]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/desktop/src/onboarding/runtime.ts` — ingestion controller creation options.
  - API/Type: `packages/core/src/runtime/onboarding-ingestion.ts:76-86` — adapter factory contract.
  - Pattern: `packages/core/src/runtime/onboarding-ingestion.ts:217-222` — wrap fallback path when adapter missing.
  - Test: `apps/desktop/test/onboarding-auth.test.ts` — desktop onboarding/wall stability assertions.

  **Acceptance Criteria** (agent-executable only):
  - [x] Desktop runtime passes non-null refill adapter factory to ingestion controller.
  - [x] Desktop queue refill diagnostics include adapter state (not null) during refill completion.
  - [x] Desktop wall tests remain green after adapter wiring.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Desktop queue refill uses adapter path
    Tool: Bash
    Steps: Run desktop runtime test flow that drains queue and triggers refill; inspect emitted diagnostics payload.
    Expected: Adapter state is present; refill path is fetch-based.
    Evidence: .sisyphus/evidence/task-4-desktop-adapter-refill.txt

  Scenario: Desktop onboarding parity guard
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test -- test/onboarding-auth.test.ts`.
    Expected: No regression in onboarding→wall flow and manual refresh behavior.
    Evidence: .sisyphus/evidence/task-4-desktop-regression.txt
  ```

  **Commit**: YES | Message: `feat(desktop-runtime): wire queue refill adapter into ingestion controller` | Files: [`apps/desktop/src/onboarding/runtime.ts`, `apps/desktop/test/**`, `packages/core/test/runtime/**`]

- [x] 5. Implement cursor progression policy for ingestion refresh and refill adapter continuity

  **What to do**: Make ingestion refresh/refill consume pagination cursor deterministically so provider requests are not pinned to first page; define reset behavior on manual refresh/reconnect.
  **Must NOT do**: Do not redesign provider API surface or break selected-library filtering and poster eligibility filtering.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: cross-layer ingestion/provider contract changes with high logic risk.
  - Skills: [] — local provider and ingestion modules are authoritative.
  - Omitted: [`playwright`] — primarily runtime/data behavior.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [9] | Blocked By: [3,4]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `packages/core/src/ingestion/media-ingestion.ts:155-297` — refresh runtime currently calls ingest without cursor progression.
  - Pattern: `packages/core/src/providers/jellyfin/client.ts:589-650` — provider `StartIndex`, `Limit`, and `nextCursor` behavior.
  - Pattern: `packages/core/src/runtime/poster-queue-refill-adapter.ts` — runtime adapter cursor/updatedSince state handling.
  - Test: `packages/core/test/ingestion/media-ingestion.test.ts` — cadence and ingestion expectations.

  **Acceptance Criteria** (agent-executable only):
  - [x] Scheduled refreshes advance cursor until exhaustion and then follow defined reset behavior.
  - [x] Manual refresh semantics are explicit and tested (default: reset cursor to fetch newest page, without breaking queue continuity).
  - [x] Provider requests demonstrate `StartIndex` progression in tests/logs instead of constant zero.
  - [x] Selected-library filtering and poster-only filtering remain unchanged.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Cursor progression under scheduled refresh
    Tool: Bash
    Steps: Run ingestion runtime tests with mocked provider returning `nextCursor`; assert query sequence uses increasing cursor values.
    Expected: Cursor advances across calls and resets only per documented policy.
    Evidence: .sisyphus/evidence/task-5-cursor-progression.txt

  Scenario: Manual refresh reset policy
    Tool: Bash
    Steps: Trigger runtime manual refresh after several scheduled pages consumed.
    Expected: Behavior matches policy (reset or continue) and is asserted explicitly.
    Evidence: .sisyphus/evidence/task-5-manual-refresh-policy.txt
  ```

  **Commit**: YES | Message: `feat(ingestion): add deterministic cursor progression for poster refresh` | Files: [`packages/core/src/ingestion/**`, `packages/core/src/runtime/**`, `packages/core/test/**`]

- [x] 6. Replace brittle stream fallback sentinel with structural readiness checks + one-shot fallback guard

  **What to do**: Replace reliance on `[data-testid="poster-item-0"]` as readiness sentinel with robust structural checks (grid stream state availability + minimum tile presence), and enforce one-shot fallback guard to avoid repeated remount cascades.
  **Must NOT do**: Do not remove fallback entirely; keep fallback for genuine broken-state recovery.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: runtime resilience and guard design with UX sensitivity.
  - Skills: [] — no external library required.
  - Omitted: [`frontend-design`] — no visual scope.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [7,8,9] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/src/onboarding/runtime.ts:447-497` — current fallback predicate and render trigger.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts:422-469` — mirrored desktop fallback logic.
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts` — stream applier registration (`WALL_POSTER_GRID_STREAM_APPLIER_KEY`).
  - Test: `packages/core/test/wall-poster-grid-stream.test.ts` — grid stream helper behavior.

  **Acceptance Criteria** (agent-executable only):
  - [x] Fallback no longer depends on single-tile sentinel `poster-item-0` presence.
  - [x] Fallback triggers at most once per broken-state incident and does not loop.
  - [x] When grid is healthy, ingestion updates remain incremental without full render calls.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Transient mount race does not force repeated remount
    Tool: Playwright
    Steps: Enter /wall and trigger ingestion update during render window; observe fallback behavior.
    Expected: At most one fallback render; no repeated remount cascade.
    Evidence: .sisyphus/evidence/task-6-fallback-oneshot.json

  Scenario: Healthy stream patch path bypasses fallback
    Tool: Bash
    Steps: Run host runtime tests asserting stream apply success and no fallback render invocation in healthy state.
    Expected: Stream applies incrementally with fallback counter unchanged.
    Evidence: .sisyphus/evidence/task-6-stream-no-fallback.txt
  ```

  **Commit**: YES | Message: `fix(runtime): harden wall stream fallback readiness checks` | Files: [`apps/web/src/onboarding/runtime.ts`, `apps/desktop/src/onboarding/runtime.ts`, `packages/core/src/wall/**`, `apps/*/test/**`]
- [x] 7. Remove idle-hide full rerender path by applying interaction-only wall patches in-place

  **What to do**: Route idle-hide/reveal/escape-driven interaction transitions to targeted wall control/detail patch functions instead of full `render()` while remaining on `/wall`.
  **Must NOT do**: Do not alter wall visual design or remove existing interaction behavior (hide/reveal controls, escape close detail).

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: high-impact runtime behavior change on wall interaction loop.
  - Skills: [`playwright`] — needed to verify real-time interaction behavior without remounts.
  - Omitted: [`frontend-design`] — design freeze.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [8,9] | Blocked By: [6]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `packages/core/src/wall/interaction-controller.ts:36-87` — idle/reveal/escape currently call `onRenderRequest`.
  - Pattern: `apps/web/src/onboarding/runtime.ts:553-582` — web interaction controller wiring.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts:549-574` — desktop interaction controller wiring.
  - Pattern: `apps/web/src/onboarding/runtime.ts:803-809` and `apps/desktop/src/onboarding/runtime.ts:926-932` — full remount via `container.innerHTML = ""`.

  **Acceptance Criteria** (agent-executable only):
  - [x] Idle at ~8s no longer triggers full wall remount when route remains `/wall`.
  - [x] Controls hide/reveal and Escape detail dismissal still work exactly as before.
  - [x] No change to selector contracts and no regression in diagnostics panel interactions.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Idle-hide without full remount
    Tool: Playwright
    Steps: Enter /wall; record wall root/grid element handles; remain idle for >= 9s; then move pointer.
    Expected: Controls visibility toggles, but wall root/grid element handles remain identity-stable.
    Evidence: .sisyphus/evidence/task-7-idle-no-remount.json

  Scenario: Escape detail behavior preserved
    Tool: Playwright
    Steps: Open detail card (if enabled in diagnostics mode), press Escape, verify close + controls state.
    Expected: Detail dismisses correctly with no full wall remount.
    Evidence: .sisyphus/evidence/task-7-escape-detail.txt
  ```

  **Commit**: YES | Message: `refactor(wall-runtime): patch idle interactions without full wall rerender` | Files: [`packages/core/src/wall/**`, `apps/web/src/onboarding/runtime.ts`, `apps/desktop/src/onboarding/runtime.ts`, `apps/web/e2e/**`]

- [x] 8. Align web/desktop idle-hide + diagnostics behavior and add parity tests

  **What to do**: Standardize host behavior for diagnostics-open + idle-hide interaction policy (recommended default: both hosts suppress idle-hide-triggered transitions while diagnostics panel is open).
  **Must NOT do**: Do not introduce host divergence without explicit tests and comments.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: host parity and regression risk management.
  - Skills: [] — unit/integration parity checks are local.
  - Omitted: [`frontend-design`] — no visual changes.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [9] | Blocked By: [6,7]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/src/onboarding/runtime.ts:556-559` — web currently skips idle-hide when diagnostics open.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts:552-559` — desktop currently lacks equivalent guard.
  - Pattern: `packages/core/src/runtime/onboarding-wall-callbacks.ts` — diagnostics toggle callback flow.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts` — diagnostics toggle + wall flow assertions.

  **Acceptance Criteria** (agent-executable only):
  - [x] Web/desktop idle-hide behavior is parity-aligned for diagnostics-open state.
  - [x] Parity tests explicitly cover both hosts for idle + diagnostics combinations.
  - [x] No regressions in desktop platform warning/fullscreen behavior.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Diagnostics-open idle parity
    Tool: Bash
    Steps: Run host-specific runtime tests that keep diagnostics open and wait beyond idle threshold.
    Expected: Both hosts follow the same policy (no hidden divergence).
    Evidence: .sisyphus/evidence/task-8-host-idle-parity.txt

  Scenario: Diagnostics closed behavior unchanged
    Tool: Playwright
    Steps: Enter wall with diagnostics closed; idle for >= 9s; verify intended control-hide behavior still occurs.
    Expected: Intended idle UX remains, without full wall remount.
    Evidence: .sisyphus/evidence/task-8-diagnostics-closed-idle.json
  ```

  **Commit**: YES | Message: `test(runtime): enforce web-desktop idle diagnostics parity` | Files: [`apps/web/**`, `apps/desktop/**`, `packages/core/src/runtime/**`]

- [x] 9. Execute full regression wave and prove no 8s full-screen remount + reduced repetition

  **What to do**: Run full monorepo verification and targeted no-remount/repeat-policy proofs; collect evidence pack for reproducible validation.
  **Must NOT do**: Do not accept partial passes or flaky red tests; stabilize before completion.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: broad verification orchestration and evidence synthesis.
  - Skills: [`playwright`] — for deterministic runtime remount evidence.
  - Omitted: [`frontend-design`] — verification only.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [Final verification wave] | Blocked By: [1,2,3,4,5,6,7,8]

  **References** (executor has NO interview context — be exhaustive):
  - Commands: `AGENTS.md` canonical checks (`pnpm -w lint/typecheck/test/build/e2e`).
  - Contract: `node scripts/verify-wall-contracts.mjs`.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts`, `apps/web/e2e/gates/mandatory-v1-gates.spec.ts`.
  - Test: `apps/desktop/test/onboarding-auth.test.ts`, `apps/desktop/test/gates/mandatory-v1-gates.test.ts`.

  **Acceptance Criteria** (agent-executable only):
  - [x] All required workspace checks pass.
  - [x] No-remount evidence confirms stable wall root/grid identity through idle threshold and diagnostics sampling.
  - [x] Repeat-policy evidence confirms improved diversity for catalogs >= 40 and documented behavior for smaller catalogs.
  - [x] Contract selectors remain unchanged.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Full gate run
    Tool: Bash
    Steps: Run `pnpm -w lint && pnpm -w typecheck && pnpm -w test && pnpm -w build && pnpm -w e2e && node scripts/verify-wall-contracts.mjs`.
    Expected: All commands exit 0.
    Evidence: .sisyphus/evidence/task-9-full-gates.txt

  Scenario: End-to-end no-remount proof at idle boundary
    Tool: Playwright
    Steps: Enter /wall, keep route stable, wait >= 12s across idle threshold with diagnostics open/closed subcases.
    Expected: No full-wall remount flash; identity probes stay stable.
    Evidence: .sisyphus/evidence/task-9-no-remount-proof.mp4
  ```

  **Commit**: YES | Message: `test(wall): verify no-remount rollout and repeat-policy stability` | Files: [`apps/web/**`, `apps/desktop/**`, `packages/core/**`, `.sisyphus/evidence/**`]

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Commit per wave milestone with conventional messages:
  1) queue/refill/pagination foundation,
  2) no-remount runtime behavior,
  3) parity + regression proof.

## Success Criteria
- Idle at/over 8 seconds does not cause full wall remount flashes.
- Stream updates remain incremental under normal runtime operation.
- Repetition is materially reduced for catalogs larger than refill target by continuous refill + pagination progression.
- For small catalogs (< refill target), repeats are controlled and policy-consistent (documented and tested).
- Web + desktop behavior is parity-aligned and all contract tests pass.
