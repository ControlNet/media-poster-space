import { describe, expect, it, vi } from "vitest";

import type {
  MediaIngestionRefreshTrigger,
  MediaIngestionRuntime,
  MediaIngestionState
} from "../../src/ingestion";
import {
  createOnboardingBaseState,
  createOnboardingIngestionController,
  createRuntimePosterQueueRefillFetchAdapter,
  parsePosterCacheSnapshot,
  toPosterCacheStorageKey,
  toReconnectGuideReason
} from "../../src/runtime";
import { createPosterCache } from "../../src/cache";
import type { MediaPage, MediaQuery } from "../../src/provider";
import type {
  MediaItem,
  ProviderErrorCategory,
  ProviderSession
} from "../../src/types";

const SESSION: ProviderSession = {
  providerId: "jellyfin",
  serverUrl: "https://jellyfin.local",
  userId: "user-001",
  username: "demo",
  accessToken: "token-001",
  createdAt: "2026-03-01T00:00:00.000Z"
};

function item(index: number): MediaItem {
  const s = String(index).padStart(4, "0");
  return {
    id: `media-${s}`,
    providerId: "jellyfin",
    libraryId: "movies",
    kind: "movie",
    title: `Title ${s}`,
    genres: [],
    tags: [],
    people: [],
    poster: { url: `https://poster.local/${s}.jpg` }
  };
}

function batch(count: number, start = 1): MediaItem[] {
  return Array.from({ length: count }, (_, i) => item(start + i));
}

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    }
  };
}

function harness(options: {
  runtimeItems: readonly MediaItem[];
  adapter: (session: ProviderSession, updatedSince: string | null) => {
    fetchItems: (n: number) => Promise<readonly MediaItem[]>;
    getState: () => { cursor: string | null; updatedSince: string | null };
  };
  storage?: Storage;
  now?: () => number;
}) {
  const state = createOnboardingBaseState<
    ProviderSession,
    unknown,
    MediaItem,
    ProviderErrorCategory,
    MediaIngestionRefreshTrigger
  >({ rememberedServer: "", rememberedUsername: "", rememberPasswordRequested: false });
  const events: Array<{ event: string; details?: unknown }> = [];
  const posterCache = createPosterCache<MediaItem>();
  const adapterUpdatedSince: Array<string | null> = [];
  const hooks: { onStateChange: ((s: MediaIngestionState) => void) | null } = { onStateChange: null };

  const controller = createOnboardingIngestionController({
    state,
    localStorageRef: options.storage ?? null,
    posterCache,
    parseSnapshot: parsePosterCacheSnapshot,
    toPosterCacheStorageKey,
    createRuntime: ({ selectedLibraryIds, onStateChange }): MediaIngestionRuntime => {
      hooks.onStateChange = onStateChange;
      const ready: MediaIngestionState = {
        status: "ready",
        trigger: "initial",
        items: [...options.runtimeItems],
        fetchedAt: "2026-03-01T12:00:00.000Z",
        nextCursor: null,
        error: null
      };
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
        getState: () => ready,
        start: () => onStateChange(ready),
        stop: () => {},
        refreshNow: async () => ready,
        dispose: () => {}
      };
    },
    createQueueRefillFetchAdapter: ({ session, updatedSince }) => {
      adapterUpdatedSince.push(updatedSince);
      return options.adapter(session, updatedSince);
    },
    appendDiagnosticsLog: (entry) => {
      events.push({ event: entry.event, details: entry.details });
    },
    toReconnectGuideReason,
    isWallRouteActive: () => true,
    onRenderRequest: () => {},
    normalizeWallActivePosterIndex: () => null,
    reconnectInitialBackoffMs: 2_000,
    reconnectMaxBackoffMs: 60_000,
    reconnectGuideThresholdMs: 60_000,
    cacheTtlMs: 60_000,
    ...(options.now ? { now: options.now } : {})
  });

  return { controller, state, events, posterCache, adapterUpdatedSince, hooks };
}

