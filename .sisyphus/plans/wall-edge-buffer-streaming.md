# Shared Core Off-Screen Edge Buffer Streaming

## TL;DR
> **Summary**: Replace row-wide poster replacement with a bounded off-screen entry-buffer model in the shared onboarding wall so only entry-side off-screen tiles receive new posters and any tile that intersects the viewport becomes immutable until it fully exits again.
> **Deliverables**:
> - Shared-core edge-buffer eligibility model with deterministic TDD coverage
> - Deferred incoming backlog so healthy “no writable slot yet” states never drop posters
> - Rich stream-apply result contract so web/desktop hosts do not remount on healthy defers
> - Web + desktop regression coverage proving visible posters do not refresh in place during healthy streaming, fullscreen, or wall-clock updates
> **Effort**: Large
> **Parallel**: YES - 2 waves
> **Critical Path**: T1 semantics lock → T3 deferred/backlog contract → T4 shared-core applier integration → T6/T7 host parity → T8/T9 regressions → T10 full verification

## Context
### Original Request
- User requirement: "应该是只有在边缘进来的poster这里才需要使用新的海报吧"
- User requirement: "这样的话，就至少要保证进入到屏幕内的poster是完全不会刷新的"
- User selected: "基于方案A制订计划"

### Interview Summary
- Scope decision: apply Scheme A to the shared core onboarding wall path used by both web and desktop hosts.
- Test decision: TDD using existing Vitest + Playwright infrastructure.
- Current behavior: `packages/core/src/wall/ui/presentation-sections.ts:75-193` traverses the entire row in edge-first order, so “edge” is only traversal order, not a true off-screen buffer.
- Current host behavior: `apps/web/src/onboarding/runtime.ts:436-549` and `apps/desktop/src/onboarding/runtime.ts:425-514` patch the shared core wall in place when possible, but fall back to a full render/remount when patch readiness fails.

### Metis Review (gaps addressed)
- Guardrail added: introduce a deferred incoming backlog so posters are not lost when zero off-screen entry slots are writable.
- Guardrail added: replace boolean stream apply success with a rich result contract so hosts can distinguish healthy defer/no-op from true failure.
- Scope boundary added: keep queue refill policy (`low watermark = 10`, `refill target = 40`), ingestion cadence, selectors, and current wall visuals unchanged.
- Defaulted semantics for execution: a tile becomes protected on first viewport intersection, remains protected while any portion intersects the viewport, and becomes writable again only after its rect is fully outside the viewport on the exit side.

## Work Objectives
### Core Objective
Implement Scheme A in the shared onboarding wall runtime so only entry-side off-screen buffer tiles receive new posters, visible tiles never refresh in place during healthy operation, and healthy “no writable slot yet” states defer incoming posters without triggering fallback remounts.

### Deliverables
- New shared-core eligibility model that classifies row tiles as visible, writable entry-buffer, or not writable.
- Shared-core pending incoming backlog that preserves FIFO order and dedupes by media identity until writable slots exist.
- Updated stream-apply contract consumed by both host runtimes.
- Web and desktop regression coverage proving healthy stream stability plus existing incident fallback discipline.
- No visual redesign, selector drift, or queue/ingestion policy change.

### Definition of Done (verifiable conditions with commands)
- `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts` passes with new eligibility, deferred backlog, and no-in-viewport-replacement assertions.
- `pnpm --filter @mps/core test -- test/runtime/onboarding-ingestion-queue-integration.test.ts` passes with no-drop deferred-stream coverage.
- `pnpm --filter @mps/desktop test -- test/onboarding-auth.test.ts` passes with healthy stream stability and incident fallback parity.
- `pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts --grep "handles healthy stream without poster-item-0 sentinel and limits fallback to one remount per incident|updates the wall clock without remounting the wall|keeps the existing wall mounted when entering fullscreen|does not replace visible posters during healthy refreshes"` passes.
- `pnpm -w lint` passes.
- `pnpm -w typecheck` passes.
- `pnpm -w test` passes.
- `pnpm -w build` passes.
- `pnpm -w e2e` passes.

