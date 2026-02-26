# Decisions — wall-frontend-redesign

## 2026-02-26 — contract freezing decisions

- Added a machine-readable manifest at `scripts/contracts/wall-contracts.json` with five enforced groups: `selector`, `route`, `timing`, `oled`, `evidence`.
- Kept verification execution as direct command (`node scripts/verify-wall-contracts.mjs`) without extra package script wiring because runnable invocation is already explicit in acceptance criteria.
- Implemented forced-failure support via `MPS_CONTRACT_FORCE_FAIL=selector|route|timing|oled|evidence` with deterministic non-zero exits and clear group-tagged messages.

## 2026-02-26 — retry confirmation

- Retained minimal task scope on retry: no additional config wiring or runtime code changes were introduced beyond the verifier + manifest and required notepad updates.

## 2026-02-26 — Afterglow Orbit token layer decisions

- Extended `packages/core/src/tokens/design-system.ts` with a dedicated `afterglowOrbitLayer` export and additive `elevationScale.orbit` key so existing token names remain intact while enabling new semantic styling hooks.
- Wired new Afterglow Orbit CSS variables through both Web (`design-tokens.ts`, `global.css`, `tailwind.config.ts`) and Desktop (`apps/desktop/src/main.ts`) entry paths to keep cross-platform token availability consistent.

## 2026-02-26 — wall runtime modular layering decisions

- Kept route ownership and ingestion/reconnect/logout side-effect orchestration inside `apps/web/src/onboarding/runtime.ts` and extracted only wall surface composition into additive `apps/web/src/wall/*` modules to avoid behavioral drift.
- Did not alter `apps/web/src/main.ts` route branching semantics (`shouldRenderWallScene` remains authoritative) because `/wall` onboarding-wall runtime behavior and wall-scene query contract must stay unchanged.

## 2026-02-26 — desktop modular runtime decisions

- Introduced `apps/desktop/src/features/platform/password-vault-adapter.ts` and `apps/desktop/src/features/platform/wall-platform-adapter.ts` so password persistence, display selection, and autostart persistence are handled behind explicit platform adapter boundaries instead of inline runtime logic.
- Kept runtime public compatibility by re-exporting password-vault symbols from `apps/desktop/src/onboarding/runtime.ts`, while routing wall surface internals through new `apps/desktop/src/wall/*` helpers (`detail-card`, `fallback-surface`, `interaction-controller`, `types`).

## 2026-02-26 — shared wall model extraction decisions

- Added a new shared core wall module (`packages/core/src/wall/{constants,detail-card-placement,interaction-state}.ts`) and exported it via both `packages/core/src/wall/index.ts` and `packages/core/src/index.ts`.
- Kept provider/auth/network and app-specific runtime orchestration in Web/Desktop runtimes; extracted only deterministic wall primitives (placement, transition guards/constants, interaction-state transitions).
- Migrated both Web and Desktop runtimes to consume shared transition + normalization helpers while preserving existing selectors, route behavior, and runtime interaction controller boundaries.

## 2026-02-26 — Afterglow Orbit wall composition decisions

- Kept `/wall` behavior orchestration in `apps/web/src/onboarding/runtime.ts` and moved all major visual redesign work into existing wall surface modules to avoid route/interaction drift while enabling a full composition refresh.
- Preserved all required selector contracts (`poster-wall-root`, `wall-poster-grid`, `poster-item-*`, `detail-card`, `wall-controls-container`, reconnect/diagnostics/fullscreen IDs) verbatim and treated them as immutable during styling work.
- Chose additive token-based depth/orbit styling (glow halos, telemetry overlays, layered card surfaces) using existing `--mps-*` variables instead of introducing dependency or palette-silo changes.

## 2026-02-26 — T15 CI/docs synchronization decisions

- Added strict docs parity verification to `.github/workflows/quality-gates.yml` so contract drift is blocked in CI at the same layer where lint/type/test/build already run.
- Added `workflow_dispatch` input wiring for `MPS_GATE_FORCE_FAIL` while keeping default push and pull_request behavior unchanged, preserving deterministic force-fail compatibility without altering baseline gate commands.
- Updated docs parity inference for fullscreen capability to read both `apps/web/src/onboarding/runtime.ts` and `apps/web/src/wall/controls-section.ts`, matching post-modularization selector ownership.
