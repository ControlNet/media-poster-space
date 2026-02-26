# Learnings — wall-frontend-redesign

## 2026-02-26 — wall contract verifier baseline

- A deterministic wall contract verifier can stay explicit by checking literal snippets across source, tests, docs, and package scripts instead of parsing ASTs.
- Selector contracts are safer when each selector is validated as both a producer contract (runtime emits selector) and a consumer contract (tests assert selector).
- Evidence contract drift is best caught by cross-checking fixed seed + metrics paths in gate suites, docs, and `scripts/verify-thresholds.mjs` wiring.

## 2026-02-26 — retry verification

- Retry completion remained stable: `node scripts/verify-wall-contracts.mjs` passed and `pnpm --filter @mps/web test -- renderer-runtime` passed without changes to runtime constants.

## 2026-02-26 — Afterglow Orbit token extension

- Additive token layering works best when semantic groups are split by purpose (orbital glow, telemetry accents, depth overlays, contrast hierarchy) and then projected into CSS vars without touching existing `--mps-*` contracts.
- Keeping new variables in both static `:root` defaults and runtime token factories prevents drift between immediate render fallback and app-initialized token state on Web/Desktop.

## 2026-02-26 — web wall modular surface extraction

- Runtime modularization can be done safely by extracting pure wall surface builders (route shell, diagnostics section, controls section, detail card, presentation sections) while keeping orchestration state and side-effect flows in `onboarding/runtime.ts`.
- Preserving selector contracts is easiest when each extracted module receives existing callback/state values and continues emitting identical `data-testid` literals verbatim.

## 2026-02-26 — desktop wall modularization learnings

- Extracting wall interaction behavior into a dedicated controller keeps Escape + idle-hide semantics deterministic while preserving existing wall selector behavior (`detail-card`, `wall-controls-container`, `manual-refresh-button`).
- Moving desktop platform responsibilities into focused adapters (password vault + wall platform preferences) reduces runtime coupling and keeps capability-matrix parity logic (`portable => autostart disabled`, default display fallback) explicit and testable.

## 2026-02-26 — shared wall model primitives

- Extracting selection, idle-hide, reveal, and dismiss transitions into `@mps/core` pure helpers keeps Web/Desktop interaction state deterministic without moving runtime side effects into core.
- A shared transition helper (`resolveWallTransitionMs`) that clamps to the 240-320ms window with a 280ms default preserves existing timing assertions while preventing accidental drift.
- Reusing shared placement + width primitives across Web/Desktop reduces duplicated math/style constants and keeps `detail-card` placement + width contracts stable.

## 2026-02-26 — Afterglow Orbit wall composition rewrite

- A full visual rewrite stayed behavior-safe by confining changes to wall surface builders (`route-shell`, `presentation-sections`, `detail-card`, `controls-section`, `diagnostics-section`) plus cosmetic style blocks in `onboarding/runtime.ts` for reconnect/fullscreen/error callouts.
- Preserving contract selectors as literal `testId` strings while changing only layout/depth/typography styling allowed a substantial composition shift (orbital overlays + split-column wall + grouped controls) without touching interaction wiring.
- Token-driven layering works best when orbital glow/depth variables are reused in gradients and borders instead of introducing new hard-coded palette values.

## 2026-02-26 — desktop Afterglow Orbit wall parity (T7)

- Desktop `/wall` visual parity can be achieved without behavior drift by confining changes to wall-surface styling/composition (route shell, poster grid, controls, diagnostics, detail card) and keeping all interaction callbacks/transitions untouched.
- Selector safety remained straightforward when literal `testId` strings were preserved in-place (`poster-wall-root`, `wall-poster-grid`, `poster-item-*`, `detail-card`, `wall-controls-container`, desktop platform selector hooks).
- Reusing Web Afterglow motifs (orbital halos, telemetry grid, split-column composition, mono telemetry labels) with desktop-specific control scope preserved visual parity while maintaining platform capability behavior.

## 2026-02-26 — wall scene Afterglow Orbit renderer rewrite (T8)