### Must Have
- Shared-core behavior parity for web + desktop onboarding walls.
- Protected visible zone rule: any tile with at least 1px viewport intersection is not writable.
- Re-entry rule: a tile becomes writable again only after it is fully outside the viewport.
- Entry-side buffer rule: only the two nearest fully off-screen tiles on the row’s entry side are writable per row snapshot.
- Pending backlog rule: incoming posters that cannot be applied immediately remain pending in FIFO order and are not dropped.
- Healthy defer rule: no writable slot available must not count as patch failure and must not trigger host remount fallback.
- Incident rule: existing one-remount-per-broken-readiness-incident behavior remains for true readiness failures only.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No changes to queue refill policy in `packages/core/src/runtime/poster-queue.ts`.
- No changes to ingestion refresh cadence or diagnostics sampling cadence.
- No selector/test-id renames (`poster-wall-root`, `wall-poster-grid`, `manual-refresh-button`, `wall-clock-heading`, `poster-item-*`).
- No visual redesign of grid geometry, tile sizing, spacing, row animation durations, overlays, or controls.
- No scene-runtime work (`apps/web/src/scene/*`) in this scope.
- No fallback remount for healthy defer/no-op stream states.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: TDD + existing Vitest/Playwright suites.
- QA policy: Every task includes agent-executed happy + failure scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`
- Default verification approach: pure/core helper tests own geometry/eligibility math; host tests verify parity, remount discipline, fullscreen, and clock behavior.

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Shared-core semantics, helper contract, backlog, and applier integration
- T1 Implement pure entry-buffer eligibility helpers with TDD
- T2 Add deferred incoming backlog + rich apply-result contract
- T3 Integrate writable-slot selection into the shared stream applier
- T4 Make eligibility reclassification resize/fullscreen-safe in shared core
- T5 Prove deferred writes do not drop posters in queue/ingestion integration

Wave 2: Host parity and regressions
- T6 Update web host runtime to honor healthy defer/no-op instead of remounting
- T7 Update desktop host runtime to match the healthy-defer contract
- T8 Add web Playwright coverage that checks real visible poster identities
- T9 Add desktop parity coverage for visible-poster immutability and incident discipline
- T10 Run full workspace verification and collect evidence for the new contract

### Dependency Matrix (full, all tasks)
| Task | Depends On | Blocks |
|---|---|---|
| T1 | - | T2,T3,T4,T5,T8,T9,T10 |
| T2 | T1 | T4,T5,T8,T9,T10 |
| T3 | T1 | T4,T5,T6,T7,T8,T9,T10 |
| T4 | T2,T3 | T5,T6,T7,T8,T9,T10 |
| T5 | T2,T3,T4 | T6,T7,T8,T9,T10 |
| T6 | T3,T4,T5 | T8,T10 |
| T7 | T3,T4,T5 | T9,T10 |
| T8 | T4,T6 | T10 |
| T9 | T4,T7 | T10 |
| T10 | T1,T2,T3,T4,T5,T6,T7,T8,T9 | Final verification wave |

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 5 tasks → deep (4), unspecified-high (1)
- Wave 2 → 5 tasks → deep (2), unspecified-high (2), visual-engineering (1)

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Implement pure entry-buffer eligibility helpers with TDD in shared core

  **What to do**: In `packages/core/src/wall/ui/presentation-sections.ts`, add exported pure helpers that accept synthetic viewport/tile rectangles and return: (a) visible tile indices, (b) entry-side writable indices, and (c) the ordered writable subset capped to exactly 2 tiles per row. Lock these defaults in tests: first pixel intersection makes a tile protected; normal rows admit from the right; reverse rows admit from the left; tiles become writable again only after full viewport exit.
  **Must NOT do**: Do not use live DOM in helper tests; do not change row animation constants, tile dimensions, or selectors.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: deterministic geometry/eligibility contract with strong TDD requirements.
  - Skills: [] — existing Vitest patterns are sufficient.
  - Omitted: [`playwright`] — browser automation is unnecessary for pure helper math.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [2,3,4,5,8,9,10] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts:75-88` — current row-edge ordering helper to preserve direction semantics.
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts:125-193` — current entry-index consumption and stream-apply loop to replace with bounded eligibility.
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts:387-541` — row construction, row direction, and tile creation contract.
  - Test: `packages/core/test/wall-poster-grid-stream.test.ts:28-98` — existing Vitest style for row direction and helper coverage.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts` passes with exact assertions for visible indices, two-slot writable entry buffers, and re-writability only after full exit.
  - [ ] Helper tests use synthetic numeric rect fixtures for both `"normal"` and `"reverse"` rows and do not depend on jsdom layout.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Normal-row entry buffer math
    Tool: Bash
    Steps: Run `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts -t "computes right-side writable entry buffer for normal rows"`.
    Expected: Command exits 0 and the test proves only the two nearest fully off-screen right-side tiles are writable.
    Evidence: .sisyphus/evidence/task-1-entry-buffer-normal.txt

  Scenario: Reverse-row visible freeze
    Tool: Bash
    Steps: Run `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts -t "treats any viewport intersection as protected for reverse rows"`.
    Expected: Command exits 0 and the test proves left-entry rows freeze tiles on first-pixel visibility.
    Evidence: .sisyphus/evidence/task-1-entry-buffer-reverse.txt
  ```

  **Commit**: YES | Message: `test(core): lock wall entry-buffer eligibility semantics` | Files: [`packages/core/src/wall/ui/presentation-sections.ts`, `packages/core/test/wall-poster-grid-stream.test.ts`]

