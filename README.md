# Media Poster Space

<div align="center">
    <img src="https://img.shields.io/github/stars/ControlNet/media-poster-space?style=flat-square">
    <img src="https://img.shields.io/github/forks/ControlNet/media-poster-space?style=flat-square">
    <a href="https://github.com/ControlNet/media-poster-space/issues"><img src="https://img.shields.io/github/issues/ControlNet/media-poster-space?style=flat-square"></a>
    <img src="https://img.shields.io/github/license/ControlNet/media-poster-space?style=flat-square">
</div>

Media Poster Space is an open source poster-wall project on **Web** and **Desktop**.

**Web**: Visit [https://mps.controlnet.space/](https://mps.controlnet.space/).

**Desktop**: Download [windows-x64](https://nightly.link/ControlNet/media-poster-space/workflows/quality-gates.yml/master/desktop-windows-x64-native.zip), [linux-x64](https://nightly.link/ControlNet/media-poster-space/workflows/quality-gates.yml/master/desktop-linux-x64-native.zip), [macos-arm64](https://nightly.link/ControlNet/media-poster-space/workflows/quality-gates.yml/master/desktop-macos-arm64-native.zip).

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
pnpm -w build:release
pnpm -w verify:release-artifacts
pnpm -w verify:docs-parity
pnpm -w verify:docs-parity --strict
```

All root commands run through the Turbo pipelines defined in `turbo.json`.

### Package-level commands

```bash
pnpm --filter @mps/core typecheck
pnpm --filter @mps/core test

pnpm --filter @mps/web typecheck
pnpm --filter @mps/web test
pnpm --filter @mps/web build
pnpm --filter @mps/web e2e

pnpm --filter @mps/desktop typecheck
pnpm --filter @mps/desktop test
pnpm --filter @mps/desktop build
pnpm --filter @mps/desktop tauri:build
```

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