- A scene-level visual overhaul stayed contract-safe by limiting edits to canvas drawing/fallback styling in `apps/web/src/scene/wall-scene.ts` while keeping route parsing, renderer mode toggles, and OLED metric export wiring untouched.
- Determinism remained stable by preserving highlight radius guard math (`resolveBackLayerHighlightRadius` + `OLED_THRESHOLD_GUARDS`) and reusing existing motion/controller tick flow (`computeOledLayerMotion` → static-duration tracking → `oledController.tick`).
- Required selector literals remained fixed (`wall-scene`, `scene-layer-back`, `scene-layer-front`, `scene-fallback-css`, `scene-oled-metrics`), allowing visual language changes without test contract drift.

## 2026-02-26 — cross-platform choreography hardening (T9)

- Restrict wall keyboard choreography to Escape-only dismissal; non-Escape keys no longer reveal controls/reset idle timer, aligning with the V1 boundary that forbids expanded keyboard scope.
- Dismiss flows now gate on an active poster before applying `createWallDismissDetailTransition` and re-arming the idle-hide timer, preventing hidden→visible control toggles through Escape when no detail card is open.
- Poster selection and dismiss handlers now consistently honor transition `shouldRender` results before rendering, keeping Web/Desktop interaction render behavior aligned while preserving `resolveWallTransitionMs` timing contracts.

## 2026-02-26 — diagnostics/control Afterglow Orbit semantics (T10)

- Diagnostics and control restyling stayed behavior-safe by preserving existing telemetry/reconnect text generation and only re-grouping DOM into visual clusters (header rail, telemetry chips, action row, callout stack).
- Selector stability remained straightforward by keeping literal `data-testid` producers unchanged (`wall-diagnostics-*`, `diagnostics-export-crash-report`, `manual-refresh-button`, `reconnect-guide`, `wall-fullscreen-warning`, `wall-ingestion-error`) while changing only hierarchy/style wrappers.
- Web module updates and desktop inline runtime updates were kept visually aligned to maintain cross-platform Afterglow Orbit parity without touching sampling interval, reconnect backoff, or crash-export logic.

## 2026-02-26 — web unit contract hardening for modular wall architecture (T11)

- Route and renderer contracts are safer when tests assert both visibility mode toggles (`primary` and `fallback`) and strict query parsing edge cases (mode precedence + seed/profile validation).
- OLED safeguards are less regression-prone when unit coverage checks each trigger channel explicitly (`focus-static`, `highlight-static`, `highlight-area`) plus `profile-cycle` separation.
- Token contract drift is easier to catch by asserting Afterglow semantic variable projection (`--mps-color-orbit-*`, telemetry, depth overlays) while preserving legacy cinematic keys and dynamic accent CSS variable names.
- Diagnostics/crash-export invariants benefit from explicit normalization tests (negative reconnect metrics + invalid memory input) and nested context redaction checks.
- Contract verifier literals must follow module boundaries after architecture extraction; selector producers and transition wiring now live under `apps/web/src/wall/*`, while timing constants are anchored in `packages/core/src/wall/constants.ts`.

## 2026-02-26 — T11 retry verification pass (post-timeout)

- The AST query `test($NAME, $$$ARGS)` returns no matches in `apps/web/test` because this suite uses Vitest `it(...)`; contract coverage still remains explicit through targeted `it(...)` cases.
- Re-running forced-failure verification with `MPS_CONTRACT_FORCE_FAIL=route` should be followed by an explicit non-zero assertion in shell (`rc=$?; [ "$rc" -ne 0 ]`) to prove failure-path behavior did execute.

## 2026-02-26 — T13 E2E/integration refresh

- Redesign-stable readiness is clearer when tests explicitly gate on `wall-ingestion-summary` counts before detail-card or evidence-capture steps (`Ingested posters: 1/2`) instead of relying on implicit rendering timing.
- Web detail/controls checks are less flaky when targeting a visible `wall-controls-container` locator and polling computed transition duration, which avoids stale hidden containers during rerender-heavy wall interactions.
- Desktop credential assertions should align with platform-bridge-backed storage in integration tests; when a bridge harness is supplied, verify credentials via `bridge.readCredential(...)` and expect `DESKTOP_PASSWORD_STORE_STORAGE_KEY` to remain unset.

## 2026-02-26 — desktop wall test hardening for modular architecture (T12)

