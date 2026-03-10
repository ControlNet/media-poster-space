# Learnings

## 2026-03-01 — Task 1 baseline lock
- `node scripts/verify-wall-contracts.mjs` remains the fastest gate signal for selector/timing parity; current baseline run is PASS.
- Required selector/timing assertions are anchored in both web + desktop tests and in `scripts/contracts/wall-contracts.json`, so future no-visual-change checks should compare all three surfaces (contracts + web e2e + desktop vitest).
- For deterministic wall baseline capture without full onboarding flow, priming `mps.auth.session` + `mps.wall.handoff` in `sessionStorage` is sufficient to enter `/wall` and capture selector/diagnostics invariants.

## 2026-03-01 — Task 2 diagnostics render split
- `createOnboardingDiagnosticsController` is safer when it emits a diagnostics-specific callback (`onDiagnosticsRenderRequest(sample)`) instead of a generic render request, because diagnostics timer ticks can no longer directly invoke full wall remount paths.
- Host runtimes can keep `/wall` mount identity stable by patching only diagnostics telemetry text nodes (`wall-diagnostics-fps`, `wall-diagnostics-memory`, `wall-diagnostics-reconnect`, `wall-diagnostics-retention-policy`) when diagnostics are visible.
- Gating diagnostics DOM patching behind both `isWallRouteActive()` and `state.diagnosticsOpen` preserves the `1000ms` sampling contract while avoiding hidden per-second wall rebuild work.

## 2026-03-01 — Task 3 queue policy/state model
- A pure queue model works cleanly as immutable state transitions (`create` / `enqueue` / `consume` / `refill-intent`) when queue identity dedupe is encoded as `providerId::id` and FIFO order is preserved.
- Keeping bootstrap as explicit state (`bootstrapPending`) makes the initial `target=40` contract testable without coupling to host runtime wiring; low-watermark policy can then activate deterministically after bootstrap resolves.
- Threshold regression coverage is easiest to keep deterministic by proving exact transition points `40 -> 39 -> 10 -> 9` and asserting intent only flips to refill at `<10` with `requestedCount = 40 - size`.
- Verified the deterministic queue contracts by running `pnpm --filter @mps/core test -- test/runtime/poster-queue.test.ts --reporter verbose` and capturing the `dedupes queue entries...` and `emits deterministic refill intent transitions...` outputs in the evidence directory.
- Confirmed the default `pnpm --filter @mps/core test -- test/runtime/poster-queue.test.ts` run passes, proving the bootstrap/threshold/dedupe expectations remain satisfied after the final implementation.

## 2026-03-01 — Task 4 queue refill TDD
- Single-flight behavior is cleanly testable with a deferred Promise: asserting identical `Promise` identity plus `fetchItems` call count (`1`) proves concurrent refill request serialization deterministically without timers.
- Starvation diagnostics are most stable when classified from refill attempt shape (`empty` when provider returns zero items, `partial` when accepted enqueue count is below requested top-up) and validated alongside dedupe counters.
- Running wildcard queue tests from `packages/core` allows deterministic shell expansion for `test/runtime/poster-queue*.test.ts`, while preserving the required command shape from the plan.

## 2026-03-01 — Task 5 refill adapter learnings
- Reusing `ingestSelectedMedia` inside a runtime adapter keeps selected-library scoping and poster eligibility filtering aligned with existing ingestion behavior while still allowing queue-specific fetch semantics (`limit`, cursor continuation, and incremental `updatedSince`).
- Cursor-aware query shaping is safest when `updatedSince` is only sent on non-cursor fetches; once a page exhausts (`nextCursor` absent), advancing `updatedSince` to the latest `fetchedAt` keeps later refill pulls incremental.
- Wrapping refill fetch failures in a runtime error type that carries `providerError` preserves auth/network categories for reconnect guidance without changing provider contracts.

## 2026-03-01 — Task 6 incremental wall stream applier learnings
- Wall grid node identity can stay stable while stream updates apply by mutating existing tile backgrounds in place and keeping per-grid stream state in a WeakMap keyed to `wall-poster-grid`.
- Entry-edge replacement stays deterministic when each row precomputes an edge-first traversal from animation direction (`normal` from right edge inward, `reverse` from left edge inward).
- Tile click behavior remains index-correct under stream updates by resolving `providerId::id` identity at click-time against the latest identity→index map instead of capturing the original render index in closures.

## 2026-03-01 — Task 7 reconnect regression fix
- Queue refill hooks must not run for non-`ready` ingestion states; invoking refill side effects during `refreshing`/`error` introduced reconnect-guide timing instability under desktop fake-timer backoff tests.
- Keeping queue refill scheduling on `ready` transitions plus stream-consume underflow events preserves queue lifecycle while leaving reconnect/backoff/manual-refresh semantics intact.

