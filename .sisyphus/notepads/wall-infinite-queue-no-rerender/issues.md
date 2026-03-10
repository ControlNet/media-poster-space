# Issues

## 2026-03-01 — Baseline capture run issues
- `sg --pattern 'testId: $X' --lang typescript packages/core/src/wall/ui` did not invoke ast-grep in this environment (`sg` maps to another CLI). Used ast-grep tool fallback + grep for selector source evidence.
- `pnpm exec ast-grep ...` is unavailable (`Command "ast-grep" not found`).
- Web targeted e2e baseline run is unstable in current working tree:
  - `apps/web/e2e/onboarding-auth.spec.ts`: 5/8 failures (timeouts with detached/unstable wall controls)
  - `apps/web/e2e/gates/mandatory-v1-gates.spec.ts`: failure with Playwright artifact ENOENT during `context.close()` and timeout
- Desktop targeted tests passed in this run (`onboarding-auth` and mandatory gate), so instability appears isolated to web e2e surface for current state.

## 2026-03-01 — Task 2 execution issues
- No new blockers encountered while splitting diagnostics render reasons; targeted diagnostics tests and workspace typecheck passed on first run.

## 2026-03-01 — Task 5 execution issues
- Running `pnpm --filter @mps/core test -- test/runtime/*queue*test.ts` from repo root hit shell glob mismatch (`zsh: no matches found`); rerunning from `packages/core` resolved wildcard expansion and executed all queue runtime tests successfully.

## 2026-03-01 — Task 7 execution issues
- Initial Task 7 integration regressed desktop reconnect guide assertions in `apps/desktop/test/onboarding-auth.test.ts` (`reconnect-guide` became intermittently absent during backoff progression).
- Resolved by limiting queue refill scheduling to ingestion `ready` states (and stream-consume underflow), then re-running desktop targeted reconnect test to green.

## 2026-03-01 — Task 8 verification issues
- The required command `pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts --grep "completes preflight -> login -> library selection and enters poster wall"` currently executes the full file suite in this repo script shape, exposing additional pre-existing flaky wall interactions outside the single grep scenario.
- Current run still shows wall interaction instability (`wall-fullscreen-button`/`logout-button` unstable-detached and occasional duplicate `wall-ingestion-summary` nodes), so Task 8 is not yet fully validated green end-to-end.

## 2026-03-01 — Task 8 finalization issue note
- Continuity scenario evidence run still fails a strict duplicate `wall-ingestion-summary` locator assertion in current web e2e; required Task 8 verification commands for this handoff (`typecheck` + `diagnostics-crash-export.test.ts`) pass, but full continuity e2e remains flaky in this branch state.

## 2026-03-01 — Task 8 race-fix verification issue
- After adding the render race guard, duplicate summary-node failure shifted back to interaction instability (`diagnostics-open` unstable/detached) in the targeted continuity test; further stabilization is still needed for full Task 8 acceptance.

## 2026-03-01 — Task 8 focused stream-transition tweak
- Limiting `onStreamReadyTransition` to poster-grid patching only (no ingestion summary rewrites) did not clear the targeted e2e instability; `diagnostics-open` remains unstable/detached in the single continuity scenario.

## 2026-03-01 — Task 8 global render reentrancy guard attempt
- Added a global `render()` reentrancy guard (`isRendering` + `renderDeferred`) to prevent overlapping render passes, but targeted continuity e2e still times out at `diagnostics-open` due to element instability/detach.

## 2026-03-01 — Task 8 ingestion-fallback disable attempt
- Disabled ingestion-callback full-render fallback on `/wall` when root/grid are missing outside active wall render; callback now marks deferred/no-op instead of calling `render()`, but targeted continuity e2e still fails at unstable/detached `diagnostics-open` click.

## 2026-03-01 — Task 8 desktop-parity recovery attempt
- Aligned web `handleIngestionRenderRequest()` with desktop recovery branches (missing-root fallback render guard, error callout recovery, ready-state stream apply fallback when stream patch fails or tiles missing). Targeted continuity e2e still fails with unstable/detached `diagnostics-open`.

