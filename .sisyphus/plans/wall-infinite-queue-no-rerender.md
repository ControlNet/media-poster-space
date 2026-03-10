# Infinite Poster Conveyor Without Full Rerenders

## TL;DR
> **Summary**: Replace full-wall rerender-on-timer behavior with an infinite conveyor runtime that keeps current visuals unchanged while feeding new posters from a queue.
> **Deliverables**:
> - Core queue runtime (low watermark 10, refill target 40) with TDD coverage
> - Diagnostics/render decoupling (keep 1000ms diagnostics contract, remove full-wall 1s rebuild)
> - Shared-core integration for web + desktop with minimal host glue changes
> - Gate-safe verification evidence across selectors/contracts/tests
> **Effort**: Large
> **Parallel**: YES - 3 waves
> **Critical Path**: T2 render-reason split → T3/T4 queue TDD+runtime → T6 incremental wall apply → T8 host wiring → T10 full verification

## Context
### Original Request
- User observed periodic wall-wide refresh (~1s) and asked for strategy aligned with the existing parallax wall design.
- User requirement evolved to: infinite moving wall, continuously fetch new posters, and insert them as new cards slide into view.
- User requirement: visual design must remain unchanged.
- User requirement: queue model with low watermark `<10` and refill target `40`.
- User requirement: TDD.

### Interview Summary
- Root cause validated: diagnostics sample callback (1000ms) triggers runtime `render()`, and wall render path clears/rebuilds full container.
- Existing architecture shares core wall/onboarding runtime logic across web and desktop; host runtimes provide thin platform glue.
- Existing contracts/tests strongly constrain selectors (`poster-wall-root`, `manual-refresh-button`, `wall-ingestion-summary`, etc.) and diagnostics interval display (`1000ms`).
- User selected queue-driven intake (instead of full snapshot-driven visual replacement) and no visual changes.

### Metis Review (gaps addressed)
- Guardrails required: no selector drift, no visual drift, no diagnostics-interval contract drift, no scope creep into unrelated onboarding/auth/platform areas.
- Risks to control: duplicate items, queue starvation, overlapping refill requests, auth/reconnect interactions, detail-card stability under rotating items.
- Missing acceptance criteria addressed in this plan: explicit “no full DOM rebuild on diagnostics tick” checks + queue threshold/refill deterministic tests.
- Assumptions resolved by default policy: global queue ownership in core runtime; bootstrap fill to target 40 on wall entry.

## Work Objectives
### Core Objective
Implement an infinite poster conveyor runtime that continuously rotates posters and pulls new posters from a queue without periodic full-wall rerenders, while preserving current visual output and all contract selectors.

### Deliverables
- Queue subsystem in `packages/core` with configurable threshold/target and single-flight refill.
- Decoupled render channels: diagnostics updates vs wall stream updates.
- Incremental wall update path (stable container + tile replacement) to eliminate full tree rebuild cadence.
- Web and desktop runtime wiring parity through shared-core behavior.
- TDD suite additions/updates proving queue behavior and no diagnostics-driven full rebuild.

### Definition of Done (verifiable conditions with commands)
- `pnpm -w lint` passes.
- `pnpm -w typecheck` passes.
- `pnpm -w test` passes.
- `pnpm -w build` passes.
- `node scripts/verify-wall-contracts.mjs` passes.
- `pnpm -w verify:docs-parity --strict` passes.
- Added/updated tests prove:
  - queue `<10` triggers refill to `40`;
  - diagnostics 1000ms ticks do not trigger full wall container rebuild;
  - required selectors and wall interactions remain intact.

