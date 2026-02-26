import {
  WALL_IDLE_HIDE_MS,
  createWallDismissDetailTransition,
  createWallIdleHideTransition,
  createWallPosterSelectionTransition,
  createWallRevealControlsTransition,
  createPosterCache,
  createMediaIngestionRuntime,
  createJellyfinMediaProvider,
  normalizeWallActivePosterIndex,
  POSTER_CACHE_DEFAULT_TTL_MS,
  resolveWallTransitionMs,
  type MediaIngestionRefreshTrigger,
  type MediaIngestionRuntime,
  type MediaIngestionState,
  type MediaItem,
  type MediaLibrary,
  type ProviderErrorCategory,
  type ProviderSession,
  type WallInteractionTransitionResult
} from "@mps/core"

import {
  DIAGNOSTICS_RETENTION_MAX_AGE_MS,
  DIAGNOSTICS_RETENTION_MAX_BYTES,
  DIAGNOSTICS_SAMPLING_INTERVAL_MS,
  createDiagnosticsLogStore,
  createDiagnosticsSampler,
  type DiagnosticsLogEntry,
  type DiagnosticsSample,
  type DiagnosticsSampler
} from "../features/diagnostics/runtime-diagnostics"
import {
  createCrashReportPackage,
  exportCrashReportPackageLocally
} from "../features/crash-export/crash-export"
import { createWallControlsSection } from "../wall/controls-section"
import { createWallDetailCard } from "../wall/detail-card"
import { createWallDiagnosticsSection } from "../wall/diagnostics-section"
import {
  createWallHeadingSection,
  createWallIngestionSummarySection,
  createWallPosterGridSection
} from "../wall/presentation-sections"
import {
  createWallFallbackShell,
  createWallRouteShell
} from "../wall/route-shell"
import {
  resolveDetailCardPlacement,
  type WallHandoff
} from "../wall/state-model"

const REMEMBERED_SERVER_STORAGE_KEY = "mps.onboarding.remembered-server"
const REMEMBERED_USERNAME_STORAGE_KEY = "mps.onboarding.remembered-username"
const DEVICE_ID_STORAGE_KEY = "mps.onboarding.device-id"
const AUTH_SESSION_STORAGE_KEY = "mps.auth.session"
const WALL_HANDOFF_STORAGE_KEY = "mps.wall.handoff"

const WALL_PATHNAME = "/wall"
const DETAIL_CARD_TRANSITION_MS = resolveWallTransitionMs()
const WALL_CACHE_STORAGE_KEY_PREFIX = "mps.wall.poster-cache.v1::"
const RECONNECT_INITIAL_BACKOFF_MS = 2_000
const RECONNECT_MAX_BACKOFF_MS = 60_000
const RECONNECT_GUIDE_THRESHOLD_MS = 60_000
const WEB_APP_VERSION = "0.1.0"

interface OnboardingState {
  serverUrl: string
  username: string
  password: string
  rememberServer: boolean
  rememberUsername: boolean
  rememberPasswordRequested: boolean
  preflightPending: boolean
  loginPending: boolean
  finishPending: boolean
  preflightError: string | null
  authError: string | null
  libraryError: string | null
  session: ProviderSession | null
  libraries: MediaLibrary[]
  selectedLibraryIds: Set<string>
  density: "cinematic" | "compact"
  ingestionStatus: "idle" | "refreshing" | "ready" | "error"
  ingestionItems: MediaItem[]
  ingestionItemCount: number
  ingestionFetchedAt: string | null
  ingestionError: string | null
  ingestionErrorCategory: ProviderErrorCategory | null
  ingestionTrigger: MediaIngestionRefreshTrigger | null
  reconnectAttempt: number
  reconnectNextDelayMs: number | null
  reconnectGuideVisible: boolean
  reconnectGuideReason: "auth" | "network" | "timeout" | "unknown" | null
  diagnosticsOpen: boolean
  detailProfile: "balanced" | "showcase"
  activePosterIndex: number | null
  wallControlsHidden: boolean
  fullscreenWarning: string | null
}

interface PlatformCapabilities {
  canPersistPassword: boolean
}

interface OnboardingAppRuntime {
  start: () => void
  dispose: () => void
}

const webPlatformCapabilities: PlatformCapabilities = {
  canPersistPassword: false
}

type FullscreenCapableDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void
  webkitFullscreenElement?: Element | null
}

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

function isFullscreenActive(doc: FullscreenCapableDocument = document): boolean {
  return doc.fullscreenElement !== null || doc.webkitFullscreenElement !== null
}

function canRequestFullscreen(target: FullscreenCapableElement): boolean {
  return (
    typeof target.requestFullscreen === "function"
    || typeof target.webkitRequestFullscreen === "function"
  )
}

async function requestFullscreen(target: FullscreenCapableElement): Promise<void> {
  if (typeof target.requestFullscreen === "function") {
    await target.requestFullscreen()
    return
  }

  if (typeof target.webkitRequestFullscreen === "function") {
    await target.webkitRequestFullscreen()
    return
  }

  throw new Error("Fullscreen API is unavailable.")
}

async function exitFullscreen(doc: FullscreenCapableDocument = document): Promise<void> {
  if (typeof doc.exitFullscreen === "function") {
    await doc.exitFullscreen()
    return
  }

  if (typeof doc.webkitExitFullscreen === "function") {
    await doc.webkitExitFullscreen()
    return
  }

  throw new Error("Fullscreen exit API is unavailable.")
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: {
    className?: string
    textContent?: string
    testId?: string
  }
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName)

  if (options?.className) {
    element.className = options.className
  }

  if (options?.textContent) {
    element.textContent = options.textContent
  }

  if (options?.testId) {
    element.dataset.testid = options.testId
  }

  return element
}

function safeGetStorage(type: "local" | "session"): Storage | null {
  try {
    return type === "local" ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function toReconnectGuideReason(errorCategory: ProviderErrorCategory | null): "auth" | "network" | "timeout" | "unknown" {
  if (errorCategory === "auth") {
    return "auth"
  }

  if (errorCategory === "network" || errorCategory === "cors") {
    return "network"
  }

  if (errorCategory === "timeout") {
    return "timeout"
  }

  return "unknown"
}

function toPosterCacheStorageKey(runtimeKey: string): string {
  return `${WALL_CACHE_STORAGE_KEY_PREFIX}${encodeURIComponent(runtimeKey)}`
}

function toAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const maybeProviderError = (error as Error & { providerError?: { message?: string } }).providerError
    if (typeof maybeProviderError?.message === "string" && maybeProviderError.message.length > 0) {
      return maybeProviderError.message
    }

    if (error.message.length > 0) {
      return error.message
    }
  }

  return "Authentication failed. Verify your credentials and try again."
}