- [x] 2. Add deferred incoming backlog and rich apply-result contract in shared core

  **What to do**: Extend the stream state in `packages/core/src/wall/ui/presentation-sections.ts` with a FIFO `pendingIncomingItems` backlog and change the applier contract from `boolean` to a discriminated result object with statuses `applied`, `deferred`, `noop`, and `unavailable`. Pending items must dedupe by media identity across previous items, next items, and backlog; items that cannot be written because no eligible slot exists must remain pending in order.
  **Must NOT do**: Do not let healthy defer map to `false`; do not drop pending items when `streamState.items` advances; do not update web/desktop host runtime call sites in this task.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: state-machine change with hidden no-drop and dedupe risks.
  - Skills: [] — local core logic only.
  - Omitted: [`playwright`] — core contract work only.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [3,4,5,6,7,8,9,10] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts:54-73` — incoming identity diff logic that currently ignores deferred backlog.
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts:139-193` — current boolean-return stream apply path to replace.
  - Pattern: `apps/web/src/onboarding/runtime.ts:436-443,538-545` — host currently treats `false` as fallback-worthy failure.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts:425-432,503-509` — mirrored host contract.
  - Test: `packages/core/test/wall-poster-grid-stream.test.ts:38-90` — existing incoming-identity and row-round-robin assertions to extend.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts` passes with cases proving pending backlog FIFO ordering, backlog dedupe by media identity, and `deferred` vs `unavailable` result separation.
  - [ ] The new shared-core apply result shape is fully typed and exported from `packages/core/src/wall/ui/presentation-sections.ts` without `any`/suppression comments; host-runtime adoption is deferred to Tasks 6 and 7.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Healthy defer preserves backlog
    Tool: Bash
    Steps: Run `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts -t "keeps incoming posters pending when no writable slots exist"`.
    Expected: Command exits 0 and the test proves zero visible replacements, non-zero deferred count, and FIFO backlog retention.
    Evidence: .sisyphus/evidence/task-2-healthy-defer.txt

  Scenario: True unavailable still signals failure
    Tool: Bash
    Steps: Run `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts -t "returns unavailable when poster grid stream state is missing"`.
    Expected: Command exits 0 and the test proves missing stream state still maps to `unavailable`, not `deferred`.
    Evidence: .sisyphus/evidence/task-2-unavailable.txt
  ```

  **Commit**: YES | Message: `feat(core): defer incoming wall posters with typed apply results` | Files: [`packages/core/src/wall/ui/presentation-sections.ts`, `packages/core/test/wall-poster-grid-stream.test.ts`]

- [x] 3. Integrate writable-slot selection into the shared stream applier without changing visible tiles

  **What to do**: Rework `applyWallPosterGridStreamState` so each apply pass: captures the current tile rectangles for the row, computes the writable entry-buffer indices, drains pending backlog first, then applies only as many incoming posters as currently writable slots allow. Preserve row round-robin distribution across rows, but never call `applyWallPosterTileMedia` on a tile whose rect intersects the viewport. Keep `wallPosterTileIdentityByElement` updated so test code can compare identities before/after healthy refreshes.
  **Must NOT do**: Do not reuse row-wide `entryIndices` as writable eligibility; do not reorder pending backlog; do not remount or rebuild the grid.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: shared-core DOM/geometry integration with round-robin and backlog interplay.
  - Skills: [] — no external library needed.
  - Omitted: [`frontend-design`] — behavior change only; visuals must stay fixed.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [4,5,6,7,8,9,10] | Blocked By: [1,2]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts:120-180` — current direct tile media mutation path.
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts:457-541` — row/tile state construction and alternating `rowDirection` contract.
  - API/Type: `packages/core/src/wall/ui/presentation-sections.ts:26-32` — stream applier key/type surface to upgrade.
  - Test: `packages/core/test/wall-poster-grid-stream.test.ts:55-90` — row-direction and row-distribution behavior to preserve.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts` passes with DOM-light tests proving visible tile identities remain unchanged across healthy apply passes when incoming posters arrive.
  - [ ] Shared-core applier preserves row round-robin distribution while restricting writes to the two nearest off-screen entry tiles per row snapshot.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Healthy stream updates only off-screen entry slots
    Tool: Bash
    Steps: Run `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts -t "applies incoming posters only to eligible entry-buffer tiles"`.
    Expected: Command exits 0 and the test proves viewport-intersecting tiles keep their original identities.
    Evidence: .sisyphus/evidence/task-3-visible-freeze.txt

  Scenario: Round-robin still spans rows under bounded writes
    Tool: Bash
    Steps: Run `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts -t "preserves row round-robin distribution while using bounded writable slots"`.
    Expected: Command exits 0 and incoming posters are distributed row-by-row without violating the writable-slot cap.
    Evidence: .sisyphus/evidence/task-3-round-robin.txt
  ```

  **Commit**: YES | Message: `feat(core): stream new posters through bounded off-screen entry slots` | Files: [`packages/core/src/wall/ui/presentation-sections.ts`, `packages/core/test/wall-poster-grid-stream.test.ts`]

- [x] 4. Make eligibility reclassification resize/fullscreen-safe in shared core

  **What to do**: Ensure writable-slot selection is recomputed from the current geometry snapshot on every apply pass rather than cached from initial render, so fullscreen entry and viewport-size changes only alter future off-screen eligibility and never force visible-tile rewrites. Add deterministic tests with synthetic rect sets simulating viewport expansion/contraction and row-direction flips.
  **Must NOT do**: Do not add ResizeObserver or timer-based relayout loops in this task; do not change existing wall clock/fullscreen control behavior.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: geometry-state correctness under changing viewport sizes.
  - Skills: [] — pure/core-first validation.
  - Omitted: [`playwright`] — browser E2E belongs in later host tasks.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [5,6,7,8,9,10] | Blocked By: [1,2,3]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts:393-405` — poster grid width/transform contract to preserve.
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts:463-469` — row animation and alternating direction inputs.
  - Pattern: `apps/web/src/onboarding/runtime.ts:746-748,1007-1102,1103-1210` — current no-remount fullscreen and wall-clock expectations.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts:1007-1210` — existing fullscreen/clock stability scenarios to mirror at the core-contract level.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts` passes with synthetic viewport-change cases proving that visible tiles remain protected after geometry reclassification.
  - [ ] No new resize/fullscreen-specific render loop or observer is introduced; eligibility is recomputed on existing apply attempts only.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Viewport expansion preserves protected tiles
    Tool: Bash
    Steps: Run `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts -t "reclassifies writable entry slots after viewport expansion without mutating visible tiles"`.
    Expected: Command exits 0 and newly visible tiles remain frozen after the viewport grows.
    Evidence: .sisyphus/evidence/task-4-viewport-expand.txt

  Scenario: Viewport contraction restores off-screen eligibility
    Tool: Bash
    Steps: Run `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts -t "makes fully exited tiles writable again after viewport contraction"`.
    Expected: Command exits 0 and previously protected tiles only become writable once fully outside the viewport.
    Evidence: .sisyphus/evidence/task-4-viewport-contract.txt
  ```

  **Commit**: YES | Message: `refactor(core): recompute wall entry eligibility from live geometry snapshots` | Files: [`packages/core/src/wall/ui/presentation-sections.ts`, `packages/core/test/wall-poster-grid-stream.test.ts`]

