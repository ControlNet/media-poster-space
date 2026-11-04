// Throwaway measurement (review only). Estimates the per-tick localStorage write
// done by onboarding-ingestion.ts syncPosterCacheToStorage once the in-memory
// poster cache has filled to POSTER_CACHE_MAX_ITEMS. Item shape mirrors the
// Jellyfin mapper (Fields=...Overview,Genres,Tags,People...). Values are
// SYNTHETIC but sized like a typical movie entry; treat result as an estimate.
import { it } from "vitest"

import { createPosterCache, POSTER_CACHE_MAX_ITEMS } from "../../../../packages/core/src/cache"
import type { MediaItem } from "../../../../packages/core/src/types"

function hex(n: number): string {
  return n.toString(16).padStart(32, "0")
}

function realisticItem(index: number): MediaItem {
  const id = hex(index)
  const base = "https://jellyfin.example.com"
  return {
    id,
    providerId: "jellyfin",
    libraryId: hex(999_999),
    kind: "movie",
    title: `Synthetic Movie Title ${index}`,
    sortTitle: `synthetic movie title ${index}`,
    overview: "x".repeat(400),
    year: 2001,
    runtimeMs: 7_200_000,
    communityRating: 7.1,
    criticRating: 81,
    genres: ["Drama", "Science Fiction", "Thriller"],
    tags: ["tag-one", "tag-two"],
    people: Array.from({ length: 40 }, (_, p) => `Person Name ${p}`),
    poster: { url: `${base}/Items/${id}/Images/Primary?tag=${hex(index + 1)}&quality=90` },
    backdrop: { url: `${base}/Items/${id}/Images/Backdrop?tag=${hex(index + 2)}&quality=90` },
    logo: { url: `${base}/Items/${id}/Images/Logo?tag=${hex(index + 3)}&quality=90` },
    dateAdded: "2024-01-01T00:00:00.0000000Z",
    dateUpdated: "2024-01-01T00:00:00.0000000Z",
    premiereDate: "2001-01-01T00:00:00.0000000Z"
  }
}

it("measures a full poster-cache snapshot", () => {
  const cache = createPosterCache<MediaItem>()
  // The controller calls setMany with the ~40-item queue each tick; entries are never
  // removed except by TTL/eviction, so over time the cache reaches maxItems.
  for (let start = 0; start < POSTER_CACHE_MAX_ITEMS; start += 40) {
    const batch = Array.from({ length: 40 }, (_, k) => realisticItem(start + k))
    cache.setMany(batch.map((value) => ({ key: value.id, value })), { ttlMs: 30 * 24 * 3_600_000 })
  }
  const entries = cache.list({ touch: false, sortByScore: false }).length
  const t0 = performance.now()
  const json = JSON.stringify(cache.toSnapshot())
  const t1 = performance.now()
  console.log(`entries=${entries} snapshotChars=${json.length} (~${(json.length / 1_048_576).toFixed(2)} Mi chars) stringifyMs=${(t1 - t0).toFixed(1)}`)
})
