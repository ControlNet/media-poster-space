import { describe, expect, it, vi } from "vitest";

import {
  MEDIA_INGESTION_REFRESH_INTERVAL_MS,
  createMediaIngestionRuntime,
  ingestSelectedMedia,
  type MediaIngestionState
} from "../../src/ingestion";
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

  it("uses 300000ms scheduled refresh cadence and supports manual refresh", async () => {
    vi.useFakeTimers();

    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    const states: MediaIngestionState[] = [];
    const listMedia = vi.fn(async () => ({
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
        }
      ],
      fetchedAt: "2026-02-24T12:05:00.000Z"
    }));

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

      expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), MEDIA_INGESTION_REFRESH_INTERVAL_MS);

      await vi.advanceTimersByTimeAsync(MEDIA_INGESTION_REFRESH_INTERVAL_MS);

      await vi.waitFor(() => {
        expect(listMedia).toHaveBeenCalledTimes(2);
      });

      await runtime.refreshNow();
      expect(listMedia).toHaveBeenCalledTimes(3);
      expect(runtime.status).toBe("ready");

      const latestState = runtime.getState();
      expect(latestState.trigger).toBe("manual");
      expect(latestState.items).toHaveLength(1);
      expect(states.some((state) => state.trigger === "scheduled")).toBe(true);

      runtime.dispose();
    } finally {
      intervalSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