- [x] 5. Prove deferred writes do not drop posters in queue/ingestion integration

  **What to do**: Extend `packages/core/test/runtime/onboarding-ingestion-queue-integration.test.ts` so the ingestion controller can exercise a healthy stream where incoming posters are deferred for one or more ticks before writable entry slots reappear. Verify that deferred posters remain pending, do not masquerade as queue failure, and eventually drain into the wall stream in FIFO order without altering queue refill semantics.
  **Must NOT do**: Do not change `RUNTIME_POSTER_QUEUE_LOW_WATERMARK`, `RUNTIME_POSTER_QUEUE_REFILL_TARGET`, or the 300000ms ingestion refresh cadence; do not rewrite provider-fetch behavior in this task.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: integration-heavy deterministic test harness work.
  - Skills: [] — existing Vitest controller harness already exists.
  - Omitted: [`playwright`] — this task stays in core integration tests.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [6,7,8,9,10] | Blocked By: [2,3,4]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `packages/core/src/runtime/onboarding-ingestion.ts:151-154` — queue snapshot sync into `state.ingestionItems`.
  - Pattern: `packages/core/src/runtime/onboarding-ingestion.ts:234-297` — refill completion path and render request trigger.
  - Pattern: `packages/core/src/runtime/onboarding-ingestion.ts:216-224` — queue refill fetch adapter integration.
  - Pattern: `packages/core/src/runtime/poster-queue.ts:187-369` — queue refill intent, consume, and single-flight refill behavior that must stay unchanged.
  - Test: `packages/core/test/runtime/onboarding-ingestion-queue-integration.test.ts:237-347` — existing bootstrap/refill harness to extend.
  - Test: `packages/core/test/runtime/poster-queue-refill.test.ts:55-239` — queue boundary semantics that must continue passing.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @mps/core test -- test/runtime/onboarding-ingestion-queue-integration.test.ts` passes with a case proving deferred incoming posters are not dropped and later drain in FIFO order.
  - [ ] `pnpm --filter @mps/core test -- test/runtime/poster-queue-refill.test.ts` still passes unchanged, proving queue policy remains intact.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Deferred stream then eventual drain
    Tool: Bash
    Steps: Run `pnpm --filter @mps/core test -- test/runtime/onboarding-ingestion-queue-integration.test.ts -t "defers incoming posters until entry slots reopen without dropping them"`.
    Expected: Command exits 0 and the test proves deferred posters remain pending and later apply in original order.
    Evidence: .sisyphus/evidence/task-5-deferred-drain.txt

  Scenario: Queue policy remains unchanged
    Tool: Bash
    Steps: Run `pnpm --filter @mps/core test -- test/runtime/poster-queue-refill.test.ts`.
    Expected: Command exits 0 and the low-watermark/target-40 semantics remain unchanged.
    Evidence: .sisyphus/evidence/task-5-queue-policy.txt
  ```

  **Commit**: YES | Message: `test(core-runtime): cover deferred wall stream backlog drain` | Files: [`packages/core/test/runtime/onboarding-ingestion-queue-integration.test.ts`, `packages/core/test/runtime/poster-queue-refill.test.ts`, `packages/core/src/wall/ui/presentation-sections.ts`]