### Must Have
- Preserve visual design (layout, spacing, motion language, overlays, selectors) with no intended stylistic changes.
- Keep diagnostics sampling interval semantics at 1000ms (contract and displayed value).
- Queue policy: low watermark `10`, refill target `40`, dedupe by media identity, single refill in-flight.
- Queue consumption policy: FIFO (outgoing visual slot receives next queued poster) with dedupe by media identity.
- Continuous conveyor behavior: incoming posters appear at entry edge as outgoing posters leave.
- Shared-core implementation path used by both web and desktop runtimes.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No full `container.innerHTML = ""`/`replaceChildren()` wall rebuild on diagnostics timer ticks.
- No selector or test-id renames covered by contracts/e2e/tests.
- No unrelated auth/preflight/logout/platform refactors.
- No visual redesign changes (font, palette, spacing, card size, overlay placement).
- No renderer rewrite (no canvas/webgl/virtualization framework swap) in this scope.
- No uncontrolled queue growth or concurrent refill storms.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: TDD + existing Vitest/Playwright/contract checks.
- QA policy: Every task includes agent-executed happy + failure scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Runtime decoupling and queue foundation
- T1 Contract + baseline lock
- T2 Render-reason split (diagnostics vs wall stream)
- T3 Queue policy + state model
- T4 Queue TDD suite
- T5 Refill adapter + single-flight fetch orchestration

Wave 2: Incremental wall application and host integration
- T6 Core incremental wall stream applier
- T7 Integrate queue stream with onboarding ingestion controller
- T8 Web runtime integration (no diagnostics full rerender)
- T9 Desktop runtime parity integration

Wave 3: Stabilization and regression hardening
- T10 End-to-end regression + gate verification

