import { describe, expect, it, vi } from "vitest";

import {
  MEDIA_INGESTION_REFRESH_INTERVAL_MS,
  createMediaIngestionRuntime,
  ingestSelectedMedia,
  type MediaIngestionState
} from "../../src/ingestion";
import type { MediaPage, MediaQuery } from "../../src/provider";
import type { ProviderSession } from "../../src/types";

const TEST_SESSION: ProviderSession = {
  providerId: "jellyfin",
  serverUrl: "https://jellyfin.local",
  userId: "user-001",
  username: "demo",
  accessToken: "token-001",
  createdAt: "2026-02-24T00:00:00.000Z"
};

describe("media ingestion", () => {
  it("ingests only selected libraries and excludes entries without poster artwork", async () => {
    const listMedia = vi.fn(async () => ({
      items: [
        {
          id: "movie-001",
          providerId: "jellyfin",
          libraryId: "movies",
          kind: "movie" as const,
          title: "Poster Ready",
          genres: [],
          tags: [],
          people: [],
          poster: { url: "https://image.local/poster-001.jpg" }
        },
        {
          id: "movie-002",
          providerId: "jellyfin",
          libraryId: "movies",
          kind: "movie" as const,
          title: "Missing Poster",
          genres: [],
          tags: [],
          people: [],
          poster: { url: "   " }
        },
        {
          id: "movie-003",
          providerId: "jellyfin",
          libraryId: "unselected",
          kind: "movie" as const,
          title: "Wrong Library",
          genres: [],
          tags: [],
          people: [],
          poster: { url: "https://image.local/poster-003.jpg" }
        }
      ],
      fetchedAt: "2026-02-24T12:00:00.000Z"
    }));

    const result = await ingestSelectedMedia({
      provider: { listMedia },
      session: TEST_SESSION,
      selectedLibraryIds: [" movies ", "movies", "shows"]
    });

    expect(listMedia).toHaveBeenCalledWith(TEST_SESSION, {
      libraryIds: ["movies", "shows"]
    });
    expect(result.fetchedAt).toBe("2026-02-24T12:00:00.000Z");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "movie-001",
      libraryId: "movies"
    });
  });

  it("advances scheduled refresh cursor and resets manual refresh to newest page", async () => {
    vi.useFakeTimers();

    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    const states: MediaIngestionState[] = [];
    const listMedia = vi.fn(async (_session, query) => {
      if (query.cursor === "cursor-001") {
        return {
          items: [
            {
              id: "movie-002",
              providerId: "jellyfin",
              libraryId: "movies",
              kind: "movie" as const,
              title: "Arrival",
              genres: ["Sci-Fi"],
              tags: [],
              people: [],
              poster: { url: "https://image.local/poster-002.jpg" }
            }
          ],
          nextCursor: "cursor-002",
          fetchedAt: "2026-02-24T12:10:00.000Z"
        };
      }

      return {
        items: [
          {
            id: "movie-001",
            providerId: "jellyfin",
            libraryId: "movies",
            kind: "movie" as const,
            title: "Dune",
            genres: ["Sci-Fi"],
            tags: [],
            people: [],
            poster: { url: "https://image.local/poster-001.jpg" }
          },
          {
            id: "movie-003",
            providerId: "jellyfin",
            libraryId: "unselected",
            kind: "movie" as const,
            title: "Wrong Library",
            genres: [],
            tags: [],
            people: [],
            poster: { url: "https://image.local/poster-003.jpg" }
          },
          {
            id: "movie-004",
            providerId: "jellyfin",
            libraryId: "movies",
            kind: "movie" as const,
            title: "Missing Poster",
            genres: [],
            tags: [],
            people: [],
            poster: { url: "   " }
          }
        ],
        nextCursor: "cursor-001",
        fetchedAt: "2026-02-24T12:05:00.000Z"
      };
    });

    try {
      const runtime = createMediaIngestionRuntime({
        provider: { listMedia },
        session: TEST_SESSION,
        selectedLibraryIds: ["movies"],
        onStateChange: (state) => {
          states.push(state);
        }
      });

      runtime.start();

      await vi.waitFor(() => {
        expect(listMedia).toHaveBeenCalledTimes(1);
      });
      expect(listMedia).toHaveBeenNthCalledWith(1, TEST_SESSION, {
        libraryIds: ["movies"],
        signal: expect.any(AbortSignal)
      });

      expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), MEDIA_INGESTION_REFRESH_INTERVAL_MS);

      await vi.advanceTimersByTimeAsync(MEDIA_INGESTION_REFRESH_INTERVAL_MS);

      await vi.waitFor(() => {
        expect(listMedia).toHaveBeenCalledTimes(2);
      });
      expect(listMedia).toHaveBeenNthCalledWith(2, TEST_SESSION, {
        libraryIds: ["movies"],
        cursor: "cursor-001",
        signal: expect.any(AbortSignal)
      });

      const manualRefreshState = await runtime.refreshNow();
      expect(listMedia).toHaveBeenCalledTimes(3);
      expect(listMedia).toHaveBeenNthCalledWith(3, TEST_SESSION, {
        libraryIds: ["movies"],
        signal: expect.any(AbortSignal)
      });
      expect(manualRefreshState.trigger).toBe("manual");
      expect(manualRefreshState.nextCursor).toBe("cursor-001");
      expect(manualRefreshState.items).toHaveLength(1);
      expect(manualRefreshState.items[0]).toMatchObject({
        id: "movie-001",
        libraryId: "movies"
      });

      await vi.advanceTimersByTimeAsync(MEDIA_INGESTION_REFRESH_INTERVAL_MS);

      await vi.waitFor(() => {
        expect(listMedia).toHaveBeenCalledTimes(4);
      });
      expect(listMedia).toHaveBeenNthCalledWith(4, TEST_SESSION, {
        libraryIds: ["movies"],
        cursor: "cursor-001",
        signal: expect.any(AbortSignal)
      });
      expect(runtime.status).toBe("ready");

      const latestState = runtime.getState();
      expect(latestState.trigger).toBe("scheduled");
      expect(latestState.nextCursor).toBe("cursor-002");
      expect(latestState.items).toHaveLength(1);
      expect(latestState.items[0]).toMatchObject({
        id: "movie-002",
        libraryId: "movies"
      });
      expect(states.some((state) => state.trigger === "manual")).toBe(true);
      expect(states.some((state) => state.trigger === "scheduled")).toBe(true);

      runtime.dispose();
    } finally {
      intervalSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("forwards an optional abort signal from ingestSelectedMedia to the provider", async () => {
    const controller = new AbortController();
    const listMedia = vi.fn(async () => ({
      items: [],
      fetchedAt: "2026-02-24T12:00:00.000Z"
    }));

    await ingestSelectedMedia({
      provider: { listMedia },
      session: TEST_SESSION,
      selectedLibraryIds: ["movies"],
      signal: controller.signal
    });

    expect(listMedia).toHaveBeenCalledWith(TEST_SESSION, {
      libraryIds: ["movies"],
      signal: controller.signal
    });
  });

  it("aborts the in-flight refresh on dispose and never publishes its late result", async () => {
    const states: MediaIngestionState[] = [];
    let requestSignal: AbortSignal | undefined;
    let resolvePage: ((page: MediaPage) => void) | null = null;
    const listMedia = vi.fn(async (_session: ProviderSession, query: MediaQuery) => {
      requestSignal = query.signal;
      return new Promise<MediaPage>((resolve) => {
        resolvePage = resolve;
      });
    });

    const runtime = createMediaIngestionRuntime({
      provider: { listMedia },
      session: TEST_SESSION,
      selectedLibraryIds: ["movies"],
      onStateChange: (state) => {
        states.push(state);
      }
    });

    const refreshPromise = runtime.refreshNow();
    await vi.waitFor(() => {
      expect(listMedia).toHaveBeenCalledTimes(1);
    });
    expect(states.map((state) => state.status)).toEqual(["refreshing"]);

    runtime.dispose();
    expect(requestSignal?.aborted).toBe(true);

    const settle = resolvePage as ((page: MediaPage) => void) | null;
    settle?.({
      items: [
        {
          id: "movie-late",
          providerId: "jellyfin",
          libraryId: "movies",
          kind: "movie",
          title: "Late",
          genres: [],
          tags: [],
          people: [],
          poster: { url: "https://image.local/late.jpg" }
        }
      ],
      fetchedAt: "2026-02-24T12:00:00.000Z"
    });
    const finalState = await refreshPromise;

    expect(states.map((state) => state.status)).toEqual(["refreshing"]);
    expect(finalState.items).toEqual([]);
    expect(runtime.getState().status).not.toBe("ready");
  });

  it("does not publish an error state when a refresh fails after dispose", async () => {
    const states: MediaIngestionState[] = [];
    const listMedia = vi.fn(async (_session: ProviderSession, query: MediaQuery) => {
      return new Promise<MediaPage>((_resolve, reject) => {
        query.signal?.addEventListener("abort", () => {
          reject(new Error("request was cancelled"));
        });
      });
    });

    const runtime = createMediaIngestionRuntime({
      provider: { listMedia },
      session: TEST_SESSION,
      selectedLibraryIds: ["movies"],
      onStateChange: (state) => {
        states.push(state);
      }
    });

    const refreshPromise = runtime.refreshNow();
    await vi.waitFor(() => {
      expect(listMedia).toHaveBeenCalledTimes(1);
    });
    runtime.dispose();
    await refreshPromise;

    expect(states.map((state) => state.status)).toEqual(["refreshing"]);
    expect(runtime.getState().error).toBeNull();
  });
});
