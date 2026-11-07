# Wall poster variety (2026-11-07)

User report: "the posters still look very repetitive". Root causes and fixes, with the numbers used to verify them.

## Root causes

1. **Pool far smaller than the wall.** The runtime queue (`poster-queue.ts`) held 40 posters (low watermark 10), while the wall rendered 5 rows x 160 tiles = 800 tiles (tiles per row = pool size x 4 cycles). Every tile was filled by `index % items.length`, so each poster appeared ~20 times and adjacent rows showed the same sequence.
2. **Rows far wider than their scroll range.** A row only moves 62% of the viewport width per cycle, so ~150 of the 160 tiles per row were never on screen; the stream wrote incoming posters into those invisible tiles (entry buffer of 2 tiles), so new posters were rarely seen.
3. **Refill re-served the same page.** The refill path re-fetched page 1 from the adapter (cursor reset) instead of continuing after the page the ingestion runtime had already delivered, so the wall cycled ~60 posters even for a 500-item library.
4. **Small libraries were re-fetched every tick** (pool target > library size => queue never reached the target => refill on every stream tick). Hidden in desktop tests, which relied on it.
5. **Refresh race in `media-ingestion.ts`**: a `refresh()` requested from the state listener of the final publish was swallowed because `refreshPromise` was cleared after publishing.

## Fixes

- Row tile count = `ceil(w * (0.38 + 1 + 0.62) / 240) + 2` (1280->13, 1920->18, 3840->34). `w` is the viewport width in px; 0.38 w is the measured leading offset of the 168vw-wide grid (it starts at about -0.372 w), 0.62 w is the scroll range.
- Initial fill order spreads distinct posters from the always-visible centre outwards, so repeats (if the pool is smaller than the wall) land on the edges.
- Stream writes go to off-screen tiles (entry side nearest first, then exit side), round-robin across rows, replacing duplicates first and then the least-recently-written tile; an incoming poster already on a tile is skipped.
- Queue policy 60/120 (a 1080p wall has 90 tiles). For a library delivered whole and smaller than 120, the policy shrinks to the library size and cycles from memory (no network).
- Refill: unused items of the delivered page first, then the adapter starting at the runtime's `nextCursor`, then wrap. A changed page (manual/scheduled refresh) is enqueued immediately.
- `media-ingestion.ts`: `refreshPromise` is cleared before the final publish; `finally` only clears its own promise.

## Numbers (web e2e, 500-item fixture library)

- 1080p: visible duplicates 0 (before: many); 431 / 500 posters seen in 10 simulated minutes (before: 143).
- 4K converges to all-unique visible tiles within a few minutes (initially some repeats on edges).

## Measurement method

- `apps/web/e2e/wall-poster-variety.spec.ts`.
- `page.clock` drives timers (the 1 s stream tick) but **not** CSS animations. To check row coverage at the scroll/float extremes, pause every animation from `document.getAnimations()` and set `currentTime` to `duration * progress`.
- Poster identity is read from the tile thumb's `background-image` URL (`/Items/<id>/`).

## Test lesson (desktop)

`apps/desktop/test/onboarding-auth.test.ts` clicked "refresh" while the previous refresh request was still in flight; a click then joins the in-flight refresh instead of starting a request. The tests only passed because of the old per-tick re-fetch spam. Wait for outstanding fetches (`Promise.allSettled(fetch.mock.results...)`) and for the button to be enabled before clicking.

## Known follow-ups (not done)

- Rows jump back at the end of each `mps-wall-row-scroll` cycle, and the middle columns never leave the screen; a continuous conveyor animation would fix both and let the centre refresh too.
- Ordering is newest-first (`SortBy=DateCreated` desc) on every launch; a shuffled start is a product decision.
