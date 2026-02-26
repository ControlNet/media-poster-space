# Poster Wall Frontend Redesign — Afterglow Orbit (Web + Desktop)

## TL;DR
> **Summary**: Redesign the poster wall frontend into a modern, high-design “Afterglow Orbit” experience across Web and Desktop while preserving all V1 functional/test contracts (OLED safety, routing semantics, timing gates, deterministic evidence).
> **Deliverables**:
> - Unified visual language for wall surfaces on Web + Desktop
> - Re-architected wall UI structure (replace current monolithic inline-style runtime patterns)
> - Preserved and hardened route/selector/metric determinism contracts
> - Updated automated verification (unit + e2e + gate evidence) with zero manual checks
> **Effort**: XL
> **Parallel**: YES - 3 waves
> **Critical Path**: T1 → T2/T3/T4 → T6/T7/T8/T9/T10 → T11/T12/T13 → T14 → T15

## Context
### Original Request
当前海报墙页面“很丑”，要求重做海报墙前端设计：更美观、漂亮、现代、设计感强；先阅读设计文档与既有计划，找到 `/wall` 代码实现，并基于前端设计能力提出可落地的重做方案。

### Interview Summary
- Scope locked: **Web + Desktop 同步重做**（海报墙体验统一升级）。
- Visual direction locked: **Afterglow Orbit**（未来感、轨道感、电影氛围增强）。
- Delivery strategy locked: **一次性重写 + tests-after**。
- Non-negotiable contracts locked: OLED 阈值、`/wall` 路由语义、8s idle hide、detail card 宽度 26-30%、过渡 240-320ms、deterministic gate evidence。
- Default applied: parity target is **behavior + token parity** across Web/Desktop (not pixel-identical parity), with platform exceptions preserved.

### Metis Review (gaps addressed)
- Added contract-freeze guardrails to prevent regressions in one-shot rewrite.
- Added deterministic controls (seed + ready-state + metrics export continuity) to preserve gate stability.
- Added explicit anti-scope-creep boundaries (no provider/auth protocol refactor, no threshold relaxation).
- Applied defaults (non-blocking): keep existing `data-testid` intact; only additive selectors/data attributes allowed.

## Work Objectives
### Core Objective
Deliver a full visual/interaction redesign of poster-wall frontend across Web and Desktop under Afterglow Orbit direction while retaining all V1 platform behavior and quality-gate contracts.

### Deliverables
1. Rebuilt wall presentation structure for Web/Desktop with modern composition and stronger visual hierarchy.
2. Afterglow Orbit tokenized visual system layered on top of existing cinematic dark contract.
3. Preserved deterministic route/test contracts for scene/runtime and gate artifacts.
4. Updated automated test suites and mandatory gate evidence demonstrating zero regression.

### Definition of Done (verifiable conditions with commands)
- `pnpm -w turbo run lint typecheck test build` exits 0.
- `pnpm -w turbo run e2e:web e2e:desktop` exits 0.
- `node scripts/verify-thresholds.mjs --platform web --metrics .sisyphus/evidence/task-16-web-gates.metrics.json` exits 0.
- `node scripts/verify-thresholds.mjs --platform desktop --metrics .sisyphus/evidence/task-16-desktop-gates.metrics.json` exits 0.
- Required selectors and wall contracts remain valid in Web and Desktop test suites.

### Must Have
- Afterglow Orbit visual direction applied to Web + Desktop wall surfaces.
- Both wall surfaces are redesigned consistently: operational `/wall` wall and deterministic scene surface (`/wall?mode=test`, `/wall?seed&profile`).
- Existing `data-testid` contract retained (additive extension only).
- Existing route semantics retained:
  - `/wall?mode=test`
  - `/wall?seed=<seed>&profile=<balanced|showcase>`
  - `/wall` operational wall path
- OLED safety contract retained:
  - focus static <= 12s
  - highlight static <= 15s
  - highlight area <= 12%
- Interaction contract retained:
  - idle hide = 8s
  - detail card width in 26-30%
  - transition window 240-320ms
  - ESC + exit hotspot must work
- Gate evidence and deterministic naming/seed behavior retained.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No provider protocol refactor (Jellyfin API/auth contract out of scope).
- No threshold relaxation or verifier bypass.
- No renaming/removal of required existing `data-testid` selectors.
- No gameplay/playback scope expansion.
- No generic “AI slop” styling (template-like gradients/layout clichés disconnected from project context).
- No hidden acceptance criteria requiring manual interpretation.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: **tests-after** with Vitest + Playwright + threshold verifier.
- QA policy: Every task includes executable happy + failure scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave.

Wave 1: Contract freeze + redesign foundation (T1-T5)
Wave 2: One-shot implementation rewrite (T6-T10)
Wave 3: Hardening, gates, release confidence (T11-T15)

### Dependency Matrix (full, all tasks)
| Task | Depends On |
|---|---|
| T1 | - |
| T2 | T1 |
| T3 | T1, T2 |
| T4 | T1, T2 |
| T5 | T1, T3, T4 |
| T6 | T2, T3, T5 |
| T7 | T2, T4, T5 |
| T8 | T2, T5 |
| T9 | T6, T7, T8 |
| T10 | T6, T7, T9 |
| T11 | T6, T8, T9 |
| T12 | T7, T9, T10 |
| T13 | T6, T7, T8, T9, T10, T11 |
| T14 | T12, T13 |
| T15 | T14 |

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 5 tasks → deep / unspecified-high / visual-engineering
- Wave 2 → 5 tasks → visual-engineering / deep / unspecified-high
- Wave 3 → 5 tasks → deep / unspecified-high / writing

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

