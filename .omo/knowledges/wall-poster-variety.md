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

## Follow-up: 4K pool and shuffled order (2026-11-07)

The user runs a 4K display and asked for a shuffled order on every launch.

- **Pool sized to the wall.** `resolveRuntimePosterQueuePolicyForWallTileCount(tiles)` gives target `max(120, ceil(tiles * 4/3))` and low watermark `max(60, ceil(target/2))`. That is 120/60 at 1080p (90 tiles) and 363/182 at 4K (272 tiles = 8 rows x 34). At 2560x1440 (a 4K panel at 150% scaling) it is 144 tiles, giving 192/96. The controller reads `resolveWallTileCount` (default `resolveWallPosterViewportTileCount()`, the window the grid is built for) on every policy call, so it follows resize and fullscreen.
- **On-screen repeats.** The first render uses the first page (100 posters) for a 272-tile wall, and the stream only wrote to off-screen tiles, so visible repeats stayed until a tile scrolled off. The middle columns never scroll off. The replacement ranking is now: off-screen duplicate, then on-screen duplicate, then oldest off-screen tile. An on-screen tile showing a poster that appears only there is never touched. 4K e2e results: before, 230 / 272 distinct overall and 85 / 127 visible; after, 272 / 272 and 127 / 127 right after entering the wall.
- **Shuffle.** The controller shuffles (Fisher-Yates, `random` option, default `Math.random`):
  - every runtime page;
  - the cache-hydrate seed, which goes through the same `setQueueRefillSourceItems`;
  - every adapter batch;
  - each wrap-around pass over a library delivered whole.
- **Page comparison.** A republished page is recognised by its identities *in delivery order* (`queueRefillSourcePageIdentities`). Comparing against the shuffled copy resets the read position; the test "keeps its place in a page that the runtime publishes again" catches that.
- **Paging is unchanged.** The server still pages `SortBy=DateCreated` desc. Server-side `SortBy=Random` was rejected: each request is independently random, so cursor pages overlap and whole-library and continue-after-page detection break.
- **Cold-start caveat.** A first run, or a run after the cache expired, shows the newest pages shuffled. A warm start shows the cached pool (wherever the last session drifted to) shuffled. A truly random start position in the library would need `TotalRecordCount` on `MediaPage` plus a provider-side random offset.
- **Multi-page libraries smaller than the pool.** `wholeLibraryDelivered` used to be set only for a one-page library. A library spread over several pages but smaller than the pool never filled the queue, so it fetched from the server on every stream tick. That covered 101–119 items at 1080p and 101–362 at 4K (751 requests in 750 ticks for 250 items). The controller now records the distinct posters of a pass: the runtime's first page, then the adapter's pages. When the adapter's cursor returns to `null` after a pass that began at the start of the library, and that pass is smaller than the wall's pool, the library is cycled from memory. Test: "cycles a N-poster library spread over pages from memory" (at most 3 requests).
- **Test helpers** in `packages/core/test/fixtures.ts`:
  - `keepDeliveredOrder` (`1 - Number.EPSILON`): Fisher-Yates swaps each item with itself, for tests that assert on order;
  - `createSeededRandom(seed)` (mulberry32).

## Known follow-ups (not done)

- Rows jump back at the end of each `mps-wall-row-scroll` cycle, and the middle columns never leave the screen; a continuous conveyor animation would fix both and let the centre refresh too.
- Random start position across the whole library (see cold-start caveat above).
