# media-poster-space V1 — Desktop + Web Poster Wall Execution Plan

## TL;DR
> **Summary**: Build a cinematic, OLED-aware Jellyfin poster-wall product with shared TypeScript core, delivered as Desktop (Tauri) + Web (static deployment), with strict release gates and explicitly accepted risk tradeoffs.
> **Deliverables**:
> - Monorepo architecture (`apps/web`, `apps/desktop`, `packages/core`)
> - Shared media/provider core and Jellyfin V1 provider
> - Cinematic Drift visual engine with OLED-safe behavior
> - Desktop and Web apps with defined parity + documented exceptions
> - Automated quality gates (Vitest, Playwright, CI) + release artifacts
> **Effort**: XL
> **Parallel**: YES - 3 waves
> **Critical Path**: T1 → T2/T3 → T7/T8/T9 → T10/T11/T12 → T16 → T17

## Context
### Original Request
Create a beautiful Jellyfin poster-wall desktop app (Win/macOS/Linux), screen-saver-like continuous poster presentation with light interaction, OLED burn-in prevention, and future extensibility to Plex/Emby; later expanded to include Web delivery and open-source self-hosted model.

### Interview Summary
- Product direction locked: **Cinematic Drift** (dark cinematic, complex visuals allowed, OLED-aware motion rules).
- Platform direction locked: **Desktop + Web same-day GA**, with explicit platform exception matrix.
- Architecture locked: **shared TS core + platform adapters**, Jellyfin-only V1, provider abstraction pre-defined.
- Security/risk posture locked by user: Web front-end token direct mode, broad CSP policy, no app-layer token expiry, no BFF in V1, no code-signing in V1, no release freeze/canary/feature flags.
- Quality posture locked: strict quality gate priority (release may slip), must-pass scenario list with timing budgets, visual review with fixed-seed evidence artifacts.

### Metis Review (gaps addressed)
- Resolved contradiction handling by explicit policies:
  - Quality gate outranks release date and feature pressure.
  - Platform parity interpreted as **core parity + documented exceptions**.
  - Security posture is risk-accepted and captured in plan constraints.
- Added concrete execution guardrails:
  - Capability matrix is mandatory artifact.
  - Must-pass scenario list and timing budgets are explicit.
  - Risk-accepted decisions are codified instead of left implicit.
  - External draft dependency removed; this plan file is the single reference source.

## Work Objectives
### Core Objective
Ship V1 of `media-poster-space` with cinematic visual quality, OLED-aware behavior, Jellyfin integration, and cross-platform delivery (Desktop + Web) under one shared TypeScript core.

### Deliverables
1. Shared core contracts, provider abstraction, and Jellyfin provider implementation.
2. Web app (static deployable) and Desktop app (Tauri portable builds) with agreed parity + exceptions.
3. Cinematic rendering pipeline (WebGL/Canvas + CSS fallback) with OLED constraints and interaction model.
4. End-to-end validation, visual evidence package, and release-ready artifacts/changelog.

### Definition of Done (verifiable conditions with commands)
- `pnpm -w install --frozen-lockfile` exits 0.
- `pnpm -w turbo run lint typecheck test build` exits 0.
- `pnpm -w turbo run e2e:web e2e:desktop` exits 0.
- Must-pass timing checks pass via scripted verification artifacts:
  - login flow ≤ 45s
  - offline cached first paint ≤ 5s
  - logout credential cleanup ≤ 1s
- Visual evidence bundle exists for both platforms with fixed-seed protocol.

### Must Have
- Cinematic Drift visual language and OLED-safe motion policies from draft.
- Shared core (`MediaItem`, provider contract) with Jellyfin V1 implementation.
- Desktop exceptions: display selection, remember password, autostart, offline cache preheat.
- Web exceptions: fullscreen API, no PWA in V1.
- AGPL open-source GitHub workflow with Issues-only feedback path.
- Web runtime remains static and direct-to-Jellyfin with client-held token model.
- Connection policy follows user-provided Jellyfin URL; when browser security blocks mixed-content/CORS/TLS, preflight diagnostics must fail gracefully with actionable guidance.
- Scope flexibility remains open during execution; release date may slip to preserve quality gate.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No playback controls in V1.
- No PWA install support in V1.
- No BFF-dependent runtime architecture in V1.
- No code signing/notarization in V1.
- No automatic feature-quality downgrade path.
- No hidden acceptance criteria requiring human interpretation only.
- No release freeze window in V1.
- No canary-only pre-release gate in V1.
- No feature-flag-based scope isolation as default governance.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: **tests-after** with Vitest + Playwright.
- QA policy: Every task includes executable happy + failure scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
Wave 1: Foundation architecture and toolchain (T1-T6)
Wave 2: Product core behavior and UX systems (T7-T12)
Wave 3: Platform completion, diagnostics, release-readiness (T13-T18)

