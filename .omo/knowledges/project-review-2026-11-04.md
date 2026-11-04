# Project review — 2026-11-04

Whole-repo review at commit `3d759fc`. Every finding below was re-checked against the source
(file:line read directly); evidence type is noted per item:
**repro** = failing/passing throwaway test or script, **source** = upstream primary source,
**read** = code reading only. Repros are kept in `.omo/review-repros/2026-11-04/` (see its README for
how to run them and which ones assert correct vs buggy behaviour).

Quick checks:
- Server version (finding 1 applies to 12.x; upgrading from 10.x flips it via migration):
  `curl -s https://<server>/System/Info/Public | jq -r .Version`
- Turbo blind spot (finding 8): at review time (turbo 1) `pnpm -s -w turbo run typecheck --dry=json | grep -c 'packages/core/src'`
  printed `0`. Since the fix (turbo 2, `^typecheck` deps) that grep no longer applies; instead compare the
  `@mps/web#typecheck` hash in `--dry=json` before/after touching `packages/core/src/index.ts` — it changes.
- Stream freeze on a live server (finding 2): once the wall stops changing, the network tab shows an
  `Items?…MinDateLastSavedForUser=…` request about every second returning `TotalRecordCount: 0`.

Why existing tests miss finding 2: `packages/core/test/runtime/poster-queue-refill-adapter.test.ts:145-170`
asserts the switch to `updatedSince` as intended behaviour, and no test drives the queue past one full
pass over a static library with the adapter wired (both apps wire it).

Finding 18 is a product limitation as much as a bug: the HTTPS-hosted web app cannot reach a plain
`http://` LAN server at all (mixed content), and neither README nor docs say so.

## External fact: Jellyfin 12 disables legacy auth

