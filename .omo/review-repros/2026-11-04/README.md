# Review repros — 2026-11-04

Throwaway reproductions behind `.omo/knowledges/project-review-2026-11-04.md`. They are not part of
any package's test suite (no package `include` glob reaches `.omo/`), so `pnpm -w test` ignores them.

**Test doubles:** every repro uses fake providers / mocked `fetch` / jsdom shaped after Jellyfin
responses. None of them talks to a real media server, Tauri runtime or OS keychain.

**Assertion direction differs per group — read before using one as a TDD starting point:**

| Group | Files | Today | After the fix |
|---|---|---|---|
| `queue/` | `queue-repro.test.ts` R1, R2, R3, R5 | fail (assert correct behaviour) | pass |
| `queue/` | `queue-repro.test.ts` R4 | pass (prints retry counts only) | — |
| `onboarding/` | `*.repro.test.ts` | pass (assert the buggy behaviour) | fail → invert into a real test |
| `apps/` | `*.repro.test.ts` | pass (assert the buggy behaviour), except the desktop relaunch case below | fail → invert |
| `providers/`, `queue/*.mjs` | scripts | print observations, no assertions | — |

`apps/desktop-lifecycle.repro.test.ts` › "relaunch at '/' …" fails today: the desktop `render()`
re-entrancy is real (synchronous `requestRender()`), but on relaunch a later platform-init render
heals it before the assertion. The Back / "Return to onboarding" variants in
`desktop-back.repro.test.ts` do reproduce.

## Run

```bash
cd packages/core && node_modules/.bin/vitest run --root ../../.omo/review-repros/2026-11-04/queue
cd packages/core && node_modules/.bin/vitest run --config ../../.omo/review-repros/2026-11-04/onboarding/vitest.node.config.mts
cd apps/desktop && node_modules/.bin/vitest run --config ../../.omo/review-repros/2026-11-04/onboarding/vitest.jsdom.config.mts
cd apps/desktop && node_modules/.bin/vitest run --config ../../.omo/review-repros/2026-11-04/apps/vitest.repro.config.mjs
node .omo/review-repros/2026-11-04/providers/repro-url.mts            # from repo root; also repro-timeout-errors / repro-ingestion / repro-contracts
node .omo/review-repros/2026-11-04/queue/diag-growth.mjs              # also diag-export / cache-tick-cost
```

Expected at review time (`9ff2172`): queue `4 failed | 1 passed`, onboarding `2 passed` + `3 passed`, apps `1 failed | 17 passed`.

Expected after the fixes (`2b9adb3`): queue `5 passed` (they assert correct behaviour); onboarding node
`1 failed | 1 passed` (`cache-size` only measures) and jsdom `3 failed`; apps `6 failed | 12 passed` —
the remaining passes only log observations or contrast with already-correct web behaviour.
`providers/repro-timeout-errors.mts` exits 0 and prints typed provider errors for every case.

`apps/probe-download-beforeunload.mjs` launches real Chromium/Firefox through Playwright
(`pnpm --filter @mps/web exec playwright install chromium firefox` first).