### Dependency Matrix (full, all tasks)
| Task | Depends On | Blocks |
|---|---|---|
| T1 | - | T10 |
| T2 | T1 | T6, T8, T9, T10 |
| T3 | T1 | T4, T5, T7, T10 |
| T4 | T3 | T5, T7, T10 |
| T5 | T3, T4 | T7, T10 |
| T6 | T2 | T8, T9, T10 |
| T7 | T2, T5 | T8, T9, T10 |
| T8 | T6, T7 | T10 |
| T9 | T6, T7 | T10 |
| T10 | T1,T2,T3,T4,T5,T6,T7,T8,T9 | Final verification wave |

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 5 tasks → deep (3), unspecified-high (2)
- Wave 2 → 4 tasks → deep (1), unspecified-high (3)
- Wave 3 → 1 task → unspecified-high (1)

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Lock baseline contracts and visual invariants before runtime changes

  **What to do**: Build a baseline evidence pack capturing current selector contracts, diagnostics interval assertions, and wall visual invariants (card size/spacing/entry/exit path) so all later tasks can prove “no visual change.”
  **Must NOT do**: Do not modify production code; do not change selectors or contract files.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: broad contract/test surface audit with evidence collection.
  - Skills: [`playwright`] — needed for deterministic wall screenshot/evidence capture.
  - Omitted: [`frontend-design`] — no redesign work allowed.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [2,10] | Blocked By: []

  **References**:
  - Pattern: `scripts/contracts/wall-contracts.json:231-266` — required selectors (`poster-wall-root`, `manual-refresh-button`).
  - Pattern: `apps/web/e2e/onboarding-auth.spec.ts:182-196` — wall root + diagnostics interval + refresh behavior checks.
  - Pattern: `apps/desktop/test/onboarding-auth.test.ts:370-410` — desktop wall selector/summary/diagnostics expectations.
  - Test: `apps/web/e2e/gates/mandatory-v1-gates.spec.ts:253-278` — mandatory gate assertions for wall visibility and manual refresh.

  **Acceptance Criteria** (agent-executable only):
  - [x] Baseline evidence artifacts are generated for wall selectors and visual layout: `node scripts/verify-wall-contracts.mjs` returns PASS and screenshots/DOM snapshots are stored.
  - [x] A baseline matrix is saved to `.sisyphus/evidence/task-1-baseline-contracts.md` listing invariant selectors/text/timing to preserve.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Baseline selector contract capture
    Tool: Bash
    Steps: Run `node scripts/verify-wall-contracts.mjs`; run targeted web/desktop wall tests asserting selectors.
    Expected: Contract PASS and selector assertions remain green.
    Evidence: .sisyphus/evidence/task-1-baseline-contracts.md

  Scenario: Baseline visual invariants capture
    Tool: Playwright
    Steps: Enter /wall, capture full-page screenshot and element snapshots for `poster-wall-root`, `wall-poster-grid`, `manual-refresh-button`.
    Expected: Evidence exists and is referenced for no-visual-change comparisons.
    Evidence: .sisyphus/evidence/task-1-baseline-visual.png
  ```

  **Commit**: NO | Message: `chore(wall): capture pre-change wall invariants` | Files: [`.sisyphus/evidence/*`]

- [x] 2. Split render reasons so diagnostics ticks cannot trigger full wall rebuild

  **What to do**: Refactor shared diagnostics/runtime callback flow so diagnostics sampling updates diagnostics state/text only, while wall stream rendering uses a separate incremental path; remove diagnostics→full `renderWall` coupling.
  **Must NOT do**: Do not change diagnostics interval constant (1000ms), diagnostics text contract, or wall selectors.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: cross-runtime state/render-flow refactor with regression risk.
  - Skills: [] — core runtime logic already local.
  - Omitted: [`frontend-design`] — behavior refactor only.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [6,8,9,10] | Blocked By: [1]

  **References**:
  - Pattern: `packages/core/src/runtime/onboarding-shared.ts:152-230` — diagnostics controller currently calls `onRenderRequest()` inside `onSample`.
  - Pattern: `packages/core/src/runtime/diagnostics.ts:1,254` — diagnostics interval contract (`DIAGNOSTICS_SAMPLING_INTERVAL_MS = 1000`).
  - Pattern: `apps/web/src/onboarding/runtime.ts:191-200,706+` — diagnostics callback wired to global `render()`.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts:185-193,815+` — mirrored desktop wiring.
  - Test: `apps/web/test/diagnostics-crash-export.test.ts` and `apps/desktop/test/diagnostics-crash-export.test.ts`.

  **Acceptance Criteria** (agent-executable only):
  - [x] Diagnostics tick path no longer causes full wall container replacement while wall route is active.
  - [x] Default policy: when diagnostics panel is closed, diagnostics samples may update in-memory state/logs but do not trigger wall DOM mutations.
  - [x] `wall-diagnostics-sampling-interval` still displays `1000ms` and diagnostics sampler unit tests remain green.
  - [x] Existing wall selectors remain present on repeated diagnostics ticks.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Diagnostics tick without full wall rebuild
    Tool: Playwright
    Steps: Enter /wall; record `poster-wall-root` first child identity; wait >=3 sampling ticks; re-read child identity.
    Expected: Root/primary wall node identity remains stable (no full remount).
    Evidence: .sisyphus/evidence/task-2-diagnostics-no-remount.json

  Scenario: Diagnostics contract stability
    Tool: Bash
    Steps: Run web+desktop diagnostics unit tests for exact 1000ms assertions.
    Expected: All interval assertions pass unchanged.
    Evidence: .sisyphus/evidence/task-2-diagnostics-tests.txt
  ```

  **Commit**: YES | Message: `refactor(runtime): decouple diagnostics sampling from full wall rerender` | Files: [`packages/core/src/runtime/*`, `apps/web/src/onboarding/runtime.ts`, `apps/desktop/src/onboarding/runtime.ts`]

- [x] 3. Introduce core queue policy/state model (low<10, refill->40) with deterministic contracts

  **What to do**: Add a pure queue model in core runtime that owns queue size, dedupe set, low watermark (10), refill target (40), and bootstrap fill behavior; expose deterministic methods for consume/refill decisions.
  **Must NOT do**: Do not mutate wall visuals or selector DOM logic in this task.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: foundational state machine with deterministic testability.
  - Skills: [] — no external framework complexity.
  - Omitted: [`playwright`] — pure logic task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4,5,7,10] | Blocked By: [1]

  **References**:
  - API/Type: `packages/core/src/provider/media-provider.ts:29-39` — query supports `cursor`, `limit`, `updatedSince`.
  - Pattern: `packages/core/src/ingestion/media-ingestion.ts:6-10,155-297` — existing refresh runtime and state conventions.
  - Pattern: `packages/core/src/runtime/onboarding-ingestion.ts:245-296` — ingestion state application and render trigger boundary.
  - External: `Oracle review (session ses_356cee522ffeSoTRQi9oocDbNZ)` — queue guardrails and single-flight recommendations.

  **Acceptance Criteria** (agent-executable only):
  - [x] Queue model enforces: when size `<10`, refill intent computes target delta up to 40.
  - [x] Queue model deduplicates by media identity and prevents negative/overflow states.
  - [x] Queue model includes explicit bootstrap policy (`initial fill to 40`).

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Threshold-driven refill intent
    Tool: Bash
    Steps: Run queue unit tests with cases size=9,10,39,40.
    Expected: Refill requested only for size<10; target reach is 40.
    Evidence: .sisyphus/evidence/task-3-queue-threshold-tests.txt

  Scenario: Duplicate payload rejection
    Tool: Bash
    Steps: Feed queue model duplicate media IDs across multiple refill batches.
    Expected: Queue holds unique IDs only; counters remain correct.
    Evidence: .sisyphus/evidence/task-3-queue-dedupe-tests.txt
  ```

  **Commit**: YES | Message: `feat(core-runtime): add deterministic wall queue policy model` | Files: [`packages/core/src/runtime/*queue*`, `packages/core/test/**`]

- [x] 4. Implement TDD suite for queue refill, single-flight, starvation, and dedupe

  **What to do**: Create failing tests first, then implement queue/refill behavior until green. Cover low watermark trigger, refill target, single in-flight fetch, dedupe, and fallback behavior when provider returns empty/partial pages.
  **Must NOT do**: Do not loosen existing wall contract tests; do not skip failure-path cases.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: heavy deterministic test authoring and edge-case matrix.
  - Skills: [] — existing Vitest patterns are sufficient.
  - Omitted: [`playwright`] — this task is core-unit focused.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [5,7,10] | Blocked By: [3]

  **References**:
  - Test: `packages/core/test/scheduler/poster-scheduler.test.ts` — deterministic timer/queue test pattern.
  - Test: `packages/core/test/ingestion/media-ingestion.test.ts` — ingestion result/refresh assertions style.
  - Pattern: `packages/core/src/runtime/onboarding-ingestion.ts:187-230` — reconnect timer scheduling and state logging behavior.
  - Pattern: `packages/core/src/ingestion/media-ingestion.ts:227-265` — refresh serialization (`refreshPromise`) pattern.

  **Acceptance Criteria** (agent-executable only):
  - [x] New queue tests fail on first run (RED), then pass after implementation (GREEN).
  - [x] Tests cover at least: threshold trigger, target refill, duplicate suppression, single-flight lock, empty-page starvation handling.
  - [x] Tests are deterministic (fake timers or deterministic clocks where needed).

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: RED→GREEN queue TDD cycle
    Tool: Bash
    Steps: Run new queue test file before implementation (expect fail), implement logic, rerun.
    Expected: Initial failure then full pass.
    Evidence: .sisyphus/evidence/task-4-queue-tdd-cycle.txt

  Scenario: Refill race prevention
    Tool: Bash
    Steps: Trigger concurrent refill requests in tests while queue<10.
    Expected: Exactly one fetch in-flight; no duplicate enqueue.
    Evidence: .sisyphus/evidence/task-4-queue-singleflight.txt
  ```

  **Commit**: YES | Message: `test(core-runtime): add TDD coverage for wall queue refill policy` | Files: [`packages/core/test/**queue*`, `packages/core/test/**wall*`]

- [x] 5. Build refill adapter over Jellyfin/media ingestion query primitives

  **What to do**: Implement queue refill fetch adapter that uses existing provider query capabilities (`cursor`, `limit`, `updatedSince`) and selected library scope, returning dedupable media candidates for queue top-up to target 40.
  **Must NOT do**: Do not alter provider API contracts or break existing snapshot ingestion behavior used by non-queue paths.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: adapter design across provider/runtime boundaries with retry/error considerations.
  - Skills: [] — local APIs are sufficient.
  - Omitted: [`frontend-design`] — no UI work in this task.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [7,10] | Blocked By: [4]

  **References**:
  - API/Type: `packages/core/src/provider/media-provider.ts:29-39` — query shape and page contract.
  - Pattern: `packages/core/src/providers/jellyfin/client.ts:574-651` — listMedia pagination and sorting behavior.
  - Pattern: `packages/core/src/ingestion/media-ingestion.ts:131-153` — selected-library ingest path and poster filtering behavior.
  - Pattern: `packages/core/src/runtime/onboarding-ingestion.ts:245-296` — ingestion-state emission and error propagation.

  **Acceptance Criteria** (agent-executable only):
  - [x] Refill adapter respects selected libraries and only returns poster-eligible items.
  - [x] Refill adapter supports bounded pull (`limit`) and cursor continuation where available.
  - [x] Adapter failure path maps to existing error categories without contract drift.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Partial refill top-up
    Tool: Bash
    Steps: Mock provider returning fewer than requested items; execute refill.
    Expected: Queue grows by available unique items, no crash, next fetch remains eligible.
    Evidence: .sisyphus/evidence/task-5-partial-refill.txt

  Scenario: Provider error backoff mapping
    Tool: Bash
    Steps: Mock 401/network errors during refill and inspect emitted error categories.
    Expected: Auth/network categories remain correctly surfaced for reconnect guidance.
    Evidence: .sisyphus/evidence/task-5-error-mapping.txt
  ```

  **Commit**: YES | Message: `feat(core-runtime): add queue refill adapter for provider pagination` | Files: [`packages/core/src/runtime/*`, `packages/core/src/ingestion/*`, `packages/core/test/**`]

- [x] 6. Add incremental wall stream applier that preserves current visuals

  **What to do**: Implement stable-node incremental wall update mechanics so moving rows continue uninterrupted and incoming posters swap into entry positions without replacing `poster-wall-root` or regenerating full wall markup.
  **Must NOT do**: Do not change CSS/visual tokens/card sizing/overlay composition; do not remove existing test IDs.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: high-risk UI runtime mechanics under strict no-visual-change constraint.
  - Skills: [`playwright`] — required for visual invariance and DOM identity checks.
  - Omitted: [`frontend-design`] — visuals are frozen.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [8,9,10] | Blocked By: [2]

  **References**:
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts` — existing row generation, animation, and poster tile structure.
  - Pattern: `packages/core/src/wall/ui/route-shell.ts` — keyframes and root shell invariants.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts:385-488` — poster item interaction and detail-card flows.
  - Contract: `scripts/contracts/wall-contracts.json` — selector invariants.

  **Acceptance Criteria** (agent-executable only):
  - [x] During diagnostics ticks, wall root and primary grid node identities stay stable.
  - [x] Poster entry/exit stream behavior updates content incrementally with unchanged visual style.
  - [x] Existing `poster-item-{index}` interaction behavior remains available for required selectors.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Stable DOM identity under periodic diagnostics ticks
    Tool: Playwright
    Steps: Capture element handles for `poster-wall-root` and `wall-poster-grid`; wait 5 diagnostics intervals.
    Expected: Handles remain attached and identity-stable (no full re-create).
    Evidence: .sisyphus/evidence/task-6-dom-stability.json

  Scenario: Stream replacement at row entry edge
    Tool: Playwright
    Steps: Observe a specific row over time; verify outgoing tile replaced by queued incoming tile at entry edge without full flash.
    Expected: Incremental content turnover occurs; no whole-screen remount flicker.
    Evidence: .sisyphus/evidence/task-6-stream-entry.mp4
  ```

  **Commit**: YES | Message: `feat(wall-ui): switch to incremental stream updates without full rerender` | Files: [`packages/core/src/wall/ui/*`, `packages/core/test/**`, `apps/web/e2e/**`]

- [x] 7. Integrate queue stream with onboarding ingestion controller state flow

  **What to do**: Extend onboarding ingestion controller to maintain queue lifecycle and publish stream-ready poster transitions, while preserving reconnect/backoff semantics and cached bootstrap behavior.
  **Must NOT do**: Do not remove reconnect guide logic or manual refresh pathways.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: state-machine integration with reconnect/error/cache concerns.
  - Skills: [] — core runtime patterns already present.
  - Omitted: [`frontend-design`] — no visual work.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [8,9,10] | Blocked By: [5]

  **References**:
  - Pattern: `packages/core/src/runtime/onboarding-ingestion.ts:83-348` — controller lifecycle, reconnect backoff, cache hydrate/sync.
  - Pattern: `packages/core/src/ingestion/media-ingestion.ts:155-297` — runtime refresh semantics.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts:196` — manual refresh expectations.
  - Test: `apps/desktop/test/onboarding-auth.test.ts` reconnect/backoff and wall behavior assertions.

  **Acceptance Criteria** (agent-executable only):
  - [x] Queue bootstrap initializes to target 40 when wall becomes active and eligible items exist.
  - [x] When queue size drops below 10, refill is triggered and target 40 restored without concurrent refill duplication.
  - [x] Reconnect/backoff/manual-refresh paths continue to function and tests remain green.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Queue watermark refill in integrated runtime
    Tool: Bash
    Steps: Simulate repeated dequeues to push queue below 10; observe controller refill behavior.
    Expected: Refill occurs and queue returns to 40 with single in-flight fetch.
    Evidence: .sisyphus/evidence/task-7-watermark-integration.txt

  Scenario: Reconnect path with queue underflow
    Tool: Bash
    Steps: Force ingestion errors while queue drains near threshold.
    Expected: Reconnect guide/backoff remain correct; runtime does not crash or spam fetches.
    Evidence: .sisyphus/evidence/task-7-reconnect-underflow.txt
  ```

  **Commit**: YES | Message: `feat(runtime): integrate queue lifecycle into onboarding ingestion controller` | Files: [`packages/core/src/runtime/onboarding-ingestion.ts`, `packages/core/test/**`, `apps/*/test/**`]

- [x] 8. Wire web runtime to incremental stream path without diagnostics-triggered full rerender

  **What to do**: Update web onboarding runtime so `/wall` uses incremental stream updates and diagnostics ticks only patch diagnostics content, not full `renderWall()` rebuild.
  **Must NOT do**: Do not break route fallback behavior, fullscreen control behavior, or existing wall interaction semantics.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: host runtime integration with route/interaction side effects.
  - Skills: [`playwright`] — needed for realistic wall flow validation.
  - Omitted: [`frontend-design`] — visuals frozen.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [10] | Blocked By: [6,7]

  **References**:
  - Pattern: `apps/web/src/onboarding/runtime.ts:573-675` — wall rendering and callback wiring.
  - Pattern: `apps/web/src/onboarding/runtime.ts:706-737` — global render/dispose flow and listeners.
  - Pattern: `packages/core/src/runtime/onboarding-wall-callbacks.ts` — shared wall callback structure.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts` — wall interactions, diagnostics panel, manual refresh.

  **Acceptance Criteria** (agent-executable only):
  - [x] Web wall no longer remounts whole tree every diagnostics tick.
  - [x] Existing web e2e onboarding-to-wall tests pass with unchanged selector/text assertions.
  - [x] Fullscreen warning/control and reconnect guide remain functional.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Web wall continuity under diagnostics ticks
    Tool: Playwright
    Steps: Enter wall, keep diagnostics open for >=5 seconds, interact with poster tile and close detail card.
    Expected: No periodic full-screen flash; interactions remain responsive and selectors stable.
    Evidence: .sisyphus/evidence/task-8-web-wall-continuity.mp4

  Scenario: Web fallback resilience
    Tool: Playwright
    Steps: Force missing handoff/session route fallback then return to onboarding and re-enter wall.
    Expected: Fallback route still works and wall stream resumes correctly after re-entry.
    Evidence: .sisyphus/evidence/task-8-web-fallback.txt
  ```

  **Commit**: YES | Message: `refactor(web-runtime): adopt incremental wall stream updates` | Files: [`apps/web/src/onboarding/runtime.ts`, `apps/web/test/**`, `apps/web/e2e/**`]

- [x] 9. Wire desktop runtime parity to shared incremental stream behavior

  **What to do**: Align desktop onboarding runtime with shared incremental stream path, preserving platform-specific controls/warnings while avoiding diagnostics-driven full wall remounts.
  **Must NOT do**: Do not alter tauri platform bridge semantics, display/autostart controls, or password-vault behavior.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: desktop-specific runtime parity integration with platform hooks.
  - Skills: [] — platform code already local.
  - Omitted: [`frontend-design`] — no visual redesign.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [10] | Blocked By: [6,7]

  **References**:
  - Pattern: `apps/desktop/src/onboarding/runtime.ts:746-845` — wall routing/rendering integration and lifecycle.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts:637-709` — platform extras/warnings in onboarding flow.
  - Test: `apps/desktop/test/onboarding-auth.test.ts:370-410` — wall summary/diagnostics/manual refresh assertions.
  - Test: `apps/desktop/test/gates/mandatory-v1-gates.test.ts:428-465` — mandatory selector and refresh behavior checks.

  **Acceptance Criteria** (agent-executable only):
  - [x] Desktop wall path preserves existing platform behavior while removing periodic full remount cadence.
  - [x] Desktop onboarding/wall tests and mandatory gates pass unchanged.
  - [x] Shared queue/stream semantics match web behavior for core wall runtime.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Desktop wall parity under runtime sampling
    Tool: Bash
    Steps: Run desktop onboarding auth runtime tests covering wall entry, diagnostics, and refresh.
    Expected: Existing assertions pass; no regression in platform warning/display/autostart behavior.
    Evidence: .sisyphus/evidence/task-9-desktop-parity-tests.txt

  Scenario: Desktop reconnect and logout safety
    Tool: Bash
    Steps: Run desktop tests for reconnect backoff and logout reset with wall interactions.
    Expected: Reconnect/logout semantics unchanged; queue/stream path does not leak session artifacts.
    Evidence: .sisyphus/evidence/task-9-desktop-reconnect-logout.txt
  ```

  **Commit**: YES | Message: `refactor(desktop-runtime): align wall stream behavior with shared core queue runtime` | Files: [`apps/desktop/src/onboarding/runtime.ts`, `apps/desktop/test/**`]

- [x] 10. Execute full regression wave and prove no-visual-change + no-1s-remount

  **What to do**: Run complete verification gates plus targeted new checks proving queue watermark behavior and diagnostics-decoupled rendering; compare against baseline evidence from Task 1.
  **Must NOT do**: Do not skip any mandatory gate; do not accept flaky/partial evidence.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: broad cross-workspace verification with strict evidence requirements.
  - Skills: [`playwright`] — for deterministic runtime behavior evidence.
  - Omitted: [`frontend-design`] — verification only.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [Final verification wave] | Blocked By: [1,2,3,4,5,6,7,8,9]

  **References**:
  - Commands: `AGENTS.md` canonical workspace gates.
  - Contract: `scripts/contracts/wall-contracts.json` and `scripts/verify-wall-contracts.mjs`.
  - Tests: `apps/web/e2e/onboarding-auth.spec.ts`, `apps/web/e2e/gates/mandatory-v1-gates.spec.ts`, `apps/desktop/test/onboarding-auth.test.ts`, `apps/desktop/test/gates/mandatory-v1-gates.test.ts`.
  - Baseline: `.sisyphus/evidence/task-1-baseline-*`.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm -w lint` / `pnpm -w typecheck` / `pnpm -w test` / `pnpm -w build` all pass.
  - [x] `node scripts/verify-wall-contracts.mjs` passes.
  - [x] `pnpm -w verify:docs-parity --strict` passes.
  - [x] Evidence proves no per-second full wall remount and queue refill policy `<10 => 40` works.
  - [x] Baseline visual invariants remain unchanged.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Full monorepo gate execution
    Tool: Bash
    Steps: Run all workspace verification commands and collect logs.
    Expected: All commands exit 0 with no new contract violations.
    Evidence: .sisyphus/evidence/task-10-full-gates.txt

  Scenario: No-1s-remount proof under diagnostics ticks
    Tool: Playwright
    Steps: Capture DOM identity + video for wall root/grid over >=10s with diagnostics active.
    Expected: No full wall remount cadence; stream remains continuous.
    Evidence: .sisyphus/evidence/task-10-no-remount-proof.mp4
  ```

  **Commit**: YES | Message: `test(wall-runtime): verify queue stream rollout and contract parity` | Files: [`apps/web/**`, `apps/desktop/**`, `packages/core/**`, `.sisyphus/evidence/**`]

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Commit in logical milestones after each wave completion:
  1) decoupling + queue foundation,
  2) incremental stream integration web+desktop,
  3) regression and verification adjustments.
- Use conventional commit messages scoped to wall/runtime/ingestion.

## Success Criteria
- No visible periodic 1s full-wall refresh/jank.
- Wall remains visually unchanged compared to baseline design language.
- Queue continuously supplies new posters (`<10` refill to `40`) with stable motion.
- Diagnostics still reports `1000ms` interval and contracts/tests remain green.
- Web + desktop wall behavior stays functionally aligned via shared-core logic.
