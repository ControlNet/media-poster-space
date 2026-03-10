# media-poster-space

Media Poster Space is an AGPL-3.0-only open source project that ships the same V1 poster-wall product for Desktop and Web, with platform exceptions documented in-repo.

## V1 documentation

- Capability matrix: `docs/capability-matrix.md`
- Poster-wall design principles: `docs/poster-wall-design-principles.md`
- Current implementation snapshot: `docs/current-implementation.md`
- Must-pass gates and evidence naming: `docs/quality-gates.md`
- Issues-only feedback and contribution flow: `docs/feedback-workflow.md`
- Gate evidence protocol details: `docs/evidence-protocol.md`

## Setup

```bash
pnpm -w install
```

## Workspace scripts

- `pnpm -w lint`
- `pnpm -w typecheck`
- `pnpm -w test`
- `pnpm -w build`
- `pnpm -w e2e`
- `pnpm -w build:release`
- `pnpm -w verify:release-artifacts`
- `pnpm -w verify:docs-parity`
- `pnpm -w verify:docs-parity --strict`

All scripts run through Turbo pipelines defined in `turbo.json`.

## AGPL scope

This repository is licensed under AGPL-3.0-only. If you run a modified version as a network service, provide corresponding source to users under the AGPL terms. See `LICENSE` for the full text.