- Desktop unit coverage is more regression-resistant when module contracts are tested directly in addition to runtime integration: `createWallInteractionController` (Escape-only keyboard scope + idle-hide scheduling), `initializeDesktopWallPlatform` (portable autostart-off + display fallback), and platform-backed password vault warning/fallback behavior.
- Linux secret-service degraded mode should remain explicit as a platform-bridge warning path: assert warning logger emission and credential persistence via bridge-backed storage, while confirming browser `localStorage` vault is not silently used for that path.
- Existing high-value runtime contracts remain important and should stay strict (reconnect backoff ladder 2s→60s, logout artifact cleanup within 1s, idle-hide/detail interactions at 8s) rather than being relaxed to satisfy redesigned surface changes.

## 2026-02-26 — T13 regression follow-up stabilization

- In reconnect-backoff integration coverage, asserting reconnect text immediately after advancing fake timers can race with rerender; wrapping reconnect-guide text checks in `vi.waitFor` keeps the same assertion intent while avoiding transient missing-node failures.
- In logout cleanup coverage, remembered server/username values can lag one render tick after artifact cleanup; waiting for input values with `vi.waitFor` preserves the remembered-state contract without relaxing timing limits.

## 2026-02-26 — T14 gate threshold/determinism recovery

- Web `logout-cleanup-ms` is more stable when timed against session-artifact removal (`mps.auth.session`, `mps.wall.handoff`) instead of including onboarding input repaint latency.
- Keep remembered-field assertions (`server-url-input`, `username-input`) after the threshold measurement so contract coverage remains strict without inflating cleanup timing from UI rerender jitter.
- Forced-failure verification can be masked by Turbo cache replay; use an uncached run (`--force`) when validating `MPS_GATE_FORCE_FAIL` non-zero behavior.

## 2026-02-26 — T14 final rerun confirmation

- With `MPS_GATE_FORCE_FAIL` declared in Turbo task env for `e2e`, `e2e:web`, and `e2e:desktop`, forced-fail runs now execute against the correct env hash instead of replaying a prior success cache.
- Happy-path gate rerun stayed deterministic and threshold-compliant on both platforms, with web logout cleanup measured under 1s while preserving remembered-field assertions.

## 2026-02-26 — T15 docs and CI parity hardening

- Docs parity inference must follow current module ownership, not legacy runtime-only assumptions. `wall-fullscreen-button` moved to `apps/web/src/wall/controls-section.ts`, so verifier signals now need to include that file.
- CI stability notes are clearer when `MPS_GATE_FORCE_FAIL` compatibility is documented in both gate docs and workflow settings, matching Turbo env hashing behavior.
- Release artifact verifier failure-path evidence can be validated safely by temporarily hiding `release/` and restoring it in the same command chain.

## 2026-02-26 — F2 gate command alignment

- Updated the CI gate job to run `pnpm -w turbo run e2e:web e2e:desktop` instead of the previous web-only `pnpm --filter @mps/web e2e`, matching docs/quality-gates.md and ensuring the V1 gate hash path is exercised for the F2 blocker.

## 2026-02-26 — wall selector consumer literal alignment

- Desktop onboarding auth tests now reference `document.querySelector('[data-testid="reconnect-guide"]')`, so the selector contract checks →consumer literal mirrors the stable data-testid lookup instead of the legacy helper.
- Web Playwright controls assert a visible `wall-controls-container` locator, so the selector contract now targets the `[data-testid="wall-controls-container"]:visible` snippet that the e2e spec actually uses.
- Verified `node scripts/verify-wall-contracts.mjs` in both happy-path and `MPS_CONTRACT_FORCE_FAIL=selector` failure-path modes to lock in the new literals.

## 2026-02-26 — F3 time-bounded manual QA pass (web)

- Manual browser QA stayed stable when the flow used deterministic Jellyfin route stubs that match existing e2e semantics (preflight + auth + libraries + media) before stepping through `/wall` interactions.
- Required user-facing checks passed in one bounded run with concrete artifacts: `/wall?mode=test` selector semantics, onboarding-to-wall selector readiness, ESC/hotspot close, and ~8s idle-hide restore-on-pointer-move behavior.
- Console verification for the bounded run reported `errorCount: 0`; only known non-blocking font decode warnings appeared (`/fonts/soehne-*.woff2`).

## 2026-02-26 — F3 scenario 4 correction

- Re-ran only the idle-hide scenario and captured a replacement evidence frame at the post-idle state (`f3-manual-04-idle-hide-corrected-2026-02-26.png`).
- Corrected scenario 4 result fields now explicitly reflect observed booleans after ~8s idle: detail hidden = true, controls hidden = true, controls visible again after pointer move = true.
