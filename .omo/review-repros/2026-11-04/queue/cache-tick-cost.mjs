// Throwaway: cost of the per-stream-tick cache write path used by
// onboarding-ingestion.ts cacheIngestionItems(): setMany(queue items) + JSON.stringify(toSnapshot()).
import { createPosterCache } from "../../../../packages/core/src/cache/poster-cache.ts";

let nowMs = Date.UTC(2026, 10, 1);
const cache = createPosterCache({ now: () => nowMs });

function item(i) {
  const s = String(i).padStart(5, "0");
  return {
    id: `a1b2c3d4e5f6a7b8c9d0e1f2a3b4${s}`,
    providerId: "jellyfin",
    libraryId: "f137a2dd21bbc1b99aa5c0f6bf02a805",
    kind: "movie",
    title: `Some Movie Title ${s}`,
    sortTitle: `some movie title ${s}`,
    overview: "x".repeat(600),
    year: 2001,
    runtimeMs: 7_200_000,
    communityRating: 7.4,
    genres: ["Drama", "Thriller"],
    tags: [],
    people: Array.from({ length: 12 }, (_, k) => `Actor Name ${k}`),
    poster: { url: `https://jellyfin.example.net/Items/${s}/Images/Primary?tag=0123456789abcdef0123456789abcdef&quality=90` },
    backdrop: { url: `https://jellyfin.example.net/Items/${s}/Images/Backdrop/0?tag=0123456789abcdef0123456789abcdef` },
    dateAdded: "2024-01-01T00:00:00.0000000Z",
    premiereDate: "2001-01-01T00:00:00.0000000Z"
  };
}

for (let i = 0; i < 1200; i += 1) {
  cache.set(item(i).id, item(i), { ttlMs: 30 * 86_400_000 });
}

const queue = Array.from({ length: 40 }, (_, k) => item(2000 + k));
const N = 50;
let bytes = 0;
const t0 = performance.now();
for (let tick = 0; tick < N; tick += 1) {
  nowMs += 1000;
  cache.setMany(queue.map((m) => ({ key: m.id, value: m })), { ttlMs: 30 * 86_400_000 });
  const json = JSON.stringify(cache.toSnapshot());
  bytes = json.length;
}
const perTick = (performance.now() - t0) / N;
console.log(`entries=${cache.getStats().itemCount} snapshotChars=${(bytes / 1e6).toFixed(2)}M perTickMs=${perTick.toFixed(2)} (setMany(40) + stringify, excluding localStorage.setItem)`);