- [x] 6. Update web host runtime to honor healthy defer/no-op instead of remounting

  **What to do**: In `apps/web/src/onboarding/runtime.ts`, update the `WALL_POSTER_GRID_STREAM_APPLIER_KEY` contract and `handleIngestionRenderRequest()` so `applied`, `deferred`, and `noop` all count as healthy outcomes. Only `unavailable` or genuinely missing readiness should request fallback render. Keep existing wall clock and fullscreen in-place patching behavior intact; do not trigger remounts during healthy manual refresh, scheduled refresh, fullscreen entry, or wall-clock updates.
  **Must NOT do**: Do not change fullscreen request UX, diagnostics interval, or unrelated onboarding/login flow; do not add fallback remounts for deferred backlog states.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: host runtime contract change with remount regression risk.
  - Skills: [] — local runtime logic only.
  - Omitted: [`frontend-design`] — no UI redesign allowed.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [8,10] | Blocked By: [2,3,5]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/src/onboarding/runtime.ts:436-443` — current boolean stream-applier call surface.
  - Pattern: `apps/web/src/onboarding/runtime.ts:506-549` — fallback/remount decision logic to narrow.
  - Pattern: `apps/web/src/onboarding/runtime.ts:552-581` — wall stream tick loop that must stay active.
  - Pattern: `apps/web/src/onboarding/runtime.ts:593-748` — in-place clock/fullscreen patching that must remain remount-free.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts:822-1210` — current remount, wall-clock, and fullscreen expectations.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts --grep "handles healthy stream without poster-item-0 sentinel and limits fallback to one remount per incident"` passes with healthy defer treated as non-remounting.
  - [ ] `pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts --grep "updates the wall clock without remounting the wall|keeps the existing wall mounted when entering fullscreen"` passes unchanged.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Healthy defer does not remount on web
    Tool: Playwright
    Steps: Run `pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts --grep "handles healthy stream without poster-item-0 sentinel and limits fallback to one remount per incident"`; inspect emitted probe JSON for `remountCount` during healthy refreshes.
    Expected: Command exits 0; healthy stream path keeps `remountCount` at 0 and only broken readiness incidents increment it to 1.
    Evidence: .sisyphus/evidence/task-6-web-remount-discipline.txt

  Scenario: Clock/fullscreen remain in-place patches
    Tool: Playwright
    Steps: Run `pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts --grep "updates the wall clock without remounting the wall|keeps the existing wall mounted when entering fullscreen"`.
    Expected: Command exits 0 and `sameWallRootAsBaseline` / `sameWallGridAsBaseline` remain true before and after clock/fullscreen changes.
    Evidence: .sisyphus/evidence/task-6-web-clock-fullscreen.txt
  ```

  **Commit**: YES | Message: `fix(web-onboarding): treat healthy wall defers as in-place updates` | Files: [`apps/web/src/onboarding/runtime.ts`, `apps/web/e2e/onboarding-auth.spec.ts`, `packages/core/src/wall/ui/presentation-sections.ts`]