### Dependency Matrix (full, all tasks)
| Task | Depends On |
|---|---|
| T1 | - |
| T2 | T1 |
| T3 | T1, T2 |
| T4 | T1 |
| T5 | T1, T4 |
| T6 | T1 |
| T7 | T3, T4 |
| T8 | T3, T7 |
| T9 | T2, T8 |
| T10 | T5, T9 |
| T11 | T7, T10 |
| T12 | T8, T9 |
| T13 | T7, T12 |
| T14 | T7, T12 |
| T15 | T1, T10, T11 |
| T16 | T7, T10, T11, T12, T13, T14, T15 |
| T17 | T6, T16 |
| T18 | T16, T17 |

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 6 tasks → quick / deep / visual-engineering / unspecified-high
- Wave 2 → 6 tasks → visual-engineering / unspecified-high / deep
- Wave 3 → 6 tasks → unspecified-high / writing / deep / visual-engineering

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task includes: Agent Profile + Parallelization + QA Scenarios.

<!-- Task details are appended below in batches. -->

- [x] 1. Bootstrap monorepo workspace and baseline scripts

  **What to do**: Initialize `pnpm + Turborepo` monorepo skeleton with `apps/web`, `apps/desktop`, `packages/core`; add root scripts for `lint/typecheck/test/build/e2e`; create minimal README and AGPL license files.
  **Must NOT do**: Do not add business logic or UI components in this task.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: high-confidence scaffolding with deterministic outputs.
  - Skills: [`git-master`] — create clean atomic setup commits.
  - Omitted: [`frontend-design`] — no visual design work yet.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [T2,T3,T4,T5,T6] | Blocked By: [-]

  **References**:
  - Pattern: `AGENTS.md` — repo workflow and session expectations.
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — architecture decisions source of truth.
  - External: `https://turbo.build/repo/docs` — workspace and pipeline conventions.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm -w install --frozen-lockfile` exits 0.
  - [x] `pnpm -w turbo run lint typecheck test build` resolves pipelines without missing-script errors.
  - [x] Root contains AGPL license text and monorepo package manifests.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Workspace bootstrap happy path
    Tool: Bash
    Steps: Run `pnpm -w install --frozen-lockfile && pnpm -w turbo run lint typecheck test build`
    Expected: All commands exit 0; turbo graph includes web, desktop, core packages
    Evidence: .sisyphus/evidence/task-1-bootstrap.log

  Scenario: Missing package linkage failure
    Tool: Bash
    Steps: Run `pnpm -w turbo run build`
    Expected: No "Cannot find workspace package" or missing dependency pipeline errors
    Evidence: .sisyphus/evidence/task-1-bootstrap-error.log
  ```

  **Commit**: YES | Message: `chore(repo): initialize pnpm monorepo and turbo pipeline` | Files: [`package.json`,`pnpm-workspace.yaml`,`turbo.json`,`apps/*`,`packages/*`,`LICENSE`]

- [x] 2. Define shared core contracts and provider abstraction

  **What to do**: In `packages/core`, define canonical domain contracts (`MediaItem`, `VisualItem`, `ProviderCapability`, auth/session types), provider interface (`MediaProvider`), and validation utilities used by both Desktop/Web.
  **Must NOT do**: Do not bind to Jellyfin-specific fields in exported UI-facing types.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: foundational API contract design with long-term impact.
  - Skills: [`frontend-ui-ux`] — keep data contracts aligned with interaction needs.
  - Omitted: [`playwright`] — no browser automation required.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [T3,T9,T10,T12] | Blocked By: [T1]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — unified model decision (`MediaItem`, provider-first design).
  - API/Type: `packages/core/src/types/*` (to create) — canonical contracts.
  - External: `https://api.jellyfin.org/openapi/` — source schema for mapping boundaries.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm -w --filter @mps/core typecheck` exits 0.
  - [x] `pnpm -w --filter @mps/core test` includes contract validation tests and exits 0.
  - [x] Desktop/Web packages import shared types without circular dependency warnings.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Contract portability happy path
    Tool: Bash
    Steps: Run `pnpm -w --filter @mps/core test && pnpm -w turbo run typecheck --filter=@mps/web --filter=@mps/desktop`
    Expected: Shared contracts compile in both app targets without platform-specific leakage
    Evidence: .sisyphus/evidence/task-2-contracts.log

  Scenario: Provider-specific field leakage failure
    Tool: Bash
    Steps: Run `pnpm -w --filter @mps/core test -- provider-contract-boundary`
    Expected: Test fails when Jellyfin-only fields are exposed in public `MediaItem`
    Evidence: .sisyphus/evidence/task-2-contracts-error.log
  ```

  **Commit**: YES | Message: `feat(core): add provider abstraction and unified media contracts` | Files: [`packages/core/src/types/*`,`packages/core/src/provider/*`,`packages/core/test/*`]

