import { describe, expect, it, vi } from "vitest";

import {
  consumeRuntimePosterQueueItem,
  createRuntimePosterQueueState,
  createRuntimePosterQueueRefillRuntime
} from "../../src/runtime";
import type { RuntimePosterQueueState } from "../../src/runtime";
import type { MediaItem } from "../../src/types";

function createMediaItem(overrides: Partial<MediaItem> & Pick<MediaItem, "id">): MediaItem {
  return {
    id: overrides.id,
    providerId: overrides.providerId ?? "jellyfin",
    libraryId: overrides.libraryId ?? "library-main",
    kind: overrides.kind ?? "movie",
    title: overrides.title ?? `Title ${overrides.id}`,
    ...(overrides.sortTitle ? { sortTitle: overrides.sortTitle } : {}),
    ...(overrides.originalTitle ? { originalTitle: overrides.originalTitle } : {}),
    ...(typeof overrides.year === "number" ? { year: overrides.year } : {}),
    genres: overrides.genres ?? [],
    tags: overrides.tags ?? [],
    people: overrides.people ?? [],
    poster: overrides.poster ?? { url: `https://poster.local/${overrides.id}.jpg` }
  };
}

function createMediaBatch(count: number, startIndex = 1): MediaItem[] {
  return Array.from({ length: count }, (_, offset) => {
    const suffix = String(startIndex + offset).padStart(3, "0");
    return createMediaItem({ id: `media-${suffix}` });
  });
}

function createDeferredPromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject
  };
}

