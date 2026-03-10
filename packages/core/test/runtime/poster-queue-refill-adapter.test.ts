import { describe, expect, it, vi } from "vitest";

import {
  consumeRuntimePosterQueueItem,
  createRuntimePosterQueueRefillFetchAdapter,
  createRuntimePosterQueueRefillRuntime,
  RuntimePosterQueueRefillAdapterError
} from "../../src/runtime";
import type { MediaProvider } from "../../src/provider";
import type { ProviderSession, MediaItem, ProviderError } from "../../src/types";

const TEST_SESSION: ProviderSession = {
  providerId: "jellyfin",
  serverUrl: "https://jellyfin.local",
  userId: "user-001",
  username: "demo",
  accessToken: "token-001",
  createdAt: "2026-03-01T10:00:00.000Z"
};

function createMediaItem(overrides: Partial<MediaItem> & Pick<MediaItem, "id">): MediaItem {
  return {
    id: overrides.id,
    providerId: overrides.providerId ?? "jellyfin",
    libraryId: overrides.libraryId ?? "movies",
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

function createProviderFailure(providerError: ProviderError): Error & { providerError: ProviderError } {
  const error = new Error(providerError.message) as Error & { providerError: ProviderError };
  error.providerError = providerError;
  return error;
}

describe("runtime poster queue refill fetch adapter", () => {
  it("supports partial queue top-up with selected-library scope and cursor continuation", async () => {
    const listMedia = vi.fn<MediaProvider["listMedia"]>(async (_session, query) => {
      if (query.cursor === "cursor-001") {
        return {
          items: [
            createMediaItem({ id: "fresh-003", libraryId: "movies" }),
            createMediaItem({
              id: "out-of-scope-002",
              libraryId: "music",
              poster: { url: "https://poster.local/out-of-scope-002.jpg" }
            })
          ],
          fetchedAt: "2026-03-01T11:05:00.000Z"
        };
      }

      if (query.updatedSince === "2026-03-01T11:05:00.000Z") {
        return {
          items: [
            createMediaItem({ id: "fresh-004", libraryId: "shows" }),
            createMediaItem({ id: "missing-poster-002", libraryId: "shows", poster: { url: "   " } })
          ],
          fetchedAt: "2026-03-01T11:10:00.000Z"
        };
      }

      return {
        items: [
          createMediaItem({ id: "fresh-001", libraryId: "movies" }),
          createMediaItem({ id: "fresh-002", libraryId: "shows" }),
          createMediaItem({ id: "missing-poster", libraryId: "movies", poster: { url: "   " } }),
          createMediaItem({
            id: "out-of-scope-001",
            libraryId: "music",
            poster: { url: "https://poster.local/out-of-scope-001.jpg" }
          })
        ],
        nextCursor: "cursor-001",
        fetchedAt: "2026-03-01T11:00:00.000Z"
      };
    });

    const adapter = createRuntimePosterQueueRefillFetchAdapter({
      provider: { listMedia },
      session: TEST_SESSION,
      selectedLibraryIds: [" movies ", "shows", "movies"],
      updatedSince: "2026-03-01T10:55:00.000Z"
    });

    const runtime = createRuntimePosterQueueRefillRuntime();
    const firstRefill = await runtime.refillIfNeeded({
      state: {
        items: createMediaBatch(9),
        bootstrapPending: false
      },
      fetchItems: adapter.fetchItems
    });

    expect(firstRefill.requestedCount).toBe(31);
    expect(firstRefill.acceptedCount).toBe(2);
    expect(firstRefill.starvation).toBe("partial");
    expect(firstRefill.nextState.items).toHaveLength(11);
    expect(listMedia).toHaveBeenNthCalledWith(1, TEST_SESSION, {
      libraryIds: ["movies", "shows"],
      limit: 31,
      updatedSince: "2026-03-01T10:55:00.000Z"
    });

    const afterFirstConsume = consumeRuntimePosterQueueItem({
      state: firstRefill.nextState
    }).nextState;
    const lowWatermarkState = consumeRuntimePosterQueueItem({
      state: afterFirstConsume
    }).nextState;

    expect(lowWatermarkState.items).toHaveLength(9);

    const secondRefill = await runtime.refillIfNeeded({
      state: lowWatermarkState,
      fetchItems: adapter.fetchItems
    });

    expect(secondRefill.requestedCount).toBe(31);
    expect(secondRefill.acceptedCount).toBe(1);
    expect(secondRefill.starvation).toBe("partial");
    expect(secondRefill.nextState.items).toHaveLength(10);
    expect(listMedia).toHaveBeenNthCalledWith(2, TEST_SESSION, {
      libraryIds: ["movies", "shows"],
      cursor: "cursor-001",
      limit: 31
    });
    expect(adapter.getState()).toEqual({
      cursor: null,
      updatedSince: "2026-03-01T11:05:00.000Z"
    });

    const afterSecondConsume = consumeRuntimePosterQueueItem({
      state: secondRefill.nextState
    }).nextState;

    expect(afterSecondConsume.items).toHaveLength(9);

    const thirdRefill = await runtime.refillIfNeeded({
      state: afterSecondConsume,
      fetchItems: adapter.fetchItems
    });

    expect(thirdRefill.requestedCount).toBe(31);
    expect(thirdRefill.acceptedCount).toBe(1);
    expect(thirdRefill.starvation).toBe("partial");
    expect(thirdRefill.nextState.items).toHaveLength(10);
    expect(listMedia).toHaveBeenNthCalledWith(3, TEST_SESSION, {
      libraryIds: ["movies", "shows"],
      limit: 31,
      updatedSince: "2026-03-01T11:05:00.000Z"
    });
    expect(adapter.getState()).toEqual({
      cursor: null,
      updatedSince: "2026-03-01T11:10:00.000Z"
    });
  });

  it("maps provider auth/network failures without category drift", async () => {
    const authAdapter = createRuntimePosterQueueRefillFetchAdapter({
      provider: {
        listMedia: vi.fn(async () => {
          throw createProviderFailure({
            category: "auth",
            message: "Session expired",
            statusCode: 401,
            retriable: false
          });
        })
      },
      session: TEST_SESSION,
      selectedLibraryIds: ["movies"]
    });

    await expect(authAdapter.fetchItems(5)).rejects.toBeInstanceOf(RuntimePosterQueueRefillAdapterError);
    await expect(authAdapter.fetchItems(5)).rejects.toMatchObject({
      providerError: {
        category: "auth",
        message: "Session expired",
        statusCode: 401,
        retriable: false
      }
    });

    const networkAdapter = createRuntimePosterQueueRefillFetchAdapter({
      provider: {
        listMedia: vi.fn(async () => {
          throw createProviderFailure({
            category: "network",
            message: "Jellyfin unavailable",
            statusCode: 503,
            retriable: true
          });
        })
      },
      session: TEST_SESSION,
      selectedLibraryIds: ["movies"]
    });

    await expect(networkAdapter.fetchItems(5)).rejects.toBeInstanceOf(RuntimePosterQueueRefillAdapterError);
    await expect(networkAdapter.fetchItems(5)).rejects.toMatchObject({
      providerError: {
        category: "network",
        message: "Jellyfin unavailable",
        statusCode: 503,
        retriable: true
      }
    });
  });
});
