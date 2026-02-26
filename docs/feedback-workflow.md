# Feedback and contribution workflow

## Issues-only feedback policy

Media Poster Space accepts product feedback, bugs, and feature requests through GitHub Issues only.

- Use Issues for bug reports.
- Use Issues for capability gaps and docs drift reports.
- Use Issues for feature proposals.

Pull requests should link to an issue whenever possible.

## Open source operating rules

- License: AGPL-3.0-only.
- Runtime scope in V1: Desktop and Web with shared core and documented exceptions.
- Quality gates are mandatory before release packaging.
- Documentation must match shipped behavior. Run docs parity checks before finalizing release or docs changes.

## Maintainer verification checklist

```bash
pnpm -w verify:docs-parity
pnpm -w verify:docs-parity --strict
pnpm -w verify:release-artifacts
```

If any command fails, open or update an issue, then fix the drift before release.