describe("runtime poster queue refill runtime", () => {
  it("enforces deterministic refill boundaries at queue sizes 9, 10, 39, and 40", async () => {
    const boundaryCases = [
      {
        queueSize: 9,
        shouldFetch: true,
        expectedRequestedCount: 31,
        expectedReason: "low-watermark" as const,
        expectedNextSize: 40
      },
      {
        queueSize: 10,
        shouldFetch: false,
        expectedRequestedCount: 0,
        expectedReason: null,
        expectedNextSize: 10
      },
      {
        queueSize: 39,
        shouldFetch: false,
        expectedRequestedCount: 0,
        expectedReason: null,
        expectedNextSize: 39
      },
      {
        queueSize: 40,
        shouldFetch: false,
        expectedRequestedCount: 0,
        expectedReason: null,
        expectedNextSize: 40
      }
    ];

    for (const testCase of boundaryCases) {
      const runtime = createRuntimePosterQueueRefillRuntime();
      const state: RuntimePosterQueueState = {
        items: createMediaBatch(testCase.queueSize),
        bootstrapPending: false
      };
      const fetchItems = vi.fn(async (requestedCount: number) => {
        return createMediaBatch(requestedCount, 1_000 + testCase.queueSize);
      });

      const result = await runtime.refillIfNeeded({
        state,
        fetchItems
      });

      expect(result.requestedCount).toBe(testCase.expectedRequestedCount);
      expect(result.reason).toBe(testCase.expectedReason);
      expect(result.nextState.items).toHaveLength(testCase.expectedNextSize);

      if (testCase.shouldFetch) {
        expect(fetchItems).toHaveBeenCalledTimes(1);
        expect(fetchItems).toHaveBeenCalledWith(testCase.expectedRequestedCount);
        expect(result.skipped).toBe(false);
      } else {
        expect(fetchItems).not.toHaveBeenCalled();
        expect(result.skipped).toBe(true);
      }
    }
  });

  it("prevents repeats before first cycle exhaustion for catalogs with at least 40 unique items", async () => {
    const runtime = createRuntimePosterQueueRefillRuntime();
    const catalog = createMediaBatch(80);
    let fetchCursor = 40;
    const fetchItems = vi.fn(async (requestedCount: number) => {
      const nextItems = catalog.slice(fetchCursor, fetchCursor + requestedCount);
      fetchCursor += nextItems.length;
      return nextItems;
    });

    let state = createRuntimePosterQueueState({
      items: catalog.slice(0, 40)
    });
    const consumedIds: string[] = [];
    let refillCount = 0;

    for (let index = 0; index < 40; index += 1) {
      const consumeResult = consumeRuntimePosterQueueItem({ state });
      if (!consumeResult.consumedItem) {
        throw new Error("Expected queue consume to return a media item before cycle exhaustion");
      }

      consumedIds.push(consumeResult.consumedItem.id);
      state = consumeResult.nextState;

      if (consumeResult.refillIntent.shouldRefill) {
        const refillResult = await runtime.refillIfNeeded({
          state,
          fetchItems
        });
        refillCount += 1;
        state = refillResult.nextState;
      }
    }

    expect(new Set(consumedIds).size).toBe(40);
    expect(consumedIds).toEqual(catalog.slice(0, 40).map((item) => item.id));
    expect(refillCount).toBe(1);
    expect(fetchItems).toHaveBeenCalledTimes(1);
    expect(fetchItems).toHaveBeenCalledWith(31);
  });

  it("allows controlled repeats for catalogs smaller than 40 without duplicate enqueue inflation", async () => {
    const runtime = createRuntimePosterQueueRefillRuntime();
    const catalog = createMediaBatch(12);
    const fetchItems = vi.fn(async (requestedCount: number) => {
      expect(requestedCount).toBe(31);
      return catalog;
    });

    let state: RuntimePosterQueueState = {
      items: catalog,
      bootstrapPending: false
    };
    const consumedBeforeRefill: string[] = [];

    for (let index = 0; index < 3; index += 1) {
      const consumeResult = consumeRuntimePosterQueueItem({ state });
      if (!consumeResult.consumedItem) {
        throw new Error("Expected seeded queue consume to return a media item");
      }

      consumedBeforeRefill.push(consumeResult.consumedItem.id);
      state = consumeResult.nextState;
    }

    expect(state.items).toHaveLength(9);

    const refillResult = await runtime.refillIfNeeded({
      state,
      fetchItems
    });

    expect(fetchItems).toHaveBeenCalledTimes(1);
    expect(refillResult.requestedCount).toBe(31);
    expect(refillResult.reason).toBe("low-watermark");
    expect(refillResult.acceptedCount).toBe(3);
    expect(refillResult.duplicateCount).toBe(9);
    expect(refillResult.nextState.items).toHaveLength(12);
    expect(refillResult.nextState.items.map((item) => item.id)).toEqual([
      ...catalog.slice(3).map((item) => item.id),
      ...consumedBeforeRefill
    ]);

    const consumedAfterRefill: string[] = [];
    let postRefillState = refillResult.nextState;
    for (let index = 0; index < 12; index += 1) {
      const consumeResult = consumeRuntimePosterQueueItem({ state: postRefillState });
      if (!consumeResult.consumedItem) {
        throw new Error("Expected refill state consume to return a media item");
      }

      consumedAfterRefill.push(consumeResult.consumedItem.id);
      postRefillState = consumeResult.nextState;
    }

    expect(consumedAfterRefill.slice(0, 9)).toEqual(catalog.slice(3).map((item) => item.id));
    expect(consumedAfterRefill.slice(9)).toEqual(consumedBeforeRefill);
  });

  it("refills from low-watermark toward target size 40", async () => {
    const runtime = createRuntimePosterQueueRefillRuntime();
    const state = {
      items: createMediaBatch(9),
      bootstrapPending: false
    };
    const fetchItems = vi.fn(async (requestedCount: number) => createMediaBatch(requestedCount, 100));

    const result = await runtime.refillIfNeeded({
      state,
      fetchItems
    });

    expect(fetchItems).toHaveBeenCalledTimes(1);
    expect(fetchItems).toHaveBeenCalledWith(31);
    expect(result.requestedCount).toBe(31);
    expect(result.reason).toBe("low-watermark");
    expect(result.acceptedCount).toBe(31);
    expect(result.duplicateCount).toBe(0);
    expect(result.starvation).toBe("none");
    expect(result.nextState.items).toHaveLength(40);
    expect(result.refillIntent).toMatchObject({
      shouldRefill: false,
      reason: null,
      requestedCount: 0,
      currentSize: 40
    });
  });

  it("suppresses duplicates from refill payload and flags partial starvation", async () => {
    const runtime = createRuntimePosterQueueRefillRuntime();
    const state = {
      items: createMediaBatch(9),
      bootstrapPending: false
    };
    const [firstQueuedItem] = state.items;

    if (!firstQueuedItem) {
      throw new Error("Expected seeded queue item");
    }

    const result = await runtime.refillIfNeeded({
      state,
      fetchItems: async () => [
        firstQueuedItem,
        createMediaItem({ id: "fresh-a" }),
        createMediaItem({ id: "fresh-a" }),
        createMediaItem({ id: "fresh-b" })
      ]
    });

    expect(result.requestedCount).toBe(31);
    expect(result.acceptedCount).toBe(2);
    expect(result.duplicateCount).toBe(2);
    expect(result.starvation).toBe("partial");
    expect(result.nextState.items).toHaveLength(11);
    expect(result.nextState.items.map((item) => item.id)).toEqual([
      ...state.items.map((item) => item.id),
      "fresh-a",
      "fresh-b"
    ]);
  });

  it("reports empty starvation when provider returns no refill items", async () => {
    const runtime = createRuntimePosterQueueRefillRuntime();
    const state = {
      items: createMediaBatch(9),
      bootstrapPending: false
    };

    const result = await runtime.refillIfNeeded({
      state,
      fetchItems: async () => []
    });

    expect(result.requestedCount).toBe(31);
    expect(result.acceptedCount).toBe(0);
    expect(result.starvation).toBe("empty");
    expect(result.nextState.items).toHaveLength(9);
    expect(result.refillIntent).toMatchObject({
      shouldRefill: true,
      reason: "low-watermark",
      requestedCount: 31,
      currentSize: 9
    });
  });

  it("serializes concurrent refill attempts into a single in-flight request", async () => {
    const runtime = createRuntimePosterQueueRefillRuntime();
    const state = {
      items: createMediaBatch(9),
      bootstrapPending: false
    };
    const deferred = createDeferredPromise<readonly MediaItem[]>();
    const fetchItems = vi.fn(async (requestedCount: number) => {
      expect(requestedCount).toBe(31);
      return deferred.promise;
    });

    const firstRefillPromise = runtime.refillIfNeeded({
      state,
      fetchItems
    });
    const secondRefillPromise = runtime.refillIfNeeded({
      state,
      fetchItems
    });

    expect(firstRefillPromise).toBe(secondRefillPromise);
    expect(runtime.hasInFlightRefill()).toBe(true);
    expect(fetchItems).toHaveBeenCalledTimes(1);

    deferred.resolve(createMediaBatch(31, 100));

    const firstResult = await firstRefillPromise;
    const secondResult = await secondRefillPromise;

    expect(firstResult).toBe(secondResult);
    expect(firstResult.reason).toBe("low-watermark");
    expect(firstResult.requestedCount).toBe(31);
    expect(firstResult.nextState.items.map((item) => item.id)).toEqual([
      ...state.items.map((item) => item.id),
      ...createMediaBatch(31, 100).map((item) => item.id)
    ]);
    expect(firstResult.nextState.items).toHaveLength(40);
    expect(runtime.hasInFlightRefill()).toBe(false);
  });

  it("skips fetches when queue does not need refill", async () => {
    const runtime = createRuntimePosterQueueRefillRuntime();
    const state = {
      items: createMediaBatch(10),
      bootstrapPending: false
    };
    const fetchItems = vi.fn(async () => {
      throw new Error("fetch should not be called");
    });

    const result = await runtime.refillIfNeeded({
      state,
      fetchItems
    });

    expect(fetchItems).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.requestedCount).toBe(0);
    expect(result.reason).toBeNull();
    expect(result.starvation).toBe("none");
    expect(result.nextState.bootstrapPending).toBe(false);
    expect(result.nextState.items.map((item) => item.id)).toEqual(state.items.map((item) => item.id));
  });
});
