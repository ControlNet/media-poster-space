import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  MediaIngestionRefreshTrigger,
  MediaIngestionRuntime,
  MediaIngestionState
} from "../../src/ingestion";
import {
  createOnboardingBaseState,
  createOnboardingIngestionController,
  parseJson,
  toPosterCacheStorageKey,
  toReconnectGuideReason
} from "../../src/runtime";
import type { CreateOnboardingIngestionControllerOptions } from "../../src/runtime";
import { createPosterCache } from "../../src/cache";
import {
  applyWallPosterGridStreamState,
  createWallPosterEntryEdgeIndices,
  getWallPosterTileMediaIdentity,
  toWallPosterMediaIdentity
} from "../../src/wall/ui/presentation-sections";
import type {
  MediaItem,
  ProviderErrorCategory,
  ProviderSession
} from "../../src/types";
import type {
  WallPosterGridRowState,
  WallPosterGridStreamState,
  WallPosterRect,
  WallPosterTileState
} from "../../src/wall/ui/presentation-sections";

const TEST_SESSION: ProviderSession = {
  providerId: "jellyfin",
  serverUrl: "https://jellyfin.local",
  userId: "user-001",
  username: "demo",
  accessToken: "token-001",
  createdAt: "2026-03-01T00:00:00.000Z"
};

type TestOnboardingState = ReturnType<typeof createTestOnboardingState>;

function createTestOnboardingState() {
  return createOnboardingBaseState<
    ProviderSession,
    unknown,
    MediaItem,
    ProviderErrorCategory,
    MediaIngestionRefreshTrigger
  >({
    rememberedServer: "",
    rememberedUsername: "",
    rememberPasswordRequested: false
  });
}

function createMediaItem(index: number): MediaItem {
  const idSuffix = String(index).padStart(3, "0");
  return {
    id: `media-${idSuffix}`,
    providerId: "jellyfin",
    libraryId: "movies",
    kind: "movie",
    title: `Title ${idSuffix}`,
    genres: [],
    tags: [],
    people: [],
    poster: {
      url: `https://poster.local/media-${idSuffix}.jpg`
    }
  };
}

function createMediaBatch(count: number, startIndex = 1): MediaItem[] {
  return Array.from({ length: count }, (_, offset) => {
    return createMediaItem(startIndex + offset);
  });
}

function createReadyState(
  items: readonly MediaItem[],
  trigger: MediaIngestionRefreshTrigger
): MediaIngestionState {
  return {
    status: "ready",
    trigger,
    items: [...items],
    fetchedAt: "2026-03-01T12:00:00.000Z",
    nextCursor: null,
    error: null
  };
}

function createErrorState(
  items: readonly MediaItem[],
  trigger: MediaIngestionRefreshTrigger
): MediaIngestionState {
  return {
    status: "error",
    trigger,
    items: [...items],
    fetchedAt: "2026-03-01T12:00:00.000Z",
    nextCursor: null,
    error: {
      category: "network",
      message: "Network unavailable",
      retriable: true
    }
  };
}

function createDeferredPromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => {};

  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return {
    promise,
    resolve
  };
}

function createWallPosterRect(
  left: number,
  right: number,
  top = 0,
  bottom = 100
): WallPosterRect {
  return {
    left,
    right,
    top,
    bottom
  };
}

function createWallPosterTileState(options: {
  rect?: WallPosterRect;
  getRect?: () => WallPosterRect;
  initialItem?: MediaItem;
} = {}): WallPosterTileState {
  const tile: {
    getBoundingClientRect?: () => WallPosterRect;
  } = {};

  if (typeof options.getRect === "function") {
    tile.getBoundingClientRect = options.getRect;
  } else if (options.rect) {
    const rect = { ...options.rect };
    tile.getBoundingClientRect = () => rect;
  }

  return {
    tile,
    posterThumb: {
      style: {
        backgroundImage: options.initialItem ? `url(${options.initialItem.poster.url})` : ""
      } as CSSStyleDeclaration
    }
  };
}

