// Throwaway repro (review only). Uses REAL core modules; only the provider's
// listMedia is replaced by a deferred so the timing can be controlled.
import { describe, expect, it } from "vitest"

import { createMediaIngestionRuntime } from "../../../../packages/core/src/ingestion"
import type { MediaIngestionRefreshTrigger } from "../../../../packages/core/src/ingestion"
import {
  createOnboardingBaseState,
  createOnboardingIngestionController,
  getOnboardingIngestionRuntimeKey,
  parseJson,
  toPosterCacheStorageKey,
  toReconnectGuideReason
} from "../../../../packages/core/src/runtime"
import { createPosterCache } from "../../../../packages/core/src/cache"
import { normalizeWallActivePosterIndex } from "../../../../packages/core/src/wall"
import type {
  MediaItem,
  ProviderErrorCategory,
  ProviderSession
} from "../../../../packages/core/src/types"
import type { MediaPage, MediaProvider } from "../../../../packages/core/src/provider"

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>()
  get length(): number { return this.map.size }
  clear(): void { this.map.clear() }
  getItem(key: string): string | null { return this.map.get(key) ?? null }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null }
  removeItem(key: string): void { this.map.delete(key) }
  setItem(key: string, value: string): void { this.map.set(key, value) }
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve: (v: T) => void = () => {}
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

function item(id: string, libraryId: string): MediaItem {
  return {
    id, providerId: "jellyfin", libraryId, kind: "movie", title: `Title ${id}`,
    genres: [], tags: [], people: [], poster: { url: `https://jf.test/Items/${id}/Images/Primary` }
  }
}

const SESSION_A: ProviderSession = {
  providerId: "jellyfin", serverUrl: "https://jf.test", userId: "user-A", username: "alice",
  accessToken: "token-A", createdAt: "2026-01-01T00:00:00.000Z"
}
const SESSION_B: ProviderSession = { ...SESSION_A, userId: "user-B", username: "bob", accessToken: "token-B" }

describe("stale ingestion publish after dispose", () => {
  it("applies runtime A's late result to the state that now belongs to runtime B and persists it under B's cache key", async () => {
    const pendingByUser = new Map<string, ReturnType<typeof deferred<MediaPage>>>()
    const provider: MediaProvider = {
      id: "jellyfin", displayName: "Jellyfin", capabilities: [],
      preflight: async () => ({ ok: true, serverVersion: "10.9.0" }),
      authenticate: async () => SESSION_A,
      restoreSession: async () => null,
      invalidateSession: async () => {},
      listLibraries: async () => [],
      listMedia: (session) => {
        const d = deferred<MediaPage>()
        pendingByUser.set(session.userId, d)
        return d.promise
      },
      toVisualItems: () => []
    }

    const state = createOnboardingBaseState<ProviderSession, unknown, MediaItem, ProviderErrorCategory, MediaIngestionRefreshTrigger>({
      rememberedServer: "", rememberedUsername: "", rememberPasswordRequested: false
    })
    const localStorageRef = new MemoryStorage()
    const posterCache = createPosterCache<MediaItem>()

    const controller = createOnboardingIngestionController({
      state,
      localStorageRef,
      posterCache,
      parseSnapshot: (value) => parseJson<ReturnType<typeof posterCache.toSnapshot>>(value),
      toPosterCacheStorageKey,
      createRuntime: ({ session, selectedLibraryIds, onStateChange }) =>
        createMediaIngestionRuntime({ provider, session, selectedLibraryIds, onStateChange }),
      appendDiagnosticsLog: () => {},
      toReconnectGuideReason,
      isWallRouteActive: () => true,
      onRenderRequest: () => {},
      normalizeWallActivePosterIndex,
      reconnectInitialBackoffMs: 2_000,
      reconnectMaxBackoffMs: 60_000,
      reconnectGuideThresholdMs: 60_000,
      cacheTtlMs: 60_000
    })

    // User A is on the wall; initial ingestion for A is in flight.
    controller.ensureRuntime(SESSION_A, ["lib-a"])
    expect(pendingByUser.has("user-A")).toBe(true)

    // Logout (runOnboardingLogoutReset -> disposeIngestionRuntime), then B enters the wall.
    controller.disposeRuntime()
    controller.ensureRuntime(SESSION_B, ["lib-b"])
    expect(pendingByUser.has("user-B")).toBe(true)

    // A's request now completes.
    pendingByUser.get("user-A")?.resolve({
      items: [item("a-secret-1", "lib-a"), item("a-secret-2", "lib-a")],
      fetchedAt: "2026-01-01T00:00:01.000Z"
    })
    await new Promise((r) => setTimeout(r, 0))

    const keyB = toPosterCacheStorageKey(getOnboardingIngestionRuntimeKey(SESSION_B, ["lib-b"]))
    const persistedForB = localStorageRef.getItem(keyB) ?? ""

    console.log("state.ingestionStatus =", state.ingestionStatus)
    console.log("state.ingestionItems  =", state.ingestionItems.map((i) => i.id))
    console.log("B cache key contains A items =", persistedForB.includes("a-secret-1"))

    // Demonstrates the defect: B's wall state + B's persisted cache now hold A's items.
    expect(state.ingestionItems.map((i) => i.id)).toContain("a-secret-1")
    expect(persistedForB).toContain("a-secret-1")

    // And B's own (later) result does not displace them from the queue.
    pendingByUser.get("user-B")?.resolve({ items: [item("b-1", "lib-b")], fetchedAt: "2026-01-01T00:00:02.000Z" })
    await new Promise((r) => setTimeout(r, 0))
    console.log("after B resolves, items =", state.ingestionItems.map((i) => i.id))
    expect(state.ingestionItems.map((i) => i.id)).toContain("a-secret-1")
  })
})
