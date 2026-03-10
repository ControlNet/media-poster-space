import { describe, expect, it } from "vitest";

import {
  DEFAULT_RUNTIME_POSTER_QUEUE_POLICY,
  RUNTIME_POSTER_QUEUE_LOW_WATERMARK,
  RUNTIME_POSTER_QUEUE_REFILL_TARGET,
  consumeRuntimePosterQueueItem,
  createRuntimePosterQueueState,
  enqueueRuntimePosterQueueItems,
  getRuntimePosterQueueRefillIntent,
  toRuntimePosterQueueMediaIdentity
} from "../../src/runtime";
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

describe("runtime poster queue model", () => {
  it("defines explicit default queue policy constants and bootstrap intent", () => {
    expect(RUNTIME_POSTER_QUEUE_LOW_WATERMARK).toBe(10);
    expect(RUNTIME_POSTER_QUEUE_REFILL_TARGET).toBe(40);
    expect(DEFAULT_RUNTIME_POSTER_QUEUE_POLICY).toEqual({
      lowWatermark: 10,
      refillTarget: 40
    });

    const initialState = createRuntimePosterQueueState();
    const refillIntent = getRuntimePosterQueueRefillIntent({ state: initialState });

    expect(initialState.bootstrapPending).toBe(true);
    expect(refillIntent).toEqual({
      shouldRefill: true,
      reason: "bootstrap",
      requestedCount: 40,
      currentSize: 0,
      lowWatermark: 10,
      targetSize: 40
    });
  });

  it("dedupes queue entries by media identity while preserving deterministic order", () => {
    const firstJellyfin = createMediaItem({
      id: "repeat-id",
      providerId: "jellyfin",
      title: "First copy"
    });
    const duplicateJellyfin = createMediaItem({
      id: "repeat-id",
      providerId: "jellyfin",
      title: "Duplicate copy"
    });
    const sameIdDifferentProvider = createMediaItem({
      id: "repeat-id",
      providerId: "plex",
      title: "Other provider"
    });

    const enqueueResult = enqueueRuntimePosterQueueItems({
      state: createRuntimePosterQueueState(),
      items: [
        firstJellyfin,
        duplicateJellyfin,
        createMediaItem({ id: "unique-id", providerId: "jellyfin" }),
        sameIdDifferentProvider
      ]
    });

    expect(enqueueResult.acceptedCount).toBe(3);
    expect(enqueueResult.duplicateCount).toBe(1);
    expect(enqueueResult.nextState.items.map(toRuntimePosterQueueMediaIdentity)).toEqual([
      "jellyfin::repeat-id",
      "jellyfin::unique-id",
      "plex::repeat-id"
    ]);
    expect(enqueueResult.nextState.items[0]).toMatchObject({
      title: "First copy"
    });
  });

  it("emits deterministic refill intent transitions for queue sizes 40, 39, 10, and 9", () => {
    const seededState = createRuntimePosterQueueState({
      items: createMediaBatch(40)
    });

    expect(seededState.bootstrapPending).toBe(false);
    expect(getRuntimePosterQueueRefillIntent({ state: seededState })).toMatchObject({
      shouldRefill: false,
      reason: null,
      currentSize: 40,
      requestedCount: 0
    });

    const consumeAt39 = consumeRuntimePosterQueueItem({ state: seededState });
    expect(consumeAt39.nextState.items).toHaveLength(39);
    expect(consumeAt39.refillIntent).toMatchObject({
      shouldRefill: false,
      reason: null,
      currentSize: 39,
      requestedCount: 0
    });

    let stateAt10 = consumeAt39.nextState;
    for (let index = 0; index < 29; index += 1) {
      stateAt10 = consumeRuntimePosterQueueItem({ state: stateAt10 }).nextState;
    }

    expect(stateAt10.items).toHaveLength(10);
    expect(getRuntimePosterQueueRefillIntent({ state: stateAt10 })).toMatchObject({
      shouldRefill: false,
      reason: null,
      currentSize: 10,
      requestedCount: 0
    });

    const consumeAt9 = consumeRuntimePosterQueueItem({ state: stateAt10 });
    expect(consumeAt9.nextState.items).toHaveLength(9);
    expect(consumeAt9.refillIntent).toEqual({
      shouldRefill: true,
      reason: "low-watermark",
      requestedCount: 31,
      currentSize: 9,
      lowWatermark: 10,
      targetSize: 40
    });
  });

  it("keeps consume behavior pure and allows re-enqueue after dequeue", () => {
    const initialState = createRuntimePosterQueueState({
      items: [createMediaItem({ id: "requeue-001" }), createMediaItem({ id: "requeue-002" })]
    });

    const firstConsume = consumeRuntimePosterQueueItem({ state: initialState });
    const secondConsumeFromOriginalState = consumeRuntimePosterQueueItem({
      state: initialState
    });

    expect(initialState.items).toHaveLength(2);
    expect(firstConsume.consumedItem).not.toBeNull();
    expect(secondConsumeFromOriginalState.consumedItem).not.toBeNull();

    if (!firstConsume.consumedItem || !secondConsumeFromOriginalState.consumedItem) {
      throw new Error("Expected consume results to include a media item");
    }

    expect(firstConsume.consumedItem.id).toBe(secondConsumeFromOriginalState.consumedItem.id);
    expect(firstConsume.nextState.items).toHaveLength(1);

    const reenqueue = enqueueRuntimePosterQueueItems({
      state: firstConsume.nextState,
      items: [firstConsume.consumedItem]
    });

    expect(reenqueue.acceptedCount).toBe(1);
    expect(reenqueue.duplicateCount).toBe(0);
    expect(reenqueue.nextState.items).toHaveLength(2);
  });
});
