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
import {
  consumeRuntimePosterQueueItem,
  createRuntimePosterQueueRefillRuntime,
  createRuntimePosterQueueState,
  enqueueRuntimePosterQueueItems,
  getRuntimePosterQueueRefillIntent,
  type RuntimePosterQueueRefillReason,
  type RuntimePosterQueueState
} from "./poster-queue"
import type {
  RuntimePosterQueueRefillFetchAdapter,
  RuntimePosterQueueRefillFetchAdapterState
} from "./poster-queue-refill-adapter"

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

// Writing the whole poster cache to storage on every one-second stream tick is wasteful
// (and was the hot path where a full quota surfaced). Ingestion results still persist
// immediately; stream ticks persist at most this often.
export const ONBOARDING_POSTER_CACHE_PERSIST_INTERVAL_MS = 30_000

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
  createQueueRefillFetchAdapter?: (options: {
    session: ProviderSession
    selectedLibraryIds: readonly string[]
    cursor: string | null
    updatedSince: string | null
  }) => RuntimePosterQueueRefillFetchAdapter
  onStreamReadyTransition?: (transition: OnboardingPosterStreamReadyTransition) => void
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
  consumeNextPosterForStream: () => Promise<MediaItem | null>
  refreshNow: () => Promise<void>
}

export interface OnboardingPosterStreamReadyTransition {
  poster: MediaItem
  queueSize: number
  refillReason: RuntimePosterQueueRefillReason | null
}