- 2026-03-01: Task 6 QA capture required fallback to port 4174 (4173 busy); MP4 artifact generation worked via GStreamer VP8->VP9 (`vp8dec ! vp9enc ! mp4mux`) when ffmpeg was unavailable.

## 2026-03-01 — Task 8 wall patch guard learnings
- Guarding ingestion `onRenderRequest` by route and DOM availability prevents unconditional wall remount attempts; a lightweight patch path can update stream + diagnostics ingestion text without clearing the wall container.
- Diagnostics sampling callback should stay telemetry-only (`onDiagnosticsRenderRequest`) so the `1000ms` sampler does not induce full wall tree replacement.

## 2026-03-01 — Task 8 regression restoration learnings
- Restoring the web wall stream tick loop (`consumeNextPosterForStream` on an interval) is required to keep queue-driven incremental wall behavior alive after adding the render guard.
- Session and wall handoff dual-storage (session + local) prevents fallback regressions on runtime restarts and keeps `/wall` hydration behavior aligned with prior stable semantics.

## 2026-03-01 — Task 8 wall render race guard
- A wall mount guard (`isWallRendering`) is necessary so ingestion callbacks do not trigger nested `render()` fallback while `renderWall()` is rebuilding root/grid nodes.
- Deferring one patch request (`wallPatchDeferredDuringRender`) and replaying it after mount completes avoids duplicate wall nodes without removing the `/wall` patch-path behavior.

## 2026-03-01 — Task 9 desktop parity learnings
- Desktop wall patching needs a one-time fallback remount when the wall first mounts with an empty grid and ingestion items arrive afterward; the stream applier cannot create poster tiles from the empty-state shell alone.
- Reconnect/backoff behavior is more deterministic when error-state updates patch existing callout text (`wall-ingestion-error` and reconnect retry metadata) instead of remounting the wall on every error update.
- Diagnostics sampling remained telemetry-only (`onDiagnosticsRenderRequest`) while still allowing ingestion-driven ready/error updates to stay in sync through targeted wall patching.

## 2026-03-01 — Task 10 full-gate + continuity wave
- Full required verification gates are currently green in this branch state (`lint`, `typecheck`, `test`, `build`, `verify-wall-contracts`, `verify:docs-parity --strict` all exit `0`), with raw command output captured in `task-10-full-gates.txt`.
- Manual no-remount probe kept diagnostics open for `10068ms` with `11` continuity samples, confirming diagnostics visibility stability over the required >=10s window.
- Continuity probe still reports `rootSameNode=false` and `gridSameNode=false` on all samples, reinforcing the unresolved web wall remount instability tracked from Task 8 context.

## 2026-03-01 — F2 code-quality review learnings
- Web runtime now serializes full rerenders with `isRendering`/`renderDeferred`; desktop runtime has wall-mount deferral but no equivalent global rerender serialization, so parity work should align reentrancy strategy across both surfaces.
- Core onboarding ingestion queue logic uses `queueLifecycleNonce` defensively to ignore stale async refill results; that same pattern would improve desktop fire-and-forget async calls that currently have no rejection handling.
- Anti-pattern scan across focus files/tests found no `TODO`/`FIXME`/`HACK`/`as any`/`@ts-ignore`; current quality risks are concentrated in async rejection handling and runtime-key identity scope, not type-safety shortcuts.

## 2026-03-01 — Task 10 rerun regression wave learnings
- Re-ran all required gate commands (`lint`, `typecheck`, `test`, `build`, `verify-wall-contracts`, `verify:docs-parity --strict`) with explicit `EXIT_STATUS=0` entries and `OVERALL_STATUS=0` captured in `.sisyphus/evidence/task-10-full-gates.txt`.
- Refreshed no-remount capture exceeded the required 10s window (`elapsedMs=10656`, `sampleCount=11`) and kept diagnostics open for the full sample set (`diagnosticsStable=true`).

## 2026-03-01 — Task 10 baseline-after-open rationale
- Baseline identity must be captured only after diagnostics panel is open and one animation frame has settled; otherwise the diagnostics-open transition itself can be mistaken for continuity remount churn.

## 2026-03-01 — Task 10 idle-hide diagnostics guard learnings
- PASS: Guarding web wall `onIdleHide` with `state.diagnosticsOpen` prevented idle-hide timer callbacks from triggering a render/remount while diagnostics is open.
- PASS: Refreshed continuity proof (`task-10-no-remount-proof.log`) now reports `allStable=true` with `rootSameNode=true` and `gridSameNode=true` for all sampled seconds (`0..10`).