function createWallPosterGridRowState(options: {
  entryIndices: number[];
  tiles: WallPosterTileState[];
  nextEntryPointer?: number;
}): WallPosterGridRowState {
  return {
    entryIndices: [...options.entryIndices],
    nextEntryPointer: options.nextEntryPointer ?? 0,
    tiles: [...options.tiles]
  };
}

function createWallPosterGridStreamState(options: {
  items?: readonly MediaItem[];
  pendingIncomingItems?: readonly MediaItem[];
  nextIncomingRowPointer?: number;
  rows?: readonly WallPosterGridRowState[];
} = {}): WallPosterGridStreamState {
  const items = [...(options.items ?? [])];

  return {
    items,
    itemIndexByIdentity: new Map(
      items.map((item, index) => [toWallPosterMediaIdentity(item), index] as const)
    ),
    nextIncomingRowPointer: options.nextIncomingRowPointer ?? 0,
    pendingIncomingItems: [...(options.pendingIncomingItems ?? [])],
    rows: [...(options.rows ?? [])]
  };
}

function createDeferredWallRows(rowCount: number): {
  rows: WallPosterGridRowState[];
  rowBufferItems: Array<{
    firstWritableItem: MediaItem;
    secondWritableItem: MediaItem;
  }>;
  reopenEntrySlots: () => void;
} {
  let entrySlotsReopened = false;
  const rowBufferItems: Array<{
    firstWritableItem: MediaItem;
    secondWritableItem: MediaItem;
  }> = [];
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const firstWritableItem = createMediaItem(20_000 + rowIndex * 2);
    const secondWritableItem = createMediaItem(20_000 + rowIndex * 2 + 1);
    rowBufferItems.push({ firstWritableItem, secondWritableItem });

    return createWallPosterGridRowState({
      entryIndices: createWallPosterEntryEdgeIndices(6, "normal"),
      tiles: [
        createWallPosterTileState({ rect: createWallPosterRect(-240, -140) }),
        createWallPosterTileState({ rect: createWallPosterRect(-120, -20) }),
        createWallPosterTileState({ rect: createWallPosterRect(-40, 60) }),
        createWallPosterTileState({ rect: createWallPosterRect(60, 160) }),
        createWallPosterTileState({
          getRect: () => {
            return entrySlotsReopened
              ? createWallPosterRect(100, 200)
              : createWallPosterRect(40, 140);
          },
          initialItem: firstWritableItem
        }),
        createWallPosterTileState({
          getRect: () => {
            return entrySlotsReopened
              ? createWallPosterRect(220, 320)
              : createWallPosterRect(80, 180);
          },
          initialItem: secondWritableItem
        })
      ]
    });
  });

  return {
    rows,
    rowBufferItems,
    reopenEntrySlots: () => {
      entrySlotsReopened = true;
    }
  };
}