## 2026-03-01 — Task 9 implementation issues
- Initial desktop parity patch caused poster-less wall state in onboarding auth tests because stream patching could not populate tiles when the wall mounted with an empty-state grid.
- Reconnect/backoff test briefly regressed when error-state updates triggered repeated full remounts; resolved by rendering once when callouts are absent and patching reconnect/error text in place for subsequent updates.

## 2026-03-01 — Task 10 verification issues
- During no-remount capture, standard Playwright actionability click on `diagnostics-open` repeatedly failed (`element is not stable` / detached), matching previously observed Task 8 instability. Evidence was still captured by switching to in-page DOM click for the diagnostics toggle.
- `task-10-no-remount-proof.log` continuity output shows `allStable=false` with root/grid same-node checks false for all `11` samples while diagnostics remained open, so Task 10 acceptance is blocked on unresolved no-1s-remount behavior.

## 2026-03-01 — F2 code-quality review findings
- [HIGH] `packages/core/src/runtime/onboarding-ingestion.ts:554-563,571-573` — runtime identity key excludes token/session freshness fields, so `ensureRuntime` can skip recreation after re-auth on the same provider/server/user/library set and continue operating with stale auth context.
- [MEDIUM] `apps/web/src/onboarding/runtime.ts:436-445` — wall patch handler marks fallback/deferred flags when root/grid are missing outside active wall render, but does not trigger `render()`, so patch recovery can stall until an unrelated render event occurs.
- [MEDIUM] `apps/desktop/src/onboarding/runtime.ts:634-645,845-855,869-879,1044` — several fire-and-forget promises have no rejection handling (`passwordVault.read`, display/autostart persistence, `initializePlatformExtensions` call site), creating unhandled-rejection risk and weak diagnosability.
- [LOW] `apps/web/src/onboarding/runtime.ts:619-622` and `apps/desktop/src/onboarding/runtime.ts:732` — logout invalidation failures are intentionally swallowed (`catch {}` / `.catch(() => undefined)`), which hides operational failure signals during incident triage.
- [LOW] `apps/web/src/onboarding/runtime.ts:467` and `packages/core/src/runtime/onboarding-ingestion.ts:321` — diagnostics currently persist raw `error.message`; no direct token/password logging was found, but upstream message content could still leak sensitive fragments if provider errors are not scrubbed.

## 2026-03-01 — F3 real manual QA issues
- Manual QA evidence run (`.sisyphus/evidence/f3-manual-results-2026-03-01.json`) passed only `1/5` required checks: wall entry flow passed, while diagnostics/manual-refresh/poster-detail/logout interactions failed.
- Deterministic failure confirmed on selector `[data-testid="diagnostics-open"]`: `3/3` open/close cycles failed standard Playwright actionability click with `element is not stable`, and close attempts often left `[data-testid="wall-diagnostics-panel"]` visible.
- Additional control failures observed on `[data-testid="manual-refresh-button"]` and `[data-testid="logout-button"]` with the same `element is not stable` timeout signature during click actionability.
- Poster interaction remained unstable: `[data-testid="poster-item-0"]` click timed out with repeated `element is not stable` and one detach/retry event, so detail close path (`[data-testid="exit-hotspot"]`) could not be validated.
- Refreshed continuity artifact (`.sisyphus/evidence/task-10-no-remount-proof.mp4` + `.log` at `18:34`): continuity still reports `allStable=false`, with `rootSameNode=false` and `gridSameNode=false` for all `11` samples while diagnostics stayed open.

## 2026-03-01 — Task 10 rerun blocking issue
- Fresh continuity proof run (`.sisyphus/evidence/task-10-no-remount-proof.log` at `19:14`) still reports `allStable=false` with `rootSameNode=false` and `gridSameNode=false` on every sample (`0..10`) while diagnostics remained open (`diagnosticsOpen=true`).
- The rerun therefore still fails the no-1s-remount closure condition despite full gate wave success.

## 2026-03-01 — Task 10 final blocker fix issues
- PASS: No new execution blockers after applying the web runtime idle-hide diagnostics-open guard; continuity capture and full required gate wave completed successfully.