function createRandomDeviceId(): string {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID()
  }

  return `mps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getOrCreateDeviceId(storage: Storage | null): string {
  const existing = storage?.getItem(DEVICE_ID_STORAGE_KEY)
  if (existing) {
    return existing
  }

  const created = createRandomDeviceId()
  storage?.setItem(DEVICE_ID_STORAGE_KEY, created)
  return created
}

function toLibraryCheckboxTestId(libraryId: string): string {
  const normalized = libraryId.replace(/[^a-zA-Z0-9-_]/g, "-")
  return `library-checkbox-${normalized}`
}

function createOnboardingState(localStorageRef: Storage | null): OnboardingState {
  const rememberedServer = localStorageRef?.getItem(REMEMBERED_SERVER_STORAGE_KEY) ?? ""
  const rememberedUsername = localStorageRef?.getItem(REMEMBERED_USERNAME_STORAGE_KEY) ?? ""

  return {
    serverUrl: rememberedServer,
    username: rememberedUsername,
    password: "",
    rememberServer: rememberedServer.length > 0,
    rememberUsername: rememberedUsername.length > 0,
    rememberPasswordRequested: false,
    preflightPending: false,
    loginPending: false,
    finishPending: false,
    preflightError: null,
    authError: null,
    libraryError: null,
    session: null,
    libraries: [],
    selectedLibraryIds: new Set<string>(),
    density: "cinematic",
    ingestionStatus: "idle",
    ingestionItems: [],
    ingestionItemCount: 0,
    ingestionFetchedAt: null,
    ingestionError: null,
    ingestionErrorCategory: null,
    ingestionTrigger: null,
    reconnectAttempt: 0,
    reconnectNextDelayMs: null,
    reconnectGuideVisible: false,
    reconnectGuideReason: null,
    diagnosticsOpen: false,
    detailProfile: "balanced",
    activePosterIndex: null,
    wallControlsHidden: false,
    fullscreenWarning: null
  }
}

export function createOnboardingAppRuntime(
  target: HTMLElement,
  options: {
    platform?: PlatformCapabilities
  } = {}
): OnboardingAppRuntime {
  const provider = createJellyfinMediaProvider()
  const localStorageRef = safeGetStorage("local")
  const sessionStorageRef = safeGetStorage("session")
  const platform = options.platform ?? webPlatformCapabilities
  const state = createOnboardingState(localStorageRef)
  const deviceId = getOrCreateDeviceId(localStorageRef)
  const posterCache = createPosterCache<MediaItem>()
  let ingestionRuntime: MediaIngestionRuntime | null = null
  let ingestionRuntimeKey: string | null = null
  let wallIdleTimerId: ReturnType<typeof setTimeout> | null = null
  let reconnectTimerId: ReturnType<typeof setTimeout> | null = null
  let reconnectStartedAtMs: number | null = null
  let reconnectBackoffMs = RECONNECT_INITIAL_BACKOFF_MS
  let wallInteractionListenersAttached = false
  const diagnosticsLogStore = createDiagnosticsLogStore()
  let diagnosticsSampler: DiagnosticsSampler | null = null
  let diagnosticsLatestSample: DiagnosticsSample | null = null
  let diagnosticsLastExportAt: string | null = null
  let diagnosticsExportError: string | null = null

  function applyWallInteractionTransition(transition: WallInteractionTransitionResult): boolean {
    state.activePosterIndex = transition.activePosterIndex
    state.wallControlsHidden = transition.wallControlsHidden
    return transition.shouldRender
  }

  function appendDiagnosticsLog(entry: DiagnosticsLogEntry): void {
    diagnosticsLogStore.append(entry)
  }

  function startDiagnosticsSampling(): void {
    if (diagnosticsSampler) {
      return
    }

    diagnosticsSampler = createDiagnosticsSampler({
      getReconnectMetrics: () => ({
        attempt: state.reconnectAttempt,
        nextDelayMs: state.reconnectNextDelayMs
      }),
      onSample: (sample) => {
        diagnosticsLatestSample = sample

        appendDiagnosticsLog({
          timestamp: sample.sampledAt,
          level: "info",
          event: "diagnostics.sample",
          details: {
            fps: sample.fps,
            memoryMb: sample.memoryMb,
            reconnectAttempt: sample.reconnectAttempt,
            reconnectNextDelayMs: sample.reconnectNextDelayMs
          }
        })

        if (isWallRouteActive()) {
          render()
        }
      }
    })
    diagnosticsSampler.start()
    appendDiagnosticsLog({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "diagnostics.sampling-started",
      details: {
        intervalMs: DIAGNOSTICS_SAMPLING_INTERVAL_MS
      }
    })
  }

  function stopDiagnosticsSampling(): void {
    if (!diagnosticsSampler) {
      return
    }

    diagnosticsSampler.dispose()
    diagnosticsSampler = null
    appendDiagnosticsLog({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "diagnostics.sampling-stopped"
    })
  }

  function exportCrashReport(handoff: WallHandoff): void {
    try {
      const crashReport = createCrashReportPackage({
        version: WEB_APP_VERSION,
        configSummary: {
          surface: "web",
          route: window.location.pathname,
          selectedLibraryIds: handoff.selectedLibraryIds,
          density: handoff.preferences.density,
          detailProfile: state.detailProfile,
          reconnectAttempt: state.reconnectAttempt,
          reconnectNextDelayMs: state.reconnectNextDelayMs,
          diagnosticsSamplingIntervalMs: DIAGNOSTICS_SAMPLING_INTERVAL_MS,
          diagnosticsRetention: {
            maxAgeMs: DIAGNOSTICS_RETENTION_MAX_AGE_MS,
            maxByteSize: DIAGNOSTICS_RETENTION_MAX_BYTES
          }
        },
        logs: diagnosticsLogStore.snapshot(),
        context: {
          ingestionStatus: state.ingestionStatus,
          ingestionTrigger: state.ingestionTrigger,
          ingestionError: state.ingestionError
        }
      })

      const fileName = exportCrashReportPackageLocally(crashReport, "mps-web-crash-report")
      diagnosticsLastExportAt = crashReport.generatedAt
      diagnosticsExportError = null

      appendDiagnosticsLog({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "diagnostics.crash-exported",
        details: {
          fileName,
          logCount: crashReport.logs.length
        }
      })
    } catch (error) {
      diagnosticsExportError = error instanceof Error
        ? error.message
        : "Crash export failed."

      appendDiagnosticsLog({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "diagnostics.crash-export-failed",
        details: {
          message: diagnosticsExportError
        }
      })
    }

    render()
  }

  appendDiagnosticsLog({
    timestamp: new Date().toISOString(),
    level: "info",
    event: "runtime.started",
    details: {
      surface: "web"
    }
  })

  function clearReconnectTimer(): void {
    if (reconnectTimerId) {
      clearTimeout(reconnectTimerId)
      reconnectTimerId = null
    }
  }

  function resetReconnectState(): void {
    clearReconnectTimer()
    reconnectStartedAtMs = null
    reconnectBackoffMs = RECONNECT_INITIAL_BACKOFF_MS
    state.reconnectAttempt = 0
    state.reconnectNextDelayMs = null
    state.reconnectGuideVisible = false
    state.reconnectGuideReason = null
  }

  function syncPosterCacheToStorage(runtimeKey: string): void {
    localStorageRef?.setItem(toPosterCacheStorageKey(runtimeKey), JSON.stringify(posterCache.toSnapshot()))
  }

  function clearPosterCache(runtimeKey: string): void {
    posterCache.clear()
    localStorageRef?.removeItem(toPosterCacheStorageKey(runtimeKey))
  }

  function hydratePosterCache(runtimeKey: string): void {
    const snapshot = parseJson<ReturnType<typeof posterCache.toSnapshot>>(
      localStorageRef?.getItem(toPosterCacheStorageKey(runtimeKey)) ?? null
    )
    posterCache.hydrate(snapshot)

    const cachedItems = posterCache.list({ touch: false, sortByScore: true }).map((item) => item.value)
    if (cachedItems.length === 0) {
      return
    }

    state.ingestionStatus = "ready"
    state.ingestionItems = cachedItems
    state.ingestionItemCount = cachedItems.length
    state.ingestionFetchedAt = new Date().toISOString()
    state.ingestionTrigger = null
    state.ingestionError = null
    state.ingestionErrorCategory = null
  }

  function cacheIngestionItems(runtimeKey: string, items: readonly MediaItem[]): void {
    if (items.length === 0) {
      clearPosterCache(runtimeKey)
      return
    }

    posterCache.setMany(
      items.map((item) => ({
        key: item.id,
        value: item
      })),
      {
        ttlMs: POSTER_CACHE_DEFAULT_TTL_MS
      }
    )
    syncPosterCacheToStorage(runtimeKey)
  }

  function scheduleReconnectAttempt(errorCategory: ProviderErrorCategory | null): void {
    if (!ingestionRuntime || !isWallRouteActive()) {
      return
    }

    const nowMs = Date.now()
    if (reconnectStartedAtMs === null) {
      reconnectStartedAtMs = nowMs
    }

    const elapsedMs = nowMs - reconnectStartedAtMs
    if (errorCategory === "auth" || elapsedMs >= RECONNECT_GUIDE_THRESHOLD_MS) {
      state.reconnectGuideVisible = true
      state.reconnectGuideReason = toReconnectGuideReason(errorCategory)
    }

    if (reconnectTimerId) {
      return
    }

    const retryDelayMs = reconnectBackoffMs
    state.reconnectNextDelayMs = retryDelayMs
    appendDiagnosticsLog({
      timestamp: new Date().toISOString(),
      level: "warn",
      event: "ingestion.reconnect-scheduled",
      details: {
        retryDelayMs,
        reason: toReconnectGuideReason(errorCategory)
      }
    })
    reconnectTimerId = setTimeout(() => {
      reconnectTimerId = null
      state.reconnectAttempt += 1
      reconnectBackoffMs = Math.min(reconnectBackoffMs * 2, RECONNECT_MAX_BACKOFF_MS)
      state.reconnectNextDelayMs = reconnectBackoffMs
      render()
      void ingestionRuntime?.refreshNow()
    }, retryDelayMs)
  }

  function resetIngestionState(): void {
    state.ingestionStatus = "idle"
    state.ingestionItems = []
    state.ingestionItemCount = 0
    state.ingestionFetchedAt = null
    state.ingestionError = null
    state.ingestionErrorCategory = null
    state.ingestionTrigger = null
    state.activePosterIndex = null
    state.wallControlsHidden = false
    resetReconnectState()
  }

  function applyIngestionState(nextState: MediaIngestionState): void {
    state.ingestionStatus = nextState.status
    state.ingestionTrigger = nextState.trigger

    if (nextState.items.length > 0) {
      state.ingestionItems = [...nextState.items]
      state.ingestionItemCount = nextState.items.length
      if (ingestionRuntimeKey) {
        cacheIngestionItems(ingestionRuntimeKey, nextState.items)
      }
    } else if (nextState.status === "ready") {
      state.ingestionItems = []
      state.ingestionItemCount = 0
      if (ingestionRuntimeKey) {
        clearPosterCache(ingestionRuntimeKey)
      }
    }

    if (nextState.fetchedAt) {
      state.ingestionFetchedAt = nextState.fetchedAt
    }

    state.ingestionError = nextState.error?.message ?? null
    state.ingestionErrorCategory = nextState.error?.category ?? null

    appendDiagnosticsLog({
      timestamp: new Date().toISOString(),
      level: nextState.status === "error" ? "warn" : "info",
      event: "ingestion.state-change",
      details: {
        status: nextState.status,
        trigger: nextState.trigger,
        itemCount: nextState.items.length,
        reconnectAttempt: state.reconnectAttempt,
        reconnectNextDelayMs: state.reconnectNextDelayMs,
        errorCategory: nextState.error?.category ?? null
      }
    })

    if (nextState.status === "ready") {
      resetReconnectState()
    } else if (nextState.status === "error") {
      scheduleReconnectAttempt(nextState.error?.category ?? null)
    }

    state.activePosterIndex = normalizeWallActivePosterIndex(
      state.activePosterIndex,
      state.ingestionItems.length
    )

    render()
  }

  function disposeIngestionRuntime(): void {
    ingestionRuntime?.dispose()
    ingestionRuntime = null
    ingestionRuntimeKey = null
    resetIngestionState()
  }

  function readActiveSession(): ProviderSession | null {
    if (state.session) {
      return state.session
    }

    return parseJson<ProviderSession>(sessionStorageRef?.getItem(AUTH_SESSION_STORAGE_KEY) ?? null)
  }

  function getIngestionRuntimeKey(session: ProviderSession, selectedLibraryIds: readonly string[]): string {
    return [session.providerId, session.serverUrl, session.userId, [...selectedLibraryIds].sort().join(",")].join("::")
  }

  function ensureIngestionRuntime(session: ProviderSession, selectedLibraryIds: readonly string[]): void {
    const runtimeKey = getIngestionRuntimeKey(session, selectedLibraryIds)
    if (ingestionRuntime && ingestionRuntimeKey === runtimeKey) {
      return
    }

    disposeIngestionRuntime()
    ingestionRuntimeKey = runtimeKey
    hydratePosterCache(runtimeKey)
    ingestionRuntime = createMediaIngestionRuntime({
      provider,
      session,
      selectedLibraryIds,
      onStateChange: applyIngestionState
    })
    ingestionRuntime.start()
  }

  function isWallRouteActive(): boolean {
    return new URL(window.location.href).pathname === WALL_PATHNAME
  }

  function clearWallIdleTimer(): void {
    if (wallIdleTimerId) {
      clearTimeout(wallIdleTimerId)
      wallIdleTimerId = null
    }
  }

  function scheduleWallIdleHide(): void {
    clearWallIdleTimer()

    if (!isWallRouteActive()) {
      return
    }

    wallIdleTimerId = setTimeout(() => {
      if (!isWallRouteActive()) {
        return
      }

      const shouldRender = applyWallInteractionTransition(
        createWallIdleHideTransition({
          activePosterIndex: state.activePosterIndex,
          wallControlsHidden: state.wallControlsHidden
        })
      )

      if (shouldRender) {
        render()
      }
    }, WALL_IDLE_HIDE_MS)
  }

  function revealWallControlsAndResetIdleTimer(): void {
    if (!isWallRouteActive()) {
      return
    }

    const shouldRender = applyWallInteractionTransition(
      createWallRevealControlsTransition({
        activePosterIndex: state.activePosterIndex,
        wallControlsHidden: state.wallControlsHidden
      })
    )
    scheduleWallIdleHide()

    if (shouldRender) {
      render()
    }
  }

  function dismissActiveDetailCardAndResetIdleTimer(): void {
    if (!isWallRouteActive() || state.activePosterIndex === null) {
      return
    }

    const shouldRender = applyWallInteractionTransition(
      createWallDismissDetailTransition({
        activePosterIndex: state.activePosterIndex,
        wallControlsHidden: state.wallControlsHidden
      })
    )
    scheduleWallIdleHide()

    if (shouldRender) {
      render()
    }
  }

  function onWallPointerOrFocusInteraction(): void {
    revealWallControlsAndResetIdleTimer()
  }

  function onWallKeyDown(event: KeyboardEvent): void {
    if (!isWallRouteActive()) {
      return
    }

    if (event.key !== "Escape") {
      return
    }

    dismissActiveDetailCardAndResetIdleTimer()
  }

  function attachWallInteractionListeners(): void {
    if (wallInteractionListenersAttached) {
      return
    }

    window.addEventListener("pointerdown", onWallPointerOrFocusInteraction)
    window.addEventListener("pointermove", onWallPointerOrFocusInteraction)
    window.addEventListener("focusin", onWallPointerOrFocusInteraction)
    window.addEventListener("keydown", onWallKeyDown)
    wallInteractionListenersAttached = true
  }

  function detachWallInteractionListeners(): void {
    if (!wallInteractionListenersAttached) {
      clearWallIdleTimer()
      return
    }

    window.removeEventListener("pointerdown", onWallPointerOrFocusInteraction)
    window.removeEventListener("pointermove", onWallPointerOrFocusInteraction)
    window.removeEventListener("focusin", onWallPointerOrFocusInteraction)
    window.removeEventListener("keydown", onWallKeyDown)
    wallInteractionListenersAttached = false
    clearWallIdleTimer()
  }

  function persistRememberedServer(): void {
    if (state.rememberServer && state.serverUrl.trim().length > 0) {
      localStorageRef?.setItem(REMEMBERED_SERVER_STORAGE_KEY, state.serverUrl.trim())
      return
    }

    localStorageRef?.removeItem(REMEMBERED_SERVER_STORAGE_KEY)
  }

  function persistRememberedUsername(): void {
    if (state.rememberUsername && state.username.trim().length > 0) {
      localStorageRef?.setItem(REMEMBERED_USERNAME_STORAGE_KEY, state.username.trim())
      return
    }

    localStorageRef?.removeItem(REMEMBERED_USERNAME_STORAGE_KEY)
  }

  function clearSessionArtifacts(): void {
    sessionStorageRef?.removeItem(AUTH_SESSION_STORAGE_KEY)
    sessionStorageRef?.removeItem(WALL_HANDOFF_STORAGE_KEY)
  }

  function saveSession(session: ProviderSession): void {
    sessionStorageRef?.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
  }

  function saveWallHandoff(handoff: WallHandoff): void {
    sessionStorageRef?.setItem(WALL_HANDOFF_STORAGE_KEY, JSON.stringify(handoff))
  }

  function readWallHandoff(): WallHandoff | null {
    return parseJson<WallHandoff>(sessionStorageRef?.getItem(WALL_HANDOFF_STORAGE_KEY) ?? null)
  }

  async function handlePreflight(): Promise<void> {
    const trimmedServerUrl = state.serverUrl.trim()

    state.preflightError = null
    state.authError = null

    if (!trimmedServerUrl) {
      state.preflightError = "Server URL is required before preflight."
      render()
      return
    }

    state.preflightPending = true
    render()

    const result = await provider.preflight({
      serverUrl: trimmedServerUrl,
      origin: window.location.origin
    })

    state.preflightPending = false

    if (!result.ok) {
      state.preflightError = result.error.message
      render()
      return
    }

    state.serverUrl = trimmedServerUrl
    persistRememberedServer()
    render()
  }

  async function handleLogin(): Promise<void> {
    state.authError = null
    state.libraryError = null

    if (!state.serverUrl.trim() || !state.username.trim() || !state.password) {
      state.authError = "Server URL, username, and password are required."
      render()
      return
    }

    state.loginPending = true
    clearSessionArtifacts()
    render()

    try {
      const session = await provider.authenticate({
        serverUrl: state.serverUrl.trim(),
        username: state.username.trim(),
        password: state.password,
        clientName: "Media Poster Space Web",
        deviceId
      })

      const libraries = await provider.listLibraries(session)

      state.session = session
      state.libraries = libraries
      state.selectedLibraryIds = new Set(libraries.map((library) => library.id))
      state.loginPending = false
      state.password = ""
      persistRememberedUsername()
      persistRememberedServer()
      saveSession(session)
      render()
    } catch (error) {
      state.loginPending = false
      state.session = null
      state.password = ""
      state.authError = toAuthErrorMessage(error)
      clearSessionArtifacts()
      render()
    }
  }

  async function handleLogout(): Promise<void> {
    const activeSession = parseJson<ProviderSession>(
      sessionStorageRef?.getItem(AUTH_SESSION_STORAGE_KEY) ?? null
    )

    if (activeSession) {
      try {
        await provider.invalidateSession(activeSession)
      } catch {
      }
    }

    disposeIngestionRuntime()
    clearSessionArtifacts()
    state.session = null
    state.libraries = []
    state.selectedLibraryIds = new Set<string>()
    state.diagnosticsOpen = false
    state.detailProfile = "balanced"
    state.authError = null
    diagnosticsLatestSample = null
    diagnosticsLastExportAt = null
    diagnosticsExportError = null
    appendDiagnosticsLog({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "session.logout"
    })
    window.history.pushState({}, "", "/")
    render()
  }

  async function handleFullscreenToggle(): Promise<void> {
    const fullscreenRoot = document.documentElement as FullscreenCapableElement | null
    if (!fullscreenRoot || !canRequestFullscreen(fullscreenRoot)) {
      state.fullscreenWarning = "Fullscreen is not supported in this browser."
      render()
      return
    }

    try {
      if (isFullscreenActive()) {
        await exitFullscreen()
      } else {
        await requestFullscreen(fullscreenRoot)
      }

      state.fullscreenWarning = null
      render()
    } catch {
      state.fullscreenWarning = "Fullscreen request was denied. Continue in windowed mode and retry anytime."
      render()
    }
  }

  function onFullscreenChange(): void {
    if (!isWallRouteActive()) {
      return
    }

    render()
  }

  function onFullscreenError(): void {
    state.fullscreenWarning = "Fullscreen request was denied. Continue in windowed mode and retry anytime."
    if (!isWallRouteActive()) {
      return
    }

    render()
  }

  function renderOnboarding(container: HTMLElement): void {
    container.innerHTML = ""

    const shell = createElement("main", { testId: "app-shell" })
    shell.style.minHeight = "100vh"
    shell.style.display = "grid"
    shell.style.placeItems = "center"
    shell.style.padding = "clamp(1rem, 3vw, 2rem)"
    shell.style.background = "var(--mps-color-canvas)"
    shell.style.color = "var(--mps-color-foreground)"
    shell.style.fontFamily = "var(--mps-font-body)"

    const card = createElement("section")
    card.style.width = "min(40rem, 100%)"
    card.style.display = "grid"
    card.style.gap = "1rem"
    card.style.padding = "clamp(1rem, 3vw, 1.5rem)"
    card.style.border = "1px solid var(--mps-color-border)"
    card.style.borderRadius = "var(--mps-radius-lg)"
    card.style.background = "color-mix(in srgb, var(--mps-color-surface) 86%, black)"
    card.style.boxShadow = "var(--mps-elevation-dramatic)"

    const heading = createElement("h1", { textContent: "Connect Jellyfin", testId: "onboarding-title" })
    heading.style.margin = "0"
    heading.style.fontFamily = "var(--mps-font-display)"
    heading.style.fontSize = "clamp(1.75rem, 4vw, 2.3rem)"

    const description = createElement("p", {
      textContent:
        "Three-step onboarding: server preflight, username/password authentication, then library and wall preferences.",
    })
    description.style.margin = "0"
    description.style.color = "var(--mps-color-foreground-muted)"

    const serverLabel = createElement("label", { textContent: "Jellyfin server URL" })
    serverLabel.style.display = "grid"
    serverLabel.style.gap = "0.5rem"

    const serverInput = createElement("input", { testId: "server-url-input" }) as HTMLInputElement
    serverInput.type = "url"
    serverInput.placeholder = "https://jellyfin.example"
    serverInput.value = state.serverUrl
    serverInput.style.padding = "0.65rem 0.75rem"
    serverInput.style.border = "1px solid var(--mps-color-border)"
    serverInput.style.borderRadius = "0.6rem"
    serverInput.style.background = "var(--mps-color-canvas)"
    serverInput.style.color = "var(--mps-color-foreground)"
    serverInput.addEventListener("input", () => {
      state.serverUrl = serverInput.value
      state.preflightError = null
    })
    serverLabel.append(serverInput)

    const rememberServerLabel = createElement("label")
    rememberServerLabel.style.display = "inline-flex"
    rememberServerLabel.style.gap = "0.45rem"
    rememberServerLabel.style.alignItems = "center"
    const rememberServer = createElement("input", { testId: "remember-server-checkbox" }) as HTMLInputElement
    rememberServer.type = "checkbox"
    rememberServer.checked = state.rememberServer
    rememberServer.addEventListener("change", () => {
      state.rememberServer = rememberServer.checked
      persistRememberedServer()
    })
    rememberServerLabel.append(rememberServer, document.createTextNode("Remember last server"))

    const preflightButton = createElement("button", {
      textContent: state.preflightPending ? "Checking…" : "Preflight server",
      testId: "preflight-check-button"
    }) as HTMLButtonElement
    preflightButton.type = "button"
    preflightButton.disabled = state.preflightPending
    preflightButton.style.padding = "0.7rem 0.95rem"
    preflightButton.style.borderRadius = "0.6rem"
    preflightButton.style.border = "1px solid var(--mps-color-accent-ring)"
    preflightButton.style.background = "var(--mps-color-accent)"
    preflightButton.style.color = "var(--mps-color-accent-foreground)"
    preflightButton.style.fontWeight = "600"
    preflightButton.addEventListener("click", () => {
      void handlePreflight()
    })

    if (state.preflightError) {
      const preflightError = createElement("p", { textContent: state.preflightError })
      preflightError.style.margin = "0"
      preflightError.style.color = "#ffb4b4"
      card.append(preflightError)
    }

    const loginFields = createElement("div")
    loginFields.style.display = "grid"
    loginFields.style.gap = "0.75rem"
    loginFields.style.paddingTop = "0.25rem"
    loginFields.style.borderTop = "1px solid color-mix(in srgb, var(--mps-color-border) 55%, transparent)"

    const usernameLabel = createElement("label", { textContent: "Username" })
    usernameLabel.style.display = "grid"
    usernameLabel.style.gap = "0.4rem"
    const usernameInput = createElement("input", { testId: "username-input" }) as HTMLInputElement
    usernameInput.type = "text"
    usernameInput.autocomplete = "username"
    usernameInput.value = state.username
    usernameInput.style.padding = "0.65rem 0.75rem"
    usernameInput.style.border = "1px solid var(--mps-color-border)"
    usernameInput.style.borderRadius = "0.6rem"
    usernameInput.style.background = "var(--mps-color-canvas)"
    usernameInput.style.color = "var(--mps-color-foreground)"
    usernameInput.addEventListener("input", () => {
      state.username = usernameInput.value
      state.authError = null
    })
    usernameLabel.append(usernameInput)

    const passwordLabel = createElement("label", { textContent: "Password" })
    passwordLabel.style.display = "grid"
    passwordLabel.style.gap = "0.4rem"
    const passwordInput = createElement("input", { testId: "password-input" }) as HTMLInputElement
    passwordInput.type = "password"
    passwordInput.autocomplete = "current-password"
    passwordInput.value = state.password
    passwordInput.style.padding = "0.65rem 0.75rem"
    passwordInput.style.border = "1px solid var(--mps-color-border)"
    passwordInput.style.borderRadius = "0.6rem"
    passwordInput.style.background = "var(--mps-color-canvas)"
    passwordInput.style.color = "var(--mps-color-foreground)"
    passwordInput.addEventListener("input", () => {
      state.password = passwordInput.value
      state.authError = null
    })
    passwordLabel.append(passwordInput)

    const rememberRow = createElement("div")
    rememberRow.style.display = "grid"
    rememberRow.style.gap = "0.35rem"

    const rememberUsernameLabel = createElement("label")
    rememberUsernameLabel.style.display = "inline-flex"
    rememberUsernameLabel.style.gap = "0.45rem"
    rememberUsernameLabel.style.alignItems = "center"
    const rememberUsername = createElement("input", {
      testId: "remember-username-checkbox"
    }) as HTMLInputElement
    rememberUsername.type = "checkbox"
    rememberUsername.checked = state.rememberUsername
    rememberUsername.addEventListener("change", () => {
      state.rememberUsername = rememberUsername.checked
      persistRememberedUsername()
    })
    rememberUsernameLabel.append(rememberUsername, document.createTextNode("Remember username"))

    const rememberPasswordLabel = createElement("label")
    rememberPasswordLabel.style.display = "inline-flex"
    rememberPasswordLabel.style.gap = "0.45rem"
    rememberPasswordLabel.style.alignItems = "center"
    rememberPasswordLabel.style.color = "var(--mps-color-foreground-muted)"
    const rememberPassword = createElement("input", {
      testId: "remember-password-checkbox"
    }) as HTMLInputElement
    rememberPassword.type = "checkbox"
    rememberPassword.checked = state.rememberPasswordRequested
    rememberPassword.disabled = !platform.canPersistPassword
    rememberPassword.addEventListener("change", () => {
      state.rememberPasswordRequested = rememberPassword.checked
    })
    rememberPasswordLabel.append(
      rememberPassword,
      document.createTextNode(
        platform.canPersistPassword
          ? "Remember password"
          : "Remember password (Desktop app only)"
      )
    )

    rememberRow.append(rememberUsernameLabel, rememberPasswordLabel)

    const loginButton = createElement("button", {
      textContent: state.loginPending ? "Signing in…" : "Sign in",
      testId: "login-submit"
    }) as HTMLButtonElement
    loginButton.type = "button"
    loginButton.disabled = state.loginPending
    loginButton.style.padding = "0.7rem 0.95rem"
    loginButton.style.borderRadius = "0.6rem"
    loginButton.style.border = "1px solid var(--mps-color-accent-ring)"
    loginButton.style.background = "var(--mps-color-accent)"
    loginButton.style.color = "var(--mps-color-accent-foreground)"
    loginButton.style.fontWeight = "600"
    loginButton.addEventListener("click", () => {
      void handleLogin()
    })

    loginFields.append(usernameLabel, passwordLabel, rememberRow, loginButton)

    if (state.authError) {
      const authError = createElement("p", {
        textContent: state.authError,
        testId: "auth-error-banner"
      })
      authError.style.margin = "0"
      authError.style.padding = "0.6rem 0.75rem"
      authError.style.borderRadius = "0.5rem"
      authError.style.border = "1px solid rgba(255, 130, 130, 0.5)"
      authError.style.background = "rgba(89, 24, 24, 0.45)"
      authError.style.color = "#ffd8d8"
      loginFields.append(authError)
    }

    const librarySection = createElement("section")
    librarySection.style.display = "grid"
    librarySection.style.gap = "0.7rem"
    librarySection.style.paddingTop = "0.25rem"
    librarySection.style.borderTop = "1px solid color-mix(in srgb, var(--mps-color-border) 55%, transparent)"

    const libraryHeading = createElement("h2", { textContent: "Library selection" })
    libraryHeading.style.margin = "0"
    libraryHeading.style.fontFamily = "var(--mps-font-display)"
    libraryHeading.style.fontSize = "1.2rem"
    librarySection.append(libraryHeading)

    if (state.libraries.length === 0) {
      const emptyLibraryState = createElement("p", {
        textContent: "Sign in first to fetch your libraries and wall preferences."
      })
      emptyLibraryState.style.margin = "0"
      emptyLibraryState.style.color = "var(--mps-color-foreground-muted)"
      librarySection.append(emptyLibraryState)
    } else {
      const libraryList = createElement("div")
      libraryList.style.display = "grid"
      libraryList.style.gap = "0.35rem"

      for (const library of state.libraries) {
        const libraryLabel = createElement("label")
        libraryLabel.style.display = "inline-flex"
        libraryLabel.style.alignItems = "center"
        libraryLabel.style.gap = "0.45rem"

        const libraryCheckbox = createElement("input", {
          testId: toLibraryCheckboxTestId(library.id)
        }) as HTMLInputElement
        libraryCheckbox.type = "checkbox"
        libraryCheckbox.checked = state.selectedLibraryIds.has(library.id)
        libraryCheckbox.addEventListener("change", () => {
          if (libraryCheckbox.checked) {
            state.selectedLibraryIds.add(library.id)
          } else {
            state.selectedLibraryIds.delete(library.id)
          }
          state.libraryError = null
        })

        const descriptor = `${library.name} (${library.kind})`
        libraryLabel.append(libraryCheckbox, document.createTextNode(descriptor))
        libraryList.append(libraryLabel)
      }

      const preferenceLabel = createElement("label", { textContent: "Wall density" })
      preferenceLabel.style.display = "grid"
      preferenceLabel.style.gap = "0.4rem"
      const densitySelect = createElement("select", { testId: "wall-density-select" }) as HTMLSelectElement
      densitySelect.innerHTML = [
        '<option value="cinematic">Cinematic (default)</option>',
        '<option value="compact">Compact</option>'
      ].join("")
      densitySelect.value = state.density
      densitySelect.style.padding = "0.65rem 0.75rem"
      densitySelect.style.border = "1px solid var(--mps-color-border)"
      densitySelect.style.borderRadius = "0.6rem"
      densitySelect.style.background = "var(--mps-color-canvas)"
      densitySelect.style.color = "var(--mps-color-foreground)"
      densitySelect.addEventListener("change", () => {
        state.density = densitySelect.value === "compact" ? "compact" : "cinematic"
      })
      preferenceLabel.append(densitySelect)

      const finishButton = createElement("button", {
        textContent: state.finishPending ? "Preparing wall…" : "Enter wall",
        testId: "onboarding-finish"
      }) as HTMLButtonElement
      finishButton.type = "button"
      finishButton.disabled = state.finishPending
      finishButton.style.padding = "0.7rem 0.95rem"
      finishButton.style.borderRadius = "0.6rem"
      finishButton.style.border = "1px solid var(--mps-color-accent-ring)"
      finishButton.style.background = "var(--mps-color-accent)"
      finishButton.style.color = "var(--mps-color-accent-foreground)"
      finishButton.style.fontWeight = "600"
      finishButton.addEventListener("click", () => {
        if (!state.session) {
          state.libraryError = "Sign in before entering the wall."
          render()
          return
        }

        if (state.selectedLibraryIds.size === 0) {
          state.libraryError = "Select at least one library before entering the wall."
          render()
          return
        }

        const handoff: WallHandoff = {
          selectedLibraryIds: [...state.selectedLibraryIds],
          preferences: {
            density: state.density,
            rememberServer: state.rememberServer,
            rememberUsername: state.rememberUsername,
            rememberPasswordRequested:
              platform.canPersistPassword && state.rememberPasswordRequested
          }
        }

        state.finishPending = true
        saveSession(state.session)
        saveWallHandoff(handoff)
        window.history.pushState({}, "", WALL_PATHNAME)
        state.finishPending = false
        render()
      })

      librarySection.append(libraryList, preferenceLabel, finishButton)
    }

    if (state.libraryError) {
      const libraryError = createElement("p", { textContent: state.libraryError })
      libraryError.style.margin = "0"
      libraryError.style.color = "#ffb4b4"
      librarySection.append(libraryError)
    }

    card.append(heading, description, serverLabel, rememberServerLabel, preflightButton, loginFields, librarySection)
    shell.append(card)
    container.append(shell)
  }

  function renderWall(container: HTMLElement): void {
    container.innerHTML = ""

    const handoff = readWallHandoff()
    if (!handoff) {
      disposeIngestionRuntime()
      detachWallInteractionListeners()
      state.activePosterIndex = null
      state.wallControlsHidden = false

      const fallback = createWallFallbackShell(createElement, {
        title: "Poster wall is not ready",
        body: "No onboarding handoff was found. Run onboarding and finish with at least one library.",
        onBack: () => {
          window.history.pushState({}, "", "/")
          render()
        }
      })

      container.append(fallback)
      return
    }

    const activeSession = readActiveSession()
    if (!activeSession) {
      disposeIngestionRuntime()
      detachWallInteractionListeners()
      state.activePosterIndex = null
      state.wallControlsHidden = false

      const fallback = createWallFallbackShell(createElement, {
        title: "Session expired",
        body: "Wall ingestion requires an active session. Sign in again to refresh posters.",
        onBack: () => {
          window.history.pushState({}, "", "/")
          render()
        }
      })

      container.append(fallback)
      return
    }

    ensureIngestionRuntime(activeSession, handoff.selectedLibraryIds)
    attachWallInteractionListeners()
    if (wallIdleTimerId === null) {
      scheduleWallIdleHide()
    }

    const { root, wallCard } = createWallRouteShell(createElement)
    const { heading, libraries, preferences } = createWallHeadingSection(createElement, handoff)
    const ingestionSummary = createWallIngestionSummarySection(createElement, {
      ingestionItemCount: state.ingestionItemCount,
      ingestionStatus: state.ingestionStatus,
      ingestionTrigger: state.ingestionTrigger,
      ingestionFetchedAt: state.ingestionFetchedAt
    })
    const posterGrid = createWallPosterGridSection(createElement, {
      items: state.ingestionItems,
      onPosterSelect: (index) => {
        const shouldRender = applyWallInteractionTransition(
          createWallPosterSelectionTransition({
            activePosterIndex: state.activePosterIndex,
            wallControlsHidden: state.wallControlsHidden
          }, index)
        )
        scheduleWallIdleHide()

        if (shouldRender) {
          render()
        }
      }
    })

    const diagnosticsPanel = createWallDiagnosticsSection(createElement, {
      diagnosticsOpen: state.diagnosticsOpen,
      handoff,
      ingestionStatus: state.ingestionStatus,
      ingestionItemCount: state.ingestionItemCount,
      ingestionTrigger: state.ingestionTrigger,
      ingestionFetchedAt: state.ingestionFetchedAt,
      ingestionError: state.ingestionError,
      reconnectAttempt: state.reconnectAttempt,
      reconnectNextDelayMs: state.reconnectNextDelayMs,
      detailProfile: state.detailProfile,
      diagnosticsLatestSample,
      diagnosticsRetentionSnapshot: diagnosticsLogStore.getRetentionSnapshot(),
      diagnosticsLastExportAt,
      diagnosticsExportError,
      onToggleDetailProfile: () => {
        state.detailProfile = state.detailProfile === "balanced" ? "showcase" : "balanced"
        render()
      },
      onExportCrashReport: () => {
        exportCrashReport(handoff)
      }
    })

    const ingestionError = state.ingestionError
      ? createElement("p", { textContent: state.ingestionError, testId: "wall-ingestion-error" })
      : null
    if (ingestionError) {
      ingestionError.style.margin = "0"
      ingestionError.style.padding = "0.64rem 0.8rem"
      ingestionError.style.borderRadius = "0.64rem"
      ingestionError.style.border = "1px solid rgba(255, 130, 130, 0.6)"
      ingestionError.style.background = [
        "linear-gradient(145deg, rgba(89, 24, 24, 0.58) 0%, rgba(54, 16, 16, 0.62) 100%)",
        "radial-gradient(circle at 100% 0%, rgba(255, 146, 146, 0.16) 0%, transparent 46%)"
      ].join(",")
      ingestionError.style.color = "#ffd8d8"
      ingestionError.style.fontFamily = "var(--mps-font-mono)"
      ingestionError.style.fontSize = "0.7rem"
      ingestionError.style.letterSpacing = "0.02em"
      ingestionError.style.boxShadow = "0 8px 18px rgba(35, 6, 6, 0.32), inset 0 0 0 1px rgba(255, 169, 169, 0.18)"
    }

    const reconnectGuide = state.reconnectGuideVisible
      ? createElement("section", { testId: "reconnect-guide" })
      : null
    if (reconnectGuide) {
      reconnectGuide.style.display = "grid"
      reconnectGuide.style.gap = "0.5rem"
      reconnectGuide.style.padding = "0.74rem 0.82rem"
      reconnectGuide.style.borderRadius = "0.66rem"
      reconnectGuide.style.border = "1px solid color-mix(in srgb, var(--mps-color-orbit-glow-halo) 68%, var(--mps-color-border))"
      reconnectGuide.style.background = [
        "linear-gradient(145deg, color-mix(in srgb, var(--mps-overlay-depth-near) 79%, black) 0%, color-mix(in srgb, var(--mps-overlay-depth-far) 76%, black) 100%)",
        "radial-gradient(circle at 105% 8%, color-mix(in srgb, var(--mps-color-telemetry-soft) 54%, transparent) 0%, transparent 52%)"
      ].join(",")
      reconnectGuide.style.boxShadow = "0 12px 24px rgba(5, 11, 20, 0.28), inset 0 0 0 1px rgba(122, 217, 255, 0.1)"

      const reconnectLabel = createElement("p", {
        textContent: "Reconnect guidance"
      })
      reconnectLabel.style.margin = "0"
      reconnectLabel.style.fontFamily = "var(--mps-font-mono)"
      reconnectLabel.style.fontSize = "0.64rem"
      reconnectLabel.style.letterSpacing = "0.1em"
      reconnectLabel.style.textTransform = "uppercase"
      reconnectLabel.style.color = "var(--mps-color-foreground-muted)"

      const reconnectReason = createElement("p", {
        textContent:
          state.reconnectGuideReason === "auth"
            ? "Session token appears invalid. Reconnect by signing in again."
            : "Connection to Jellyfin is unstable. Keep this screen open while reconnect retries continue."
      })
      reconnectReason.style.margin = "0"
      reconnectReason.style.color = "var(--mps-color-foreground-support)"
      reconnectReason.style.lineHeight = "1.38"

      const reconnectMeta = createElement("p", {
        textContent: `Retry attempts: ${state.reconnectAttempt}; next retry in ${state.reconnectNextDelayMs ?? "n/a"}ms.`
      })
      reconnectMeta.style.margin = "0"
      reconnectMeta.style.fontFamily = "var(--mps-font-mono)"
      reconnectMeta.style.fontSize = "0.7rem"
      reconnectMeta.style.color = "var(--mps-color-foreground-muted)"
      reconnectMeta.style.padding = "0.44rem 0.52rem"
      reconnectMeta.style.borderRadius = "0.52rem"
      reconnectMeta.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 72%, var(--mps-color-telemetry-muted))"
      reconnectMeta.style.background = "color-mix(in srgb, var(--mps-overlay-depth-near) 78%, black)"

      const reconnectAction = createElement("button", {
        textContent: "Return to onboarding"
      }) as HTMLButtonElement
      reconnectAction.type = "button"
      reconnectAction.style.width = "fit-content"
      reconnectAction.style.padding = "0.48rem 0.68rem"
      reconnectAction.style.borderRadius = "0.5rem"
      reconnectAction.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 64%, var(--mps-color-telemetry-muted))"
      reconnectAction.style.background = "linear-gradient(140deg, color-mix(in srgb, var(--mps-color-surface-raised) 82%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 88%, black) 100%)"
      reconnectAction.style.color = "var(--mps-color-foreground-emphasis)"
      reconnectAction.style.fontSize = "0.74rem"
      reconnectAction.style.textTransform = "uppercase"
      reconnectAction.style.letterSpacing = "0.04em"
      reconnectAction.style.boxShadow = "inset 0 0 0 1px rgba(122, 217, 255, 0.08)"
      reconnectAction.addEventListener("click", () => {
        window.history.pushState({}, "", "/")
        render()
      })

      reconnectGuide.append(reconnectLabel, reconnectReason, reconnectMeta, reconnectAction)
    }

    const fullscreenWarning = state.fullscreenWarning
      ? createElement("p", { textContent: state.fullscreenWarning, testId: "wall-fullscreen-warning" })
      : null
    if (fullscreenWarning) {
      fullscreenWarning.style.margin = "0"
      fullscreenWarning.style.padding = "0.62rem 0.8rem"
      fullscreenWarning.style.borderRadius = "0.64rem"
      fullscreenWarning.style.border = "1px solid rgba(255, 194, 130, 0.54)"
      fullscreenWarning.style.background = [
        "linear-gradient(145deg, rgba(89, 54, 24, 0.58) 0%, rgba(63, 38, 18, 0.57) 100%)",
        "radial-gradient(circle at 100% 0%, rgba(255, 210, 151, 0.16) 0%, transparent 48%)"
      ].join(",")
      fullscreenWarning.style.color = "#ffe5cc"
      fullscreenWarning.style.fontFamily = "var(--mps-font-mono)"
      fullscreenWarning.style.fontSize = "0.69rem"
      fullscreenWarning.style.letterSpacing = "0.02em"
      fullscreenWarning.style.boxShadow = "0 8px 18px rgba(33, 18, 8, 0.3), inset 0 0 0 1px rgba(255, 219, 174, 0.18)"
    }

    const controlsContainer = createWallControlsSection(createElement, {
      ingestionStatus: state.ingestionStatus,
      diagnosticsOpen: state.diagnosticsOpen,
      fullscreenActive: isFullscreenActive(),
      controlsHidden: state.wallControlsHidden,
      transitionMs: DETAIL_CARD_TRANSITION_MS,
      onRefresh: () => {
        void ingestionRuntime?.refreshNow()
      },
      onToggleFullscreen: () => {
        void handleFullscreenToggle()
      },
      onToggleDiagnostics: () => {
        state.diagnosticsOpen = !state.diagnosticsOpen
        render()
      },
      onLogout: () => {
        void handleLogout()
      },
      fullscreenWarning,
      diagnosticsPanel,
      ingestionError,
      reconnectGuide
    })

    const selectedPoster =
      typeof state.activePosterIndex === "number"
        ? state.ingestionItems[state.activePosterIndex] ?? null
        : null
    const detailCardVisible = selectedPoster !== null && !state.wallControlsHidden

    const detailCard = createWallDetailCard(createElement, {
      selectedPoster,
      detailCardVisible,
      detailCardTransitionMs: DETAIL_CARD_TRANSITION_MS,
      placement: selectedPoster
        ? resolveDetailCardPlacement(state.activePosterIndex ?? 0, state.ingestionItems.length)
        : null,
      onClose: () => {
        dismissActiveDetailCardAndResetIdleTimer()
      }
    })

    wallCard.append(
      heading,
      libraries,
      preferences,
      ingestionSummary,
      posterGrid,
      detailCard,
      controlsContainer
    )
    root.append(wallCard)
    container.append(root)
  }

  function render(): void {
    const url = new URL(window.location.href)

    if (url.pathname === WALL_PATHNAME) {
      startDiagnosticsSampling()
      renderWall(target)
      return
    }

    stopDiagnosticsSampling()
    detachWallInteractionListeners()
    state.activePosterIndex = null
    state.wallControlsHidden = false
    state.fullscreenWarning = null
    disposeIngestionRuntime()
    renderOnboarding(target)
  }

  function onPopState(): void {
    render()
  }

  return {
    start: () => {
      window.addEventListener("popstate", onPopState)
      document.addEventListener("fullscreenchange", onFullscreenChange)
      document.addEventListener("fullscreenerror", onFullscreenError)
      render()
    },
    dispose: () => {
      stopDiagnosticsSampling()
      detachWallInteractionListeners()
      disposeIngestionRuntime()
      window.removeEventListener("popstate", onPopState)
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      document.removeEventListener("fullscreenerror", onFullscreenError)
      target.replaceChildren()
    }
  }
}