export function createOnboardingIngestionController<Snapshot = unknown>(
  options: CreateOnboardingIngestionControllerOptions<Snapshot>
): OnboardingIngestionController {
  const now = options.now ?? Date.now
  const providerErrorCategories: readonly ProviderErrorCategory[] = [
    "auth",
    "network",
    "timeout",
    "cors",
    "unknown"
  ]

  let ingestionRuntime: MediaIngestionRuntime | null = null
  let ingestionRuntimeKey: string | null = null
  let reconnectTimerId: ReturnType<typeof setTimeout> | null = null
  let reconnectStartedAtMs: number | null = null
  let reconnectBackoffMs = options.reconnectInitialBackoffMs
  let posterQueueState: RuntimePosterQueueState = createRuntimePosterQueueState()
  let posterQueueRefillRuntime = createRuntimePosterQueueRefillRuntime()
  let queueRefillSourceItems: MediaItem[] = []
  let queueRefillSourceCursor = 0
  let queueRefillFetchAdapter: RuntimePosterQueueRefillFetchAdapter | null = null
  let queueLifecycleNonce = 0
  let runtimeGeneration = 0
  let refillRetryNotBeforeMs: number | null = null
  let refillRetryBackoffMs = options.reconnectInitialBackoffMs
  let lastPosterCachePersistAtMs: number | null = null

  function isProviderErrorCategory(value: unknown): value is ProviderErrorCategory {
    if (typeof value !== "string") {
      return false
    }

    return providerErrorCategories.includes(value as ProviderErrorCategory)
  }

  function resetQueueState(): void {
    queueLifecycleNonce += 1
    posterQueueState = createRuntimePosterQueueState()
    posterQueueRefillRuntime = createRuntimePosterQueueRefillRuntime()
    queueRefillSourceItems = []
    queueRefillSourceCursor = 0
    queueRefillFetchAdapter = null
    refillRetryNotBeforeMs = null
    refillRetryBackoffMs = options.reconnectInitialBackoffMs
  }

  function syncWallItemsFromQueue(): void {
    options.state.ingestionItems = [...posterQueueState.items]
    options.state.ingestionItemCount = posterQueueState.items.length
  }

  function setQueueRefillSourceItems(items: readonly MediaItem[]): void {
    queueRefillSourceItems = [...items]
    queueRefillSourceCursor = 0
  }

  function takeQueueRefillSourceItems(requestedCount: number, options: {
    allowWrap: boolean
  }): MediaItem[] {
    const normalizedCount = Number.isFinite(requestedCount)
      ? Math.max(Math.trunc(requestedCount), 0)
      : 0

    if (normalizedCount === 0 || queueRefillSourceItems.length === 0) {
      return []
    }

    const fetchedItems: MediaItem[] = []
    for (let index = 0; index < normalizedCount; index += 1) {
      if (queueRefillSourceCursor >= queueRefillSourceItems.length) {
        if (!options.allowWrap) {
          break
        }

        queueRefillSourceCursor = 0
      }

      const nextItem = queueRefillSourceItems[queueRefillSourceCursor]
      if (!nextItem) {
        break
      }

      fetchedItems.push(nextItem)
      queueRefillSourceCursor += 1
    }

    return fetchedItems
  }

  function seedPosterQueueFromSource(): void {
    const bootstrapIntent = getRuntimePosterQueueRefillIntent({ state: posterQueueState })
    if (!bootstrapIntent.shouldRefill || bootstrapIntent.requestedCount === 0) {
      syncWallItemsFromQueue()
      return
    }

    const bootstrapItems = takeQueueRefillSourceItems(bootstrapIntent.requestedCount, {
      allowWrap: false
    })
    if (bootstrapItems.length === 0) {
      syncWallItemsFromQueue()
      return
    }

    posterQueueState = enqueueRuntimePosterQueueItems({
      state: posterQueueState,
      items: bootstrapItems
    }).nextState
    syncWallItemsFromQueue()
  }

  async function fetchQueueRefillItems(requestedCount: number): Promise<readonly MediaItem[]> {
    if (queueRefillFetchAdapter) {
      const fetchedItems = await queueRefillFetchAdapter.fetchItems(requestedCount)
      if (fetchedItems.length > 0) {
        return fetchedItems
      }

      // An empty page (e.g. the end of a pass) must not starve the wall: keep rotating
      // through the items the ingestion runtime already delivered.
      return takeQueueRefillSourceItems(requestedCount, {
        allowWrap: true
      })
    }

    return takeQueueRefillSourceItems(requestedCount, {
      allowWrap: true
    })
  }

  function toQueueRefillFetchAdapterStateSnapshot(): RuntimePosterQueueRefillFetchAdapterState | null {
    if (!queueRefillFetchAdapter) {
      return null
    }

    return queueRefillFetchAdapter.getState()
  }

  async function refillPosterQueueIfNeeded(source: "ingestion-ready" | "stream-consume"): Promise<void> {
    if (!options.isWallRouteActive()) {
      return
    }

    const refillIntent = getRuntimePosterQueueRefillIntent({ state: posterQueueState })
    if (!refillIntent.shouldRefill || refillIntent.reason === null || refillIntent.requestedCount === 0) {
      return
    }

    // Only one refill runs at a time; ticks that arrive meanwhile simply wait for it
    // instead of each applying (and logging) the same result.
    if (posterQueueRefillRuntime.hasInFlightRefill()) {
      return
    }

    if (refillRetryNotBeforeMs !== null && now() < refillRetryNotBeforeMs) {
      return
    }

    const lifecycleNonceAtStart = queueLifecycleNonce
    options.appendDiagnosticsLog({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "queue.refill-requested",
      details: {
        source,
        reason: refillIntent.reason,
        requestedCount: refillIntent.requestedCount,
        queueSize: posterQueueState.items.length,
        inFlight: posterQueueRefillRuntime.hasInFlightRefill()
      }
    })

    try {
      const refillResult = await posterQueueRefillRuntime.refillIfNeeded({
        state: posterQueueState,
        fetchItems: fetchQueueRefillItems
      })

      if (queueLifecycleNonce !== lifecycleNonceAtStart) {
        return
      }

      refillRetryNotBeforeMs = null
      refillRetryBackoffMs = options.reconnectInitialBackoffMs

      // The refill started from an older snapshot; stream ticks kept consuming while it
      // was in flight. Add the fetched items to the queue as it is now.
      posterQueueState = enqueueRuntimePosterQueueItems({
        state: posterQueueState,
        items: refillResult.acceptedItems
      }).nextState
      syncWallItemsFromQueue()
      options.state.activePosterIndex = options.normalizeWallActivePosterIndex(
        options.state.activePosterIndex,
        options.state.ingestionItems.length
      )

      if (ingestionRuntimeKey) {
        cacheIngestionItems(ingestionRuntimeKey, posterQueueState.items, { force: false })
      }

      options.appendDiagnosticsLog({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "queue.refill-completed",
        details: {
          source,
          reason: refillResult.reason,
          requestedCount: refillResult.requestedCount,
          fetchedCount: refillResult.fetchedCount,
          acceptedCount: refillResult.acceptedCount,
          duplicateCount: refillResult.duplicateCount,
          starvation: refillResult.starvation,
          queueSize: posterQueueState.items.length,
          adapterState: toQueueRefillFetchAdapterStateSnapshot()
        }
      })

      options.onRenderRequest()
    } catch (error) {
      if (queueLifecycleNonce !== lifecycleNonceAtStart) {
        return
      }

      const providerErrorCategory =
        typeof error === "object"
        && error !== null
        && "providerError" in error
        && typeof error.providerError === "object"
        && error.providerError !== null
        && "category" in error.providerError
        && isProviderErrorCategory(error.providerError.category)
          ? error.providerError.category
          : null

      options.appendDiagnosticsLog({
        timestamp: new Date().toISOString(),
        level: "warn",
        event: "queue.refill-failed",
        details: {
          source,
          queueSize: posterQueueState.items.length,
          errorCategory: providerErrorCategory,
          message: error instanceof Error ? error.message : "Queue refill failed",
          retryDelayMs: refillRetryBackoffMs
        }
      })

      refillRetryNotBeforeMs = now() + refillRetryBackoffMs
      refillRetryBackoffMs = Math.min(refillRetryBackoffMs * 2, options.reconnectMaxBackoffMs)
      scheduleReconnectAttempt(providerErrorCategory)
      options.onRenderRequest()
    }
  }

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

  function syncPosterCacheToStorage(runtimeKey: string, persistOptions: { force: boolean }): void {
    const storage = options.localStorageRef
    if (!storage) {
      return
    }

    const nowMs = now()
    if (
      !persistOptions.force
      && lastPosterCachePersistAtMs !== null
      && nowMs - lastPosterCachePersistAtMs < ONBOARDING_POSTER_CACHE_PERSIST_INTERVAL_MS
    ) {
      return
    }

    lastPosterCachePersistAtMs = nowMs
    try {
      storage.setItem(
        options.toPosterCacheStorageKey(runtimeKey),
        JSON.stringify(options.posterCache.toSnapshot())
      )
    } catch (error) {
      // Typically QuotaExceededError. The in-memory cache keeps working; only the warm
      // start after a reload is affected, so this must not break the stream tick.
      options.appendDiagnosticsLog({
        timestamp: new Date(nowMs).toISOString(),
        level: "warn",
        event: "cache.persist-failed",
        details: {
          message: error instanceof Error ? error.message : String(error)
        }
      })
    }
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
        syncPosterCacheToStorage(runtimeKey, { force: true })
      }
    }

    const cachedItems = options.posterCache
      .list({ touch: false, sortByScore: true })
      .map((item) => item.value)

    setQueueRefillSourceItems(cachedItems)
    posterQueueState = createRuntimePosterQueueState()
    seedPosterQueueFromSource()

    if (cachedItems.length === 0) {
      return
    }

    // Cached posters are shown right away, but nothing has been fetched yet, so
    // `ingestionFetchedAt` stays unset until the runtime reports a real fetch.
    options.state.ingestionStatus = "ready"
    syncWallItemsFromQueue()
    options.state.ingestionTrigger = null
    options.state.ingestionError = null
    options.state.ingestionErrorCategory = null
  }

  function cacheIngestionItems(
    runtimeKey: string,
    items: readonly MediaItem[],
    persistOptions: { force: boolean }
  ): void {
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

    syncPosterCacheToStorage(runtimeKey, persistOptions)
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
    resetQueueState()
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
      setQueueRefillSourceItems(nextState.items)
      if (posterQueueState.items.length === 0) {
        seedPosterQueueFromSource()
      }

      if (ingestionRuntimeKey) {
        cacheIngestionItems(ingestionRuntimeKey, posterQueueState.items, { force: true })
      }

      if (nextState.status === "ready") {
        void refillPosterQueueIfNeeded("ingestion-ready")
      }
    } else if (nextState.status === "ready") {
      // Replacing the queue invalidates any refill still in flight.
      queueLifecycleNonce += 1
      setQueueRefillSourceItems([])
      posterQueueState = createRuntimePosterQueueState()
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
    runtimeGeneration += 1
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
    const generation = runtimeGeneration
    ingestionRuntimeKey = runtimeKey
    hydratePosterCache(runtimeKey)
    // Always start with a full pass: a changes-only first query returns nothing for a
    // library that has not changed, which used to starve a warm-started wall.
    queueRefillFetchAdapter = options.createQueueRefillFetchAdapter?.({
      session,
      selectedLibraryIds,
      cursor: null,
      updatedSince: null
    }) ?? null
    ingestionRuntime = options.createRuntime({
      session,
      selectedLibraryIds,
      onStateChange: (nextState) => {
        // A runtime that was disposed (logout, server or library change) can still
        // resolve a request it started earlier; its result belongs to the old session.
        if (generation !== runtimeGeneration) {
          return
        }

        applyIngestionState(nextState)
      }
    })
    ingestionRuntime.start()
  }

  async function consumeNextPosterForStream(): Promise<MediaItem | null> {
    if (posterQueueState.items.length === 0) {
      await refillPosterQueueIfNeeded("stream-consume")
    }

    const currentQueueItems = [...posterQueueState.items]
    const consumeResult = consumeRuntimePosterQueueItem({
      state: posterQueueState
    })

    const shouldRetainLastVisiblePoster =
      consumeResult.consumedItem !== null
      && currentQueueItems.length === 1
      && consumeResult.nextState.items.length === 0

    posterQueueState = shouldRetainLastVisiblePoster
      ? createRuntimePosterQueueState({
          items: currentQueueItems
        })
      : consumeResult.nextState

    syncWallItemsFromQueue()
    options.state.activePosterIndex = options.normalizeWallActivePosterIndex(
      options.state.activePosterIndex,
      options.state.ingestionItems.length
    )

    if (ingestionRuntimeKey) {
      cacheIngestionItems(ingestionRuntimeKey, posterQueueState.items, { force: false })
    }

    if (!consumeResult.consumedItem) {
      return null
    }

    options.onStreamReadyTransition?.({
      poster: consumeResult.consumedItem,
      queueSize: posterQueueState.items.length,
      refillReason: consumeResult.refillIntent.reason
    })

    void refillPosterQueueIfNeeded("stream-consume")

    return consumeResult.consumedItem
  }

  return {
    disposeRuntime,
    ensureRuntime,
    consumeNextPosterForStream,
    refreshNow: async () => {
      if (!ingestionRuntime) {
        return
      }

      await ingestionRuntime.refreshNow()
    }
  }
}
