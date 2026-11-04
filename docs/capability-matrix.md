# V1 capability matrix

This matrix describes shipped behavior for V1 and documented platform exceptions.

## Shared behavior

- Provider coverage is Jellyfin and Emby in V1, while Plex remains out of scope.
- Core onboarding flow is server preflight, sign-in, then library selection.
- Manual refresh and reconnect guidance are present on both Desktop and Web.
- Diagnostics are sampled and retained in memory (bounded), but the wall currently has no control that opens the diagnostics panel or crash export; they are not reachable from the UI in V1.
- Offline cached startup support exists on both platforms.
- Redesign parity target is behavior and token parity across Desktop and Web, with documented platform exceptions.
- Wall stream policy is shared across platforms (1s cadence, queue low-watermark `10`, refill target `40`).
- Poster tile click-to-open detail is disabled on both platforms in current V1 behavior.

## Desktop vs Web

| Capability | Desktop | Web | Source of truth |
| --- | --- | --- | --- |
| Password persistence | Yes (OS keychain only) | No | `apps/desktop/src/onboarding/runtime.ts`, `apps/web/src/onboarding/runtime.ts` |
| Display selection | Yes (moves the window to the chosen monitor) | No | `apps/desktop/src/onboarding/runtime.ts`, `apps/desktop/src/features/platform/tauri-bridge.ts` |
| Autostart | Yes (disabled in portable mode) | No | `apps/desktop/src/onboarding/runtime.ts`, `apps/desktop/src/features/platform/tauri-bridge.ts` |
| Fullscreen control | Yes (Tauri window fullscreen) | Yes (browser Fullscreen API) | `apps/web/src/onboarding/runtime.ts` |
| Poster tile click opens detail card | No | No | `packages/core/src/runtime/onboarding-wall-callbacks.ts`, `packages/core/src/wall/ui/presentation-sections.ts` |
| Offline cached startup | Yes | Yes | `apps/desktop/src/onboarding/runtime.ts`, `apps/web/src/onboarding/runtime.ts` |
| PWA install | No | No | `apps/web/package.json` and no service worker / web manifest in `apps/web` |
| Playback controls | No | No | V1 scope guardrail from plan, no playback control runtime implemented |
| Provider coverage | Jellyfin + Emby | Jellyfin + Emby | `createJellyfinMediaProvider()` and `createEmbyMediaProvider()` usage in web and desktop runtimes |

## Risk-accepted constraints

- Web runtime stays static and direct to Jellyfin/Emby, with client-held token flow. The access token is kept in `sessionStorage`; it is copied to `localStorage` only when "Remember server" is checked.
- Desktop remembers passwords only in the OS keychain (Secret Service on Linux). Without a keychain the password is not remembered and a warning is shown; there is no local-file fallback. Logout removes remembered passwords from the keychain.
- The hosted HTTPS web app cannot reach a plain `http://` server (browser mixed-content blocking), except `localhost`. Use an `https://` address (for example behind a reverse proxy) or the desktop app.
- No BFF runtime dependency in V1.
- No code signing or notarization in V1.