- [x] 3. Implement Jellyfin provider client with preflight and session handling

  **What to do**: Build Jellyfin provider implementation for direct client mode: server preflight checks (reachability/CORS/version/auth endpoint), login flow, token lifecycle hooks, and normalized fetch adapters for items/images metadata.
  **Must NOT do**: Do not add Plex/Emby runtime behavior in V1.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: network/protocol integration and error semantics.
  - Skills: [`secret-guard`] — prevent credential leakage in logs and test fixtures.
  - Omitted: [`frontend-design`] — transport layer task.

  **Parallelization**: Can Parallel: PARTIAL | Wave 1 | Blocks: [T7,T8] | Blocked By: [T1,T2]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — direct token mode, preflight-first connection.
  - API/Type: `packages/core/src/provider/MediaProvider` — contract to implement.
  - External: `https://api.jellyfin.org/openapi/jellyfin-openapi-stable.json` — endpoint behavior.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm -w --filter @mps/core test -- jellyfin-provider` exits 0.
  - [x] Preflight command validates reachable test server and returns structured diagnostics.
  - [x] Error mapper returns deterministic categories (`network`, `auth`, `cors`, `version`, `unknown`).

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Preflight + auth happy path
    Tool: Bash
    Steps: Run `pnpm -w --filter @mps/core test -- jellyfin-provider-happy`
    Expected: Preflight passes, login returns token, item fetch returns normalized `MediaItem[]`
    Evidence: .sisyphus/evidence/task-3-jellyfin-provider.log

  Scenario: Invalid endpoint failure path
    Tool: Bash
    Steps: Run `pnpm -w --filter @mps/core test -- jellyfin-provider-failure`
    Expected: Client reports categorized failure (no raw stack/token leak)
    Evidence: .sisyphus/evidence/task-3-jellyfin-provider-error.log
  ```

  **Commit**: YES | Message: `feat(core): implement jellyfin provider with preflight diagnostics` | Files: [`packages/core/src/providers/jellyfin/*`,`packages/core/test/jellyfin/*`]

- [x] 4. Build design-token system and typography baseline

  **What to do**: Implement Tailwind + design tokens for cinematic dark theme, dynamic accent hooks, brand font loading + fallback chain, and tokenized spacing/radius/elevation scales shared by Desktop/Web.
  **Must NOT do**: Do not hard-code colors/typography directly inside feature components.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: foundation visual language implementation.
  - Skills: [`frontend-design`] — token architecture and cinematic styling quality.
  - Omitted: [`secret-guard`] — no credential surface in this task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [T7,T10,T11] | Blocked By: [T1]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — dynamic accent + brand font decisions.
  - Test: `apps/web/src/styles/*` (to create) — token snapshots.
  - External: `https://tailwindcss.com/docs/theme` — token mapping.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm -w --filter @mps/web test -- design-tokens` exits 0.
  - [x] `pnpm -w --filter @mps/web build` emits no unresolved font/token errors.
  - [x] Dynamic accent function outputs accessible contrast ratios in token tests.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Token pipeline happy path
    Tool: Bash
    Steps: Run `pnpm -w --filter @mps/web test -- design-tokens && pnpm -w --filter @mps/web build`
    Expected: Token snapshots pass; font fallback chain resolves without runtime crashes
    Evidence: .sisyphus/evidence/task-4-design-tokens.log

  Scenario: Font load failure fallback
    Tool: Playwright
    Steps: Block brand-font URL; open app route `/`; inspect computed font family of `[data-testid="app-shell"]`
    Expected: App falls back to system font and remains readable
    Evidence: .sisyphus/evidence/task-4-design-tokens-error.png
  ```

  **Commit**: YES | Message: `feat(ui): add cinematic design tokens and typography baseline` | Files: [`apps/web/tailwind.config.*`,`packages/core/src/tokens/*`,`apps/web/src/styles/*`]

- [x] 5. Implement rendering engine foundation (WebGL/Canvas + CSS fallback)

  **What to do**: Build layered scene renderer abstraction with WebGL/Canvas primary path and CSS light-effects fallback when WebGL is unavailable; expose render hooks used by both Desktop/Web shells.
  **Must NOT do**: Do not embed provider/network logic inside renderer.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: high-complexity motion/render architecture.
  - Skills: [`frontend-ui-ux`] — preserve motion clarity and interaction readiness.
  - Omitted: [`git-master`] — not a git-history task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [T10,T11] | Blocked By: [T1,T4]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — mixed rendering, high-refresh, non-degrading visual policy.
  - API/Type: `packages/core/src/render/*` (to create) — renderer interfaces.
  - External: `https://developer.mozilla.org/docs/Web/API/WebGL_API` — fallback behavior constraints.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm -w --filter @mps/web test -- renderer` exits 0.
  - [x] WebGL unavailable mode still renders usable wall scene with CSS fallback.
  - [x] Renderer state transitions do not leak memory in stress test harness.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Renderer primary path happy case
    Tool: Playwright
    Steps: Open `/wall?mode=test`; verify `[data-testid="scene-layer-front"]` and `[data-testid="scene-layer-back"]` animate
    Expected: Layer transforms update over time; no blank canvas
    Evidence: .sisyphus/evidence/task-5-renderer.mp4

  Scenario: WebGL-disabled fallback
    Tool: Playwright
    Steps: Launch browser with WebGL disabled; open `/wall?mode=test`
    Expected: `[data-testid="scene-fallback-css"]` visible; app remains interactive
    Evidence: .sisyphus/evidence/task-5-renderer-error.png
  ```

  **Commit**: YES | Message: `feat(render): add layered renderer with webgl and css fallback` | Files: [`packages/core/src/render/*`,`apps/web/src/scene/*`]

