import { describe, expect, it } from "vitest";

import { createPosterCache, POSTER_CACHE_DEFAULT_TTL_MS } from "../src/cache";

describe("poster cache", () => {
  it("enforces both item and total-size capacity limits", () => {
    let nowMs = Date.parse("2026-02-25T00:00:00.000Z");
    const cache = createPosterCache<{ payload: string }>({
      now: () => nowMs,
      maxItems: 3,
      maxTotalSizeBytes: 11,
      sizeOf: (value) => value.payload.length,
      hotnessWeightMs: 1,
      preheatBoostMs: 1
    });

    cache.set("poster-a", { payload: "aaaa" });
    cache.set("poster-b", { payload: "bbbb" });
    cache.set("poster-c", { payload: "cccc" });

    const firstPassKeys = cache.list({ touch: false }).map((item) => item.key);
    expect(firstPassKeys).toHaveLength(2);
    expect(firstPassKeys).toContain("poster-b");
    expect(firstPassKeys).toContain("poster-c");
    expect(cache.getStats().itemCount).toBeLessThanOrEqual(3);
    expect(cache.getStats().totalSizeBytes).toBeLessThanOrEqual(11);

    nowMs += 10;
    cache.set("poster-d", { payload: "dddd" });

    const secondPassKeys = cache.list({ touch: false }).map((item) => item.key);
    expect(secondPassKeys).toHaveLength(2);
    expect(secondPassKeys).toContain("poster-c");
    expect(secondPassKeys).toContain("poster-d");
    expect(cache.getStats().itemCount).toBeLessThanOrEqual(3);
    expect(cache.getStats().totalSizeBytes).toBeLessThanOrEqual(11);
  });

  it("expires entries after the configured 30-day ttl", () => {
    let nowMs = Date.parse("2026-02-25T00:00:00.000Z");
    const cache = createPosterCache<{ title: string }>({
      now: () => nowMs
    });

    cache.set("poster-ttl", { title: "TTL poster" });
    expect(cache.get("poster-ttl", { touch: false })).toEqual({ title: "TTL poster" });

    nowMs += POSTER_CACHE_DEFAULT_TTL_MS - 1;
    expect(cache.get("poster-ttl", { touch: false })).toEqual({ title: "TTL poster" });

    nowMs += 1;
    expect(cache.get("poster-ttl", { touch: false })).toBeNull();
  });

  it("evicts by lru + hotness so frequently accessed entries survive", () => {
    let nowMs = Date.parse("2026-02-25T00:00:00.000Z");
    const cache = createPosterCache<{ title: string }>({
      now: () => nowMs,
      maxItems: 2,
      maxTotalSizeBytes: 1_000,
      hotnessWeightMs: 1_000,
      preheatBoostMs: 1
    });

    cache.set("hot", { title: "Hot Poster" });
    for (let index = 0; index < 8; index += 1) {
      void cache.get("hot");
    }

    nowMs += 1_000;
    cache.set("cold", { title: "Cold Poster" });
    nowMs += 1;
    cache.set("new", { title: "New Poster" });

    const keys = cache.list({ touch: false }).map((item) => item.key);
    expect(keys).toHaveLength(2);
    expect(keys).toContain("hot");
    expect(keys).toContain("new");
    expect(keys).not.toContain("cold");
  });

  it("applies desktop preheat exception during eviction decisions", () => {
    let nowMs = Date.parse("2026-02-25T00:00:00.000Z");
    const cache = createPosterCache<{ title: string }>({
      now: () => nowMs,
      maxItems: 2,
      maxTotalSizeBytes: 1_000,
      hotnessWeightMs: 1,
      preheatBoostMs: 60_000
    });

    cache.set("preheated", { title: "Pinned for desktop startup" });
    cache.set("normal", { title: "Regular poster" });
    cache.markPreheated(["preheated"]);

    nowMs += 1;
    cache.set("incoming", { title: "Incoming poster" });

    const keys = cache.list({ touch: false }).map((item) => item.key);
    expect(keys).toContain("preheated");
    expect(keys).toContain("incoming");
    expect(keys).not.toContain("normal");
  });
});
