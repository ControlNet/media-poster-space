# AGENTS.md

Repository guidance for coding agents working in `media-poster-space`.

## 0) Rule

The `designs` directory is for HTML-based visual design ideas for the GUI, it is for reference and read-only.

## 1) Scope and intent
- This is a pnpm + Turborepo TypeScript monorepo.
- Prefer minimal, reviewable patches that match local patterns.
- Fix root causes; avoid broad unrelated refactors.
- Keep tests deterministic (stable seeds/timestamps/artifact naming).

## 2) Rule-file discovery (Cursor / Copilot)
Checked locations:
- `.cursor/rules/**`
- `.cursorrules`
- `.github/copilot-instructions.md`

Current status: none exist in this repo.

Agent policy:
- Treat this `AGENTS.md` as the active local agent rule set.
- If Cursor/Copilot rule files are added later, merge them here and follow the stricter rule on conflicts.

## 3) Toolchain and bootstrap
- Package manager: `pnpm@8.10.0`.
- Workspaces: `apps/*`, `packages/*`.
- Pipeline orchestration: `turbo.json`.

Bootstrap command:
```bash
pnpm -w install
```

## 4) Canonical build/lint/test commands
Root workspace commands (preferred entrypoint):
```bash
pnpm -w lint
pnpm -w typecheck
pnpm -w test
pnpm -w build
pnpm -w e2e
pnpm -w build:release
pnpm -w verify:release-artifacts
pnpm -w verify:docs-parity
pnpm -w verify:docs-parity --strict
```

Turbo pipeline order:
- `lint -> typecheck -> test -> build`
- `build -> e2e`
- `build -> build:release`

Package-level commands:
```bash
pnpm --filter @mps/web dev
pnpm --filter @mps/web typecheck
pnpm --filter @mps/web test
pnpm --filter @mps/web build
pnpm --filter @mps/web e2e
pnpm --filter @mps/web e2e:web

pnpm --filter @mps/desktop dev
pnpm --filter @mps/desktop typecheck
pnpm --filter @mps/desktop test
pnpm --filter @mps/desktop build
pnpm --filter @mps/desktop e2e:desktop
pnpm --filter @mps/desktop tauri:dev
pnpm --filter @mps/desktop tauri:build

pnpm --filter @mps/core typecheck
pnpm --filter @mps/core test
```

## 5) Single-test execution (important)
Use `--` to forward args to Vitest/Playwright.

Vitest: single file
```bash
pnpm --filter @mps/web test -- test/renderer-runtime.test.ts
pnpm --filter @mps/desktop test -- test/onboarding-auth.test.ts
pnpm --filter @mps/core test -- test/ingestion/media-ingestion.test.ts
```

Vitest: single test name (`-t` / `--testNamePattern`)
```bash
pnpm --filter @mps/web test -- -t "selects primary mode when WebGL is available and cancels raf on stop/dispose"
pnpm --filter @mps/desktop test -- -t "samples on an exact 1000ms interval"
pnpm --filter @mps/core test -- -t "ingests only selected libraries and excludes entries without poster artwork"
```

Playwright: single spec / title grep
```bash
pnpm --filter @mps/web e2e -- e2e/wall-smoke.spec.ts
pnpm --filter @mps/web e2e -- --grep "wall route resolves a render mode and single visible layer family"
pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts --grep "completes preflight -> login -> library selection and enters poster wall"
```

Turbo: target one workspace from root
```bash
pnpm -w test -- --filter=@mps/web
pnpm -w test -- --filter=@mps/desktop
pnpm -w test -- --filter=@mps/core
```

## 6) Code style guidelines
### TypeScript and types
- All workspaces use strict TS: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noEmit`.
- Do not use `any`, `@ts-ignore`, or `@ts-expect-error`.
- Prefer explicit unions and typed result objects (for example `ValidationResult<T>`).
- Narrow from `unknown` with type guards; keep runtime validation explicit for external input.
- Preserve `readonly` and `as const` semantics where present.

### Imports and exports
- Prefer `import type { ... }` for type-only imports.
- Keep shared imports through `@mps/core` / `@mps/core/*`; local internals via relative paths.
- Prefer named exports for runtime modules.
- Keep `packages/core/src/index.ts` barrel exports aligned with public API changes.

### Formatting
- No ESLint/Prettier/Biome config is present; package `lint` scripts are placeholders.
- Follow file-local style to avoid churn.
- Common baseline across repo: 2-space indent + double quotes.
- Semicolons are mixed by area:
  - often present in `packages/core` and much of `apps/web`
  - often omitted in parts of `apps/desktop` and some e2e specs

### Naming
- `PascalCase`: interfaces/types/classes.
- `camelCase`: functions/variables.
- `UPPER_SNAKE_CASE`: module constants/policy values.
- test ids and URL query keys are kebab-case.

### Error handling
- Never swallow errors (`catch {}` forbidden).
- Map external failures into typed domain errors (for example `category`, `message`, `statusCode`, `retriable`).
- Never leak secrets in logs/errors/crash exports.
- Prefer explicit fallback + warning propagation over silent failure.

### Testing conventions
- Unit/integration: Vitest (`test/**/*.test.ts`).
- Web e2e: Playwright (`apps/web/e2e/**/*.spec.ts`).
- Desktop Vitest uses `jsdom` in `apps/desktop/vitest.config.ts`.
- For time-based logic, use fake timers and deterministic assertions.

## 7) Validation checklist for changes
Docs-only changes:
```bash
pnpm -w verify:docs-parity
```

Code changes (minimum):
```bash
pnpm -w lint
pnpm -w typecheck
pnpm -w test
```

UI/runtime behavior changes (also run):
```bash
pnpm -w build
pnpm -w e2e
```