- Jellyfin 12.0 (2026-09-08, latest 12.4 on 2026-10-26) release notes:
  "Legacy authorization is now disabled by default, and a migration disables it on existing
  installs as well" and "Legacy route prefixes removed (`/emby/*` and `/mediabrowser/*`)".
  (`gh release view v12.0 -R jellyfin/jellyfin`; PR #15559, re-applied by #16992 after the
  temporary revert #16754.)
- Server source at tag `v12.0`, `Jellyfin.Server.Implementations/Security/AuthorizationContext.cs:93-110,233-259`:
  `X-Emby-Token`, `X-MediaBrowser-Token`, `api_key`, `X-Emby-Authorization` and the `Emby`
  scheme are only honoured when `EnableLegacyAuthorization` is true.
- Supported form: `Authorization: MediaBrowser Token="<token>"` (plus Client/Device/DeviceId/Version).

## Critical / High

1. **Post-login calls 401 on Jellyfin 12.x** (source) — `packages/core/src/providers/jellyfin/client.ts:883-888`
   sends only `X-Emby-Token`. Preflight + login pass, `listLibraries`/`listMedia` get 401.
   `:606` treats 401 on `Sessions/Logout` as success, so tokens are never revoked.
   Fix: Jellyfin → `Authorization: MediaBrowser Token="…"`; keep `X-Emby-Token` for Emby.
2. **Poster stream freezes** (repro) — `packages/core/src/runtime/poster-queue-refill-adapter.ts:131-138`
   switches to `updatedSince` (changes-only, `MinDateLastSavedForUser`) forever once the cursor
   runs out; `onboarding-ingestion.ts:216-224` never falls back to wrap-around source items;
   `:393` stamps `ingestionFetchedAt = now` on cache hydrate so a warm start's first refill is
   already changes-only; retain-last-poster (`:602-611`) keeps the queue at 1 so `:489-492`
   never reseeds. Cold start: wall goes static after one library pass; warm start: ~40 s.
3. **Desktop "encrypted" password fallback is reversible obfuscation** (read) —
   Rust `apps/desktop/src-tauri/src/lib.rs:177-221` XOR with a key = SHA-256 of a constant plus
   `serverurl::username`, which is stored in plaintext as the map key of the same
   `credential-fallback.json` (written with default perms, `:162-167`). TS
   `apps/desktop/src/features/platform/password-vault-adapter.ts:147-178` derives the AES-GCM key
   from `deviceId`, stored in localStorage (`mps.onboarding.device-id`) next to the ciphertext and
   also sent to the media server. Docs (`docs/capability-matrix.md:19`) claim "encrypted storage".
4. **Logout leaves the password in the OS keychain** (read) — logout calls `passwordVault.clearAll()`
   (`apps/desktop/src/onboarding/runtime.ts:1134`) → `platform_clear_all_credentials`
   (`lib.rs:499-502`) which only empties the fallback file. Remember-password pref + remembered
   server/username survive, so hydration (`runtime.ts:898-924`, triggered at `:1047,1263,1279`)
   refills the old password from the keychain. Failures are hidden by `Promise.allSettled`
   (`password-vault-adapter.ts:353-364`) and `let _ =` (`lib.rs:494`).
5. **Timeout covers headers only; a stalled body hangs ingestion forever** (repro) —
   `client.ts:890-902` clears the timer before `readJsonSafely` (`:904-915`) reads the body; the
   shared refresh promise in `ingestion/media-ingestion.ts` is reused, no AbortSignal on dispose.
6. **Servers behind a sub-path are unreachable** (repro) — `client.ts:105-110`: the leading `/`
   makes `new URL` drop `/jellyfin` from `https://host/jellyfin`.
7. **CI runs 1 of 22 web Playwright tests** (read + CI log) — `apps/web/package.json:14` runs only
   `e2e/gates`; `.github/workflows/quality-gates.yml:280` is the only e2e step; Pages and releases
   are gated on it. `onboarding-auth.spec.ts` (20 tests) and `wall-smoke.spec.ts` never run in CI.
8. **Turbo hashes ignore `@mps/core`** (repro via `turbo run typecheck --dry=json`) — `turbo.json`
   has no `^` deps / `globalDependencies`; web/desktop task inputs include 0 core files, so local
   `pnpm -w typecheck|test` can replay stale passes. Build `outputs: []`; e2e outputs
   `.omo/evidence/**` resolve per package and never match. CI has no cache today.

## Medium

9. `readJsonSafely` (`client.ts:904-915`) turns non-JSON / truncated bodies into `{}` (repro); with
   `onboarding-ingestion.ts:502-509` a `ready` + 0 items result clears the queue and poster cache.
10. `listLibraries`/`listMedia` (`client.ts:625-632,697-704`) throw raw `TypeError`/`DOMException`;
    `toProviderError` (`:171-176`) maps AbortError to `network`, never `timeout` (repro).
11. Races (repro): `media-ingestion.ts:206-226` publishes after `dispose()`; `onboarding-ingestion.ts:584-588`
    has no generation guard, so a late result lands in the next session and its cache key;
    `poster-queue.ts:356-365` single-flight returns the first caller's stale snapshot (consumed
    posters return, a cleared queue is resurrected; `:502-509` doesn't bump `queueLifecycleNonce`).
12. Failed refills retry every 1 s tick with no backoff (`onboarding-ingestion.ts:297-327,633`) (repro).
13. Diagnostics: a 1 Hz sample is appended forever (`onboarding-shared.ts:185-204`, retention
    7 days / 100 MB in `diagnostics.ts:2-3`, `shift()` at cap) — ~20 MB/day heap, up to ~117 MB
    (measured) — while the panel and crash export are unreachable: `onToggleDiagnostics` is never
    bound in `packages/core/src/wall/ui/controls-section.ts` (trigger removed in `4a5bb07`), yet
    `docs/capability-matrix.md:9` says both exist.
14. Poster cache is re-serialised to localStorage on every tick (`onboarding-ingestion.ts:349-354,619-621`),
    up to 1200 entries (~2 M chars), never cleared on logout, `QuotaExceededError` unhandled in the
    tick path (stalls the stream).
15. "Return to onboarding" cannot leave the wall (repro, web + desktop) —
    `onboarding-wall-callbacks.ts:41-44` keeps session + handoff, auto-resume
    (`apps/web/src/onboarding/runtime.ts:1366-1376`; desktop `runtime.ts:944-949`) bounces back.
    Desktop `render()` re-enters through synchronous `requestRender()` (`:326-332`, `:1540-1559`):
    Back/Return leaves the login form under `/wall`.
16. Desktop wall clock never updates — web has `startWallClockLoop`/`syncWallClockHeadingInPlace`,
    desktop has neither (repro: +2 h, desktop still shows mount time).
17. Web always persists the bearer token to localStorage (`apps/web/src/onboarding/runtime.ts:922-926`)
    regardless of remember toggles, on an origin that loads Google gtag (`apps/web/index.html:9-16`);
    web logout awaits server invalidation (up to 8 s) before clearing it (`runtime.ts:1038-1058`, repro).
18. Missing scheme (`192.168.1.10:8096`) and HTTPS→HTTP mixed content both surface as
    "Could not reach … server" (`client.ts:92-122,179-185`, `onboarding-workflow.ts:59-83`) (repro).
19. Display selection is persisted (`lib.rs:365-372`) but never applied — nothing moves the window;
    `docs/capability-matrix.md:20` says "Yes".
20. Swallowed errors (AGENTS.md): `password-vault-adapter.ts:48,233,325(empty),341,353-364`;
    `tauri-bridge.ts:81,98(empty)`; `lib.rs:139,156,380,387-391,424,494`; `poster-cache.ts:93`;
    `renderer-foundation.ts:38`; `apps/web/src/scene/wall-scene.ts:82`; `onboarding-shared.ts:366,378`.
21. `release-build-artifacts` packages placeholders — the "AppImage" is a bash `echo` script
    (`scripts/release/package-desktop-release.mjs:135-147`), portable tars have no binary — and is
    not in `github-release.needs` (`quality-gates.yml:291-296`); real binaries get no verification.
22. Gates are self-certifying: fps/size/duration/seed are written by the test and compared back
    (`apps/desktop/test/gates/mandatory-v1-gates.test.ts:252-258,388-396`, `scripts/verify-thresholds.mjs:131-145`);
    clips are 25 fps not 60; no golden comparison; `retries: 1` on CI (`apps/web/playwright.config.ts:9`).
23. `scripts/verify-wall-contracts.mjs` is not wired anywhere, fails today (`wall-path-constant`), and
    is satisfied by comment anchors (`apps/web/e2e/onboarding-auth.spec.ts:22-26`, after `966f379`).

## Low

24. Tauri: no CSP, `withGlobalTauri: true`, no capabilities → `platform_read_credential` (plaintext
    password) callable from any webview script; desktop display `<select>` built with `innerHTML`
    from OS monitor names (`apps/desktop/src/onboarding/runtime.ts:1352-1358`, markup injection repro).
25. Emby: `restoreSession` hits `/Users/Me` (not an Emby endpoint, `client.ts:543`; no caller yet);
    product detection relies on `ProductName`, which Emby's public info lacks (`:150-164`).
26. Validation contracts are never used in production; `criticRating` limited to 0–10 vs Jellyfin
    0–100 (`validation/contracts.ts:280-283`); persisted session/handoff parsed unchecked
    (`onboarding-shared.ts:334-381`) — `{}` handoff → blank page on every load (repro).
27. Web: provider switch after login reverts (`runtime.ts:1169-1186`); `/wall/` half-alive
    (`:448-450`); `base-path.ts:57-70` `//host` target throws at boot. Desktop: platform init dies on
    a fullscreen rejection (`runtime.ts:451-457`); wall fullscreen errors are invisible.
28. Desktop vitest `include` picks up `test/gates/**` (`apps/desktop/vitest.config.ts:6`): `pnpm -w test`
    runs the ~50 s Chromium gate (2–3× per CI job) and leaves ~3.5 MB orphan webm files.
29. `CHANGELOG.md` was generated before the first commit and is rewritten (tracked) on every
    `build:release`; only root `package.json` version is checked against the tag.
30. 34 npm advisories, all dev tooling (vite 5, vitest 2 incl. critical tinypool/UI-server, jsdom/ws,
    tailwind/picomatch, turbo 1). Runtime deps: only `@mps/core`.
31. Non-deterministic tests: real-time assertions (`apps/desktop/test/onboarding-auth.test.ts:772,922,1857`),
    real waits (`apps/web/e2e/onboarding-auth.spec.ts:996,1008`).
32. Dead code: `poster-scheduler.ts` (no caller), detail card transition (no caller).

## Checked, no issue

Token never appears in poster/image URLs; crash-export redaction covers token/password/authorization
keys and header patterns; pagination terminates; listeners on window/document are paired; render
loop cancels its RAF; GitHub Actions permissions are scoped per job and `github-release` requires
quality + e2e + native builds.

## Fix status (2026-11-04, same day)

Fixed on `master` (commits `d3beca9`, `af0f5d1`, provider merge, plus the CI/build batch):

- 1, 5, 6, 9, 10, 18, 25, 26 (providers/validation): `Authorization: MediaBrowser … Token="…"` for
  Jellyfin (`X-Emby-Token` kept for Emby); relative API URLs keep sub-paths; one timer + optional
  `AbortSignal` cover fetch **and** body; non-JSON 2xx throws a typed error; server URL must have a
  scheme; HTTPS page + `http://` non-loopback server gets an explicit mixed-content error.
  Jellyfin 12 accepts a token-only `MediaBrowser Token="…"` (server fills Client/Device from the
  device record); its header parser URL-decodes values, so `\"` escaping only works for plain values.
- 2, 11, 12: adapter restarts a **full pass** after the cursor runs out (no permanent `updatedSince`);
  warm start does not stamp `ingestionFetchedAt`; empty refill page falls back to wrap-around source
  items; refill results are enqueued onto the *current* queue; in-flight refill skips ticks; failed
  refills back off 2 s → 60 s; runtime generation guard drops results from disposed runtimes.
  Regression tests: `packages/core/test/runtime/onboarding-ingestion-stream-regressions.test.ts`.
- 13, 14: diagnostics log keeps 1/60 samples and caps entries (20 000, head-index ring);
  poster cache persisted at most every 30 s on ticks, 1.5 MB cap, `QuotaExceededError` logged,
  cleared on logout. The diagnostics toggle (`diagnostics-open`) is back in the wall navbar, so the
  panel and crash export are reachable again (tests: desktop jsdom + web e2e with a real download).
- 3, 4, 19, 20, 24 (desktop): keychain only, no local fallback (decision: no keychain ⇒ password not
  remembered + warning); Rust keeps `credentialIdentities` in `platform-state.json` so clear-all can
  delete keychain entries; legacy `credential-fallback.json` and `mps.desktop.password-vault` are
  deleted; display selection moves the window (also on start-up); Tauri CSP added;
  `<select>` built with `new Option`.
- 15, 16, 17, 27: return-to-onboarding clears the handoff; desktop `render()` coalesces re-entrant
  requests; desktop wall clock loop; web logout clears locally first; web token goes to
  localStorage only when "Remember server" is on; `/wall/` consistent; cross-origin redirect
  target ignored; provider switch drops the abandoned session.

Pitfall: `parseJson` now returns `unknown` — narrow with `isWallHandoff` / `isPersistedProviderSession`
/ `parsePosterCacheSnapshot` from `packages/core/src/runtime/onboarding-shared.ts`. Never log a
`JSON.parse` error message for stored session data: V8 quotes the input (token) in it.

Follow-ups not done: refill adapter does not forward an `AbortSignal` (late results are already
dropped by the lifecycle nonce); apps do not pass a signal to preflight/listLibraries.

CI/build/test batch (merged from the infra branch): 7 (CI runs all web e2e + gates; `web-chromium` /
`web-gates` Playwright projects), 8 (turbo 2 with `^` deps, `globalDependencies: scripts/**`,
`dist/**` outputs), 21 (placeholder desktop packages removed; `finalize-release-assets.mjs` +
`SHA256SUMS`; release job needs the artifact job), 22 (`scripts/run-gates.mjs` + `verify-thresholds.mjs
--since`; PNG headers read, no self-written fps/size), 23 (unwired wall-contract verifier deleted),
28 (desktop gate split into `vitest.gates.config.ts`), 29 (tracked CHANGELOG removed;
`verify:versions` checks all package.json + tauri.conf.json + Cargo.toml), 30 (`pnpm audit` clean:
vitest 4, vite 6, jsdom 26, turbo 2 + overrides), 31 (fake timers / `page.clock`). 32 (dead code) left as is.

Web flake found by the infra work and fixed: "limits fallback to one remount per incident" failed ~1 in
10–15 runs. Cause: web read `hasPosterTiles` *before* applying the stream, so an `applied` result that
had just mounted tiles still triggered a remount, and during an active fallback incident the telemetry
sync (which re-enables the refresh button) was skipped. Check:
`pnpm --filter @mps/web exec playwright test --project=web-chromium --grep "one remount" --repeat-each=15`.

Command meaning changes (AGENTS.md not edited — only on explicit request): `pnpm --filter @mps/web e2e`
no longer runs `e2e/gates/`; `pnpm -w e2e:web` runs the full suite then the gates; `pnpm -w test` no
longer runs the desktop Chromium gate; new `pnpm -w verify:versions`.

## Desktop runtime verification recipe (no WebDriver needed)

Throwaway keyring + data dir only; never point these at the real `$HOME`.

```bash
T=$(mktemp -d); mkdir -m 700 $T/run
# Rust credential commands against a real Secret Service (gnome-keyring in a private D-Bus session):
cd apps/desktop/src-tauri && HOME=$T XDG_DATA_HOME=$T/data XDG_RUNTIME_DIR=$T/run \
  CARGO_HOME=~/.cargo RUSTUP_HOME=~/.rustup dbus-run-session -- sh -c \
  'printf pw | gnome-keyring-daemon --unlock --components=secrets >/dev/null && cargo test -- --include-ignored'
# Real app under Xvfb (portable data dir via MPS_PORTABLE_DIR; WebKit needs the DMA-BUF renderer off):
pnpm --filter @mps/desktop exec tauri build --debug --no-bundle
WEBKIT_DISABLE_DMABUF_RENDERER=1 HOME=$T XDG_RUNTIME_DIR=$T/run MPS_PORTABLE_DIR=$T/data \
  xvfb-run -a -s "-screen 0 1920x1080x24" apps/desktop/src-tauri/target/debug/mps-desktop
```

- `import -window root` gives a black frame; capture the window id from `xwininfo -root -children` instead.
- This Xvfb ignores `xrandr --setmonitor` and `+xinerama` (one monitor only). To check that display
  selection moves the window, build with `--config '{"app":{"windows":[{…,"x":400,"y":120}]}}'`:
  no saved display → window stays at +400+120; saved `display-0-1920x1080-0,0` → +0+0.
- Verified 2026-11-04: UI renders under the CSP, IPC works, legacy `credential-fallback.json` is deleted
  at start-up, a stale saved display logs `[mps] Could not restore the selected display` and is replaced.