- [x] 6. Establish quality toolchain and CI pipelines

  **What to do**: Configure Vitest, Playwright, lint/typecheck/build scripts, GitHub Actions workflow matrix, and evidence artifact upload conventions.
  **Must NOT do**: Do not loosen failing checks to greenwash pipeline.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: pipeline orchestration across mono-packages.
  - Skills: [`playwright`] — reliable E2E runner setup.
  - Omitted: [`frontend-design`] — non-visual infra task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [T16,T17] | Blocked By: [T1]

  **References**:
  - Pattern: `AGENTS.md` — quality gate expectations.
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — strict gate + stable-only strategy.
  - External: `https://docs.github.com/actions` — workflow matrix patterns.

  **Acceptance Criteria** (agent-executable only):
  - [x] CI runs lint/typecheck/test/build on pull request and fails on first hard error.
  - [x] Playwright reports and evidence artifacts are generated and retained.
  - [x] `pnpm -w turbo run lint typecheck test build` succeeds locally.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: CI happy path
    Tool: Bash
    Steps: Run `pnpm -w turbo run lint typecheck test build`
    Expected: Exit 0 with all packages included in pipeline
    Evidence: .sisyphus/evidence/task-6-ci.log

  Scenario: Intentional failing check
    Tool: Bash
    Steps: Execute a failing test target `pnpm -w --filter @mps/core test -- __nonexistent__`
    Expected: Pipeline exits non-zero and reports failure cause clearly
    Evidence: .sisyphus/evidence/task-6-ci-error.log
  ```

  **Commit**: YES | Message: `chore(ci): configure test and build gates with gha workflows` | Files: [`.github/workflows/*`,`turbo.json`,`package.json`,`playwright.config.*`,`vitest.config.*`]

- [x] 7. Implement 3-step onboarding and authentication UX

  **What to do**: Build onboarding flow (`server → login → library+OLED prefs`) with preflight checks, remember-username, remember-last-server, Desktop-only remember-password, Web auto-restore on reopen.
  **Must NOT do**: Do not persist password on Web.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: UX-critical flows with form/state behavior.
  - Skills: [`frontend-ui-ux`] — robust onboarding usability and edge-state handling.
  - Omitted: [`find-skills`] — no capability discovery needed.

  **Parallelization**: Can Parallel: PARTIAL | Wave 2 | Blocks: [T8,T11,T13,T14,T16] | Blocked By: [T3,T4]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — onboarding 3-step, remember semantics, logout cleanup rules.
  - API/Type: `packages/core/src/providers/jellyfin/*` — auth/preflight client.
  - Test: `apps/web/e2e/auth.spec.ts` (to create) — login path validation.

  **Acceptance Criteria** (agent-executable only):
  - [x] Login end-to-end (preflight→auth→library selection→wall) completes within 45s in test profile.
  - [x] Logout clears token/password within 1s and preserves username/server address.
  - [x] Desktop remember-password toggle persists encrypted secret; Web UI omits this toggle.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: First login happy path
    Tool: Playwright
    Steps: Fill `[data-testid="server-url-input"]`, click `[data-testid="preflight-check-button"]`, login via `[data-testid="login-submit"]`, select libraries `[data-testid="library-checkbox-*"]`, continue `[data-testid="onboarding-finish"]`
    Expected: `[data-testid="poster-wall-root"]` visible and timing artifact <=45s
    Evidence: .sisyphus/evidence/task-7-onboarding.mp4

  Scenario: Invalid credentials failure path
    Tool: Playwright
    Steps: Submit wrong password on `[data-testid="password-input"]`
    Expected: `[data-testid="auth-error-banner"]` shown; no token persisted
    Evidence: .sisyphus/evidence/task-7-onboarding-error.png
  ```

  **Commit**: YES | Message: `feat(auth): add three-step onboarding and session UX` | Files: [`apps/web/src/features/onboarding/*`,`apps/desktop/src/features/onboarding/*`,`apps/*/e2e/auth*`]

- [x] 8. Implement library selection and normalized media ingestion

  **What to do**: Build library picker and ingestion pipeline that pulls only selected libraries, skips items without poster art, maps to unified `MediaItem`, and supports 5-minute refresh with manual refresh trigger.
  **Must NOT do**: Do not introduce app-level filtering for adult content in V1.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: data ingestion correctness and refresh semantics.
  - Skills: [] — no specialized skill required beyond base category.
  - Omitted: [`frontend-design`] — data-centric task.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [T9,T12,T16] | Blocked By: [T3,T7]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — selected-library policy, missing-poster skip, 5-minute refresh.
  - API/Type: `MediaItem` contract in `packages/core`.
  - External: `https://typescript-sdk.jellyfin.org/classes/generated-client.ItemsApi.html`.

  **Acceptance Criteria** (agent-executable only):
  - [x] Selected-library filter is respected in all content pulls.
  - [x] Items without posters never enter render queue.
  - [x] Scheduled refresh runs every 5 minutes with manual trigger command.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Selected libraries happy path
    Tool: Playwright
    Steps: Select subset libraries; enter wall; open diagnostics `[data-testid="diagnostics-open"]`
    Expected: Diagnostics list only selected library IDs; no unselected content appears
    Evidence: .sisyphus/evidence/task-8-ingestion.png

  Scenario: No-poster filtering failure path
    Tool: Bash
    Steps: Run `pnpm -w --filter @mps/core test -- ingestion-missing-poster`
    Expected: Items lacking poster image are excluded from output set
    Evidence: .sisyphus/evidence/task-8-ingestion-error.log
  ```

  **Commit**: YES | Message: `feat(data): add selected-library ingestion and refresh pipeline` | Files: [`packages/core/src/ingestion/*`,`apps/*/src/features/library/*`,`packages/core/test/ingestion*`]

- [x] 9. Implement poster scheduling engine (random + anti-cluster)

  **What to do**: Build scheduler that enforces pure-random baseline with anti-cluster constraints (same series/actor/year suppression), 45-minute reappearance window, 30-day cache TTL integration, and medium prefetch policy.
  **Must NOT do**: Do not add recommendation weighting by rating/newness/watch-state.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: rule-heavy sequencing and deterministic behavior under randomness.
  - Skills: [] — no specialized skill required beyond base category.
  - Omitted: [`playwright`] — algorithm-first task.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [T10,T12,T16] | Blocked By: [T2,T8]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — anti-cluster, 45-minute window, no weighting.
  - API/Type: `packages/core/src/scheduler/*` (to create).
  - Test: deterministic seed protocol requirement in draft.

  **Acceptance Criteria** (agent-executable only):
  - [x] Scheduler tests confirm 45-minute repeat suppression in main viewport window.
  - [x] Deterministic seed mode reproduces identical sequence for visual baseline runs.
  - [x] Anti-cluster constraints fire for same series/actor/year back-to-back attempts.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Deterministic scheduling happy path
    Tool: Bash
    Steps: Run `pnpm -w --filter @mps/core test -- scheduler-seed-stability`
    Expected: Two seeded runs output identical sequence hashes
    Evidence: .sisyphus/evidence/task-9-scheduler.log

  Scenario: Anti-cluster guard failure path
    Tool: Bash
    Steps: Run `pnpm -w --filter @mps/core test -- scheduler-anti-cluster`
    Expected: Guard test fails if same-cluster items appear within blocked window
    Evidence: .sisyphus/evidence/task-9-scheduler-error.log
  ```

  **Commit**: YES | Message: `feat(core): add random scheduler with anti-cluster constraints` | Files: [`packages/core/src/scheduler/*`,`packages/core/test/scheduler*`]

- [x] 10. Implement Cinematic Drift scene behavior and OLED constraints

  **What to do**: Implement multi-layer parallax wall, medium-slow horizontal drift, global micro-shift every 45s, fixed-cycle relayout (`Balanced 90s`, `Showcase 60s`) plus risk-triggered early relayout, and highlight/static-area thresholds.
  **Must NOT do**: Do not disable drift/re-layout automatically for convenience.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: core cinematic motion system.
  - Skills: [`frontend-design`] — preserve filmic look while enforcing OLED rules.
  - Omitted: [`github-cli`] — no GitHub inspection needed.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [T11,T15,T16] | Blocked By: [T5,T9]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — drift speed, micro-shift cadence, relayout cycles, OLED thresholds.
  - API/Type: scheduler output from `T9` and renderer hooks from `T5`.
  - Test: visual evidence protocol requirements (fixed seed + 1080p/60).

  **Acceptance Criteria** (agent-executable only):
  - [x] Metrics export confirms: focus-card static <=12s, highlight static <=15s, highlight area <=12%.
  - [x] Relayout cycle timings match selected profile and support risk-triggered early relayout.
  - [x] Wall drift and layer offsets remain active after 30-minute soak test.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Cinematic motion happy path
    Tool: Playwright
    Steps: Open `/wall?seed=baseline-1&profile=showcase`; run 90s capture
    Expected: Layer drift visible; periodic relayout occurs; no static-threshold breach
    Evidence: .sisyphus/evidence/task-10-cinematic.mp4

  Scenario: Static risk trigger path
    Tool: Bash
    Steps: Run `pnpm -w --filter @mps/web test -- oled-risk-trigger`
    Expected: Risk detector forces early relayout before threshold breach
    Evidence: .sisyphus/evidence/task-10-cinematic-error.log
  ```

  **Commit**: YES | Message: `feat(scene): implement cinematic drift and oled safety thresholds` | Files: [`apps/*/src/scene/*`,`packages/core/src/oled/*`,`packages/core/test/oled*`]

- [x] 11. Implement interaction layer: detail card, hide rules, exit behavior

  **What to do**: Implement click-to-detail card, smart card positioning (26-30% width, avoid edges/highlights), 8s auto-hide idle behavior, 240-320ms transitions, escape + hotspot exit behavior, and deep-settings-only profile toggle.
  **Must NOT do**: Do not add playback actions or keyboard control set beyond ESC in V1.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: UI behavior strongly coupled to visual quality.
  - Skills: [`frontend-ui-ux`] — interaction fidelity and anti-misclick behavior.
  - Omitted: [`playwright`] — used in QA, not implementation skill requirement.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [T15,T16] | Blocked By: [T7,T10]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — interaction and exit decisions.
  - Test: selectors contract for QA (`data-testid` namespace).
  - External: `https://developer.mozilla.org/docs/Web/API/Fullscreen_API` (web fullscreen interaction consistency).

  **Acceptance Criteria** (agent-executable only):
  - [x] Clicking poster opens detail card with required fields and hides missing metadata fields.
  - [x] Idle timeout hides card/controls after 8s.
  - [x] ESC and top-right hotspot both exit reliably; no accidental auto-exit behavior.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Detail card interaction happy path
    Tool: Playwright
    Steps: Click `[data-testid="poster-item-0"]`; inspect `[data-testid="detail-card"]`; wait 8s idle
    Expected: Card appears with valid fields then auto-hides at idle threshold
    Evidence: .sisyphus/evidence/task-11-interaction.mp4

  Scenario: Exit gesture failure path
    Tool: Playwright
    Steps: Trigger ESC and hotspot `[data-testid="exit-hotspot"]` repeatedly under active animation
    Expected: Exit always routes to expected state without stuck overlay or crash
    Evidence: .sisyphus/evidence/task-11-interaction-error.png
  ```

  **Commit**: YES | Message: `feat(ui): add detail card behavior and exit interactions` | Files: [`apps/*/src/features/wall-interaction/*`,`apps/*/e2e/interaction*`]

- [x] 12. Implement caching, offline startup, and recovery behavior

  **What to do**: Implement cache subsystem with size caps (`1GB or 1200`), 30-day TTL, LRU+hotness eviction, desktop preheat exception, offline-first startup recovery, and reconnect backoff (2s→60s).
  **Must NOT do**: Do not bypass cache policy limits for convenience.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: resilience and storage correctness.
  - Skills: [] — no specialized skill required beyond base category.
  - Omitted: [`frontend-design`] — non-visual logic core.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [T13,T14,T16] | Blocked By: [T8,T9]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — offline/TTL/eviction/reconnect decisions.
  - API/Type: `packages/core/src/cache/*` (to create).
  - Test: must-pass scenario requirements (offline first paint <=5s).

  **Acceptance Criteria** (agent-executable only):
  - [x] Offline startup with existing cache renders wall within 5s.
  - [x] Cache never exceeds configured capacity and evicts by LRU+hotness with TTL.
  - [x] Token invalidation transitions to reconnect/guide state within 60s.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Offline recovery happy path
    Tool: Playwright
    Steps: Warm cache; cut network; restart app/page
    Expected: `[data-testid="poster-wall-root"]` visible <=5s; reconnect attempts logged
    Evidence: .sisyphus/evidence/task-12-cache.mp4

  Scenario: Token revoked failure path
    Tool: Playwright
    Steps: Revoke token on server fixture; keep app running for 60s
    Expected: App enters `[data-testid="reconnect-guide"]` state without crash
    Evidence: .sisyphus/evidence/task-12-cache-error.png
  ```

  **Commit**: YES | Message: `feat(resilience): add cache policy and offline recovery flows` | Files: [`packages/core/src/cache/*`,`apps/*/src/features/recovery/*`,`packages/core/test/cache*`]

- [x] 13. Implement Desktop platform extensions and secure persistence path

  **What to do**: In Tauri app, implement exception features: display selection, optional remember-password, autostart, local encrypted credential storage, Linux no-secret-service weak-encryption fallback, and portable package behavior.
  **Must NOT do**: Do not expose plain-text password/token in desktop config files.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: OS integration and sensitive storage behavior.
  - Skills: [`secret-guard`] — credential persistence safety checks.
  - Omitted: [`frontend-design`] — mostly platform integration.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [T16,T17] | Blocked By: [T7,T12]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — desktop exception matrix and storage fallbacks.
  - Pattern: `AGENTS.md` — non-destructive workflow expectations.
  - External: `https://v2.tauri.app/develop/calling-rust/` — desktop command bridge patterns.

  **Acceptance Criteria** (agent-executable only):
  - [x] Display picker controls target monitor output correctly.
  - [x] Remember-password works only on Desktop and survives restart.
  - [x] Linux secret-service-unavailable path uses fallback encryption and logs warning without crash.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Desktop extension happy path
    Tool: interactive_bash
    Steps: Launch desktop app in tmux; enable autostart, remember-password, choose monitor 2; restart app
    Expected: Settings persist; app opens on chosen monitor; credentials decrypt successfully
    Evidence: .sisyphus/evidence/task-13-desktop.log

  Scenario: Missing secret-service failure path
    Tool: Bash
    Steps: Run desktop integration test with mocked unavailable secret-service
    Expected: Fallback encryption path used; warning recorded; no plaintext secret write
    Evidence: .sisyphus/evidence/task-13-desktop-error.log
  ```

  **Commit**: YES | Message: `feat(desktop): add monitor selection startup and secure persistence paths` | Files: [`apps/desktop/src-tauri/*`,`apps/desktop/src/features/platform/*`,`apps/desktop/test/*`]

- [x] 14. Implement Web platform behavior (static deploy, fullscreen, auto-restore)

  **What to do**: Implement Web-specific behavior: static-build output, fullscreen API entry, auto-reconnect/restore from last server, no remember-password in web, no PWA.
  **Must NOT do**: Do not introduce runtime backend dependencies.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: browser UX and fullscreen behavior.
  - Skills: [`playwright`] — browser behavior validation.
  - Omitted: [`secret-guard`] — no new secret persistence layer added here.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [T16,T17] | Blocked By: [T7,T12]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — static deployment and web exception decisions.
  - External: `https://developer.mozilla.org/docs/Web/API/Fullscreen_API`.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm -w --filter @mps/web build` outputs deployable static artifacts.
  - [x] Fullscreen entry/exit works via in-app control in supported browsers.
  - [x] Web restart auto-restores last server + username but never password.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Web static + fullscreen happy path
    Tool: Playwright
    Steps: Serve static build; open app; click `[data-testid="web-fullscreen-button"]`; reload page
    Expected: Fullscreen works; previous server+username restored; password field empty
    Evidence: .sisyphus/evidence/task-14-web.mp4

  Scenario: Unsupported fullscreen failure path
    Tool: Playwright
    Steps: Mock fullscreen denial; click fullscreen button
    Expected: Non-blocking warning shown via `[data-testid="fullscreen-warning"]`; app continues
    Evidence: .sisyphus/evidence/task-14-web-error.png
  ```

  **Commit**: YES | Message: `feat(web): add static fullscreen and session-restore behavior` | Files: [`apps/web/src/features/platform/*`,`apps/web/e2e/platform*`,`apps/web/vite.config.*`]

- [x] 15. Add diagnostics panel and local crash-report export

  **What to do**: Implement developer diagnostics panel (available in release), 1-second sampling for FPS/memory/reconnect metrics, and crash package export (`logs+version+config-summary`) with token redaction.
  **Must NOT do**: Do not export secrets (token/password/raw auth headers).

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: observability + privacy boundary enforcement.
  - Skills: [`secret-guard`] — sensitive field redaction and leak prevention.
  - Omitted: [`frontend-design`] — focus on diagnostics utility.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [T16,T18] | Blocked By: [T1,T10,T11]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — diagnostics panel and log retention decisions.
  - Test: must-pass redaction behavior in crash package export.

  **Acceptance Criteria** (agent-executable only):
  - [x] Diagnostics panel can be toggled in release builds.
  - [x] Sampling interval is 1s and data retention follows 7-day/100MB policy.
  - [x] Crash export package contains required fields and excludes secret fields.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Diagnostics happy path
    Tool: Playwright
    Steps: Open diagnostics `[data-testid="diagnostics-open"]`; observe metrics for 10s
    Expected: FPS/memory/reconnect counters update each second
    Evidence: .sisyphus/evidence/task-15-diagnostics.mp4

  Scenario: Redaction failure path
    Tool: Bash
    Steps: Trigger synthetic crash; export package; grep for token/password patterns
    Expected: No token/password strings present in exported archive
    Evidence: .sisyphus/evidence/task-15-diagnostics-error.log
  ```

  **Commit**: YES | Message: `feat(obs): add diagnostics panel and redacted crash exports` | Files: [`apps/*/src/features/diagnostics/*`,`apps/*/src/features/crash-export/*`,`apps/*/test/diagnostics*`]

- [x] 16. Build mandatory V1 gate suite and evidence generation

  **What to do**: Implement automated gate suite for must-pass scenarios: login flow <=45s, offline cached paint <=5s, token-revoked recovery <=60s, logout cleanup <=1s, dual-platform visual baseline (fixed seed, 1080p/60, 30s clip + 3 screenshots each segment).
  **Must NOT do**: Do not mark gate as passed without generated evidence artifacts.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: executable acceptance harness and threshold enforcement.
  - Skills: [`playwright`] — scenario automation and evidence capture.
  - Omitted: [`frontend-design`] — quality gate orchestration task.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [T17,T18] | Blocked By: [T7,T10,T11,T12,T13,T14,T15]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — must-pass list, thresholds, evidence protocol.
  - Test: Playwright and Vitest configs from `T6`.

  **Acceptance Criteria** (agent-executable only):
  - [x] `pnpm -w turbo run e2e:web e2e:desktop` exits 0 with threshold assertions.
  - [x] Evidence folder contains required files for all mandatory scenarios.
  - [x] Visual baseline artifacts use fixed seed and naming format `milestone-scene-version`.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Gate suite happy path
    Tool: Bash
    Steps: Run `pnpm -w turbo run e2e:web e2e:desktop`
    Expected: All threshold assertions pass; evidence files generated in `.sisyphus/evidence`
    Evidence: .sisyphus/evidence/task-16-gates.log

  Scenario: Threshold regression path
    Tool: Bash
    Steps: Run gate tests with throttled network/CPU profile
    Expected: Suite fails with clear threshold-specific messages (which gate failed)
    Evidence: .sisyphus/evidence/task-16-gates-error.log
  ```

  **Commit**: YES | Message: `test(gates): enforce v1 mandatory scenario and timing thresholds` | Files: [`apps/*/e2e/gates/*`,`scripts/verify-thresholds.*`,`docs/evidence-protocol.*`]

