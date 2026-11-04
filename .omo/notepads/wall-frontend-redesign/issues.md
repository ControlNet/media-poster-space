# Issues — wall-frontend-redesign

## 2026-02-26 — encountered and resolved

- Initial verifier run reported all selector checks as invalid because nested selector checks in the manifest intentionally omit per-check IDs.
- Resolution: verifier now treats `id` as optional for nested checks and derives a stable fallback label from `groupName:file`.

## 2026-02-26 — retry status

- No new blockers surfaced during retry; forced-fail branch (`MPS_CONTRACT_FORCE_FAIL=selector`) continued to fail non-zero with a clear group-tagged message.

## 2026-02-26 — Afterglow Orbit token layer status

- No blockers encountered. Existing design-token and contrast checks remained green after additive token expansion.

## 2026-02-26 — web wall modular extraction status

- No new blockers encountered during modular extraction.
- Risk check performed: required wall selectors remained unchanged and task-scoped runtime + onboarding wall flow tests passed after extraction.

## 2026-02-26 — desktop wall modularization status

- No blocking issues encountered during desktop wall/runtime extraction.
- Observed expected warning logs in `onboarding-auth` tests for non-Tauri execution (`Secure desktop credential storage unavailable. Using local encrypted fallback.`); behavior is unchanged and tests remain green.

## 2026-02-26 — shared wall model extraction status

- Encountered one strict-type issue during verification: `normalizeWallActivePosterIndex` needed an explicit numeric guard before range checks (`activePosterIndex` possibly null). Fixed by checking `typeof activePosterIndex === "number"` first.
- No blockers after fix; required Web/Desktop turbo tests and targeted Web Playwright idle-hide/detail-card spec passed.

## 2026-02-26 — Afterglow Orbit wall composition status

- No blockers encountered during visual rewrite implementation; selector contracts remained stable while restructuring wall layout and surfaces.
- Risk to monitor: broad inline-style expansion increases visual complexity; mitigated by keeping behavioral callbacks, transition durations, and control wiring unchanged.

## 2026-02-26 — desktop wall parity rewrite status (T7)

- No blockers encountered while rebuilding desktop `/wall` visuals; required selectors and interaction callbacks remained unchanged.
- Verification note: targeted and full `@mps/desktop` onboarding-auth suites plus desktop mandatory V1 gates passed after rewrite.
- Risk to monitor: desktop wall remains inline-style heavy; future cleanup could extract visual builders further while preserving current selector literals and interaction contracts.

## 2026-02-26 — wall scene renderer rewrite status (T8)

- No blockers encountered during the Afterglow Orbit scene rewrite.
- Risk monitored: expanded canvas layering complexity; mitigated by keeping selector producers, renderer mode visibility semantics, and OLED metrics dataset shape unchanged.
- Verification note: required `renderer-runtime`, `oled-risk-trigger`, and `e2e/wall-smoke.spec.ts` runs passed after the visual update.

## 2026-02-26 — interaction choreography status (T9)

- No new blockers encountered while hardening interaction choreography across Web/Desktop runtimes.
- Expected non-Tauri warning remains in desktop onboarding suite (`Secure desktop credential storage unavailable. Using local encrypted fallback.`); behavior unchanged and tests remain green.

## 2026-02-26 — diagnostics/control surface status (T10)

- No blockers encountered while reskinning diagnostics, reconnect, fullscreen warning, ingestion error, and control clustering surfaces.
- Expected desktop warning remains non-blocking during tests (`Secure desktop credential storage unavailable. Using local encrypted fallback.`); behavior unchanged.
- Verification note: targeted web/desktop diagnostics crash-export suites, focused Playwright reconnect/fullscreen scenarios, and both package build commands passed after the presentation updates.

## 2026-02-26 — web unit hardening status (T11)

- Encountered contract-verifier drift after modular wall extraction: `node scripts/verify-wall-contracts.mjs` failed on stale Web selector/timing literals still pointing at `apps/web/src/onboarding/runtime.ts`.
- Resolution: updated `scripts/contracts/wall-contracts.json` to target current Web wall module producer files (`apps/web/src/wall/*`) and canonical timing constants in `packages/core/src/wall/constants.ts`, plus updated desktop idle-hide wiring literal.
- Post-fix status: required happy-path verifier and forced route-failure verifier behavior both execute as expected.

## 2026-02-26 — T11 retry execution note

- No new blockers in retry run. Required suite and verifier commands completed again; forced route-fail path emitted explicit `[wall-contracts:route]` failure and was validated as non-zero.

## 2026-02-26 — T13 desktop integration drift encountered and resolved

