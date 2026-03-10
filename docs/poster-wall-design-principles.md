# V1 poster-wall design principles

This document records the frontend design contract for the V1 poster wall.
Source of truth is the shipped runtime and gate contracts in this repository, with this file documenting implementation-facing rules.

## 1) Visual direction: Afterglow Orbit

- The wall uses an Afterglow Orbit visual language, dark cinematic base, orbital glow layers, telemetry accents, and high readability.
- Motion and composition should feel like an ambient, screen-saver-style media surface, not a static catalog grid.
- The visual baseline must remain usable when advanced rendering paths are unavailable (Canvas/WebGL fallback behavior).

## 2) Scene composition and motion rules

- Multi-layer parallax wall with medium-slow horizontal drift.
- Global micro-shift cadence every 45 seconds.
- Profile-driven relayout cycles:
  - `balanced`: 90-second cycle
  - `showcase`: 60-second cycle
- Risk-triggered early relayout is required when OLED risk metrics approach thresholds.

## 3) OLED safety constraints (non-optional)

The wall must continuously enforce these constraints:

- Focus-card static duration <= 12s
- Highlight static duration <= 15s
- Highlight area ratio <= 12%

If risk is detected, relayout/motion correction must trigger automatically (no manual intervention required).

## 4) Content selection and wall payload rules

- Only selected libraries are eligible for ingestion.
- Items without usable poster art are excluded from the render queue.
- TV presentation is series-level in the wall surface (not season/episode tiles).
- Scheduled refresh and manual refresh should both be available.

## 5) Interaction model (light-interaction wall)

- Poster tiles are hover-reactive surfaces; click/tap does not open detail card in the current V1 implementation.
- Wall controls + detail card auto-hide after 8 seconds of idle time.
- Interaction transitions should remain in the 240-320ms range.
- Wall controls auto-hide after 8 seconds of idle time.
- Interaction transitions should remain in the 240-320ms range for controls and diagnostics reveals.
- Overlay layers must not create pointer dead-zones over the wall surface; non-interactive overlays should remain pass-through.

### Explicit V1 interaction boundaries

- No playback controls.
- No poster tile click-selection workflow.
- No expanded keyboard control set beyond required onboarding and diagnostics actions.

## 6) Diagnostics and resilience expectations

- Diagnostics panel is part of release behavior (not debug-only).
- 1s sampling for FPS/memory/reconnect metrics.
- Crash export includes logs + version + config summary and must redact secret fields.
- Offline cached startup and reconnect behavior are first-class wall UX requirements.

## 7) Route and platform behavior

- Primary wall entry path is `/wall` after onboarding handoff.
- Web includes deterministic scene validation routes:
  - `/wall?mode=test`
  - `/wall?seed=<seed>&profile=<balanced|showcase>`
- Core wall behavior is shared across Desktop/Web, with platform exceptions tracked in `docs/capability-matrix.md`.
- Web and Desktop parity target is behavior and token parity, not pixel-identical parity. Platform exceptions remain documented.

## 8) Validation contract (must-pass)

- Gate command: `pnpm -w turbo run e2e:web e2e:desktop`
- Thresholds:
  - `login-flow-ms <= 45000`
  - `offline-cached-first-paint-ms <= 5000`
  - `token-revoked-recovery-ms <= 60000`
  - `logout-cleanup-ms <= 1000`
- Visual evidence must use fixed seed `v1-fixed-seed` and deterministic naming (see `docs/quality-gates.md` and `docs/evidence-protocol.md`).

## 9) Scope guardrails (keep the wall focused)

- No PWA install scope in V1.
- No BFF/runtime backend dependency in V1 web flow.
- No quality downgrade path that silently relaxes visual or timing gates.

## 10) Current implementation status snapshot

- Stream cadence is 1 second and aligned with diagnostics sampling.
- Queue refill policy is fixed at low-watermark `10` and refill-target `40`, with single-flight refill.
- Row updates use deterministic row ordering plus round-robin incoming item distribution to reduce synchronized visual jumps.
- Runtime behavior for click-to-open detail is disabled on both Web and Desktop.
- Wall hit-testing hardening is required: keep non-interactive overlays pass-through and avoid nested transformed animation surfaces that can destabilize hover hit targets.

## References

- `.sisyphus/plans/media-poster-space-v1.md`
- `docs/quality-gates.md`
- `docs/evidence-protocol.md`
- `docs/capability-matrix.md`
- `docs/current-implementation.md`