function createExpectedDeferredDrainByRow(
  items: readonly MediaItem[],
  rowCount: number,
  startRowPointer: number
): Array<{
  firstIncomingItem: MediaItem | null;
  secondIncomingItem: MediaItem | null;
}> {
  const expectedByRow: Array<{
    firstIncomingItem: MediaItem | null;
    secondIncomingItem: MediaItem | null;
  }> = Array.from({ length: rowCount }, () => ({
    firstIncomingItem: null,
    secondIncomingItem: null
  }));
  let nextRowPointer = startRowPointer;

  for (const item of items) {
    const rowIndex = nextRowPointer % rowCount;
    nextRowPointer = (nextRowPointer + 1) % rowCount;

    const expectedRow = expectedByRow[rowIndex];
    if (!expectedRow) {
      throw new Error(`Expected deferred drain row ${rowIndex}`);
    }

    if (expectedRow.firstIncomingItem === null) {
      expectedRow.firstIncomingItem = item;
      continue;
    }

    if (expectedRow.secondIncomingItem === null) {
      expectedRow.secondIncomingItem = item;
      continue;
    }

    throw new Error(`Deferred drain expected at most two writable slots per row, row=${rowIndex}`);
  }

  return expectedByRow;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function createControllerHarness(options: {
  state: TestOnboardingState;
  runtimeItems: readonly MediaItem[];
  refreshNowImplementation?: (onStateChange: (state: MediaIngestionState) => void) => Promise<MediaIngestionState>;
  queueFetchItems?: (requestedCount: number) => Promise<readonly MediaItem[]>;
  reconnectInitialBackoffMs?: number;
  reconnectMaxBackoffMs?: number;
  reconnectGuideThresholdMs?: number;
}) {
  const diagnosticsEvents: string[] = [];
  const onRenderRequest = vi.fn();
  const posterCache = createPosterCache<MediaItem>();
  const runtimeRefreshNow = vi.fn(async () => createReadyState(options.runtimeItems, "manual"));

  const createRuntime = vi.fn(({ selectedLibraryIds, onStateChange }: {
    session: ProviderSession;
    selectedLibraryIds: readonly string[];
    onStateChange: (state: MediaIngestionState) => void;
  }): MediaIngestionRuntime => {
    if (options.refreshNowImplementation) {
      runtimeRefreshNow.mockImplementation(() => options.refreshNowImplementation!(onStateChange));
    } else {
      runtimeRefreshNow.mockImplementation(async () => {
        const ready = createReadyState(options.runtimeItems, "manual");
        onStateChange(ready);
        return ready;
      });
    }

    const initialReadyState = createReadyState(options.runtimeItems, "initial");

    return {
      get refreshIntervalMs() {
        return 300_000;
      },
      get selectedLibraryIds() {
        return selectedLibraryIds;
      },
      get status() {
        return "ready" as const;
      },
      getState: () => initialReadyState,
      start: () => {
        onStateChange(initialReadyState);
      },
      stop: () => {},
      refreshNow: () => runtimeRefreshNow(),
      dispose: () => {}
    };
  });

  const baseControllerOptions: CreateOnboardingIngestionControllerOptions<
    ReturnType<typeof posterCache.toSnapshot>
  > = {
    state: options.state,
    localStorageRef: null,
    posterCache,
    parseSnapshot: (value: string | null) => {
      return parseJson<ReturnType<typeof posterCache.toSnapshot>>(value);
    },
    toPosterCacheStorageKey,
    createRuntime,
    appendDiagnosticsLog: (entry) => {
      diagnosticsEvents.push(entry.event);
    },
    toReconnectGuideReason,
    isWallRouteActive: () => true,
    onRenderRequest,
    normalizeWallActivePosterIndex: (activePosterIndex, itemCount) => {
      if (itemCount <= 0) {
        return null;
      }

      if (activePosterIndex === null) {
        return null;
      }

      if (activePosterIndex < 0) {
        return 0;
      }

      if (activePosterIndex >= itemCount) {
        return itemCount - 1;
      }

      return activePosterIndex;
    },
    reconnectInitialBackoffMs: options.reconnectInitialBackoffMs ?? 2_000,
    reconnectMaxBackoffMs: options.reconnectMaxBackoffMs ?? 60_000,
    reconnectGuideThresholdMs: options.reconnectGuideThresholdMs ?? 60_000,
    cacheTtlMs: 60_000
  };

  const controller = options.queueFetchItems
    ? (() => {
        const queueFetchItems = options.queueFetchItems;
        return createOnboardingIngestionController({
          ...baseControllerOptions,
          createQueueRefillFetchAdapter: () => ({
            fetchItems: queueFetchItems,
            getState: () => ({
              cursor: null,
              updatedSince: null
            })
          })
        });
      })()
    : createOnboardingIngestionController(baseControllerOptions);

  return {
    controller,
    createRuntime,
    runtimeRefreshNow,
    diagnosticsEvents,
    onRenderRequest
  };
}

describe("onboarding ingestion queue integration", () => {
  it("bootstraps to 40 and refills under low watermark with one in-flight fetch", async () => {
    const state = createTestOnboardingState();
    const runtimeItems = createMediaBatch(120, 1);
    const underflowRefill = createDeferredPromise<readonly MediaItem[]>();
    const queueFetchItems = vi.fn(async (requestedCount: number) => {
      expect(requestedCount).toBe(31);
      return underflowRefill.promise;
    });

    const harness = createControllerHarness({
      state,
      runtimeItems,
      queueFetchItems
    });

    harness.controller.ensureRuntime(TEST_SESSION, ["movies"]);

    await vi.waitFor(() => {
      expect(state.ingestionItemCount).toBe(40);
    });
    expect(queueFetchItems).not.toHaveBeenCalled();

    for (let index = 0; index < 31; index += 1) {
      await harness.controller.consumeNextPosterForStream();
    }

    expect(state.ingestionItemCount).toBe(9);
    await vi.waitFor(() => {
      expect(queueFetchItems).toHaveBeenCalledTimes(1);
    });

    await harness.controller.refreshNow();
    expect(queueFetchItems).toHaveBeenCalledTimes(1);

    underflowRefill.resolve(createMediaBatch(31, 1_000));
    await vi.waitFor(() => {
      expect(state.ingestionItemCount).toBe(40);
    });

    expect(harness.runtimeRefreshNow).toHaveBeenCalledTimes(1);
    expect(harness.diagnosticsEvents).toContain("queue.refill-requested");
    expect(harness.diagnosticsEvents).toContain("queue.refill-completed");
  });

  it("keeps reconnect/backoff and manual refresh behavior while queue is underflowed", async () => {
    vi.useFakeTimers();

    const state = createTestOnboardingState();
    const runtimeItems = createMediaBatch(120, 1);
    const underflowRefill = createDeferredPromise<readonly MediaItem[]>();
    const queueFetchItems = vi.fn(async () => underflowRefill.promise);
    let refreshCount = 0;

    const harness = createControllerHarness({
      state,
      runtimeItems,
      queueFetchItems,
      reconnectInitialBackoffMs: 50,
      reconnectMaxBackoffMs: 200,
      reconnectGuideThresholdMs: 60_000,
      refreshNowImplementation: async (onStateChange) => {
        refreshCount += 1;
        const errorState = createErrorState(runtimeItems, refreshCount === 1 ? "manual" : "scheduled");
        onStateChange(errorState);
        return errorState;
      }
    });

    try {
      harness.controller.ensureRuntime(TEST_SESSION, ["movies"]);

      await vi.waitFor(() => {
        expect(state.ingestionItemCount).toBe(40);
      });

      for (let index = 0; index < 31; index += 1) {
        await harness.controller.consumeNextPosterForStream();
      }

      expect(state.ingestionItemCount).toBe(9);
      await vi.waitFor(() => {
        expect(queueFetchItems).toHaveBeenCalledTimes(1);
      });

      await harness.controller.refreshNow();
      expect(state.ingestionStatus).toBe("error");
      expect(state.reconnectNextDelayMs).toBe(50);
      expect(harness.runtimeRefreshNow).toHaveBeenCalledTimes(1);
      expect(queueFetchItems).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(50);

      await vi.waitFor(() => {
        expect(harness.runtimeRefreshNow).toHaveBeenCalledTimes(2);
      });

      expect(state.reconnectAttempt).toBe(1);
      expect(state.reconnectNextDelayMs).toBe(100);
      expect(state.reconnectGuideVisible).toBe(false);
      expect(harness.diagnosticsEvents).toContain("ingestion.reconnect-scheduled");

      underflowRefill.resolve(createMediaBatch(31, 2_000));
      await vi.waitFor(() => {
        expect(state.ingestionItemCount).toBeGreaterThanOrEqual(31);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("defers incoming posters until entry slots reopen without dropping them", async () => {
    vi.stubGlobal("window", {
      innerWidth: 100,
      innerHeight: 100
    });

    const state = createTestOnboardingState();
    const runtimeItems = createMediaBatch(120, 1);
    const deferredRefillItems = createMediaBatch(31, 1_000);
    const queueFetchItems = vi.fn(async (requestedCount: number) => {
      expect(requestedCount).toBe(31);
      return deferredRefillItems;
    });

    const harness = createControllerHarness({
      state,
      runtimeItems,
      queueFetchItems
    });
    const deferredWall = createDeferredWallRows(16);

    harness.controller.ensureRuntime(TEST_SESSION, ["movies"]);

    await vi.waitFor(() => {
      expect(state.ingestionItemCount).toBe(40);
    });

    const streamState = createWallPosterGridStreamState({
      items: state.ingestionItems,
      rows: deferredWall.rows
    });

    for (let index = 0; index < 31; index += 1) {
      await harness.controller.consumeNextPosterForStream();
    }

    await vi.waitFor(() => {
      expect(state.ingestionItemCount).toBe(40);
    });
    expect(queueFetchItems).toHaveBeenCalledTimes(1);
    expect(state.ingestionStatus).toBe("ready");
    expect(harness.diagnosticsEvents).not.toContain("queue.refill-failed");

    const deferredApplyResult = applyWallPosterGridStreamState(streamState, state.ingestionItems);
    expect(deferredApplyResult).toEqual({
      status: "deferred",
      queuedItemCount: 31,
      appliedItemCount: 0,
      pendingItemCount: 31
    });
    expect(deferredApplyResult.status).not.toBe("unavailable");
    expect(streamState.pendingIncomingItems.map((item) => item.id)).toEqual(
      deferredRefillItems.map((item) => item.id)
    );

    await harness.controller.consumeNextPosterForStream();
    const secondDeferredApplyResult = applyWallPosterGridStreamState(streamState, state.ingestionItems);
    expect(secondDeferredApplyResult).toEqual({
      status: "deferred",
      queuedItemCount: 31,
      appliedItemCount: 0,
      pendingItemCount: 31
    });
    expect(streamState.pendingIncomingItems.map((item) => item.id)).toEqual(
      deferredRefillItems.map((item) => item.id)
    );

    const drainStartRowPointer = streamState.nextIncomingRowPointer;
    deferredWall.reopenEntrySlots();
    const expectedDrainByRow = createExpectedDeferredDrainByRow(
      deferredRefillItems,
      deferredWall.rows.length,
      drainStartRowPointer
    );

    const drainedApplyResult = applyWallPosterGridStreamState(streamState, state.ingestionItems);
    expect(drainedApplyResult).toEqual({
      status: "applied",
      queuedItemCount: 31,
      appliedItemCount: 31,
      pendingItemCount: 0
    });
    expect(streamState.pendingIncomingItems).toEqual([]);

    for (let rowIndex = 0; rowIndex < deferredWall.rows.length; rowIndex += 1) {
      const row = deferredWall.rows[rowIndex];
      if (!row) {
        throw new Error(`Expected deferred wall row ${rowIndex}`);
      }

      const firstTileIdentity = getWallPosterTileMediaIdentity(row.tiles[4]?.tile ?? {});
      const expectedDrainRow = expectedDrainByRow[rowIndex];
      if (!expectedDrainRow) {
        throw new Error(`Expected deferred drain row assertions for row ${rowIndex}`);
      }

      const expectedFirstIncomingItem = expectedDrainRow.firstIncomingItem;
      if (!expectedFirstIncomingItem) {
        throw new Error(`Expected first incoming poster for row ${rowIndex}`);
      }

      expect(firstTileIdentity).toBe(toWallPosterMediaIdentity(expectedFirstIncomingItem));

      const secondIncomingItem = expectedDrainRow.secondIncomingItem;
      const secondTileIdentity = getWallPosterTileMediaIdentity(row.tiles[5]?.tile ?? {});

      if (secondIncomingItem) {
        expect(secondTileIdentity).toBe(toWallPosterMediaIdentity(secondIncomingItem));
      } else {
        const rowBufferItems = deferredWall.rowBufferItems[rowIndex];
        if (!rowBufferItems) {
          throw new Error(`Expected deferred wall buffer items for row ${rowIndex}`);
        }

        expect(secondTileIdentity).toBeNull();
        expect(row.tiles[5]?.posterThumb.style.backgroundImage).toBe(
          `url(${rowBufferItems.secondWritableItem.poster.url})`
        );
      }
    }
  });
});
