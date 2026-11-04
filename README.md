# Media Poster Space

<div align="center">
    <img src="https://img.shields.io/github/stars/ControlNet/media-poster-space?style=flat-square">
    <img src="https://img.shields.io/github/forks/ControlNet/media-poster-space?style=flat-square">
    <a href="https://github.com/ControlNet/media-poster-space/issues"><img src="https://img.shields.io/github/issues/ControlNet/media-poster-space?style=flat-square"></a>
    <img src="https://img.shields.io/github/license/ControlNet/media-poster-space?style=flat-square">
</div>

Media Poster Space is an open source poster-wall project on **Web** and **Desktop**.

**Web**: Visit [https://mps.controlnet.space/](https://mps.controlnet.space/).

**Desktop**: Download [windows-x64](https://github.com/ControlNet/media-poster-space/releases/latest/download/mps-desktop-windows-x64.exe), [linux-x64](https://github.com/ControlNet/media-poster-space/releases/latest/download/mps-desktop-linux-x64.AppImage), [macos-arm64](https://github.com/ControlNet/media-poster-space/releases/latest/download/mps-desktop-macos-arm64.app.zip), or see all [releases](https://github.com/ControlNet/media-poster-space/releases).

![screenshot](assets/screenshot.webp)

## Run locally

### Setup

This repository uses **pnpm workspaces** and **Turborepo**.

```bash
pnpm -w install
```

### Web

```bash
pnpm --filter @mps/web dev
```

### Desktop UI

```bash
pnpm --filter @mps/desktop dev
```

### Desktop with Tauri shell

```bash
pnpm --filter @mps/desktop tauri:dev
```

## Workspace commands

### Root workspace

```bash
pnpm -w lint
pnpm -w typecheck
pnpm -w test
pnpm -w build
pnpm -w e2e
pnpm -w e2e:web
pnpm -w build:release
pnpm -w verify:release-artifacts
pnpm -w verify:versions
pnpm -w verify:docs-parity
pnpm -w verify:docs-parity --strict
```

Lint, typecheck, test, build, e2e and `build:release` run through the Turbo pipelines defined in `turbo.json`; the `verify:*` commands are plain Node scripts. `pnpm -w e2e` runs the full web Playwright suite, `pnpm -w e2e:web` runs that suite followed by the web V1 gates, `pnpm -w build:release` writes the web static archive, changelog and metadata under the gitignored `release/` directory, and `pnpm -w verify:versions` checks that every `package.json`, `tauri.conf.json` and `Cargo.toml` declares the same version.

### Package-level commands

```bash
pnpm --filter @mps/core typecheck
pnpm --filter @mps/core test

pnpm --filter @mps/web typecheck
pnpm --filter @mps/web test
pnpm --filter @mps/web build
pnpm --filter @mps/web e2e
pnpm --filter @mps/web e2e:web

pnpm --filter @mps/desktop typecheck
pnpm --filter @mps/desktop test
pnpm --filter @mps/desktop build
pnpm --filter @mps/desktop e2e:desktop
pnpm --filter @mps/desktop tauri:build
```

`@mps/web e2e` runs every Playwright spec except `e2e/gates/`; `@mps/web e2e:web` and `@mps/desktop e2e:desktop` run the mandatory V1 gates and verify their metrics.

## Quality gates

Release quality is gate-driven. If the gates fail, release work is not complete.

Primary gate command:

```bash
pnpm -w turbo run e2e:web e2e:desktop
```

Documentation parity checks:

```bash
pnpm -w verify:docs-parity
pnpm -w verify:docs-parity --strict
```

For thresholds, failure-path testing, and evidence naming, see `docs/quality-gates.md`.

## License

This repository is licensed under **AGPL-3.0**.