- Encountered desktop onboarding suite breakage after refresh pass: one test referenced `platformHarness` without creating it, and linux fallback coverage still asserted legacy localStorage secret behavior.
- Resolution: updated `onboarding-auth` integration tests to consistently provide a platform harness for bridge-backed credential assertions, reuse the same bridge on restart, and assert fallback-warning path via `bridge.readCredential(...)` with no `DESKTOP_PASSWORD_STORE_STORAGE_KEY` residue.

## 2026-02-26 — desktop wall test hardening status (T12)

- Encountered one assertion mismatch while hardening the linux secret-service warning test: the weak-fallback warning path writes through the platform bridge and does not populate browser `mps.desktop.password-vault` localStorage.
- Resolution: moved the assertion to verify bridge credential persistence + explicit warning logger emission, and asserted `localStorage` vault remains null for that platform path.
- No remaining blockers after fix; full desktop suite and required focused onboarding-auth command both pass.

## 2026-02-26 — T13 regression follow-up issues

- Intermittent reconnect regression reproduced by orchestrator (`Missing element: reconnect-guide`) was caused by direct DOM access after fake-timer advancement; node creation lagged behind the immediate assertion in some runs.
- Logout remembered-value regression (`server-url-input` empty) was timing-sensitive after cleanup assertions; fixed by waiting for remembered inputs to settle on the onboarding render before final value assertions.

## 2026-02-26 — T14 gate threshold/failure-path issues

- Reproduced mandatory web gate regression: `[GATE:logout-cleanup<=1s] threshold exceeded: 1272ms > 1000ms.` in `pnpm -w turbo run e2e:web e2e:desktop`.
- Root cause: `logout-cleanup-ms` timing in web gate test included remembered-input value settling, which can lag behind the actual session-artifact cleanup.
- Resolution: updated web gate spec to time logout cleanup at artifact-removal completion (`mps.auth.session` + `mps.wall.handoff` null), while keeping remembered-input assertions as separate checks.
- Failure-path gotcha: plain `MPS_GATE_FORCE_FAIL=logout-cleanup pnpm -w turbo run e2e:web e2e:desktop` replayed cached success; reran uncached (`--force`) to confirm explicit non-zero failure reason.

## 2026-02-26 — T14 rerun issue follow-up

- Confirmed cache-hash fix worked: `MPS_GATE_FORCE_FAIL=logout-cleanup pnpm -w turbo run e2e:web e2e:desktop` now exits non-zero without needing `--force`.
- Explicit failure reason observed in rerun: `[GATE:logout-cleanup<=1s] forced failure for regression evidence.`

## 2026-02-26 — T15 docs parity drift encountered and resolved

- `pnpm -w verify:docs-parity` and strict mode initially failed with `Fullscreen control` mismatch because verifier logic only scanned `apps/web/src/onboarding/runtime.ts` while the fullscreen control moved into `apps/web/src/wall/controls-section.ts` during modularization.
- Resolution: updated `scripts/verify-docs-parity.mjs` to read `apps/web/src/wall/controls-section.ts` and include that signal in fullscreen capability inference.
- Failure-path verification note: `pnpm -w verify:release-artifacts` passes in this workspace when release artifacts are present, so non-zero behavior was validated by temporarily moving `release/` out of path, running verifier, then restoring it.

## 2026-02-26 — selector consumer literal drift resolved

- `node scripts/verify-wall-contracts.mjs` reported the `selector.reconnect-guide` and `selector.wall-controls-container` consumers as stale because the tests now query `[data-testid="..."]` values instead of the legacy helpers.
- Updated the contract literals to reference `document.querySelector('[data-testid="reconnect-guide"]')` and `page.locator('[data-testid="wall-controls-container"]:visible')`, keeping the manifest aligned with the current test style.
- Verification: happy-path verifier now passes and `MPS_CONTRACT_FORCE_FAIL=selector node scripts/verify-wall-contracts.mjs` still exits non-zero, preserving failure-path evidence.

## 2026-02-26 — F2 gate blocker

- Resolved the F2 blocker by switching the CI gate job from the weaker `pnpm --filter @mps/web e2e` to `pnpm -w turbo run e2e:web e2e:desktop`, satisfying the docs/quality-gates command contract and exercising both Web and Desktop V1 paths.

## 2026-02-26 — F3 time-bounded manual QA execution notes

- No blocking runtime/browser issues found in the bounded manual run for the requested four scenarios.
- Observed only expected non-blocking warnings for unresolved Söhne fonts (`Failed to decode downloaded font`, `OTS parsing error`) during page load.
- No additional blockers opened from this pass.

## 2026-02-26 — F3 scenario 4 evidence correction

- Corrected a scenario-4 evidence inconsistency by re-running only the idle-hide check and replacing the screenshot with a post-timeout hidden-state capture.
- No new blocker introduced; corrected result remains pass with observed hidden-state booleans recorded in `f3-manual-results-2026-02-26.json`.