<!-- Task details are appended below in batches. -->

- [x] 1. Freeze wall behavior contracts and create automated contract verifier

  **What to do**: Build a machine-readable contract manifest (route semantics, required selectors, timing constraints, OLED thresholds, evidence outputs) and add `scripts/verify-wall-contracts.mjs` to assert the redesign never breaks critical `/wall` contracts before deeper implementation.
  **Must NOT do**: Do not alter runtime behavior, thresholds, or route outputs in this task.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: contract extraction and verifier design affects all downstream tasks.
  - Skills: [] — no extra skill required.
  - Omitted: [`frontend-design`] — no visual implementation yet.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [T2,T3,T4,T5] | Blocked By: [-]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/src/scene/route.ts` — `/wall` query contract source of truth.
  - Pattern: `apps/web/src/scene/wall-scene.ts` — scene selectors + OLED dataset behavior.
  - Pattern: `apps/web/src/onboarding/runtime.ts` — operational wall interactions/timers/selectors.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts` — desktop wall behavior + parity constraints.
  - Test: `apps/web/e2e/wall-smoke.spec.ts` — scene selector expectations.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts` — detail-card width, idle hide, exits, reconnect.
  - Test: `apps/desktop/test/onboarding-auth.test.ts` — desktop wall interaction contracts.
  - Test: `apps/web/e2e/gates/mandatory-v1-gates.spec.ts` — deterministic gate behavior.
  - External: `docs/poster-wall-design-principles.md` — non-optional design/interaction/OLED boundaries.

  **Acceptance Criteria** (agent-executable only):
  - [x] `node scripts/verify-wall-contracts.mjs` exits 0 and validates route/selector/timing/OLED contract definitions.
  - [x] Contract manifest includes both Web and Desktop required selector namespaces.
  - [x] `pnpm --filter @mps/web test -- renderer-runtime` exits 0 unchanged.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Contract verifier happy path
    Tool: Bash
    Steps: Run `node scripts/verify-wall-contracts.mjs && pnpm --filter @mps/web test -- renderer-runtime`
    Expected: Contract verification passes and route semantics tests stay green
    Evidence: .sisyphus/evidence/task-1-contract-freeze.log

  Scenario: Contract violation failure path
    Tool: Bash
    Steps: Run `MPS_CONTRACT_FORCE_FAIL=selector node scripts/verify-wall-contracts.mjs`
    Expected: Command exits non-zero with explicit missing-selector failure message
    Evidence: .sisyphus/evidence/task-1-contract-freeze-error.log
  ```

  **Commit**: YES | Message: `test(contract): add wall behavior contract verifier` | Files: [`scripts/verify-wall-contracts.mjs`,`scripts/contracts/wall-contracts.json`]

