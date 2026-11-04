import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ONBOARDING_AUTH_SESSION_STORAGE_KEY,
  ONBOARDING_WALL_HANDOFF_STORAGE_KEY,
  clearPersistedPosterCaches,
  parsePosterCacheSnapshot,
  readOnboardingActiveSession,
  readOnboardingWallHandoff,
  toPosterCacheStorageKey
} from "../../src/runtime";
import { createPosterCache } from "../../src/cache";
import type { MediaItem, ProviderSession } from "../../src/types";

// Test double: an in-memory Storage, not a browser localStorage/sessionStorage.
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

const SESSION: ProviderSession = {
  providerId: "jellyfin",
  serverUrl: "https://jellyfin.local",
  userId: "user-1",
  username: "demo",
  accessToken: "token-1",
  createdAt: "2026-11-04T00:00:00.000Z"
};

function mediaItem(id: string): MediaItem {
  return {
    id,
    providerId: "jellyfin",
    libraryId: "movies",
    kind: "movie",
    title: `Title ${id}`,
    genres: [],
    tags: [],
    people: [],
    poster: { url: `https://poster.local/${id}.jpg` }
  };
}

describe("persisted onboarding state", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("discards a malformed wall handoff instead of returning it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage = memoryStorage();
    storage.setItem(ONBOARDING_WALL_HANDOFF_STORAGE_KEY, "{}");

    expect(readOnboardingWallHandoff(storage)).toBeNull();
    expect(storage.getItem(ONBOARDING_WALL_HANDOFF_STORAGE_KEY)).toBeNull();
  });

  it("returns a well-formed wall handoff", () => {
    const storage = memoryStorage();
    const handoff = {
      selectedLibraryIds: ["movies"],
      preferences: { rememberServer: true, rememberUsername: false, rememberPasswordRequested: false }
    };
    storage.setItem(ONBOARDING_WALL_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));

    expect(readOnboardingWallHandoff(storage)).toEqual(handoff);
  });

  it("discards an unparsable or incomplete persisted session without logging its content", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage = memoryStorage();

    storage.setItem(ONBOARDING_AUTH_SESSION_STORAGE_KEY, "{\"accessToken\":\"secret-token\"");
    expect(readOnboardingActiveSession({ currentSession: null, sessionStorageRef: storage })).toBeNull();

    storage.setItem(ONBOARDING_AUTH_SESSION_STORAGE_KEY, JSON.stringify({ accessToken: "secret-token" }));
    expect(readOnboardingActiveSession({ currentSession: null, sessionStorageRef: storage })).toBeNull();
    expect(storage.getItem(ONBOARDING_AUTH_SESSION_STORAGE_KEY)).toBeNull();

    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-token");
  });

  it("returns a well-formed persisted session", () => {
    const storage = memoryStorage();
    storage.setItem(ONBOARDING_AUTH_SESSION_STORAGE_KEY, JSON.stringify(SESSION));

    expect(readOnboardingActiveSession({ currentSession: null, sessionStorageRef: storage })).toEqual(SESSION);
  });

  it("keeps valid poster cache entries and drops malformed ones", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cache = createPosterCache<MediaItem>({ now: () => 1_000 });
    cache.setMany([
      { key: "a", value: mediaItem("a") },
      { key: "b", value: mediaItem("b") }
    ]);
    const snapshot = cache.toSnapshot();
    const corrupted = {
      ...snapshot,
      entries: [
        ...snapshot.entries,
        { ...snapshot.entries[0], key: "no-poster", value: { id: "no-poster" } },
        { ...snapshot.entries[0], key: 42 }
      ]
    };

    const parsed = parsePosterCacheSnapshot(JSON.stringify(corrupted));

    expect(parsed?.entries.map((entry) => entry.key).sort()).toEqual(["a", "b"]);
    expect(parsePosterCacheSnapshot("[]")).toBeNull();
    expect(parsePosterCacheSnapshot(null)).toBeNull();
  });

  it("clears every persisted poster cache and nothing else", () => {
    const storage = memoryStorage();
    storage.setItem(toPosterCacheStorageKey("jellyfin::a::u1::movies"), "{}");
    storage.setItem(toPosterCacheStorageKey("jellyfin::b::u2::shows"), "{}");
    storage.setItem("mps.onboarding.remembered-server", "https://jellyfin.local");

    clearPersistedPosterCaches(storage);

    expect(storage.length).toBe(1);
    expect(storage.getItem("mps.onboarding.remembered-server")).toBe("https://jellyfin.local");
  });
});