- [x] 17. Produce release artifacts and stable-channel packaging

  **What to do**: Create release packaging flow for Desktop portable outputs (including AppImage), Web static distribution package, Stable-only release metadata, and mandatory changelog generation.
  **Must NOT do**: Do not add code signing/notarization in V1.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: cross-platform packaging orchestration.
  - Skills: [`git-master`] — consistent release commit/tag hygiene.
  - Omitted: [`frontend-design`] — packaging/release task.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [T18] | Blocked By: [T6,T16]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — portable-only, no signing, stable-only, changelog required.
  - External: `https://v2.tauri.app/distribute/` — Tauri artifact configuration.

  **Acceptance Criteria** (agent-executable only):
  - [x] Desktop builds produce portable artifacts for Win/mac/Linux (Linux includes AppImage).
  - [x] Web build produces host-agnostic static package.
  - [x] Release bundle includes standardized changelog for the version.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Release packaging happy path
    Tool: Bash
    Steps: Run `pnpm -w turbo run build:release`
    Expected: Artifacts generated in release directory for all targets; changelog file present
    Evidence: .sisyphus/evidence/task-17-release.log

  Scenario: Missing artifact failure path
    Tool: Bash
    Steps: Run release verification script `pnpm -w verify:release-artifacts`
    Expected: Script fails if any required target artifact is absent
    Evidence: .sisyphus/evidence/task-17-release-error.log
  ```

  **Commit**: YES | Message: `chore(release): add stable packaging and changelog pipeline` | Files: [`apps/desktop/src-tauri/tauri.conf.*`,`scripts/release/*`,`CHANGELOG.md`,`release/*`]

- [x] 18. Finalize open-source ops docs, capability matrix, and issue-first workflow

  **What to do**: Publish V1 docs inside repo for AGPL licensing, capability matrix, platform exception list, must-pass gate definitions, Issues-only feedback workflow, and risk-accepted constraints statement.
  **Must NOT do**: Do not introduce unresolved claims that contradict implemented behavior.

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: accuracy-critical technical documentation.
  - Skills: [] — no specialized skill required beyond base category.
  - Omitted: [`frontend-design`] — documentation-only task.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [-] | Blocked By: [T16,T17]

  **References**:
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — locked decisions and capability matrix basis.
  - Pattern: `.sisyphus/plans/media-poster-space-v1.md` — execution-to-doc alignment.

  **Acceptance Criteria** (agent-executable only):
  - [x] Capability matrix in docs matches implemented behavior for Desktop/Web.
  - [x] Docs explicitly state Issues-only feedback channel and AGPL license scope.
  - [x] Gate definitions and evidence naming scheme are documented and consistent with scripts.

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Documentation parity happy path
    Tool: Bash
    Steps: Run `pnpm -w verify:docs-parity`
    Expected: Script confirms docs matrices and implemented feature flags/paths align
    Evidence: .sisyphus/evidence/task-18-docs.log

  Scenario: Drift detection failure path
    Tool: Bash
    Steps: Run `pnpm -w verify:docs-parity --strict`
    Expected: Verification fails when docs claim unsupported capability
    Evidence: .sisyphus/evidence/task-18-docs-error.log
  ```

  **Commit**: YES | Message: `docs(v1): publish capability matrix and open-source operating rules` | Files: [`README.md`,`docs/capability-matrix.md`,`docs/quality-gates.md`,`docs/feedback-workflow.md`]

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Conventional commits, one commit per completed task when task AC + QA evidence are both green.
- Commit types: `feat`, `fix`, `chore`, `test`, `docs`.
- No squashing requirement in-task; squash policy decided at PR time.

## Success Criteria
- Both Desktop and Web pass all V1 must-pass scenarios and gating commands.
- Visual baseline protocol passes with zero critical visual defects.
- Capability matrix matches shipped behavior.
- Release artifacts and changelog published under AGPL project governance.