// Emulates the Jellyfin listMedia contract used by the adapter:
// StartIndex cursor paging, Limit, and updatedSince -> MinDateLastSavedForUser
// (for a static library nothing is "saved" after the first pass).
function fakeJellyfin(library: readonly MediaItem[]) {
  const queries: MediaQuery[] = [];
  const listMedia = vi.fn(async (_s: ProviderSession, query: MediaQuery): Promise<MediaPage> => {
    queries.push(query);
    const start = query.cursor ? Number(query.cursor) : 0;
    const limit = query.limit ?? 100;
    const source = query.updatedSince ? [] : library;
    const page = source.slice(start, start + limit);
    const hasMore = source.length > start + page.length;
    return {
      items: page,
      fetchedAt: new Date(Date.UTC(2026, 2, 1, 12, 0, queries.length)).toISOString(),
      ...(hasMore ? { nextCursor: String(start + limit) } : {})
    };
  });
  return { listMedia, queries };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
}

describe("onboarding ingestion poster stream regressions", () => {
  it("applies a refill on top of the current queue instead of the snapshot taken when it started", async () => {
    const pending = deferred<readonly MediaItem[]>();
    const fetchItems = vi.fn(async () => pending.promise);
    const h = harness({
      runtimeItems: batch(120, 1),
      adapter: () => ({ fetchItems, getState: () => ({ cursor: null, updatedSince: null }) })
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(40));

    for (let i = 0; i < 31; i += 1) {
      await h.controller.consumeNextPosterForStream();
    }
    await vi.waitFor(() => expect(fetchItems).toHaveBeenCalledTimes(1));

    const consumedWhileInFlight: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const consumed = await h.controller.consumeNextPosterForStream();
      consumedWhileInFlight.push(consumed?.id ?? "null");
    }
    expect(h.state.ingestionItemCount).toBe(6);
    expect(fetchItems).toHaveBeenCalledTimes(1);

    pending.resolve(batch(31, 1_000));
    await flush();

    const queueIds = h.state.ingestionItems.map((m) => m.id);
    expect(consumedWhileInFlight.filter((id) => queueIds.includes(id))).toEqual([]);
    expect(queueIds).toHaveLength(37);
    expect(h.events.filter((e) => e.event === "queue.refill-completed")).toHaveLength(1);
  });

  it("keeps the stream moving after the library has been paged through once", async () => {
    const library = batch(150, 1);
    const jf = fakeJellyfin(library);
    const h = harness({
      runtimeItems: library.slice(0, 100),
      adapter: (session, updatedSince) =>
        createRuntimePosterQueueRefillFetchAdapter({
          provider: { listMedia: jf.listMedia },
          session,
          selectedLibraryIds: ["movies"],
          ...(updatedSince ? { updatedSince } : {})
        })
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(40));

    const consumedIds: string[] = [];
    for (let tick = 0; tick < 1000; tick += 1) {
      const consumed = await h.controller.consumeNextPosterForStream();
      consumedIds.push(consumed?.id ?? "null");
      await flush();
    }

    expect(new Set(consumedIds.slice(-200)).size).toBeGreaterThan(100);
    expect(h.state.ingestionItemCount).toBeGreaterThan(1);
  });

  it("starts a warm (cached) wall with a full pass instead of a changes-only query", async () => {
    const library = batch(150, 1);
    const storage = memoryStorage();
    const seedCache = createPosterCache<MediaItem>();
    seedCache.setMany(library.slice(0, 40).map((m) => ({ key: m.id, value: m })), { ttlMs: 60_000 });
    const runtimeKey = ["jellyfin", SESSION.serverUrl, SESSION.userId, "movies"].join("::");
    storage.setItem(toPosterCacheStorageKey(runtimeKey), JSON.stringify(seedCache.toSnapshot()));

    const jf = fakeJellyfin(library);
    const h = harness({
      runtimeItems: library.slice(0, 100),
      storage,
      adapter: (session, updatedSince) =>
        createRuntimePosterQueueRefillFetchAdapter({
          provider: { listMedia: jf.listMedia },
          session,
          selectedLibraryIds: ["movies"],
          ...(updatedSince ? { updatedSince } : {})
        })
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    expect(h.adapterUpdatedSince).toEqual([null]);
    expect(h.state.ingestionFetchedAt).not.toBeNull();
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(40));
    for (let tick = 0; tick < 60; tick += 1) {
      await h.controller.consumeNextPosterForStream();
      await flush();
    }

    expect(jf.queries[0]?.updatedSince).toBeUndefined();
    expect(h.state.ingestionItemCount).toBeGreaterThan(1);
  });

  it("backs off between failed refills instead of retrying on every stream tick", async () => {
    let nowMs = Date.UTC(2026, 2, 1, 12, 0, 0);
    const fetchItems = vi.fn(async () => {
      throw Object.assign(new Error("Jellyfin unavailable"), {
        providerError: { category: "network", message: "Jellyfin unavailable", retriable: true }
      });
    });
    const h = harness({
      runtimeItems: batch(40, 1),
      adapter: () => ({ fetchItems, getState: () => ({ cursor: null, updatedSince: null }) }),
      now: () => nowMs
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(40));
    for (let tick = 0; tick < 100; tick += 1) {
      await h.controller.consumeNextPosterForStream();
      await flush();
      nowMs += 1_000;
    }

    // The queue drops below the low watermark around tick 31, leaving ~70 s of failures.
    // With 2 s -> 60 s exponential backoff that is a handful of attempts, not ~70.
    expect(fetchItems.mock.calls.length).toBeGreaterThan(0);
    expect(fetchItems.mock.calls.length).toBeLessThanOrEqual(6);
    expect(h.events.filter((e) => e.event === "queue.refill-requested").length)
      .toBe(fetchItems.mock.calls.length);
  });

  it("drops a late refill after the queue was cleared by an empty library", async () => {
    const pending = deferred<readonly MediaItem[]>();
    const fetchItems = vi.fn(async () => pending.promise);
    const h = harness({
      runtimeItems: batch(120, 1),
      adapter: () => ({ fetchItems, getState: () => ({ cursor: null, updatedSince: null }) })
    });
    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(40));
    for (let i = 0; i < 31; i += 1) {
      await h.controller.consumeNextPosterForStream();
    }
    await vi.waitFor(() => expect(fetchItems).toHaveBeenCalledTimes(1));

    h.hooks.onStateChange?.({
      status: "ready", trigger: "scheduled", items: [], fetchedAt: "2026-03-01T12:05:00.000Z", nextCursor: null, error: null
    });
    expect(h.state.ingestionItemCount).toBe(0);

    pending.resolve(batch(31, 1_000));
    await flush();
    expect(h.state.ingestionItemCount).toBe(0);
    expect(h.posterCache.getStats().itemCount).toBe(0);
  });

  it("ignores state published by a runtime that has already been replaced", async () => {
    const fetchItems = vi.fn(async () => [] as readonly MediaItem[]);
    const h = harness({
      runtimeItems: batch(40, 1),
      adapter: () => ({ fetchItems, getState: () => ({ cursor: null, updatedSince: null }) })
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(40));
    const staleOnStateChange = h.hooks.onStateChange;

    h.controller.disposeRuntime();
    h.controller.ensureRuntime({ ...SESSION, userId: "user-002" }, ["shows"]);
    const itemsForSecondRuntime = h.state.ingestionItems.map((m) => m.id);

    staleOnStateChange?.({
      status: "ready",
      trigger: "scheduled",
      items: batch(5, 9_000),
      fetchedAt: "2026-03-01T12:05:00.000Z",
      nextCursor: null,
      error: null
    });

    expect(h.state.ingestionItems.map((m) => m.id)).toEqual(itemsForSecondRuntime);
    expect(h.state.ingestionItems.some((m) => m.id.startsWith("media-9"))).toBe(false);
    expect(
      h.posterCache.list({ touch: false, sortByScore: false }).some((entry) => entry.key.startsWith("media-9"))
    ).toBe(false);
  });
});
