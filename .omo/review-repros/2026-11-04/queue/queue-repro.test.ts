// Throwaway review repros. Not part of the repo.
import { describe, expect, it, vi } from "vitest";

import type {
  MediaIngestionRefreshTrigger,
  MediaIngestionRuntime,
  MediaIngestionState
} from "../../../../packages/core/src/ingestion";
import {
  createOnboardingBaseState,
  createOnboardingIngestionController,
  createRuntimePosterQueueRefillFetchAdapter,
  parseJson,
  toPosterCacheStorageKey,
  toReconnectGuideReason
} from "../../../../packages/core/src/runtime";
import { createPosterCache } from "../../../../packages/core/src/cache";
import type { MediaPage, MediaQuery } from "../../../../packages/core/src/provider";
import type {
  MediaItem,
  ProviderErrorCategory,
  ProviderSession
} from "../../../../packages/core/src/types";

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
    parseSnapshot: (value: string | null) => parseJson<ReturnType<typeof posterCache.toSnapshot>>(value),
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
    cacheTtlMs: 60_000
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

describe("review repros", () => {
  it("R1: in-flight refill overwrites newer queue state -> consumed posters re-enter queue; N completion logs", async () => {
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
    expect(h.state.ingestionItemCount).toBe(9);

    // Three more 1s stream ticks happen while the network fetch is pending.
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
    const reappeared = consumedWhileInFlight.filter((id) => queueIds.includes(id));
    const completedLogs = h.events.filter((e) => e.event === "queue.refill-completed").length;
    console.log("R1 consumed while in flight:", consumedWhileInFlight);
    console.log("R1 queue size after refill:", queueIds.length, "(expected 6 + 31 = 37)");
    console.log("R1 already-consumed ids back in queue:", reappeared);
    console.log("R1 queue.refill-completed log entries for ONE fetch:", completedLogs);
    expect(reappeared).toEqual([]); // FAILS if the defect exists
  });

  it("R2: adapter never wraps after cursor exhaustion -> stream starves on a static library", async () => {
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
    // 1000 one-second ticks ~= 17 minutes of wall time.
    for (let tick = 0; tick < 1000; tick += 1) {
      const consumed = await h.controller.consumeNextPosterForStream();
      consumedIds.push(consumed?.id ?? "null");
      await flush();
    }

    const last200 = consumedIds.slice(-200);
    const distinctLast200 = new Set(last200);
    const starvedEmpty = h.events.filter(
      (e) => e.event === "queue.refill-completed"
        && (e.details as { starvation?: string }).starvation === "empty"
    ).length;
    console.log("R2 provider calls:", jf.listMedia.mock.calls.length);
    console.log("R2 queries with updatedSince (delta-only):", jf.queries.filter((q) => q.updatedSince).length);
    console.log("R2 queue size at end:", h.state.ingestionItemCount);
    console.log("R2 distinct posters in last 200 ticks:", distinctLast200.size, [...distinctLast200].slice(0, 3));
    console.log("R2 refills with starvation=empty:", starvedEmpty);
    expect(distinctLast200.size).toBeGreaterThan(1); // FAILS if the stream starves
  });

  it("R3: warm cache start -> adapter created with updatedSince=now, first refill is delta-only", async () => {
    const library = batch(150, 1);
    const storage = memoryStorage();
    // Previous session persisted 40 posters in the cache.
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
    console.log("R3 adapter created with updatedSince:", h.adapterUpdatedSince);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(40));
    for (let tick = 0; tick < 60; tick += 1) {
      await h.controller.consumeNextPosterForStream();
      await flush();
    }
    console.log("R3 first adapter query:", JSON.stringify(jf.queries[0]));
    console.log("R3 queue size after 60 ticks:", h.state.ingestionItemCount);
    expect(jf.queries[0]?.updatedSince).toBeUndefined(); // FAILS if first refill is delta-only
  });

  it("R4: failing refill retried on every stream tick (no backoff), 2 log entries per tick", async () => {
    const fetchItems = vi.fn(async () => {
      throw Object.assign(new Error("Jellyfin unavailable"), {
        providerError: { category: "network", message: "Jellyfin unavailable", retriable: true }
      });
    });
    const h = harness({
      runtimeItems: batch(40, 1),
      adapter: () => ({ fetchItems, getState: () => ({ cursor: null, updatedSince: null }) })
    });

    h.controller.ensureRuntime(SESSION, ["movies"]);
    await vi.waitFor(() => expect(h.state.ingestionItemCount).toBe(40));
    for (let tick = 0; tick < 100; tick += 1) {
      await h.controller.consumeNextPosterForStream();
      await flush();
    }
    const failed = h.events.filter((e) => e.event === "queue.refill-failed").length;
    const requested = h.events.filter((e) => e.event === "queue.refill-requested").length;
    console.log("R4 fetch attempts over 100 ticks:", fetchItems.mock.calls.length);
    console.log("R4 refill-requested logs:", requested, "refill-failed logs:", failed);
  });

  it("R5: ready+empty ingestion while refill in flight -> late refill resurrects cleared queue (no nonce bump)", async () => {
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

    // Library emptied server-side: ingestion reports ready with zero items.
    h.hooks.onStateChange?.({
      status: "ready", trigger: "scheduled", items: [], fetchedAt: "2026-03-01T12:05:00.000Z", nextCursor: null, error: null
    });
    const afterClear = h.state.ingestionItemCount;
    const cacheAfterClear = h.posterCache.getStats().itemCount;

    pending.resolve(batch(31, 1_000));
    await flush();
    console.log("R5 queue after empty-ready:", afterClear, "cache:", cacheAfterClear);
    console.log("R5 queue after late refill:", h.state.ingestionItemCount, "cache:", h.posterCache.getStats().itemCount);
    expect(h.state.ingestionItemCount).toBe(0); // FAILS if stale result resurrects the queue
  });
});
