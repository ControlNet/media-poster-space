# Current implementation snapshot (March 2026)

This document summarizes the currently implemented behavior for the V1 wall runtime.
It complements `docs/capability-matrix.md` and `docs/poster-wall-design-principles.md` with an implementation-focused status view.

## Shared architecture

- The project ships one shared TypeScript core runtime (`packages/core`) consumed by Web and Desktop onboarding runtimes.
- Core wall behavior (ingestion, queueing, stream patching, diagnostics sampling, reconnect behavior) is shared.
- Platform-specific differences remain limited to documented exceptions (for example browser Fullscreen API on Web, OS-keychain password persistence and display selection on Desktop).

## Wall ingestion and stream pipeline

- Diagnostics sampling interval is 1 second (`DIAGNOSTICS_SAMPLING_INTERVAL_MS = 1000`).
- Wall stream tick on Web and Desktop follows the same 1-second cadence (`WALL_STREAM_INTERVAL_MS = DIAGNOSTICS_SAMPLING_INTERVAL_MS`).
- Runtime poster queue policy is:
  - low watermark: `10`
  - refill target: `40`
  - single-flight refill guard (only one refill request in flight); a refill result is added to the queue as it is when the refill completes
  - failed refills back off exponentially (2 s up to 60 s)
  - after a full pass over the selected libraries the next refill starts a new full pass (no changes-only queries), so a static library keeps rotating
- The poster cache is persisted to `localStorage` (capped at 1.5 MB) after each ingestion and at most every 30 s during streaming, and is cleared on logout.
- The diagnostics log keeps one in every 60 samples and is bounded by age, size and entry count.
- Stream patching updates poster tiles incrementally instead of forcing full view remounts.

## Poster wall presentation behavior

- Poster rows are generated from deterministic row-level ordering (`createWallPosterRowOrder`) for stable-but-varied row content.
- Incoming stream items are distributed row-by-row in round-robin fashion (`consumeWallPosterIncomingRowIndex`) to avoid synchronized all-row jumps.
- Poster tiles remain hover-reactive (`mouseenter` / `mouseleave` transform and filter updates).

## Interaction model (current)

- Poster tile click-to-open-detail behavior has been removed in Web and Desktop runtimes.
- Detail card remains part of the wall composition but is not opened via poster tile click in the current flow.
- Controls are accessible from the wall controls panel, including the diagnostics toggle (`diagnostics-open`), which opens the diagnostics panel with crash export.
- "Return to onboarding" clears the wall handoff (the session stays) so the user stays on the onboarding screen instead of being sent back to the wall.

## Hover-hit stability hardening

Recent wall interaction hardening includes:

- Non-interactive fixed overlays set to pass-through pointer behavior (`pointer-events: none`).
- Controls container kept pass-through with pointer re-enabled only on interactive controls.
- Wall shell reduced to a single active transformed animation surface for better hit-testing stability (removed nested transform animation on `wallCard`).

## Verification baseline

The implementation above is validated by the repository gate flow, including:

- core tests
- web tests + web e2e
- desktop tests
- workspace typecheck
- workspace build and e2e pipelines

See `docs/quality-gates.md` and `docs/evidence-protocol.md` for gate and evidence contracts.
