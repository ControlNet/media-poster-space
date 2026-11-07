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
import { createSeededRandom, keepDeliveredOrder } from "../fixtures";
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
  // Defaults to a further page: the runtime delivered the first page of a larger library.
  runtimeNextCursor?: string | null;
  random?: () => number;
  wallTileCount?: number;
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
  const adapterCursors: Array<string | null> = [];
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
        nextCursor: options.runtimeNextCursor === undefined ? "next-page" : options.runtimeNextCursor,
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
    createQueueRefillFetchAdapter: ({ session, cursor, updatedSince }) => {
      adapterUpdatedSince.push(updatedSince);
      adapterCursors.push(cursor);
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
    random: options.random ?? keepDeliveredOrder,
    ...(options.wallTileCount !== undefined ? { resolveWallTileCount: () => options.wallTileCount ?? 0 } : {}),
    ...(options.now ? { now: options.now } : {})
  });

  return { controller, state, events, posterCache, adapterUpdatedSince, adapterCursors, hooks };
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
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(120));

    for (let i = 0; i < 61; i += 1) {
      await h.controller.consumeNextPosterForStream();
    }
    await vi.waitFor(() => expect(fetchItems).toHaveBeenCalledTimes(1));

    const consumedWhileInFlight: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const consumed = await h.controller.consumeNextPosterForStream();
      consumedWhileInFlight.push(consumed?.id ?? "null");
    }
    expect(h.state.ingestionItemCount).toBe(56);
    expect(fetchItems).toHaveBeenCalledTimes(1);

    pending.resolve(batch(61, 1_000));
    await flush();

    const queueIds = h.state.ingestionItems.map((m) => m.id);
    expect(consumedWhileInFlight.filter((id) => queueIds.includes(id))).toEqual([]);
    expect(queueIds).toHaveLength(117);
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
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBeGreaterThanOrEqual(100));

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
    expect(h.state.ingestionFetchedAt).not.toBeNull();
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBeGreaterThanOrEqual(40));
    for (let tick = 0; tick < 60; tick += 1) {
      await h.controller.consumeNextPosterForStream();
      await flush();
    }

    // The adapter is only created once the delivered page is used up, and always as a full pass.
    expect(h.adapterUpdatedSince).toEqual([null]);
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
      runtimeItems: batch(120, 1),
      adapter: () => ({ fetchItems, getState: () => ({ cursor: null, updatedSince: null }) }),
      now: () => nowMs
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(120));
    for (let tick = 0; tick < 100; tick += 1) {
      await h.controller.consumeNextPosterForStream();
      await flush();
      nowMs += 1_000;
    }

    // The queue drops below the low watermark around tick 61, leaving ~40 s of failures.
    // With 2 s -> 60 s exponential backoff that is a handful of attempts, not ~40.
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
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(120));
    for (let i = 0; i < 61; i += 1) {
      await h.controller.consumeNextPosterForStream();
    }
    await vi.waitFor(() => expect(fetchItems).toHaveBeenCalledTimes(1));

    h.hooks.onStateChange?.({
      status: "ready", trigger: "scheduled", items: [], fetchedAt: "2026-03-01T12:05:00.000Z", nextCursor: null, error: null
    });
    expect(h.state.ingestionItemCount).toBe(0);

    pending.resolve(batch(61, 1_000));
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

  it("uses the rest of the delivered page before asking the adapter for more", async () => {
    const fetchItems = vi.fn(async () => [] as readonly MediaItem[]);
    const h = harness({
      runtimeItems: batch(200, 1),
      adapter: () => ({ fetchItems, getState: () => ({ cursor: null, updatedSince: null }) })
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(120));
    for (let i = 0; i < 61; i += 1) {
      await h.controller.consumeNextPosterForStream();
    }
    await flush();

    // Items 121..181 come from the page the runtime already delivered, not from a second fetch.
    expect(fetchItems).not.toHaveBeenCalled();
    expect(h.adapterCursors).toEqual([]);
    expect(h.state.ingestionItems.map((m) => m.id)).toContain("media-0181");
    expect(h.state.ingestionItems.map((m) => m.id)).not.toContain("media-0001");
  });

  it("continues the adapter after the page the ingestion runtime delivered", async () => {
    const library = batch(300, 1);
    const jf = fakeJellyfin(library);
    const h = harness({
      runtimeItems: library.slice(0, 100),
      runtimeNextCursor: "100",
      adapter: (session) =>
        createRuntimePosterQueueRefillFetchAdapter({
          provider: { listMedia: jf.listMedia },
          session,
          selectedLibraryIds: ["movies"],
          cursor: "100"
        })
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBeGreaterThanOrEqual(100));
    await flush();

    expect(h.adapterCursors).toEqual(["100"]);
    expect(jf.queries[0]?.cursor).toBe("100");
    // The bootstrap top-up brings new posters (101..120), not a second copy of 1..20.
    expect(h.state.ingestionItems.map((m) => m.id)).toContain("media-0120");
    expect(h.events.find((e) => e.event === "queue.refill-completed")?.details).toMatchObject({
      acceptedCount: 20,
      duplicateCount: 0
    });
  });

  it("keeps its place in a page that the runtime publishes again", async () => {
    const fetchItems = vi.fn(async () => batch(61, 5_000));
    const h = harness({
      runtimeItems: batch(120, 1),
      random: createSeededRandom(7),
      adapter: () => ({ fetchItems, getState: () => ({ cursor: null, updatedSince: null }) })
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(120));

    const consumedIds: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      consumedIds.push((await h.controller.consumeNextPosterForStream())?.id ?? "null");
    }
    // A refresh republishes the same page (status "refreshing", then "ready"). The page arrives in
    // delivery order while the queue reads it shuffled; it must still be recognised as the same.
    h.hooks.onStateChange?.({
      status: "refreshing", trigger: "manual", items: batch(120, 1), fetchedAt: "2026-03-01T12:00:00.000Z", nextCursor: null, error: null
    });
    await flush();
    expect(h.state.ingestionItemCount).toBe(90);
    for (let i = 0; i < 31; i += 1) {
      consumedIds.push((await h.controller.consumeNextPosterForStream())?.id ?? "null");
    }
    await flush();

    // The page was already used up (in its shuffled order), so the refill asks the adapter
    // instead of re-serving posters that were just shown.
    expect(fetchItems).toHaveBeenCalledTimes(1);
    const queuedIds = h.state.ingestionItems.map((m) => m.id);
    expect(consumedIds.filter((id) => queuedIds.includes(id))).toEqual([]);
  });

  it("cycles a library that fits in one page from memory instead of fetching it every tick", async () => {
    const fetchItems = vi.fn(async () => batch(24, 1));
    const h = harness({
      runtimeItems: batch(24, 1),
      runtimeNextCursor: null,
      adapter: () => ({ fetchItems, getState: () => ({ cursor: null, updatedSince: null }) })
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(24));
    const consumedIds: string[] = [];
    for (let tick = 0; tick < 60; tick += 1) {
      const consumed = await h.controller.consumeNextPosterForStream();
      consumedIds.push(consumed?.id ?? "null");
      await flush();
    }

    // The runtime's page was the whole library: no adapter, no network.
    expect(h.adapterCursors).toEqual([]);
    expect(fetchItems).not.toHaveBeenCalled();
    // The pool is the library (24), refilled from memory when half of it has been shown.
    expect(h.events.filter((e) => e.event === "queue.refill-requested").length).toBeLessThanOrEqual(6);
    expect(new Set(consumedIds).size).toBe(24);
    expect(h.state.ingestionItemCount).toBeGreaterThan(0);
  });

  it("puts posters from a changed page on the wall without waiting for the queue to drain", async () => {
    const fetchItems = vi.fn(async () => [] as readonly MediaItem[]);
    const h = harness({
      runtimeItems: batch(24, 1),
      runtimeNextCursor: null,
      adapter: () => ({ fetchItems, getState: () => ({ cursor: null, updatedSince: null }) })
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(24));

    // A refresh finds six new titles. The queue is still full (the pool is the 24-item library),
    // so without an immediate enqueue they would only arrive after half of it had been shown.
    h.hooks.onStateChange?.({
      status: "ready",
      trigger: "manual",
      items: [...batch(6, 900), ...batch(24, 1)],
      fetchedAt: "2026-03-01T12:05:00.000Z",
      nextCursor: null,
      error: null
    });
    await flush();

    const wallIds = h.state.ingestionItems.map((m) => m.id);
    for (const newItem of batch(6, 900)) {
      expect(wallIds).toContain(newItem.id);
    }
    expect(fetchItems).not.toHaveBeenCalled();
  });

  it("shuffles the delivered posters into a different order on every launch", async () => {
    const launch = async (seed: number): Promise<string[]> => {
      const h = harness({
        runtimeItems: batch(120, 1),
        random: createSeededRandom(seed),
        adapter: () => ({ fetchItems: async () => [], getState: () => ({ cursor: null, updatedSince: null }) })
      });
      h.controller.ensureRuntime(SESSION, ["movies"]);
      await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(120));
      return h.state.ingestionItems.map((m) => m.id);
    };

    const deliveredOrder = batch(120, 1).map((m) => m.id);
    const firstLaunch = await launch(1);
    const secondLaunch = await launch(2);

    expect([...firstLaunch].sort()).toEqual(deliveredOrder);
    expect([...secondLaunch].sort()).toEqual(deliveredOrder);
    expect(firstLaunch).not.toEqual(deliveredOrder);
    expect(secondLaunch).not.toEqual(firstLaunch);
    expect(firstLaunch.slice(0, 20)).not.toEqual(secondLaunch.slice(0, 20));
  });

  it("shuffles posters fetched by the adapter and each pass over a small library", async () => {
    const fetchItems = vi.fn(async (n: number) => batch(n, 1_000));
    const h = harness({
      runtimeItems: batch(100, 1),
      random: createSeededRandom(3),
      adapter: () => ({ fetchItems, getState: () => ({ cursor: null, updatedSince: null }) })
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(120));

    // The adapter delivered media-1000..1019 in that order; the queue holds them shuffled.
    const adapterIds = h.state.ingestionItems.slice(100).map((m) => m.id);
    expect([...adapterIds].sort()).toEqual(batch(20, 1_000).map((m) => m.id));
    expect(adapterIds).not.toEqual(batch(20, 1_000).map((m) => m.id));

    // A library that fits in one page is cycled from memory; consecutive passes differ.
    const small = harness({
      runtimeItems: batch(24, 1),
      runtimeNextCursor: null,
      random: createSeededRandom(4),
      adapter: () => ({ fetchItems: async () => [], getState: () => ({ cursor: null, updatedSince: null }) })
    });
    small.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(small.state.ingestionItemCount).toBe(24));
    const consumed: string[] = [];
    for (let tick = 0; tick < 72; tick += 1) {
      consumed.push((await small.controller.consumeNextPosterForStream())?.id ?? "null");
      await flush();
    }
    // Without a new order per pass the stream would repeat with a period of the library size.
    expect(new Set(consumed).size).toBe(24);
    expect(consumed.slice(24, 48)).not.toEqual(consumed.slice(48, 72));
  });

  it("sizes the poster pool to a 4K wall", async () => {
    const fetchItems = vi.fn(async (n: number) => batch(n, 1_000));
    const h = harness({
      runtimeItems: batch(100, 1),
      wallTileCount: 272,
      adapter: () => ({ fetchItems, getState: () => ({ cursor: null, updatedSince: null }) })
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);

    // 272 tiles (8 rows of 34) need a pool of 363: the 100-poster page plus 263 from the adapter.
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(363));
    expect(fetchItems).toHaveBeenCalledWith(263);
    expect(new Set(h.state.ingestionItems.map((m) => m.id)).size).toBe(363);
  });
});
