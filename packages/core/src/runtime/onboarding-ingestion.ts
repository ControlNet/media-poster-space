import type {
  MediaIngestionRefreshTrigger,
  MediaIngestionRuntime,
  MediaIngestionState
} from "../ingestion"
import type {
  MediaItem,
  ProviderErrorCategory,
  ProviderSession
} from "../types"
import type { DiagnosticsLogEntry } from "./diagnostics"
import type { OnboardingBaseState } from "./onboarding-shared"

export interface OnboardingPosterCacheEntry {
  key: string
  value: MediaItem
}

export interface OnboardingPosterCache<Snapshot = unknown> {
  toSnapshot: () => Snapshot
  clear: () => void
  hydrate: (snapshot: Snapshot | null | undefined) => void
  list: (options: { touch: boolean; sortByScore: boolean }) => OnboardingPosterCacheEntry[]
  setMany: (
    entries: OnboardingPosterCacheEntry[],
    options: {
      ttlMs: number
      preheated?: boolean
    }
  ) => void
  markPreheated?: (keys: readonly string[]) => void
}

type OnboardingSharedState = OnboardingBaseState<
  ProviderSession,
  unknown,
  MediaItem,
  ProviderErrorCategory,
  MediaIngestionRefreshTrigger
>

export interface CreateOnboardingIngestionControllerOptions<Snapshot = unknown> {
  state: OnboardingSharedState
  localStorageRef: Storage | null
  posterCache: OnboardingPosterCache<Snapshot>
  parseSnapshot: (value: string | null) => Snapshot | null
  toPosterCacheStorageKey: (runtimeKey: string) => string
  createRuntime: (options: {
    session: ProviderSession
    selectedLibraryIds: readonly string[]
    onStateChange: (state: MediaIngestionState) => void
  }) => MediaIngestionRuntime
  appendDiagnosticsLog: (entry: DiagnosticsLogEntry) => void
  toReconnectGuideReason: (
    errorCategory: ProviderErrorCategory | null
  ) => "auth" | "network" | "timeout" | "unknown"
  isWallRouteActive: () => boolean
  onRenderRequest: () => void
  normalizeWallActivePosterIndex: (
    activePosterIndex: number | null,
    itemCount: number
  ) => number | null
  reconnectInitialBackoffMs: number
  reconnectMaxBackoffMs: number
  reconnectGuideThresholdMs: number
  cacheTtlMs: number
  cacheSetPreheated?: boolean
  markHydratedItemsAsPreheated?: boolean
  now?: () => number
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

export interface OnboardingIngestionController {
  disposeRuntime: () => void
  ensureRuntime: (
    session: ProviderSession,
    selectedLibraryIds: readonly string[]
  ) => void
  refreshNow: () => Promise<void>
}

export function createOnboardingIngestionController<Snapshot = unknown>(
  options: CreateOnboardingIngestionControllerOptions<Snapshot>
): OnboardingIngestionController {
  const now = options.now ?? Date.now

  let ingestionRuntime: MediaIngestionRuntime | null = null
  let ingestionRuntimeKey: string | null = null
  let reconnectTimerId: ReturnType<typeof setTimeout> | null = null
  let reconnectStartedAtMs: number | null = null
  let reconnectBackoffMs = options.reconnectInitialBackoffMs

  function clearReconnectTimer(): void {
    if (!reconnectTimerId) {
      return
    }

    ;(options.clearTimeoutFn ?? clearTimeout)(reconnectTimerId)
    reconnectTimerId = null
  }

  function resetReconnectState(): void {
    clearReconnectTimer()
    reconnectStartedAtMs = null
    reconnectBackoffMs = options.reconnectInitialBackoffMs
    options.state.reconnectAttempt = 0
    options.state.reconnectNextDelayMs = null
    options.state.reconnectGuideVisible = false
    options.state.reconnectGuideReason = null
  }

  function syncPosterCacheToStorage(runtimeKey: string): void {
    options.localStorageRef?.setItem(
      options.toPosterCacheStorageKey(runtimeKey),
      JSON.stringify(options.posterCache.toSnapshot())
    )
  }

  function clearPosterCache(runtimeKey: string): void {
    options.posterCache.clear()
    options.localStorageRef?.removeItem(options.toPosterCacheStorageKey(runtimeKey))
  }

  function hydratePosterCache(runtimeKey: string): void {
    const snapshot = options.parseSnapshot(
      options.localStorageRef?.getItem(options.toPosterCacheStorageKey(runtimeKey)) ?? null
    )

    options.posterCache.hydrate(snapshot)

    if (options.markHydratedItemsAsPreheated && typeof options.posterCache.markPreheated === "function") {
      const preheatedKeys = options.posterCache
        .list({ touch: false, sortByScore: true })
        .map((item) => item.key)

      if (preheatedKeys.length > 0) {
        options.posterCache.markPreheated(preheatedKeys)
        syncPosterCacheToStorage(runtimeKey)
      }
    }

    const cachedItems = options.posterCache
      .list({ touch: false, sortByScore: true })
      .map((item) => item.value)

    if (cachedItems.length === 0) {
      return
    }

    options.state.ingestionStatus = "ready"
    options.state.ingestionItems = cachedItems
    options.state.ingestionItemCount = cachedItems.length
    options.state.ingestionFetchedAt = new Date().toISOString()
    options.state.ingestionTrigger = null
    options.state.ingestionError = null
    options.state.ingestionErrorCategory = null
  }

  function cacheIngestionItems(runtimeKey: string, items: readonly MediaItem[]): void {
    if (items.length === 0) {
      clearPosterCache(runtimeKey)
      return
    }

    const setManyOptions =
      typeof options.cacheSetPreheated === "boolean"
        ? {
            ttlMs: options.cacheTtlMs,
            preheated: options.cacheSetPreheated
          }
        : {
            ttlMs: options.cacheTtlMs
          }

    options.posterCache.setMany(
      items.map((item) => ({
        key: item.id,
        value: item
      })),
      setManyOptions
    )

    syncPosterCacheToStorage(runtimeKey)
  }

  function scheduleReconnectAttempt(errorCategory: ProviderErrorCategory | null): void {
    if (!ingestionRuntime || !options.isWallRouteActive()) {
      return
    }

    const nowMs = now()
    if (reconnectStartedAtMs === null) {
      reconnectStartedAtMs = nowMs
    }

    const elapsedMs = nowMs - reconnectStartedAtMs
    if (errorCategory === "auth" || elapsedMs >= options.reconnectGuideThresholdMs) {
      options.state.reconnectGuideVisible = true
      options.state.reconnectGuideReason = options.toReconnectGuideReason(errorCategory)
    }

    if (reconnectTimerId) {
      return
    }

    const retryDelayMs = reconnectBackoffMs
    options.state.reconnectNextDelayMs = retryDelayMs
    options.appendDiagnosticsLog({
      timestamp: new Date().toISOString(),
      level: "warn",
      event: "ingestion.reconnect-scheduled",
      details: {
        retryDelayMs,
        reason: options.toReconnectGuideReason(errorCategory)
      }
    })

    reconnectTimerId = (options.setTimeoutFn ?? setTimeout)(() => {
      reconnectTimerId = null
      options.state.reconnectAttempt += 1
      reconnectBackoffMs = Math.min(
        reconnectBackoffMs * 2,
        options.reconnectMaxBackoffMs
      )
      options.state.reconnectNextDelayMs = reconnectBackoffMs
      options.onRenderRequest()
      void ingestionRuntime?.refreshNow()
    }, retryDelayMs)
  }

  function resetIngestionState(): void {
    options.state.ingestionStatus = "idle"
    options.state.ingestionItems = []
    options.state.ingestionItemCount = 0
    options.state.ingestionFetchedAt = null
    options.state.ingestionError = null
    options.state.ingestionErrorCategory = null
    options.state.ingestionTrigger = null
    options.state.activePosterIndex = null
    options.state.wallControlsHidden = false
    resetReconnectState()
  }

  function applyIngestionState(nextState: MediaIngestionState): void {
    options.state.ingestionStatus = nextState.status
    options.state.ingestionTrigger = nextState.trigger

    if (nextState.items.length > 0) {
      options.state.ingestionItems = [...nextState.items]
      options.state.ingestionItemCount = nextState.items.length
      if (ingestionRuntimeKey) {
        cacheIngestionItems(ingestionRuntimeKey, nextState.items)
      }
    } else if (nextState.status === "ready") {
      options.state.ingestionItems = []
      options.state.ingestionItemCount = 0
      if (ingestionRuntimeKey) {
        clearPosterCache(ingestionRuntimeKey)
      }
    }

    if (nextState.fetchedAt) {
      options.state.ingestionFetchedAt = nextState.fetchedAt
    }

    options.state.ingestionError = nextState.error?.message ?? null
    options.state.ingestionErrorCategory = nextState.error?.category ?? null

    options.appendDiagnosticsLog({
      timestamp: new Date().toISOString(),
      level: nextState.status === "error" ? "warn" : "info",
      event: "ingestion.state-change",
      details: {
        status: nextState.status,
        trigger: nextState.trigger,
        itemCount: nextState.items.length,
        reconnectAttempt: options.state.reconnectAttempt,
        reconnectNextDelayMs: options.state.reconnectNextDelayMs,
        errorCategory: nextState.error?.category ?? null
      }
    })

    if (nextState.status === "ready") {
      resetReconnectState()
    } else if (nextState.status === "error") {
      scheduleReconnectAttempt(nextState.error?.category ?? null)
    }

    options.state.activePosterIndex = options.normalizeWallActivePosterIndex(
      options.state.activePosterIndex,
      options.state.ingestionItems.length
    )

    options.onRenderRequest()
  }

  function disposeRuntime(): void {
    ingestionRuntime?.dispose()
    ingestionRuntime = null
    ingestionRuntimeKey = null
    resetIngestionState()
  }

  function getIngestionRuntimeKey(
    session: ProviderSession,
    selectedLibraryIds: readonly string[]
  ): string {
    return [
      session.providerId,
      session.serverUrl,
      session.userId,
      [...selectedLibraryIds].sort().join(",")
    ].join("::")
  }

  function ensureRuntime(
    session: ProviderSession,
    selectedLibraryIds: readonly string[]
  ): void {
    const runtimeKey = getIngestionRuntimeKey(session, selectedLibraryIds)
    if (ingestionRuntime && ingestionRuntimeKey === runtimeKey) {
      return
    }

    disposeRuntime()
    ingestionRuntimeKey = runtimeKey
    hydratePosterCache(runtimeKey)
    ingestionRuntime = options.createRuntime({
      session,
      selectedLibraryIds,
      onStateChange: applyIngestionState
    })
    ingestionRuntime.start()
  }

  return {
    disposeRuntime,
    ensureRuntime,
    refreshNow: async () => {
      if (!ingestionRuntime) {
        return
      }

      await ingestionRuntime.refreshNow()
    }
  }
}
