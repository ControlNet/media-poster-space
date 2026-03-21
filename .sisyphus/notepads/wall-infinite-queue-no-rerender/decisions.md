# Decisions

## 2026-03-01 — Task 1 baseline policy decisions
- Treat Task 1 as evidence-only lock: no runtime/UI code changes; baseline recorded in `.sisyphus/evidence/task-1-baseline-*` artifacts.
- Freeze these comparison anchors for downstream tasks: `poster-wall-root`, `wall-poster-grid`, `manual-refresh-button`, `wall-ingestion-summary`, `wall-diagnostics-sampling-interval`, and diagnostics text `1000ms`.
- Accept `/wall` baseline screenshot captured under ingestion-error state (network unresolved) because required selectors and diagnostics interval remain present and measurable; this still provides valid no-visual-change reference for selector/shell invariants.

## 2026-03-01 — Task 2 render-path decision
- Replaced diagnostics controller callback wiring with `onDiagnosticsRenderRequest(sample)` to make diagnostics sampling an explicit render reason separate from full runtime rerender flows.
- Updated web/desktop runtime diagnostics wiring to patch diagnostics telemetry text directly instead of calling global `render()` on each diagnostics sample tick.
- Preserved diagnostics contracts by keeping `DIAGNOSTICS_SAMPLING_INTERVAL_MS = 1000` and leaving `wall-diagnostics-sampling-interval` content semantics unchanged.

## 2026-03-01 — Task 3 queue model decisions
- Added `packages/core/src/runtime/poster-queue.ts` as a pure runtime model surface (no DOM/runtime host coupling) and exported it via `packages/core/src/runtime/index.ts`.
- Locked explicit queue policy constants to `lowWatermark=10` and `refillTarget=40` through `DEFAULT_RUNTIME_POSTER_QUEUE_POLICY`, with validation in `createRuntimePosterQueuePolicy` for deterministic contract safety.
- Represented bootstrap policy explicitly with `bootstrapPending` and refill intent reason `"bootstrap"`; once queue reaches target, refill decisions switch to low-watermark logic (`"low-watermark"` when size `<10`).
- Defined media dedupe identity as `providerId::id` (`toRuntimePosterQueueMediaIdentity`) so duplicate suppression is deterministic while still allowing same raw `id` from different providers.
- ## 2026-03-01 — Task 3 acceptance decision
- Logged Task 3 as accepted because the deterministic threshold and dedupe unit tests both pass (`pnpm --filter @mps/core test -- test/runtime/poster-queue.test.ts`) and matching verbose traces were captured as evidence.

## 2026-03-01 — Task 4 refill runtime decisions
- Added a queue-local refill runtime (`createRuntimePosterQueueRefillRuntime`) in `packages/core/src/runtime/poster-queue.ts` to keep single-flight lock semantics inside the pure core model, without introducing provider adapter plumbing from Task 5.
- Standardized refill attempt outputs with typed metadata (`requestedCount`, `reason`, `acceptedCount`, `duplicateCount`, `starvation`, `skipped`, `refillIntent`) so threshold, dedupe, starvation, and race-prevention assertions remain deterministic in unit tests.
- Kept refill triggering semantics aligned with Task 3 policy constants: decisions still derive from `getRuntimePosterQueueRefillIntent` (`<10` low-watermark toward target `40`, plus bootstrap handling).

## 2026-03-01 — Task 5 refill adapter decisions
- Added `createRuntimePosterQueueRefillFetchAdapter` in `packages/core/src/runtime/poster-queue-refill-adapter.ts` and exported it from `packages/core/src/runtime/index.ts` as the runtime bridge from queue refill requests to provider `listMedia` query primitives.
- Adapter state tracks `cursor` + `updatedSince` internally, applies bounded pulls via `limit=requestedCount`, and advances `updatedSince` only after cursor exhaustion to support incremental follow-up pulls.
- Introduced `RuntimePosterQueueRefillAdapterError` with preserved `providerError` payload so downstream runtime flows can keep existing auth/network error-category handling without provider API changes.

## 2026-03-01 — Task 6 incremental wall stream applier decisions
- Implemented Task 6 stream mechanics directly in `packages/core/src/wall/ui/presentation-sections.ts` by introducing a stable-node incremental applier (`applyWallPosterGridStreamItems`) backed by WeakMap-managed grid state.
- Incoming stream items are defined as identity deltas (`providerId::id`) between previous and next item lists; only those deltas trigger tile replacement, which prevents full grid regeneration while rows continue animated motion.
- Preserved frozen visual/selector contracts by leaving tile/card styling intact and retaining existing `poster-item-{index}` assignment behavior on initial grid construction.

## 2026-03-01 — Task 7 reconnect/backoff restoration decision
- Restricted onboarding ingestion queue refill trigger points to `ready` ingestion updates and stream-consume underflow paths; removed refill scheduling from transient non-ready updates to avoid reconnect-guide contract regressions.
- Retained queue state, bootstrap fill behavior, and low-watermark refill logic without changing host runtime wiring or selector contracts.

## 2026-03-01 — Task 8 web runtime render-guard decision
- Updated web onboarding ingestion `onRenderRequest` to route-guarded behavior: non-wall routes still call full `render()`, while `/wall` routes run lightweight patching (`applyWallStreamItems` + `syncWallIngestionTelemetry`) and only fall back to one full render when wall root/grid is unavailable.
- Kept fallback/reconnect/fullscreen contracts untouched by limiting Task 8 changes to `apps/web/src/onboarding/runtime.ts` orchestration logic.