- [x] 7. Update desktop host runtime to match the healthy-defer contract

  **What to do**: Mirror the web host contract update in `apps/desktop/src/onboarding/runtime.ts` so shared-core `deferred` and `noop` outcomes do not trigger fallback render. Preserve the current one-remount-per-broken-readiness-incident contract, and keep the existing mounted-wall behavior when poster sentinels are absent but the grid is otherwise healthy.
  **Must NOT do**: Do not fork desktop-only stream semantics; do not change desktop auth/session flows or unrelated diagnostics/export logic.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: host parity work must remain aligned with the shared-core contract.
  - Skills: [] — existing desktop Vitest harness is local.
  - Omitted: [`frontend-design`] — no visual changes allowed.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [9,10] | Blocked By: [2,3,5]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/desktop/src/onboarding/runtime.ts:425-432` — current boolean stream-applier contract.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts:471-514` — desktop fallback/remount decision logic.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts:517-547` — stream tick loop parity with web.
  - Test: `apps/desktop/test/onboarding-auth.test.ts:745-918` — existing mounted-stream and broken-readiness incident tests.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @mps/desktop test -- test/onboarding-auth.test.ts` passes with healthy defer/no-op states treated as mounted, non-remounting outcomes.
  - [ ] Existing desktop broken-readiness incident coverage still proves at most one remount per incident and correct rearm after recovery.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Healthy defer stays mounted on desktop
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test -- test/onboarding-auth.test.ts -t "keeps healthy stream updates mounted when poster-item-0 is absent"`.
    Expected: Command exits 0 and the existing `poster-wall-root` / `wall-poster-grid` elements remain identical across healthy refreshes.
    Evidence: .sisyphus/evidence/task-7-desktop-mounted.txt

  Scenario: Broken readiness still remounts once per incident
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test -- test/onboarding-auth.test.ts -t "falls back once per broken readiness incident and rearms after recovery"`.
    Expected: Command exits 0 and the first broken incident remounts once, repeated broken refreshes do not remount again until recovery.
    Evidence: .sisyphus/evidence/task-7-desktop-fallback.txt
  ```

  **Commit**: YES | Message: `fix(desktop-onboarding): honor healthy wall defer contract` | Files: [`apps/desktop/src/onboarding/runtime.ts`, `apps/desktop/test/onboarding-auth.test.ts`, `packages/core/src/wall/ui/presentation-sections.ts`]

- [x] 8. Add web Playwright coverage that checks real visible poster identities, not sentinels

  **What to do**: Extend `apps/web/e2e/onboarding-auth.spec.ts` with a new scenario named `does not replace visible posters during healthy refreshes`. In the test, collect the currently visible poster buttons from `[data-testid="wall-poster-grid"]` by viewport intersection, capture their `backgroundImage` values (or poster-thumb background values), trigger healthy refresh/stream activity, and assert that the same visible elements retain the same backgrounds while off-screen entry tiles are allowed to change. Keep the existing remount, clock, and fullscreen probes intact.
  **Must NOT do**: Do not rely on `poster-item-0` or any single sentinel as proof of visible immutability; do not compare screenshots pixel-for-pixel.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: browser-visible behavior verification with animated DOM.
  - Skills: [`playwright`] — required for deterministic browser inspection.
  - Omitted: [`frontend-design`] — no UI redesign work.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [10] | Blocked By: [4,6]

  **References** (executor has NO interview context — be exhaustive):
  - Test: `apps/web/e2e/onboarding-auth.spec.ts:96-176` — existing probe helpers for wall root/grid identity.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts:822-933` — healthy stream + incident remount probe to extend.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts:1007-1210` — wall clock/fullscreen no-remount assertions to preserve.
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts:487-517` — poster tiles are buttons with poster thumbs using `backgroundImage`.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts --grep "does not replace visible posters during healthy refreshes"` passes.
  - [ ] The new test captures at least 3 currently visible poster elements by viewport intersection and proves their `backgroundImage` values stay unchanged across a healthy refresh cycle.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Visible poster identities remain stable on healthy refresh
    Tool: Playwright
    Steps: Run `pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts --grep "does not replace visible posters during healthy refreshes"`; inspect the emitted probe payload for the before/after visible poster backgrounds.
    Expected: Command exits 0 and the same visible poster elements keep identical background-image strings before and after refresh.
    Evidence: .sisyphus/evidence/task-8-web-visible-identities.txt

  Scenario: Existing remount/fullscreen/clock probes still pass
    Tool: Playwright
    Steps: Run `pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts --grep "handles healthy stream without poster-item-0 sentinel and limits fallback to one remount per incident|updates the wall clock without remounting the wall|keeps the existing wall mounted when entering fullscreen"`.
    Expected: Command exits 0 and all existing probes remain green alongside the new visible-identity coverage.
    Evidence: .sisyphus/evidence/task-8-web-regressions.txt
  ```

  **Commit**: YES | Message: `test(web-wall): prove visible posters stay immutable during healthy refreshes` | Files: [`apps/web/e2e/onboarding-auth.spec.ts`, `apps/web/src/onboarding/runtime.ts`, `packages/core/src/wall/ui/presentation-sections.ts`]