- [x] 2. Implement Afterglow Orbit token layer for Web + Desktop

  **What to do**: Extend the existing cinematic token system with Afterglow Orbit variables (orbital glow, telemetry accents, depth overlays, elevated contrast hierarchy) and wire these variables into both Web and Desktop entry styles without breaking current token names.
  **Must NOT do**: Do not remove or rename existing `--mps-*` variables consumed by current runtime/tests.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: this is design-system-level visual foundation work.
  - Skills: [`frontend-design`] — needed to avoid generic visual output and ensure direction fidelity.
  - Omitted: [`playwright`] — no browser automation needed for implementation.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [T6,T7,T8] | Blocked By: [T1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `packages/core/src/tokens/design-system.ts` — current palette/spacing/radius/elevation baseline.
  - Pattern: `apps/web/src/styles/design-tokens.ts` — CSS variable mapping layer.
  - Pattern: `apps/web/tailwind.config.ts` — theme extension and variable bindings.
  - Pattern: `apps/web/src/styles/global.css` — root variable defaults + font fallback handling.
  - Pattern: `apps/desktop/src/main.ts` — desktop token application entry.
  - Test: `apps/web/test/design-tokens.test.ts` — existing token behavior and fallback expectations.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm --filter @mps/web test -- design-tokens` exits 0.
  - [x] Web and Desktop boot paths compile with extended Afterglow token variables.
  - [x] Existing fallback and contrast constraints remain valid (`contrastRatio >= 4.5` tests pass).

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Token system happy path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/web test -- design-tokens && pnpm -w turbo run typecheck --filter=@mps/web --filter=@mps/desktop`
    Expected: Token tests and cross-app typechecks pass with Afterglow additions
    Evidence: .sisyphus/evidence/task-2-afterglow-tokens.log

  Scenario: Accent fallback failure path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/web test -- design-tokens -- -t "falls back to cinematic default accent when media accent is malformed"`
    Expected: Fallback test remains green; any regression fails this target
    Evidence: .sisyphus/evidence/task-2-afterglow-tokens-error.log
  ```

  **Commit**: YES | Message: `feat(ui): add afterglow orbit token extension` | Files: [`packages/core/src/tokens/design-system.ts`,`apps/web/src/styles/design-tokens.ts`,`apps/web/tailwind.config.ts`,`apps/desktop/src/main.ts`,`apps/web/src/styles/global.css`]

- [x] 3. Re-architect Web wall runtime into modular wall surface layers

  **What to do**: Replace the monolithic Web wall runtime structure with modular layers (route shell, wall state/model, presentation sections, controls, diagnostics, detail card) while preserving all existing `data-testid` outputs and `/wall` operational behavior.
  **Must NOT do**: Do not break existing selector names used by `apps/web/e2e/*.spec.ts`.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: large refactor under strict behavior compatibility constraints.
  - Skills: [`frontend-ui-ux`] — retain interaction quality while restructuring.
  - Omitted: [`frontend-design`] — this task is architectural structure, not final visual polish.

  **Parallelization**: Can Parallel: PARTIAL | Wave 1 | Blocks: [T5,T6,T9,T10] | Blocked By: [T1,T2]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/src/main.ts` — runtime entry and route dispatch behavior.
  - Pattern: `apps/web/src/onboarding/runtime.ts` — current full wall operational logic.
  - Pattern: `apps/web/src/scene/route.ts` — route predicate contract to preserve.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts` — selector and behavior invariants.
  - Test: `apps/web/e2e/gates/mandatory-v1-gates.spec.ts` — gate-critical flow assumptions.
  - Test: `apps/web/test/renderer-runtime.test.ts` — route/render mode assumptions.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm --filter @mps/web test -- renderer-runtime` exits 0.
  - [x] `pnpm --filter @mps/web exec playwright test --config=playwright.config.ts e2e/onboarding-auth.spec.ts -g "completes preflight -> login -> library selection and enters poster wall"` exits 0.
  - [x] Existing required wall selectors remain queryable without renaming.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Modularized runtime happy path
    Tool: Playwright
    Steps: Run onboarding flow test targeting `poster-wall-root`, `wall-poster-grid`, `poster-item-0`, `detail-card`
    Expected: Flow reaches wall; selectors resolve and interactions remain functional
    Evidence: .sisyphus/evidence/task-3-web-runtime-refactor.log

  Scenario: Route semantics regression failure path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/web test -- renderer-runtime -- -t "handles /wall?mode=test query routing deterministically"`
    Expected: Test fails immediately if route semantics were altered
    Evidence: .sisyphus/evidence/task-3-web-runtime-refactor-error.log
  ```

  **Commit**: YES | Message: `refactor(web): modularize wall runtime while preserving selector contract` | Files: [`apps/web/src/main.ts`,`apps/web/src/onboarding/runtime.ts`,`apps/web/src/wall/*`]

- [x] 4. Re-architect Desktop wall runtime into modular layers with platform adapters

  **What to do**: Mirror Web modularization on Desktop runtime by extracting wall surface modules and isolating platform-specific responsibilities (display selection, autostart, password persistence) behind adapter boundaries.
  **Must NOT do**: Do not regress desktop-specific capabilities documented in capability matrix.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: desktop runtime has complex platform state and persistence interactions.
  - Skills: [`frontend-ui-ux`] — preserve parity and interaction quality under restructuring.
  - Omitted: [`frontend-design`] — structure-first task, visual polish comes later.

  **Parallelization**: Can Parallel: PARTIAL | Wave 1 | Blocks: [T5,T7,T9,T10] | Blocked By: [T1,T2]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/desktop/src/main.ts` — desktop runtime bootstrap and token application.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts` — current monolithic desktop wall runtime.
  - Pattern: `apps/desktop/src/features/platform/tauri-bridge.ts` — platform capability bridge.
  - Test: `apps/desktop/test/onboarding-auth.test.ts` — desktop behavior contract.
  - Test: `docs/capability-matrix.md` — desktop/web exception boundaries.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm --filter @mps/desktop test -- onboarding-auth` exits 0.
  - [x] Desktop platform features (remember-password, display selection, autostart portable-mode behavior) remain covered by passing tests.
  - [x] Wall selectors expected by desktop tests remain available.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Desktop modular runtime happy path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test -- onboarding-auth -- -t "completes 3-step onboarding and persists encrypted remember-password data"`
    Expected: Onboarding-to-wall and desktop credential flow remain functional
    Evidence: .sisyphus/evidence/task-4-desktop-runtime-refactor.log

  Scenario: Desktop capability regression failure path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test -- onboarding-auth -- -t "disables autostart controls in portable package mode"`
    Expected: Test fails if platform exception contract is broken
    Evidence: .sisyphus/evidence/task-4-desktop-runtime-refactor-error.log
  ```

  **Commit**: YES | Message: `refactor(desktop): modularize wall runtime with platform adapters` | Files: [`apps/desktop/src/onboarding/runtime.ts`,`apps/desktop/src/wall/*`,`apps/desktop/src/features/platform/*`]

- [x] 5. Introduce shared wall model primitives for deterministic interaction state

  **What to do**: Add cross-platform wall model utilities in `packages/core` for deterministic poster selection state, detail-card placement computation, idle-hide timer state transitions, and transition-window guards so Web/Desktop share logic instead of diverging.
  **Must NOT do**: Do not move provider/network/auth responsibilities into the new wall model module.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: shared domain model impacts both platforms and test determinism.
  - Skills: [] — core logic task.
  - Omitted: [`frontend-design`] — non-visual logic extraction.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [T6,T7,T8,T9,T10,T11,T12] | Blocked By: [T1,T3,T4]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/src/onboarding/runtime.ts` — current placement/idle/timing logic (`resolveDetailCardPlacement`, idle-hide logic).
  - Pattern: `apps/desktop/src/onboarding/runtime.ts` — desktop mirror behavior.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts` — width, transition, idle-hide invariants.
  - Test: `apps/desktop/test/onboarding-auth.test.ts` — same invariants in desktop test harness.
  - API/Type: `packages/core/src/types/*` — shared type layer for cross-platform contracts.

  **Acceptance Criteria** (agent-executable only):
  - [x] Shared wall model module compiles and is consumed by both Web and Desktop runtimes.
  - [x] Deterministic placement and idle-hide logic pass unit tests in Web/Desktop suites.
  - [x] 240-320ms transition guard and 8s idle-hide behavior remain enforced via tests.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Shared model happy path
    Tool: Bash
    Steps: Run `pnpm -w turbo run test --filter=@mps/web --filter=@mps/desktop`
    Expected: Web/Desktop tests pass using shared wall model primitives
    Evidence: .sisyphus/evidence/task-5-shared-wall-model.log

  Scenario: Idle-hide contract failure path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/web exec playwright test --config=playwright.config.ts e2e/onboarding-auth.spec.ts -g "poster tiles open detail card with idle hide and exit controls"`
    Expected: Test fails on any idle-hide/timing regression
    Evidence: .sisyphus/evidence/task-5-shared-wall-model-error.log
  ```

  **Commit**: YES | Message: `feat(core): add shared deterministic wall interaction model` | Files: [`packages/core/src/wall/*`,`apps/web/src/wall/*`,`apps/desktop/src/wall/*`]

- [x] 6. Rewrite Web operational wall UI into Afterglow Orbit composition

  **What to do**: Fully redesign Web `/wall` operational surface (grid composition, orbital overlays, hierarchy, controls grouping, card surfaces, typography rhythm, depth system) using Afterglow Orbit while preserving existing behavior/selectors and gate-driven flows.
  **Must NOT do**: Do not break existing reconnect, logout, diagnostics, manual refresh, or onboarding handoff behaviors.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: primary high-design UI rewrite.
  - Skills: [`frontend-design`,`frontend-ui-ux`] — required for non-generic design execution with UX fidelity.
  - Omitted: [`secret-guard`] — no credential-surface architecture changes in this task.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [T9,T10,T11,T12,T13] | Blocked By: [T2,T3,T5]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/src/onboarding/runtime.ts` — current wall DOM structure/flows.
  - Pattern: `apps/web/src/styles/design-tokens.ts` — token-driven style source.
  - Pattern: `apps/web/src/styles/global.css` — base theme and typography behavior.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts` — operational wall behavior assertions.
  - Test: `docs/poster-wall-design-principles.md` — interaction and safety boundaries.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm --filter @mps/web exec playwright test --config=playwright.config.ts e2e/onboarding-auth.spec.ts -g "completes preflight -> login -> library selection and enters poster wall"` exits 0.
  - [x] Existing required selectors remain stable (`poster-wall-root`, `wall-poster-grid`, `poster-item-*`, `detail-card`, `wall-controls-container`, diagnostics/reconnect IDs).
  - [x] Visual hierarchy and spacing are token-driven (no uncontrolled hardcoded palette drift).

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Web wall redesign happy path
    Tool: Playwright
    Steps: Execute onboarding-to-wall flow and inspect `poster-wall-root`, `wall-poster-grid`, `poster-item-0`, `wall-controls-container`
    Expected: Redesigned UI renders correctly; core wall interactions remain passable
    Evidence: .sisyphus/evidence/task-6-web-afterglow.mp4

  Scenario: Auth failure safety path
    Tool: Playwright
    Steps: Run `e2e/onboarding-auth.spec.ts` test "shows explicit auth error and keeps session token cleared on invalid credentials"
    Expected: Error banner appears and no wall mount occurs with invalid credentials
    Evidence: .sisyphus/evidence/task-6-web-afterglow-error.png
  ```

  **Commit**: YES | Message: `feat(web): rebuild wall ui with afterglow orbit direction` | Files: [`apps/web/src/onboarding/runtime.ts`,`apps/web/src/wall/*`,`apps/web/src/styles/*`]

- [x] 7. Rewrite Desktop operational wall UI for Web/Desktop visual parity

  **What to do**: Apply the same Afterglow Orbit redesign to Desktop wall surface, preserving desktop-only platform controls and ensuring behavior/token parity with Web while allowing platform-specific layout nuances.
  **Must NOT do**: Do not remove desktop platform affordances (display picker, autostart controls, remember-password flows).

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: desktop visual rebuild with strict parity constraints.
  - Skills: [`frontend-design`,`frontend-ui-ux`] — maintain strong design quality and usability.
  - Omitted: [`playwright`] — desktop tests are Vitest+DOM harness in this repo.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [T9,T10,T12,T13] | Blocked By: [T2,T4,T5]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/desktop/src/onboarding/runtime.ts` — desktop operational wall and platform controls.
  - Pattern: `apps/desktop/src/main.ts` — desktop token root behavior.
  - Pattern: `docs/capability-matrix.md` — desktop/web exception boundaries.
  - Test: `apps/desktop/test/onboarding-auth.test.ts` — desktop parity and capability assertions.
  - Test: `apps/desktop/test/gates/mandatory-v1-gates.test.ts` — desktop deterministic gate expectations.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm --filter @mps/desktop test -- onboarding-auth` exits 0.
  - [x] Desktop wall redesign preserves all existing test-targeted selectors.
  - [x] Desktop platform-specific controls remain functionally available and correctly styled.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Desktop wall redesign happy path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test -- onboarding-auth -- -t "opens detail card from poster tiles, supports ESC/hotspot close, and idle-hides after 8 seconds"`
    Expected: Redesigned wall passes interaction/timing checks in desktop harness
    Evidence: .sisyphus/evidence/task-7-desktop-afterglow.log

  Scenario: Desktop platform exception failure path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test -- onboarding-auth -- -t "persists selected display and autostart settings across desktop restarts"`
    Expected: Test fails if redesign breaks desktop-specific capability behavior
    Evidence: .sisyphus/evidence/task-7-desktop-afterglow-error.log
  ```

  **Commit**: YES | Message: `feat(desktop): rebuild wall ui with afterglow orbit parity` | Files: [`apps/desktop/src/onboarding/runtime.ts`,`apps/desktop/src/wall/*`,`apps/desktop/src/features/platform/*`]

- [x] 8. Redesign cinematic scene renderer visuals into Afterglow Orbit language

  **What to do**: Rework scene visual rendering (front/back layers + fallback aesthetics) to match Afterglow Orbit mood while preserving route parsing, renderer mode semantics, OLED metric export pipeline, and deterministic test route behavior.
  **Must NOT do**: Do not alter OLED threshold constants, relayout trigger semantics, or required scene test IDs.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: canvas/fallback rendering redesign under OLED constraints.
  - Skills: [`frontend-design`] — strong visual motion/art direction execution.
  - Omitted: [`frontend-ui-ux`] — core work is render aesthetics and deterministic scene behavior.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [T9,T11,T12,T13] | Blocked By: [T2,T5]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/src/scene/wall-scene.ts` — scene layers, fallback, OLED dataset exports.
  - Pattern: `apps/web/src/scene/route.ts` — deterministic route contract.
  - API/Type: `packages/core/src/oled/cinematic-drift.ts` — OLED safety logic.
  - API/Type: `packages/core/src/render/renderer-foundation.ts` — renderer mode behaviors.
  - Test: `apps/web/test/renderer-runtime.test.ts` — route/mode visibility assertions.
  - Test: `apps/web/test/oled-risk-trigger.test.ts` — OLED trigger and highlight area assertions.
  - Test: `apps/web/e2e/wall-smoke.spec.ts` — primary/fallback layer visibility checks.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm --filter @mps/web test -- renderer-runtime` exits 0.
  - [x] `pnpm --filter @mps/web test -- oled-risk-trigger` exits 0.
  - [x] `pnpm --filter @mps/web exec playwright test --config=playwright.config.ts e2e/wall-smoke.spec.ts` exits 0.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Scene redesign happy path
    Tool: Playwright
    Steps: Open `/wall?mode=test`; assert `wall-scene`, `scene-layer-front`, `scene-layer-back` or fallback mode semantics
    Expected: Scene renders deterministically with valid mode and expected layer visibility contract
    Evidence: .sisyphus/evidence/task-8-scene-afterglow.mp4

  Scenario: OLED/routing regression failure path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/web test -- oled-risk-trigger -- -t "triggers early relayout from risk state before showcase cadence interval"`
    Expected: Any regression in OLED trigger behavior causes failing test
    Evidence: .sisyphus/evidence/task-8-scene-afterglow-error.log
  ```

  **Commit**: YES | Message: `feat(scene): redesign cinematic wall scene for afterglow orbit` | Files: [`apps/web/src/scene/wall-scene.ts`,`apps/web/src/scene/route.ts`,`apps/web/src/scene/*`]

- [x] 9. Rebuild cross-platform interaction choreography (detail card, idle-hide, exits)

  **What to do**: Re-implement interaction choreography for Web/Desktop wall surfaces: poster focus transitions, detail-card docking/placement logic, 8s idle-hide behavior, ESC/hotspot exit reliability, and transition timing bounded to 240-320ms.
  **Must NOT do**: Do not expand keyboard scope beyond required V1 interactions.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: interaction rules are strict, test-heavy, and cross-platform.
  - Skills: [`frontend-ui-ux`] — precision in interaction behavior and accessibility.
  - Omitted: [`frontend-design`] — visual style already established in T6/T7/T8.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [T10,T11,T12,T13] | Blocked By: [T6,T7,T8]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/src/onboarding/runtime.ts` — current interaction handlers + timers + transitions.
  - Pattern: `apps/desktop/src/onboarding/runtime.ts` — desktop interaction parity.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts` — detail card width/transition/idle-hide/ESC/hotspot checks.
  - Test: `apps/desktop/test/onboarding-auth.test.ts` — matching desktop checks.
  - External: `docs/poster-wall-design-principles.md` — interaction model boundaries.

  **Acceptance Criteria** (agent-executable only):
  - [x] Web detail-card interaction test passes with width and timing bounds.
  - [x] Desktop detail-card interaction test passes with idle-hide and exit behavior.
  - [x] No regression in reconnect/controls visibility behavior caused by interaction rewiring.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Interaction choreography happy path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/web exec playwright test --config=playwright.config.ts e2e/onboarding-auth.spec.ts -g "poster tiles open detail card with idle hide and exit controls"`
    Expected: Detail card behavior, transition window, idle hide, ESC/hotspot all pass
    Evidence: .sisyphus/evidence/task-9-interaction-choreo.log

  Scenario: Desktop interaction regression failure path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test -- onboarding-auth -- -t "opens detail card from poster tiles, supports ESC/hotspot close, and idle-hides after 8 seconds"`
    Expected: Test fails on any timing/exit/idle regression
    Evidence: .sisyphus/evidence/task-9-interaction-choreo-error.log
  ```

  **Commit**: YES | Message: `feat(interaction): rebuild cross-platform wall interaction choreography` | Files: [`apps/web/src/wall/*`,`apps/desktop/src/wall/*`,`packages/core/src/wall/*`]

- [x] 10. Redesign diagnostics, reconnect, and control surfaces with Afterglow semantics

  **What to do**: Re-skin and restructure diagnostics panel, reconnect guide, fullscreen warning, ingestion errors, and control clusters to match Afterglow Orbit visual hierarchy while preserving existing behavior and `data-testid` hooks.
  **Must NOT do**: Do not change diagnostics sampling interval semantics, reconnect backoff policy, or crash-export redaction behavior.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: high-density UI surface needing clarity and aesthetic quality.
  - Skills: [`frontend-ui-ux`] — readability, hierarchy, and usable control grouping.
  - Omitted: [`secret-guard`] — no new secret persistence/channel changes in this task.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [T12,T13] | Blocked By: [T6,T7,T9]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/src/features/diagnostics/runtime-diagnostics.ts` — sampling behavior contract.
  - Pattern: `apps/web/src/features/crash-export/crash-export.ts` — redaction/export contract.
  - Pattern: `apps/desktop/src/features/diagnostics/runtime-diagnostics.ts` — desktop counterpart.
  - Pattern: `apps/desktop/src/features/crash-export/crash-export.ts` — desktop crash export behavior.
  - Test: `apps/web/e2e/onboarding-auth.spec.ts` — diagnostics/reconnect/fullscreen flows.
  - Test: `apps/web/test/diagnostics-crash-export.test.ts` — web diagnostics/redaction unit tests.
  - Test: `apps/desktop/test/diagnostics-crash-export.test.ts` — desktop diagnostics/redaction unit tests.

  **Acceptance Criteria** (agent-executable only):
  - [x] Web diagnostics unit tests pass.
  - [x] Desktop diagnostics unit tests pass.
  - [x] Web e2e reconnect/fullscreen/diagnostics assertions remain green.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Diagnostics redesign happy path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/web test -- diagnostics-crash-export && pnpm --filter @mps/desktop test -- diagnostics-crash-export`
    Expected: Sampling and crash-export redaction behaviors remain intact post-redesign
    Evidence: .sisyphus/evidence/task-10-diagnostics-controls.log

  Scenario: Reconnect/fullscreen failure handling path
    Tool: Playwright
    Steps: Run `pnpm --filter @mps/web exec playwright test --config=playwright.config.ts e2e/onboarding-auth.spec.ts -g "shows non-blocking warning when fullscreen request is denied|shows reconnect guide within 60s when token is revoked"`
    Expected: Warning/reconnect flows remain visible and non-crashing under failure conditions
    Evidence: .sisyphus/evidence/task-10-diagnostics-controls-error.log
  ```

  **Commit**: YES | Message: `feat(ui): redesign diagnostics and wall control surfaces` | Files: [`apps/web/src/wall/*`,`apps/web/src/features/*`,`apps/desktop/src/wall/*`,`apps/desktop/src/features/*`]

- [x] 11. Update and harden Web unit tests for redesigned wall architecture

  **What to do**: Refresh/add Web unit tests to match new wall modules while preserving legacy contracts: route semantics, renderer mode behavior, OLED risk triggers, design-token invariants, and diagnostics/crash-export invariants.
  **Must NOT do**: Do not delete contract tests just to make the suite green.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: test redesign must protect deterministic behavior under major refactor.
  - Skills: [] — focused on test architecture rigor.
  - Omitted: [`frontend-design`] — no visual coding.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [T13,T14] | Blocked By: [T6,T8,T9]

  **References** (executor has NO interview context — be exhaustive):
  - Test: `apps/web/test/renderer-runtime.test.ts`
  - Test: `apps/web/test/oled-risk-trigger.test.ts`
  - Test: `apps/web/test/design-tokens.test.ts`
  - Test: `apps/web/test/diagnostics-crash-export.test.ts`
  - Pattern: `apps/web/src/scene/route.ts`
  - Pattern: `apps/web/src/scene/wall-scene.ts`
  - Pattern: `apps/web/src/wall/*` (new modules from rewrite)

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm --filter @mps/web test` exits 0.
  - [x] Route and OLED contract tests remain explicit and passing.
  - [x] Contract verifier from T1 remains green after test refresh.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Web unit suite happy path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/web test && node scripts/verify-wall-contracts.mjs`
    Expected: Entire web unit suite and contract verifier pass
    Evidence: .sisyphus/evidence/task-11-web-tests.log

  Scenario: Forced contract failure path
    Tool: Bash
    Steps: Run `MPS_CONTRACT_FORCE_FAIL=route node scripts/verify-wall-contracts.mjs`
    Expected: Command exits non-zero with explicit route-contract failure message
    Evidence: .sisyphus/evidence/task-11-web-tests-error.log
  ```

  **Commit**: YES | Message: `test(web): update wall unit coverage for redesign contracts` | Files: [`apps/web/test/*`,`scripts/verify-wall-contracts.mjs`,`scripts/contracts/wall-contracts.json`]

- [x] 12. Update and harden Desktop unit tests for redesigned wall architecture

  **What to do**: Refresh/add Desktop Vitest coverage for redesigned wall modules, ensuring desktop-specific behaviors (remember-password, display/autostart, reconnect backoff, idle-hide/detail interactions) remain enforced.
  **Must NOT do**: Do not relax desktop-specific capability assertions to hide regressions.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: platform-aware test hardening with many runtime branches.
  - Skills: [] — test/system behavior focus.
  - Omitted: [`frontend-design`] — no visual implementation.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [T14] | Blocked By: [T7,T9,T10]

  **References** (executor has NO interview context — be exhaustive):
  - Test: `apps/desktop/test/onboarding-auth.test.ts`
  - Test: `apps/desktop/test/diagnostics-crash-export.test.ts`
  - Test: `apps/desktop/test/gates/mandatory-v1-gates.test.ts`
  - Pattern: `apps/desktop/src/onboarding/runtime.ts`
  - Pattern: `apps/desktop/src/features/platform/tauri-bridge.ts`
  - Pattern: `apps/desktop/src/wall/*` (new modules from rewrite)

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm --filter @mps/desktop test` exits 0.
  - [x] Desktop platform exception tests remain explicit and passing.
  - [x] Reconnect backoff and logout-timing tests remain green.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Desktop unit suite happy path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test`
    Expected: All desktop unit and gate-related Vitest suites pass
    Evidence: .sisyphus/evidence/task-12-desktop-tests.log

  Scenario: Desktop security fallback failure path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/desktop test -- onboarding-auth -- -t "shows non-crashing warning when linux secret-service is unavailable and fallback encryption is used"`
    Expected: Test fails on any regression in fallback warning/encryption behavior
    Evidence: .sisyphus/evidence/task-12-desktop-tests-error.log
  ```

  **Commit**: YES | Message: `test(desktop): update wall and platform coverage for redesign` | Files: [`apps/desktop/test/*`,`apps/desktop/src/wall/*`,`apps/desktop/src/onboarding/runtime.ts`]

- [x] 13. Refresh Web/Desktop end-to-end and integration suites for redesigned wall

  **What to do**: Update E2E/integration suites to validate redesigned wall behavior and visuals while preserving legacy selector contracts and deterministic readiness assumptions.
  **Must NOT do**: Do not remove broad scenario coverage (auth failure/offline/reconnect/logout/detail interactions).

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: high-risk test-surface updates across many scenarios.
  - Skills: [`playwright`] — strong browser automation stability for wall tests.
  - Omitted: [`frontend-design`] — verification-focused task.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [T14] | Blocked By: [T6,T7,T8,T9,T10,T11]

  **References** (executor has NO interview context — be exhaustive):
  - Test: `apps/web/e2e/onboarding-auth.spec.ts`
  - Test: `apps/web/e2e/wall-smoke.spec.ts`
  - Test: `apps/web/e2e/gates/mandatory-v1-gates.spec.ts`
  - Test: `apps/desktop/test/onboarding-auth.test.ts`
  - Test: `apps/desktop/test/gates/mandatory-v1-gates.test.ts`
  - Config: `apps/web/playwright.config.ts`
  - Config: `.github/workflows/quality-gates.yml`

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm --filter @mps/web e2e` exits 0.
  - [x] `pnpm --filter @mps/desktop test -- onboarding-auth` exits 0.
  - [x] Existing test ID contract remains fully represented in updated tests.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: E2E suite happy path
    Tool: Bash
    Steps: Run `pnpm --filter @mps/web e2e && pnpm --filter @mps/desktop test -- onboarding-auth`
    Expected: Web and desktop integration flows pass against redesigned wall
    Evidence: .sisyphus/evidence/task-13-e2e-refresh.log

  Scenario: Forced gate failure path
    Tool: Bash
    Steps: Run `MPS_GATE_FORCE_FAIL=visual-baseline pnpm -w turbo run e2e:web e2e:desktop`
    Expected: Command exits non-zero with explicit threshold/baseline failure reason
    Evidence: .sisyphus/evidence/task-13-e2e-refresh-error.log
  ```

  **Commit**: YES | Message: `test(e2e): refresh wall scenarios for afterglow redesign` | Files: [`apps/web/e2e/*`,`apps/desktop/test/*`,`apps/web/playwright.config.ts`]

- [x] 14. Execute mandatory V1 gate suite and resolve threshold/determinism regressions

  **What to do**: Run full gate commands for Web/Desktop, resolve regressions introduced by redesign, and ensure deterministic evidence + threshold verifier outputs remain compliant.
  **Must NOT do**: Do not bypass or weaken threshold checks to force green.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: requires systematic triage across interaction, rendering, timing, and evidence outputs.
  - Skills: [`playwright`] — gate and evidence workflow relies on browser automation.
  - Omitted: [`frontend-design`] — this is quality gate hardening.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [T15] | Blocked By: [T12,T13]

  **References** (executor has NO interview context — be exhaustive):
  - Command Contract: `docs/quality-gates.md`
  - Command Contract: `docs/evidence-protocol.md`
  - Test: `apps/web/e2e/gates/mandatory-v1-gates.spec.ts`
  - Test: `apps/desktop/test/gates/mandatory-v1-gates.test.ts`
  - Script: `scripts/verify-thresholds.mjs`
  - Output: `.sisyphus/evidence/task-16-web-gates.metrics.json`
  - Output: `.sisyphus/evidence/task-16-desktop-gates.metrics.json`

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm -w turbo run e2e:web e2e:desktop` exits 0.
  - [x] Threshold verifier passes for both platforms.
  - [x] Deterministic evidence files are produced with required naming protocol.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Mandatory gates happy path
    Tool: Bash
    Steps: Run `pnpm -w turbo run e2e:web e2e:desktop && node scripts/verify-thresholds.mjs --platform web --metrics .sisyphus/evidence/task-16-web-gates.metrics.json && node scripts/verify-thresholds.mjs --platform desktop --metrics .sisyphus/evidence/task-16-desktop-gates.metrics.json`
    Expected: Gate suites and both threshold verifications pass
    Evidence: .sisyphus/evidence/task-14-gate-hardening.log

  Scenario: Threshold regression failure path
    Tool: Bash
    Steps: Run `MPS_GATE_FORCE_FAIL=logout-cleanup pnpm -w turbo run e2e:web e2e:desktop`
    Expected: Gate run fails with explicit logout-cleanup threshold violation message
    Evidence: .sisyphus/evidence/task-14-gate-hardening-error.log
  ```

  **Commit**: YES | Message: `test(gates): restore deterministic threshold compliance after redesign` | Files: [`apps/web/e2e/gates/*`,`apps/desktop/test/gates/*`,`scripts/verify-thresholds.mjs`,`docs/evidence-protocol.md`]

- [x] 15. Harden CI stability and synchronize docs/contracts for redesigned wall

  **What to do**: Finalize CI stability for redesigned suites (including deterministic runner settings where needed), synchronize docs with shipped wall behavior/visual direction, and ensure docs parity checks stay green.
  **Must NOT do**: Do not document capabilities or visual claims not actually implemented.

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: accuracy-critical documentation and contract traceability.
  - Skills: [] — no specialized skill required.
  - Omitted: [`frontend-design`] — documentation/CI finalization task.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [-] | Blocked By: [T14]

  **References** (executor has NO interview context — be exhaustive):
  - Config: `.github/workflows/quality-gates.yml`
  - Docs: `docs/poster-wall-design-principles.md`
  - Docs: `docs/capability-matrix.md`
  - Docs: `docs/quality-gates.md`
  - Docs: `docs/evidence-protocol.md`
  - Script: `scripts/verify-docs-parity.mjs`

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm -w verify:docs-parity` exits 0.
  - [x] `pnpm -w verify:docs-parity --strict` exits 0.
  - [x] CI workflow definition remains compatible with redesigned test/gate commands.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Docs/CI parity happy path
    Tool: Bash
    Steps: Run `pnpm -w verify:docs-parity && pnpm -w verify:docs-parity --strict`
    Expected: Documentation claims match implemented behavior and strict drift check passes
    Evidence: .sisyphus/evidence/task-15-docs-ci.log

  Scenario: Release artifact validation failure path
    Tool: Bash
    Steps: Run `pnpm -w verify:release-artifacts`
    Expected: Command exits non-zero when required release artifacts are absent, proving CI/doc guardrails catch missing outputs
    Evidence: .sisyphus/evidence/task-15-docs-ci-error.log
  ```

  **Commit**: YES | Message: `docs(ci): align wall redesign contracts and quality workflows` | Files: [`.github/workflows/quality-gates.yml`,`docs/poster-wall-design-principles.md`,`docs/capability-matrix.md`,`docs/quality-gates.md`,`docs/evidence-protocol.md`]

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- One atomic commit per completed task after AC + QA evidence both pass.
- Commit format: `type(scope): description`.
- Recommended types: `feat`, `refactor`, `test`, `fix`, `docs`, `chore`.

## Success Criteria
- Afterglow Orbit redesign is visibly delivered on Web + Desktop wall experiences.
- All V1 behavior contracts and thresholds remain green.
- Deterministic gate evidence is generated and verifier passes on both platforms.
- CI quality workflow remains green without selector/timing regressions.