## 2026-03-01 — Task 8 restoration decision
- Kept the wall render guard and diagnostics telemetry-only callback, but restored stream loop/tick wiring and `onStreamReadyTransition` callback so `/wall` remains incremental rather than static.
- Reinstated dual-storage semantics for session and wall handoff reads/writes to remove onboarding-to-wall persistence regressions introduced during earlier guard-only edits.

## 2026-03-01 — Task 8 race-fix decision
- Added `isWallRendering` + deferred patch replay to ensure wall-missing fallback render cannot recursively fire during an active wall rebuild.
- Preserved existing guard contract: non-wall routes still full-render, mounted wall uses patch updates, missing wall outside rebuild allows one safe fallback render.

## 2026-03-01 — Task 9 desktop runtime parity decision
- Desktop onboarding runtime now mirrors shared/web incremental wall orchestration: route-guarded ingestion render handling, stream applier patch path, deferred patch replay during wall mount, and stream tick loop via `consumeNextPosterForStream`.
- Kept desktop-specific platform semantics unchanged (display/autostart controls, warning banner behavior, and password-vault bridge semantics) by limiting edits to wall render/patch lifecycle wiring in `apps/desktop/src/onboarding/runtime.ts`.
- Diagnostics callback remains telemetry-only, with targeted error-callout patching and single fallback renders only when required to materialize missing wall structures.

## 2026-03-01 — Task 10 acceptance decision
- Accept gate wave results as valid for regression baseline (all required commands exited `0` and are logged with raw output + status in `task-10-full-gates.txt`).
- Reject final Task 10 closure for now: no-remount proof captured successfully (`task-10-no-remount-proof.mp4` + `task-10-no-remount-proof.log`), but continuity checks remained unstable (`CONTINUITY_ROOT_GRID_STABLE=false`).
- Treat Task 10 as **blocked by unresolved web wall remount instability** until root/grid continuity remains stable through a >=10s diagnostics-open interval.

## 2026-03-01 — F4 scope-fidelity decision
- Scope verdict: **FAIL** for final acceptance because one core user constraint remains unmet (`no 1s remount` on web wall continuity).
- Requested vs delivered assessment:
  - Visual unchanged: mostly preserved (selector contracts remain PASS in `task-10-full-gates.txt`, and no visual-token/style redesign evidence was introduced).
  - Queue contract (`<10` refill to `40`): delivered and evidenced by queue/runtime tests (`task-3-queue-threshold-tests.txt`, `task-7-watermark-integration.txt`).
  - No 1s remount: **not delivered** in final evidence (`task-10-no-remount-proof.log` shows `allStable=false`, `rootSameNode=false`, `gridSameNode=false` across 11 samples / ~10s).
  - Shared core web/desktop behavior: partially delivered (desktop parity evidence is green; web continuity remains unstable).
- Out-of-scope additions observed in current diff map: legacy tracker exports and `.sisyphus/notepads/media-poster-space-v1/*` bookkeeping updates; these do not satisfy wall runtime scope and should be treated as process artifacts.
- Decision: **NO-GO** until web wall root/grid continuity is proven stable for >=10s diagnostics-open runtime and Task 8/10 continuity obligations are re-verified green.


## 2026-03-01 — F1 plan compliance audit (oracle)
- Audit basis: `.sisyphus/plans/wall-infinite-queue-no-rerender.md` acceptance criteria + mandatory QA scenarios; missing/failed evidence treated as non-compliant.
- Verdict snapshot (tasks 1-10): FAIL overall due to Task 1 web QA scenario failures, Task 2 missing evidence, Task 6 turnover proof gap, Task 8 missing green e2e proof, Task 10 no-remount proof failing.
- Explicit blockers:
  - Task 8: no evidence that web onboarding-to-wall e2e suite passes unchanged; notepad notes continued `diagnostics-open` instability/detach.
  - Task 10: gates pass, but continuity probe reports `CONTINUITY_ROOT_GRID_STABLE=false` across 11 samples with diagnostics open (>=10s), so “no 1s remount” is not proven.

## 2026-03-01 — F3 real manual QA decision
- Decision: **BLOCKED / not shippable** for wall interaction continuity.
- Basis: manual QA evidence (`.sisyphus/evidence/f3-manual-results-2026-03-01.json`) shows `1/5` pass (`wall entry flow` only) with deterministic click instability on controls (`diagnostics-open`, `manual-refresh-button`, `logout-button`) and unstable/detached poster interaction (`poster-item-0`).
- Supporting continuity artifact was refreshed (`task-10-no-remount-proof.mp4` + `.log`) and still shows `allStable=false` with root/grid node identity instability across all 11 samples during diagnostics-open window.

## 2026-03-01 — Task 10 rerun verdict decision
- Keep full regression wave marked **PASS** for mandatory gates because `.sisyphus/evidence/task-10-full-gates.txt` logs all required commands with `EXIT_STATUS=0` and `OVERALL_STATUS=0`.
- Keep Task 10 final closure marked **FAIL/BLOCKED** because refreshed no-remount continuity proof (`.sisyphus/evidence/task-10-no-remount-proof.log`) still shows `allStable=false` with `rootSameNode=false` and `gridSameNode=false` across the >=10s diagnostics-open sample window.

## 2026-03-01 — Task 10 final blocker resolution decision
- PASS: Apply a minimal web-only runtime callback guard in `apps/web/src/onboarding/runtime.ts` so idle-hide does not transition/render while `state.diagnosticsOpen === true`; preserve existing idle-hide behavior when diagnostics is closed.
- PASS: Mark Task 10 blocker resolved after refreshed continuity proof shows stable wall node identity for >=10s diagnostics-open window and all required gate commands pass.
