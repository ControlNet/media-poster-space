# Learnings — poster-loading-stability-no-remount

- 2026-03-03: Runtime still includes full-remount wall path in both hosts (`container.innerHTML = ""` in `apps/web/src/onboarding/runtime.ts` and `apps/desktop/src/onboarding/runtime.ts`).
- 2026-03-03: Idle threshold remains `WALL_IDLE_HIDE_MS = 8_000`, matching reported user symptom window.
- 2026-03-03: Stream fallback predicate still depends on `poster-item-0` sentinel and `wallPatchFallbackRequested` gate in both hosts.
- 2026-03-03: Ingestion controller supports `createQueueRefillFetchAdapter`, but host wiring needs explicit verification in web/desktop runtime instantiation.
- 2026-03-03: Runtime refill boundary contract is strict (`currentSize < 10`): size 9 triggers refill to target 40, while sizes 10/39/40 skip deterministically.
- 2026-03-03: For catalogs smaller than target size, dedupe prevents enqueue inflation by accepting only identities absent from the current queue (e.g., 12-item catalog at size 9 accepts exactly 3).
- 2026-03-03: Added deterministic non-gating Task 1 probes in `apps/web/e2e/onboarding-auth.spec.ts` and `apps/desktop/test/onboarding-auth.test.ts` that log wall-root/grid identity snapshots plus selector presence for `poster-wall-root`, `wall-poster-grid`, `poster-item-0`, `manual-refresh-button`, and `diagnostics-open`.
- 2026-03-03: Baseline evidence from both hosts shows root/grid identity stable after manual refresh, but changed after the 8s idle window, while selector contract remained present across snapshots.
- 2026-03-03: Web runtime now wires `createQueueRefillFetchAdapter` into `createOnboardingIngestionController` via `createRuntimePosterQueueRefillFetchAdapter`, so queue top-ups use fetch-adapter flow when available.
- 2026-03-03: Web crash-export diagnostics from `queue.refill-completed` report non-null `adapterState` (observed sample: `{ "cursor": null, "updatedSince": "2026-03-03T08:25:28.183Z" }`) during targeted e2e verification.
- 2026-03-03: Desktop runtime now wires `createQueueRefillFetchAdapter` into `createOnboardingIngestionController` using `createRuntimePosterQueueRefillFetchAdapter`; desktop queue top-ups issue adapter-backed fetches instead of wrap-only fallback when adapter is available.
- 2026-03-03: Desktop diagnostics evidence now includes `queue.refill-completed` with non-null `adapterState` (observed sample: `{ "cursor": null, "updatedSince": "2026-03-03T08:31:48.244Z" }`) from onboarding/wall regression execution.
- 2026-03-03: `createMediaIngestionRuntime` now consumes `state.nextCursor` only for scheduled refreshes; initial/manual refreshes intentionally reset to newest-page queries by omitting cursor.
- 2026-03-03: Adapter continuity remains stable across pagination boundaries: after cursor exhaustion (`nextCursor: null`), refill queries pivot back to `updatedSince` and advance that timestamp on each full-page completion.
- 2026-03-03: Filtering contract stayed intact during pagination work: selected-library gating and non-empty poster URL eligibility still define accepted ingestion/refill items.

- 2026-03-03: Desktop Task 6 test harness cannot assume `poster-item-0` always exists at assertion time; realistic readiness checks should assert wall root/grid stability and generic `[data-testid^="poster-item-"]` family presence instead of a fixed index sentinel.
- 2026-03-03: Readiness-blocking for one-shot fallback tests must be installed only after wall route entry to avoid interfering with onboarding library-checkbox rendering in desktop jsdom tests.

- 2026-03-03: For desktop Task 6, sentinel-independence checks are stable when they verify wall mount identity + poster-item family presence instead of requiring `poster-item-1` to exist before stream refresh has fully materialized.
- 2026-03-03: Web + desktop wall interaction callbacks now apply in-place control/detail style patches on idle-hide/reveal/escape while staying on `/wall`, which kept `poster-wall-root` and `wall-poster-grid` identity stable through the 8s idle cycle in targeted verification.
- 2026-03-03: Task 7 web Playwright proof (`task-7-idle-no-remount`) showed controls visibility toggles (`hidden` -> `visible`) without remount and retained selector contracts across initial/manual-refresh/idle/reveal snapshots.
- 2026-03-03: Escape interaction check (`task-7-escape-detail`) remained non-remounting after resetting probe baseline immediately before Escape, avoiding false positives from legitimate diagnostics-triggered remount paths.

- 2026-03-03: Targeted web Playwright idle probe (`--grep "idle-hide"`) remained remount-free: `poster-wall-root` and `wall-poster-grid` stayed identity-stable through idle-hide (~8s) and pointer-driven reveal while control visibility toggled hidden -> visible.
- 2026-03-03: AST checks over app runtimes found no `createWallInteractionController` wiring that passes `onRenderRequest: render`, confirming idle/reveal/escape interaction controller callbacks route through patch-or-render wrappers instead of direct full rerender on `/wall`.
- 2026-03-03: Task 7 verification confirms idle-hide/reveal interaction path keeps `poster-wall-root` and `wall-poster-grid` identity stable in both web Playwright and desktop Vitest flows; controls visibility toggles without full remount.
- 2026-03-03: Task 8 parity is stable in full-suite context when diagnostics-open assertion compares idle visibility against an open-state baseline rather than hardcoded `visible`; diagnostics-closed idle still hides controls and pointer reveal restores visibility on both hosts.

- 2026-03-03: Task 9 full regression command now passes end-to-end (`pnpm -w lint && pnpm -w typecheck && pnpm -w test && pnpm -w build && pnpm -w e2e && node scripts/verify-wall-contracts.mjs`), with PASS marker recorded in `.sisyphus/evidence/task-9-full-gates.txt`.
- 2026-03-03: Deterministic no-remount idle-boundary proof was captured from web Playwright test `suppresses idle-hide while diagnostics are open and preserves diagnostics-closed idle-hide behavior`; resulting artifact is `.sisyphus/evidence/task-9-no-remount-proof.mp4` (18.84s).
- 2026-03-03: Repeat-policy stability evidence was strengthened by targeted Task 9 reruns of `poster-queue-refill.test.ts` for both large-catalog (>=40) and small-catalog (<40) policy cases, appended to `.sisyphus/evidence/task-9-full-gates.txt`.
- 2026-03-03: Task 9 full gate chain now passes end-to-end (`pnpm -w lint/typecheck/test/build/e2e` + `node scripts/verify-wall-contracts.mjs`) after replacing brittle web gate offline assertion `poster-item-0` with `[data-testid^="poster-item-"]`.
- 2026-03-03: No-remount proof capture is stable when evaluating diagnostics-open and diagnostics-closed windows against phase-specific baselines; continuity log reports `closedStable=true` and `openStable=true`.
- 2026-03-03: F2 quality review found no task-7/8/9 blockers in no-remount + diagnostics-parity paths; remaining review risk is swallowed logout invalidation errors in web/desktop runtimes.

- 2026-03-03: F3 real-manual QA rerun confirms /wall idle-hide+reveal (diagnostics closed), diagnostics-open parity, manual refresh+reconnect guide, and logout remembered-server/username preservation all pass in targeted web Playwright probes with no test-run console error output.
