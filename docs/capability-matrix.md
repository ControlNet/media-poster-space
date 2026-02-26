# V1 capability matrix

This matrix describes shipped behavior for V1 and documented platform exceptions.

## Shared behavior

- Provider coverage is Jellyfin only in V1.
- Core onboarding flow is server preflight, sign-in, then library selection.
- Manual refresh, reconnect guidance, diagnostics panel, and crash export are present on both Desktop and Web.
- Offline cached startup support exists on both platforms.
- Redesign parity target is behavior and token parity across Desktop and Web, with documented platform exceptions.

## Desktop vs Web

| Capability | Desktop | Web | Source of truth |
| --- | --- | --- | --- |
| Password persistence | Yes (encrypted storage) | No | `apps/desktop/src/onboarding/runtime.ts`, `apps/web/src/onboarding/runtime.ts` |
| Display selection | Yes | No | `apps/desktop/src/onboarding/runtime.ts`, `apps/desktop/src/features/platform/tauri-bridge.ts` |
| Autostart | Yes (disabled in portable mode) | No | `apps/desktop/src/onboarding/runtime.ts`, `apps/desktop/src/features/platform/tauri-bridge.ts` |
| Fullscreen control | No (managed by windowing system) | Yes (browser Fullscreen API) | `apps/web/src/onboarding/runtime.ts` |
| Offline cached startup | Yes | Yes | `apps/desktop/src/onboarding/runtime.ts`, `apps/web/src/onboarding/runtime.ts` |
| PWA install | No | No | `apps/web/package.json` and no service worker / web manifest in `apps/web` |
| Playback controls | No | No | V1 scope guardrail from plan, no playback control runtime implemented |
| Provider coverage | Jellyfin only | Jellyfin only | `createJellyfinMediaProvider()` usage in web and desktop runtimes |

## Risk-accepted constraints

- Web runtime stays static and direct to Jellyfin, with client-held token flow.
- No BFF runtime dependency in V1.
- No code signing or notarization in V1.