- [x] 9. Add desktop parity coverage for visible-poster immutability and incident discipline

  **What to do**: Extend `apps/desktop/test/onboarding-auth.test.ts` with a desktop-only parity check that stubs visible vs off-screen `getBoundingClientRect()` ranges for selected wall tiles, captures background-image values for visible tiles, triggers healthy refreshes, and proves those visible tiles do not change in place. Preserve the existing broken-readiness incident test unchanged except for adapting to the new apply-result type.
  **Must NOT do**: Do not introduce desktop-only eligibility logic; do not remove the existing mounted-wall or incident-rearm tests.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: deterministic jsdom/runtime parity test authoring.
  - Skills: [] — existing desktop Vitest harness already covers runtime setup.
  - Omitted: [`playwright`] — desktop parity stays in the Vitest/jsdom harness.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [10] | Blocked By: [4,7]

  **References** (executor has NO interview context — be exhaustive):
  - Test: `apps/desktop/test/onboarding-auth.test.ts:745-814` — current healthy mounted-stream test pattern.
  - Test: `apps/desktop/test/onboarding-auth.test.ts:816-918` — current incident fallback discipline test pattern.
  - Pattern: `packages/core/src/wall/ui/presentation-sections.ts:120-193,487-517` — tile identity mutation path to validate from the desktop harness.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts:425-547` — desktop stream/fallback contract updated in Task 7.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @mps/desktop test -- test/onboarding-auth.test.ts -t "keeps visible posters unchanged during healthy refreshes"` passes.
  - [ ] `pnpm --filter @mps/desktop test -- test/onboarding-auth.test.ts -t "falls back once per broken readiness incident and rearms after recovery"` still passes unchanged in behavior.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Desktop visible tiles stay immutable during healthy refresh
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test -- test/onboarding-auth.test.ts -t "keeps visible posters unchanged during healthy refreshes"`.
    Expected: Command exits 0 and the stubbed visible tile elements keep the same background-image strings before/after refresh.
    Evidence: .sisyphus/evidence/task-9-desktop-visible-identities.txt

  Scenario: Desktop incident contract still rearms correctly
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test -- test/onboarding-auth.test.ts -t "falls back once per broken readiness incident and rearms after recovery"`.
    Expected: Command exits 0 and one-remount-per-incident behavior remains intact.
    Evidence: .sisyphus/evidence/task-9-desktop-incident.txt
  ```

  **Commit**: YES | Message: `test(desktop-wall): preserve visible-poster immutability parity` | Files: [`apps/desktop/test/onboarding-auth.test.ts`, `apps/desktop/src/onboarding/runtime.ts`, `packages/core/src/wall/ui/presentation-sections.ts`]

- [x] 10. Run full workspace verification and collect evidence for the new contract

  **What to do**: After all code and regression tasks are complete, run the targeted package tests first, then the workspace gates listed in `AGENTS.md`. Collect evidence files for core helper math, deferred backlog drain, web visible-identity probes, desktop parity, and final workspace gates. If any test fails because it assumed row-wide write eligibility, update that test only if the failure is directly caused by the new Scheme A contract.
  **Must NOT do**: Do not broaden scope to unrelated flaky suites; do not skip failing tests without root-cause resolution.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: broad verification sweep with evidence gathering.
  - Skills: [`playwright`] — needed for the web E2E subset and full e2e gate.
  - Omitted: [`frontend-design`] — verification only.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [Final verification wave] | Blocked By: [5,6,7,8,9]

  **References** (executor has NO interview context — be exhaustive):
  - AGENTS: `AGENTS.md:29-51,111-120` — canonical lint/typecheck/test/build/e2e commands.
  - Test: `packages/core/test/wall-poster-grid-stream.test.ts` — helper and backlog coverage.
  - Test: `packages/core/test/runtime/onboarding-ingestion-queue-integration.test.ts` — deferred/no-drop integration coverage.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts:822-1210` — remount, clock, fullscreen, and new visible-identity coverage.
  - Test: `apps/desktop/test/onboarding-auth.test.ts:745-918` — desktop parity coverage.

  **Acceptance Criteria** (agent-executable only):
  - [ ] All targeted package-level commands pass and evidence artifacts exist under `.sisyphus/evidence/` for tasks 1-9.
  - [ ] `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`, and `pnpm -w e2e` all exit 0.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Targeted contract and regression sweep
    Tool: Bash
    Steps: Run `pnpm --filter @mps/core test -- test/wall-poster-grid-stream.test.ts && pnpm --filter @mps/core test -- test/runtime/onboarding-ingestion-queue-integration.test.ts && pnpm --filter @mps/desktop test -- test/onboarding-auth.test.ts && pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts`.
    Expected: Command exits 0 and evidence for visible immutability, deferred backlog, and incident parity is captured.
    Evidence: .sisyphus/evidence/task-10-targeted-sweep.txt

  Scenario: Workspace gate sweep
    Tool: Bash
    Steps: Run `pnpm -w lint && pnpm -w typecheck && pnpm -w test && pnpm -w build && pnpm -w e2e`.
    Expected: Command exits 0 across the workspace with no regressions.
    Evidence: .sisyphus/evidence/task-10-workspace-gates.txt
  ```

  **Commit**: NO | Message: `chore(verify): run wall edge-buffer verification sweep` | Files: [`.sisyphus/evidence/*`]

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Agent-Driven Playwright QA — unspecified-high (+ playwright)
- [x] F4. Scope Fidelity Check — deep

  **F1 QA Scenario**
  ```
  Tool: task(subagent_type="oracle")
  Steps: Review `.sisyphus/plans/wall-edge-buffer-streaming.md` against the saved requirements and verify every task preserves Scheme A defaults, shared-core scope, and zero-human verification.
  Expected: Oracle returns APPROVE with no critical scope or contract drift.
  Evidence: .sisyphus/evidence/f1-plan-compliance.md
  ```

  **F2 QA Scenario**
  ```
  Tool: task(category="unspecified-high")
  Steps: Audit the final implementation diff against the plan, focusing on type safety, selector stability, queue-policy preservation, and absence of row-wide visible writes.
  Expected: Reviewer returns APPROVE with zero critical findings.
  Evidence: .sisyphus/evidence/f2-code-quality.md
  ```

  **F3 QA Scenario**
  ```
  Tool: task(category="unspecified-high", load_skills=["playwright"])
  Steps: Run the web wall flow, capture visible-poster identities before/after healthy refreshes, verify fullscreen and wall-clock no-remount behavior, and save the browser evidence.
  Expected: Reviewer returns APPROVE and attached evidence proves visible posters remain unchanged during healthy refreshes.
  Evidence: .sisyphus/evidence/f3-playwright-qa.md
  ```

  **F4 QA Scenario**
  ```
  Tool: task(category="deep")
  Steps: Compare final changes against `.sisyphus/plans/wall-edge-buffer-streaming.md` and reject any queue-policy, ingestion-cadence, scene-runtime, selector, or visual-design scope creep.
  Expected: Reviewer returns APPROVE with no out-of-scope modifications.
  Evidence: .sisyphus/evidence/f4-scope-fidelity.md
  ```

## Commit Strategy
- Commit 1: `test(core): lock wall edge-buffer immutability rules`
- Commit 2: `feat(core): defer new posters until off-screen slots open`
- Commit 3: `fix(onboarding): honor healthy wall defer state across hosts`
- Commit 4: `test(onboarding-wall): cover visible-poster immutability regressions`

## Success Criteria
- Healthy wall updates only change entry-side off-screen tiles.
- Any tile intersecting the viewport keeps the same poster identity until it fully exits.
- Deferred incoming posters are eventually applied in FIFO order and are never dropped due to temporary lack of writable slots.
- Web and desktop continue sharing the same core wall stream behavior.
- Existing fallback/remount tests remain valid for true readiness incidents only.
