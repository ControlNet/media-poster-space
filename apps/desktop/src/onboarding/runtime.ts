import {
  WALL_DETAIL_CARD_MAX_WIDTH,
  WALL_DETAIL_CARD_MIN_WIDTH,
  WALL_DETAIL_CARD_WIDTH,
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
  createDesktopPlatformBridge,
  type DesktopPlatformBridge,
  type DesktopDisplayOption
} from "../features/platform/tauri-bridge"
import {
  createEncryptedLocalPasswordVault,
  createPlatformBackedPasswordVault,
  type DesktopPasswordVault
} from "../features/platform/password-vault-adapter"
import {
  initializeDesktopWallPlatform,
  persistDesktopAutostartEnabled,
  persistDesktopDisplaySelection
} from "../features/platform/wall-platform-adapter"
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
import {
  formatDetailMeta,
  hasText,
  resolveDetailCardPlacement
} from "../wall/detail-card"
import { renderWallFallbackSurface } from "../wall/fallback-surface"
import { createWallInteractionController } from "../wall/interaction-controller"
import type { WallHandoff } from "../wall/types"

export {
  DESKTOP_PASSWORD_STORE_STORAGE_KEY,
  createEncryptedLocalPasswordVault,
  createPlatformBackedPasswordVault
} from "../features/platform/password-vault-adapter"
export type { DesktopPasswordVault } from "../features/platform/password-vault-adapter"

const REMEMBERED_SERVER_STORAGE_KEY = "mps.onboarding.remembered-server"
const REMEMBERED_USERNAME_STORAGE_KEY = "mps.onboarding.remembered-username"
const REMEMBER_PASSWORD_ENABLED_STORAGE_KEY = "mps.onboarding.remember-password-enabled"
const DEVICE_ID_STORAGE_KEY = "mps.onboarding.device-id"
const AUTH_SESSION_STORAGE_KEY = "mps.auth.session"
const WALL_HANDOFF_STORAGE_KEY = "mps.wall.handoff"

const WALL_PATHNAME = "/wall"
const DETAIL_CARD_TRANSITION_MS = resolveWallTransitionMs()
const WALL_CACHE_STORAGE_KEY_PREFIX = "mps.wall.poster-cache.v1::"
const RECONNECT_INITIAL_BACKOFF_MS = 2_000
const RECONNECT_MAX_BACKOFF_MS = 60_000
const RECONNECT_GUIDE_THRESHOLD_MS = 60_000
const DESKTOP_APP_VERSION = "0.1.0"

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
  platformReady: boolean
  platformPortable: boolean
  platformDisplays: DesktopDisplayOption[]
  selectedDisplayId: string | null
  autostartEnabled: boolean
  platformWarning: string | null
}

interface OnboardingAppRuntime {
  start: () => void
  dispose: () => void
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
  const rememberedPasswordEnabled = localStorageRef?.getItem(REMEMBER_PASSWORD_ENABLED_STORAGE_KEY) === "1"

  return {
    serverUrl: rememberedServer,
    username: rememberedUsername,
    password: "",
    rememberServer: rememberedServer.length > 0,
    rememberUsername: rememberedUsername.length > 0,
    rememberPasswordRequested: rememberedPasswordEnabled,
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
    platformReady: false,
    platformPortable: false,
    platformDisplays: [],
    selectedDisplayId: null,
    autostartEnabled: false,
    platformWarning: null
  }
}

export function createDesktopOnboardingAppRuntime(
  target: HTMLElement,
  options: {
    passwordVault?: DesktopPasswordVault
    platformBridge?: DesktopPlatformBridge
    warningLogger?: Pick<Console, "warn">
  } = {}
): OnboardingAppRuntime {
  const provider = createJellyfinMediaProvider()
  const localStorageRef = safeGetStorage("local")
  const sessionStorageRef = safeGetStorage("session")
  const state = createOnboardingState(localStorageRef)
  const deviceId = getOrCreateDeviceId(localStorageRef)
  const platformBridge = options.platformBridge ?? createDesktopPlatformBridge(localStorageRef)
  const warningLogger = options.warningLogger ?? console
  const fallbackPasswordVault = createEncryptedLocalPasswordVault(localStorageRef, deviceId)
  const passwordVault = options.passwordVault
    ?? createPlatformBackedPasswordVault({
      platformBridge,
      fallbackVault: fallbackPasswordVault,
      onWarning: (warning) => {
        state.platformWarning = warning
        warningLogger.warn(warning)
      }
    })
  const posterCache = createPosterCache<MediaItem>()
  let ingestionRuntime: MediaIngestionRuntime | null = null
  let ingestionRuntimeKey: string | null = null
  let reconnectTimerId: ReturnType<typeof setTimeout> | null = null
  let reconnectStartedAtMs: number | null = null
  let reconnectBackoffMs = RECONNECT_INITIAL_BACKOFF_MS
  let platformInitNonce = 0

  let passwordHydrationNonce = 0
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
        version: DESKTOP_APP_VERSION,
        configSummary: {
          surface: "desktop",
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
          },
          displaySelection: state.selectedDisplayId,
          autostartEnabled: state.autostartEnabled
        },
        logs: diagnosticsLogStore.snapshot(),
        context: {
          ingestionStatus: state.ingestionStatus,
          ingestionTrigger: state.ingestionTrigger,
          ingestionError: state.ingestionError
        }
      })

      const fileName = exportCrashReportPackageLocally(crashReport, "mps-desktop-crash-report")
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
      surface: "desktop"
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

  async function initializePlatformExtensions(): Promise<void> {
    const initNonce = ++platformInitNonce

    const platformState = await initializeDesktopWallPlatform({
      platformBridge,
      existingWarning: state.platformWarning
    })

    if (platformInitNonce !== initNonce) {
      return
    }

    state.platformReady = platformState.platformReady
    state.platformPortable = platformState.platformPortable
    state.platformDisplays = platformState.platformDisplays
    state.selectedDisplayId = platformState.selectedDisplayId
    state.autostartEnabled = platformState.autostartEnabled
    state.platformWarning = platformState.platformWarning

    render()
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

    const preheatedKeys = posterCache.list({ touch: false, sortByScore: true }).map((item) => item.key)
    if (preheatedKeys.length > 0) {
      posterCache.markPreheated(preheatedKeys)
      syncPosterCacheToStorage(runtimeKey)
    }

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
        ttlMs: POSTER_CACHE_DEFAULT_TTL_MS,
        preheated: false
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

  function dismissActiveDetailCard(): boolean {
    if (state.activePosterIndex === null) {
      return false
    }

    return applyWallInteractionTransition(
      createWallDismissDetailTransition({
        activePosterIndex: state.activePosterIndex,
        wallControlsHidden: state.wallControlsHidden
      })
    )
  }

  const wallInteractionController = createWallInteractionController({
    idleHideMs: WALL_IDLE_HIDE_MS,
    isWallRouteActive,
    onIdleHide: () => {
      return applyWallInteractionTransition(
        createWallIdleHideTransition({
          activePosterIndex: state.activePosterIndex,
          wallControlsHidden: state.wallControlsHidden
        })
      )
    },
    onRevealControls: () => {
      return applyWallInteractionTransition(
        createWallRevealControlsTransition({
          activePosterIndex: state.activePosterIndex,
          wallControlsHidden: state.wallControlsHidden
        })
      )
    },
    onEscape: () => {
      return dismissActiveDetailCard()
    },
    onRenderRequest: () => {
      render()
    }
  })

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

  function persistRememberPasswordPreference(): void {
    if (state.rememberPasswordRequested) {
      localStorageRef?.setItem(REMEMBER_PASSWORD_ENABLED_STORAGE_KEY, "1")
      return
    }

    localStorageRef?.removeItem(REMEMBER_PASSWORD_ENABLED_STORAGE_KEY)
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

  function queueRememberedPasswordHydration(): void {
    passwordHydrationNonce += 1
    const hydrationNonce = passwordHydrationNonce

    if (!state.rememberPasswordRequested || state.password.length > 0) {
      return
    }

    const serverUrl = state.serverUrl.trim()
    const username = state.username.trim()

    if (!serverUrl || !username) {
      return
    }

    void passwordVault.read({ serverUrl, username }).then((rememberedPassword) => {
      if (hydrationNonce !== passwordHydrationNonce) {
        return
      }

      if (!rememberedPassword || state.password.length > 0) {
        return
      }

      state.password = rememberedPassword
      render()
    })
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
    queueRememberedPasswordHydration()
    render()
  }

  async function handleLogin(): Promise<void> {
    state.authError = null
    state.libraryError = null

    const trimmedServerUrl = state.serverUrl.trim()
    const trimmedUsername = state.username.trim()
    const submittedPassword = state.password

    if (!trimmedServerUrl || !trimmedUsername || !submittedPassword) {
      state.authError = "Server URL, username, and password are required."
      render()
      return
    }

    state.loginPending = true
    clearSessionArtifacts()
    render()

    try {
      const session = await provider.authenticate({
        serverUrl: trimmedServerUrl,
        username: trimmedUsername,
        password: submittedPassword,
        clientName: "Media Poster Space Desktop",
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
      persistRememberPasswordPreference()

      if (state.rememberPasswordRequested) {
        const writeResult = await passwordVault.write({
          serverUrl: trimmedServerUrl,
          username: trimmedUsername,
          password: submittedPassword
        })

        if (writeResult.warning) {
          state.platformWarning = writeResult.warning
        }
      } else {
        await passwordVault.clearForIdentity({
          serverUrl: trimmedServerUrl,
          username: trimmedUsername
        })
      }

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

    disposeIngestionRuntime()
    clearSessionArtifacts()
    await passwordVault.clearAll()

    state.session = null
    state.password = ""
    state.libraries = []
    state.selectedLibraryIds = new Set<string>()
    state.diagnosticsOpen = false
    state.detailProfile = "balanced"
    state.authError = null
    state.libraryError = null
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

    if (activeSession) {
      void provider.invalidateSession(activeSession).catch(() => undefined)
    }
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
        "Desktop onboarding: server preflight, username/password authentication, then library and wall preferences."
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

      if (!state.password) {
        queueRememberedPasswordHydration()
      }
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

      if (!state.password) {
        queueRememberedPasswordHydration()
      }
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
    rememberPassword.addEventListener("change", () => {
      state.rememberPasswordRequested = rememberPassword.checked
      persistRememberPasswordPreference()

      if (state.rememberPasswordRequested) {
        queueRememberedPasswordHydration()
        return
      }

      state.password = ""
      const serverUrl = state.serverUrl.trim()
      const username = state.username.trim()

      if (serverUrl && username) {
        void passwordVault.clearForIdentity({ serverUrl, username })
      }

      render()
    })
    rememberPasswordLabel.append(
      rememberPassword,
      document.createTextNode("Remember password (stored encrypted on this device)")
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

      const displayLabel = createElement("label", { textContent: "Display output" })
      displayLabel.style.display = "grid"
      displayLabel.style.gap = "0.4rem"
      const displaySelect = createElement("select", { testId: "display-selection-select" }) as HTMLSelectElement
      displaySelect.style.padding = "0.65rem 0.75rem"
      displaySelect.style.border = "1px solid var(--mps-color-border)"
      displaySelect.style.borderRadius = "0.6rem"
      displaySelect.style.background = "var(--mps-color-canvas)"
      displaySelect.style.color = "var(--mps-color-foreground)"
      displaySelect.disabled = !state.platformReady || state.platformDisplays.length === 0
      displaySelect.innerHTML = state.platformDisplays
        .map((display) => {
          const primaryLabel = display.isPrimary ? " (primary)" : ""
          const selectedAttribute = display.id === state.selectedDisplayId ? " selected" : ""
          return `<option value="${display.id}"${selectedAttribute}>${display.label}${primaryLabel}</option>`
        })
        .join("")
      displaySelect.addEventListener("change", () => {
        state.selectedDisplayId = displaySelect.value || null
        void persistDesktopDisplaySelection({
          platformBridge,
          displayId: state.selectedDisplayId
        }).then((warning) => {
          if (!warning) {
            return
          }

          state.platformWarning = warning
          render()
        })
      })
      displayLabel.append(displaySelect)

      const autostartLabel = createElement("label")
      autostartLabel.style.display = "inline-flex"
      autostartLabel.style.gap = "0.45rem"
      autostartLabel.style.alignItems = "center"
      const autostartCheckbox = createElement("input", { testId: "autostart-toggle-checkbox" }) as HTMLInputElement
      autostartCheckbox.type = "checkbox"
      autostartCheckbox.checked = state.autostartEnabled
      autostartCheckbox.disabled = !state.platformReady || state.platformPortable
      autostartCheckbox.addEventListener("change", () => {
        state.autostartEnabled = autostartCheckbox.checked
        void persistDesktopAutostartEnabled({
          platformBridge,
          enabled: state.autostartEnabled
        }).then((warning) => {
          if (!warning) {
            return
          }

          state.platformWarning = warning
          render()
        })
      })

      const autostartLabelText = state.platformPortable
        ? "Autostart unavailable in portable package mode"
        : "Launch automatically on desktop startup"
      autostartLabel.append(autostartCheckbox, document.createTextNode(autostartLabelText))

      const portableBadge = createElement("p", {
        testId: "portable-mode-badge",
        textContent: state.platformPortable
          ? "Portable package mode active"
          : "Installed package mode active"
      })
      portableBadge.style.margin = "0"
      portableBadge.style.color = "var(--mps-color-foreground-muted)"

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
            rememberPasswordRequested: state.rememberPasswordRequested
          }
        }

        state.finishPending = true
        saveSession(state.session)
        saveWallHandoff(handoff)
        window.history.pushState({}, "", WALL_PATHNAME)
        state.finishPending = false
        render()
      })

      librarySection.append(libraryList, preferenceLabel, displayLabel, autostartLabel, portableBadge, finishButton)
    }

    if (state.libraryError) {
      const libraryError = createElement("p", { textContent: state.libraryError })
      libraryError.style.margin = "0"
      libraryError.style.color = "#ffb4b4"
      librarySection.append(libraryError)
    }

    const platformWarningBanner = state.platformWarning
      ? createElement("p", {
        textContent: state.platformWarning,
        testId: "platform-warning-banner"
      })
      : null

    if (platformWarningBanner) {
      platformWarningBanner.style.margin = "0"
      platformWarningBanner.style.padding = "0.6rem 0.75rem"
      platformWarningBanner.style.borderRadius = "0.5rem"
      platformWarningBanner.style.border = "1px solid rgba(255, 183, 77, 0.5)"
      platformWarningBanner.style.background = "rgba(117, 74, 20, 0.45)"
      platformWarningBanner.style.color = "#ffe0b2"
    }

    card.append(heading, description, serverLabel, rememberServerLabel, preflightButton, loginFields, librarySection)
    if (platformWarningBanner) {
      card.append(platformWarningBanner)
    }
    shell.append(card)
    container.append(shell)
  }

  function renderWall(container: HTMLElement): void {
    container.innerHTML = ""

    const handoff = readWallHandoff()
    if (!handoff) {
      disposeIngestionRuntime()
      wallInteractionController.detach()
      state.activePosterIndex = null
      state.wallControlsHidden = false
      renderWallFallbackSurface({
        container,
        createElement,
        title: "Poster wall is not ready",
        body: "No onboarding handoff was found. Run onboarding and finish with at least one library.",
        onBack: () => {
          window.history.pushState({}, "", "/")
          render()
        }
      })
      return
    }

    const activeSession = readActiveSession()
    if (!activeSession) {
      disposeIngestionRuntime()
      wallInteractionController.detach()
      state.activePosterIndex = null
      state.wallControlsHidden = false
      renderWallFallbackSurface({
        container,
        createElement,
        title: "Session expired",
        body: "Wall ingestion requires an active session. Sign in again to refresh posters.",
        onBack: () => {
          window.history.pushState({}, "", "/")
          render()
        }
      })
      return
    }

    ensureIngestionRuntime(activeSession, handoff.selectedLibraryIds)
    wallInteractionController.attach()
    if (!wallInteractionController.isIdleHideScheduled()) {
      wallInteractionController.scheduleIdleHide()
    }

    const root = createElement("main", { testId: "poster-wall-root" })
    root.style.minHeight = "100vh"
    root.style.display = "flex"
    root.style.justifyContent = "center"
    root.style.alignItems = "center"
    root.style.padding = "clamp(0.9rem, 2vw, 1.5rem)"
    root.style.position = "relative"
    root.style.overflow = "hidden"
    root.style.isolation = "isolate"
    root.style.background = [
      "radial-gradient(circle at 17% 24%, var(--mps-color-orbit-glow-halo) 0%, transparent 43%)",
      "radial-gradient(circle at 84% 8%, color-mix(in srgb, var(--mps-color-telemetry-soft) 72%, transparent) 0%, transparent 56%)",
      "linear-gradient(155deg, var(--mps-overlay-depth-far) 0%, var(--mps-color-canvas) 58%, #05070f 100%)"
    ].join(",")
    root.style.color = "var(--mps-color-foreground)"
    root.style.fontFamily = "var(--mps-font-body)"

    const orbitHaloNear = createElement("div")
    orbitHaloNear.setAttribute("aria-hidden", "true")
    orbitHaloNear.style.position = "absolute"
    orbitHaloNear.style.inset = "auto auto -26vmax -20vmax"
    orbitHaloNear.style.width = "58vmax"
    orbitHaloNear.style.aspectRatio = "1 / 1"
    orbitHaloNear.style.borderRadius = "999px"
    orbitHaloNear.style.pointerEvents = "none"
    orbitHaloNear.style.opacity = "0.85"
    orbitHaloNear.style.filter = "blur(2px)"
    orbitHaloNear.style.background = [
      "radial-gradient(circle at center, var(--mps-color-orbit-glow-halo) 0%, rgba(122, 217, 255, 0.08) 38%, transparent 70%)",
      "conic-gradient(from 200deg, transparent 0deg, rgba(122, 217, 255, 0.16) 120deg, transparent 205deg, rgba(210, 166, 90, 0.22) 290deg, transparent 360deg)"
    ].join(",")

    const orbitHaloFar = createElement("div")
    orbitHaloFar.setAttribute("aria-hidden", "true")
    orbitHaloFar.style.position = "absolute"
    orbitHaloFar.style.inset = "-28vmax -16vmax auto auto"
    orbitHaloFar.style.width = "56vmax"
    orbitHaloFar.style.aspectRatio = "1 / 1"
    orbitHaloFar.style.borderRadius = "999px"
    orbitHaloFar.style.pointerEvents = "none"
    orbitHaloFar.style.opacity = "0.54"
    orbitHaloFar.style.mixBlendMode = "screen"
    orbitHaloFar.style.background = "radial-gradient(circle at 45% 44%, var(--mps-color-orbit-glow) 0%, rgba(122, 217, 255, 0.12) 34%, transparent 74%)"

    const wallCard = createElement("section")
    wallCard.style.width = "min(90rem, 100%)"
    wallCard.style.minHeight = "min(88vh, 52rem)"
    wallCard.style.display = "grid"
    wallCard.style.gridTemplateColumns = "minmax(14rem, 0.72fr) minmax(0, 1.28fr)"
    wallCard.style.gridAutoRows = "min-content"
    wallCard.style.alignContent = "start"
    wallCard.style.columnGap = "clamp(0.8rem, 2vw, 1.2rem)"
    wallCard.style.rowGap = "0.72rem"
    wallCard.style.padding = "clamp(0.9rem, 2vw, 1.2rem)"
    wallCard.style.position = "relative"
    wallCard.style.overflow = "hidden"
    wallCard.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 72%, var(--mps-color-orbit-glow-halo))"
    wallCard.style.borderRadius = "var(--mps-radius-lg)"
    wallCard.style.background = [
      "linear-gradient(152deg, var(--mps-overlay-depth-near) 0%, color-mix(in srgb, var(--mps-color-surface) 78%, black) 34%, color-mix(in srgb, var(--mps-color-surface-raised) 72%, black) 100%)",
      "radial-gradient(circle at 80% 0%, color-mix(in srgb, var(--mps-color-telemetry-soft) 64%, transparent) 0%, transparent 38%)"
    ].join(",")
    wallCard.style.boxShadow = "var(--mps-elevation-orbit), inset 0 1px 0 rgba(255, 255, 255, 0.06)"
    wallCard.style.backdropFilter = "blur(6px)"

    const orbitalMeridian = createElement("div")
    orbitalMeridian.setAttribute("aria-hidden", "true")
    orbitalMeridian.style.position = "absolute"
    orbitalMeridian.style.inset = "0"
    orbitalMeridian.style.pointerEvents = "none"
    orbitalMeridian.style.zIndex = "0"
    orbitalMeridian.style.background = [
      "repeating-radial-gradient(circle at 104% 50%, transparent 0 3.7rem, rgba(122, 217, 255, 0.11) 3.7rem 3.82rem)",
      "linear-gradient(90deg, transparent 0%, rgba(122, 217, 255, 0.08) 30%, rgba(122, 217, 255, 0.14) 45%, transparent 72%)"
    ].join(",")

    const telemetryGrid = createElement("div")
    telemetryGrid.setAttribute("aria-hidden", "true")
    telemetryGrid.style.position = "absolute"
    telemetryGrid.style.inset = "0"
    telemetryGrid.style.pointerEvents = "none"
    telemetryGrid.style.zIndex = "0"
    telemetryGrid.style.opacity = "0.22"
    telemetryGrid.style.backgroundImage = [
      "linear-gradient(to right, rgba(122, 217, 255, 0.14) 1px, transparent 1px)",
      "linear-gradient(to bottom, rgba(122, 217, 255, 0.08) 1px, transparent 1px)"
    ].join(",")
    telemetryGrid.style.backgroundSize = "2.6rem 2.6rem"

    root.append(orbitHaloNear, orbitHaloFar)
    wallCard.append(orbitalMeridian, telemetryGrid)

    const heading = createElement("h1", { textContent: "Poster Wall" })
    heading.style.margin = "0"
    heading.style.fontFamily = "var(--mps-font-display)"
    heading.style.gridColumn = "1"
    heading.style.position = "relative"
    heading.style.zIndex = "1"
    heading.style.fontSize = "clamp(1.26rem, 2.4vw, 1.8rem)"
    heading.style.lineHeight = "1.1"
    heading.style.letterSpacing = "0.03em"
    heading.style.textTransform = "uppercase"
    heading.style.color = "var(--mps-color-foreground-emphasis)"
    heading.style.textShadow = "0 0 16px color-mix(in srgb, var(--mps-color-orbit-glow) 52%, transparent)"

    const libraries = createElement("p", {
      textContent: `Libraries selected: ${handoff.selectedLibraryIds.join(", ") || "none"}`
    })
    libraries.style.margin = "0"
    libraries.style.gridColumn = "1"
    libraries.style.position = "relative"
    libraries.style.zIndex = "1"
    libraries.style.padding = "0.68rem 0.72rem"
    libraries.style.borderRadius = "0.62rem"
    libraries.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 76%, var(--mps-color-orbit-glow-halo))"
    libraries.style.background = "linear-gradient(140deg, color-mix(in srgb, var(--mps-color-surface-raised) 78%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 84%, black) 100%)"
    libraries.style.fontSize = "0.83rem"
    libraries.style.lineHeight = "1.35"
    libraries.style.color = "var(--mps-color-foreground-support)"
    libraries.style.boxShadow = "inset 0 0 0 1px rgba(122, 217, 255, 0.1)"

    const preferences = createElement("p", {
      textContent:
        `Density: ${handoff.preferences.density}; remember server: ${handoff.preferences.rememberServer ? "yes" : "no"}; `
        + `remember username: ${handoff.preferences.rememberUsername ? "yes" : "no"}; `
        + `remember password: ${handoff.preferences.rememberPasswordRequested ? "yes" : "no"}.`
    })
    preferences.style.margin = "0"
    preferences.style.gridColumn = "1"
    preferences.style.position = "relative"
    preferences.style.zIndex = "1"
    preferences.style.padding = "0.64rem 0.72rem"
    preferences.style.borderRadius = "0.62rem"
    preferences.style.border = "1px dashed color-mix(in srgb, var(--mps-color-border) 74%, var(--mps-color-telemetry-muted))"
    preferences.style.background = "color-mix(in srgb, var(--mps-overlay-depth-near) 72%, transparent)"
    preferences.style.color = "var(--mps-color-foreground-muted)"
    preferences.style.fontSize = "0.79rem"
    preferences.style.lineHeight = "1.35"

    const ingestionSummary = createElement("p", {
      textContent:
        `Ingested posters: ${state.ingestionItemCount}; `
        + `status: ${state.ingestionStatus}; `
        + `trigger: ${state.ingestionTrigger ?? "n/a"}; `
        + `last refresh: ${state.ingestionFetchedAt ?? "pending"}.`,
      testId: "wall-ingestion-summary"
    })
    ingestionSummary.style.margin = "0"
    ingestionSummary.style.gridColumn = "1"
    ingestionSummary.style.position = "relative"
    ingestionSummary.style.zIndex = "1"
    ingestionSummary.style.padding = "0.62rem 0.78rem"
    ingestionSummary.style.borderRadius = "0.6rem"
    ingestionSummary.style.border = "1px solid color-mix(in srgb, var(--mps-color-telemetry-muted) 45%, var(--mps-color-border))"
    ingestionSummary.style.background = "linear-gradient(90deg, color-mix(in srgb, var(--mps-overlay-depth-near) 78%, black) 0%, color-mix(in srgb, var(--mps-overlay-depth-far) 72%, black) 70%)"
    ingestionSummary.style.color = "var(--mps-color-foreground-support)"
    ingestionSummary.style.fontFamily = "var(--mps-font-mono)"
    ingestionSummary.style.fontSize = "0.74rem"
    ingestionSummary.style.letterSpacing = "0.015em"
    ingestionSummary.style.boxShadow = "inset 0 0 0 1px rgba(122, 217, 255, 0.08)"

    const posterGrid = createElement("section", { testId: "wall-poster-grid" })
    posterGrid.style.display = "grid"
    posterGrid.style.gridColumn = "2"
    posterGrid.style.gridRow = "1 / span 6"
    posterGrid.style.position = "relative"
    posterGrid.style.zIndex = "1"
    posterGrid.style.alignContent = "start"
    posterGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(10.2rem, 1fr))"
    posterGrid.style.gap = "0.82rem"
    posterGrid.style.padding = "0.2rem"
    posterGrid.style.borderRadius = "0.8rem"
    posterGrid.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 62%, var(--mps-color-orbit-glow-halo))"
    posterGrid.style.background = "linear-gradient(168deg, color-mix(in srgb, var(--mps-overlay-depth-near) 78%, black) 0%, color-mix(in srgb, var(--mps-overlay-depth-far) 82%, black) 100%)"
    posterGrid.style.boxShadow = "inset 0 0 0 1px rgba(122, 217, 255, 0.08)"
    posterGrid.style.maxHeight = "min(74vh, 46rem)"
    posterGrid.style.overflow = "auto"

    if (state.ingestionItems.length === 0) {
      const emptyPosterState = createElement("p", {
        textContent: "No posters ingested yet. Try manual refresh once ingestion is ready."
      })
      emptyPosterState.style.margin = "0"
      emptyPosterState.style.padding = "0.9rem"
      emptyPosterState.style.borderRadius = "0.6rem"
      emptyPosterState.style.border = "1px dashed color-mix(in srgb, var(--mps-color-border) 72%, var(--mps-color-telemetry-muted))"
      emptyPosterState.style.color = "var(--mps-color-foreground-muted)"
      emptyPosterState.style.background = "color-mix(in srgb, var(--mps-color-surface-raised) 75%, black)"
      posterGrid.append(emptyPosterState)
    } else {
      state.ingestionItems.forEach((item, index) => {
        const tile = createElement("button", {
          testId: `poster-item-${index}`
        }) as HTMLButtonElement
        tile.type = "button"
        tile.style.display = "grid"
        tile.style.gridTemplateRows = "auto min-content"
        tile.style.gap = "0.4rem"
        tile.style.padding = "0.42rem"
        tile.style.borderRadius = "0.72rem"
        tile.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 80%, var(--mps-color-orbit-glow-halo))"
        tile.style.background = "linear-gradient(156deg, color-mix(in srgb, var(--mps-color-surface-raised) 78%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 84%, black) 100%)"
        tile.style.color = "var(--mps-color-foreground)"
        tile.style.textAlign = "left"
        tile.style.cursor = "pointer"
        tile.style.transition = "transform 170ms ease, border-color 170ms ease, box-shadow 170ms ease"
        tile.style.boxShadow = "0 8px 20px rgba(3, 8, 18, 0.35), inset 0 0 0 1px rgba(122, 217, 255, 0.04)"

        const posterThumb = createElement("div")
        posterThumb.style.aspectRatio = "2 / 3"
        posterThumb.style.borderRadius = "0.55rem"
        posterThumb.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 62%, var(--mps-color-orbit-glow-halo))"
        posterThumb.style.backgroundImage = `url(${item.poster.url})`
        posterThumb.style.backgroundSize = "cover"
        posterThumb.style.backgroundPosition = "center"
        posterThumb.style.backgroundColor = "color-mix(in srgb, var(--mps-color-canvas) 84%, black)"
        posterThumb.style.boxShadow = "inset 0 -70px 42px rgba(4, 8, 18, 0.56)"

        const tileTitle = createElement("p", { textContent: item.title })
        tileTitle.style.margin = "0"
        tileTitle.style.fontSize = "0.86rem"
        tileTitle.style.fontWeight = "600"
        tileTitle.style.lineHeight = "1.3"
        tileTitle.style.letterSpacing = "0.01em"

        const tileTelemetry = createElement("p", {
          textContent: [item.kind, typeof item.year === "number" ? String(item.year) : null].filter(Boolean).join(" · ") || "Library asset"
        })
        tileTelemetry.style.margin = "0"
        tileTelemetry.style.fontFamily = "var(--mps-font-mono)"
        tileTelemetry.style.fontSize = "0.68rem"
        tileTelemetry.style.letterSpacing = "0.03em"
        tileTelemetry.style.textTransform = "uppercase"
        tileTelemetry.style.color = "var(--mps-color-foreground-muted)"

        const tileLabel = createElement("div")
        tileLabel.style.display = "grid"
        tileLabel.style.gap = "0.17rem"
        tileLabel.style.padding = "0.08rem 0.08rem 0.1rem"
        tileLabel.append(tileTitle, tileTelemetry)

        tile.append(posterThumb, tileLabel)
        tile.addEventListener("click", () => {
          const shouldRender = applyWallInteractionTransition(
            createWallPosterSelectionTransition({
              activePosterIndex: state.activePosterIndex,
              wallControlsHidden: state.wallControlsHidden
            }, index)
          )
          wallInteractionController.scheduleIdleHide()

          if (shouldRender) {
            render()
          }
        })
        tile.addEventListener("mouseenter", () => {
          tile.style.transform = "translateY(-2px)"
          tile.style.borderColor = "color-mix(in srgb, var(--mps-color-telemetry) 44%, var(--mps-color-border))"
          tile.style.boxShadow = "0 14px 28px rgba(3, 8, 18, 0.46), 0 0 0 1px rgba(122, 217, 255, 0.26)"
        })
        tile.addEventListener("mouseleave", () => {
          tile.style.transform = "translateY(0)"
          tile.style.borderColor = "color-mix(in srgb, var(--mps-color-border) 80%, var(--mps-color-orbit-glow-halo))"
          tile.style.boxShadow = "0 8px 20px rgba(3, 8, 18, 0.35), inset 0 0 0 1px rgba(122, 217, 255, 0.04)"
        })

        posterGrid.append(tile)
      })
    }

    function applyControlButtonSkin(
      button: HTMLButtonElement,
      tone: "accent" | "neutral"
    ): void {
      button.style.width = "fit-content"
      button.style.padding = "0.58rem 0.78rem"
      button.style.borderRadius = "0.56rem"
      button.style.fontWeight = "600"
      button.style.fontSize = "0.78rem"
      button.style.letterSpacing = "0.015em"
      button.style.textTransform = "uppercase"
      button.style.transition = "transform 150ms ease, border-color 150ms ease"

      if (tone === "accent") {
        button.style.border = "1px solid color-mix(in srgb, var(--mps-color-accent-ring) 72%, var(--mps-color-telemetry))"
        button.style.background = "linear-gradient(135deg, color-mix(in srgb, var(--mps-color-accent) 82%, black) 0%, color-mix(in srgb, var(--mps-color-accent-soft) 74%, black) 100%)"
        button.style.color = "var(--mps-color-accent-foreground)"
        return
      }

      button.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 64%, var(--mps-color-telemetry-muted))"
      button.style.background = "linear-gradient(135deg, color-mix(in srgb, var(--mps-color-surface-raised) 82%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 88%, black) 100%)"
      button.style.color = "var(--mps-color-foreground-support)"
    }

    function attachButtonHover(button: HTMLButtonElement): void {
      button.addEventListener("mouseenter", () => {
        button.style.transform = "translateY(-1px)"
      })

      button.addEventListener("mouseleave", () => {
        button.style.transform = "translateY(0)"
      })
    }

    const refreshButton = createElement("button", {
      textContent: state.ingestionStatus === "refreshing" ? "Refreshing…" : "Refresh posters now",
      testId: "manual-refresh-button"
    }) as HTMLButtonElement
    refreshButton.type = "button"
    applyControlButtonSkin(refreshButton, "accent")
    attachButtonHover(refreshButton)
    refreshButton.disabled = state.ingestionStatus === "refreshing"
    refreshButton.addEventListener("click", () => {
      void ingestionRuntime?.refreshNow()
    })

    const diagnosticsButton = createElement("button", {
      textContent: state.diagnosticsOpen ? "Hide diagnostics" : "Open diagnostics",
      testId: "diagnostics-open"
    }) as HTMLButtonElement
    diagnosticsButton.type = "button"
    applyControlButtonSkin(diagnosticsButton, "neutral")
    attachButtonHover(diagnosticsButton)
    diagnosticsButton.addEventListener("click", () => {
      state.diagnosticsOpen = !state.diagnosticsOpen
      render()
    })

    const diagnosticsPanel = state.diagnosticsOpen
      ? createElement("section", { testId: "wall-diagnostics-panel" })
      : null
    if (diagnosticsPanel) {
      const retentionSnapshot = diagnosticsLogStore.getRetentionSnapshot()
      const lastSample = diagnosticsLatestSample
      const memoryLabel = typeof lastSample?.memoryMb === "number"
        ? `${lastSample.memoryMb.toFixed(1)} MB`
        : "n/a"

      diagnosticsPanel.style.display = "grid"
      diagnosticsPanel.style.gap = "0.68rem"
      diagnosticsPanel.style.padding = "0.86rem"
      diagnosticsPanel.style.borderRadius = "0.76rem"
      diagnosticsPanel.style.border = "1px solid color-mix(in srgb, var(--mps-color-orbit-glow-halo) 68%, var(--mps-color-border))"
      diagnosticsPanel.style.background = [
        "linear-gradient(154deg, color-mix(in srgb, var(--mps-overlay-depth-near) 82%, black) 0%, color-mix(in srgb, var(--mps-overlay-depth-far) 78%, black) 100%)",
        "radial-gradient(circle at 96% -8%, color-mix(in srgb, var(--mps-color-orbit-glow-halo) 52%, transparent) 0%, transparent 48%)"
      ].join(",")
      diagnosticsPanel.style.boxShadow = "0 14px 28px rgba(3, 8, 18, 0.26), inset 0 0 0 1px rgba(122, 217, 255, 0.1)"
      diagnosticsPanel.style.backdropFilter = "blur(6px)"

      function applyTelemetryChipStyle(chip: HTMLElement, variant: "neutral" | "emphasis"): void {
        chip.style.margin = "0"
        chip.style.padding = "0.52rem 0.58rem"
        chip.style.borderRadius = "0.54rem"
        chip.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 68%, var(--mps-color-telemetry-muted))"
        chip.style.background = "color-mix(in srgb, var(--mps-overlay-depth-near) 76%, black)"

        if (variant === "emphasis") {
          chip.style.color = "var(--mps-color-foreground-support)"
          return
        }

        chip.style.color = "var(--mps-color-foreground-muted)"
      }

      const diagnosticsHeading = createElement("h3", {
        textContent: "Runtime diagnostics"
      })
      diagnosticsHeading.style.margin = "0"
      diagnosticsHeading.style.fontFamily = "var(--mps-font-display)"
      diagnosticsHeading.style.fontSize = "1rem"
      diagnosticsHeading.style.lineHeight = "1.2"

      const diagnosticsSubheading = createElement("p", {
        textContent: "Telemetry stream · reconnect state · crash export"
      })
      diagnosticsSubheading.style.margin = "0"
      diagnosticsSubheading.style.fontFamily = "var(--mps-font-mono)"
      diagnosticsSubheading.style.fontSize = "0.66rem"
      diagnosticsSubheading.style.letterSpacing = "0.1em"
      diagnosticsSubheading.style.textTransform = "uppercase"
      diagnosticsSubheading.style.color = "var(--mps-color-foreground-muted)"

      const diagnosticsLibraries = createElement("p", {
        textContent: `Selected libraries: ${handoff.selectedLibraryIds.join(", ") || "none"}`,
        testId: "wall-diagnostics-selected-libraries"
      })
      applyTelemetryChipStyle(diagnosticsLibraries, "emphasis")
      diagnosticsLibraries.style.fontSize = "0.78rem"
      diagnosticsLibraries.style.lineHeight = "1.35"

      const diagnosticsIngestion = createElement("p", {
        textContent:
          `Ingestion state: status=${state.ingestionStatus}; count=${state.ingestionItemCount}; `
          + `trigger=${state.ingestionTrigger ?? "n/a"}; fetchedAt=${state.ingestionFetchedAt ?? "pending"}; `
          + `error=${state.ingestionError ?? "none"}; reconnectAttempts=${state.reconnectAttempt}; `
          + `nextRetryMs=${state.reconnectNextDelayMs ?? "n/a"}.`,
        testId: "wall-diagnostics-ingestion-state"
      })
      applyTelemetryChipStyle(diagnosticsIngestion, "neutral")
      diagnosticsIngestion.style.fontFamily = "var(--mps-font-mono)"
      diagnosticsIngestion.style.fontSize = "0.69rem"
      diagnosticsIngestion.style.lineHeight = "1.45"

      const diagnosticsSamplingInterval = createElement("p", {
        textContent: `Sampling interval: ${DIAGNOSTICS_SAMPLING_INTERVAL_MS}ms`,
        testId: "wall-diagnostics-sampling-interval"
      })
      applyTelemetryChipStyle(diagnosticsSamplingInterval, "neutral")
      diagnosticsSamplingInterval.style.fontFamily = "var(--mps-font-mono)"
      diagnosticsSamplingInterval.style.fontSize = "0.7rem"

      const diagnosticsFps = createElement("p", {
        textContent: `FPS (last 1s): ${lastSample?.fps ?? 0}`,
        testId: "wall-diagnostics-fps"
      })
      applyTelemetryChipStyle(diagnosticsFps, "emphasis")
      diagnosticsFps.style.fontFamily = "var(--mps-font-mono)"
      diagnosticsFps.style.fontSize = "0.71rem"

      const diagnosticsMemory = createElement("p", {
        textContent: `Memory usage: ${memoryLabel}`,
        testId: "wall-diagnostics-memory"
      })
      applyTelemetryChipStyle(diagnosticsMemory, "emphasis")
      diagnosticsMemory.style.fontFamily = "var(--mps-font-mono)"
      diagnosticsMemory.style.fontSize = "0.71rem"

      const diagnosticsReconnect = createElement("p", {
        textContent:
          `Reconnect metrics: attempts=${lastSample?.reconnectAttempt ?? state.reconnectAttempt}; `
          + `nextRetryMs=${lastSample?.reconnectNextDelayMs ?? state.reconnectNextDelayMs ?? "n/a"}.`,
        testId: "wall-diagnostics-reconnect"
      })
      applyTelemetryChipStyle(diagnosticsReconnect, "neutral")
      diagnosticsReconnect.style.fontFamily = "var(--mps-font-mono)"
      diagnosticsReconnect.style.fontSize = "0.69rem"

      const diagnosticsRetention = createElement("p", {
        textContent:
          `Retention policy: ${Math.round(DIAGNOSTICS_RETENTION_MAX_AGE_MS / (24 * 60 * 60 * 1_000))}d / `
          + `${Math.round(DIAGNOSTICS_RETENTION_MAX_BYTES / (1024 * 1024))}MB; `
          + `logs=${retentionSnapshot.count}; bytes=${retentionSnapshot.byteSize}.`,
        testId: "wall-diagnostics-retention-policy"
      })
      applyTelemetryChipStyle(diagnosticsRetention, "neutral")
      diagnosticsRetention.style.fontFamily = "var(--mps-font-mono)"
      diagnosticsRetention.style.fontSize = "0.69rem"
      diagnosticsRetention.style.lineHeight = "1.4"

      const diagnosticsProfile = createElement("p", {
        textContent: `Profile: ${state.detailProfile}`,
        testId: "deep-settings-profile-current"
      })
      applyTelemetryChipStyle(diagnosticsProfile, "emphasis")
      diagnosticsProfile.style.fontFamily = "var(--mps-font-mono)"
      diagnosticsProfile.style.fontSize = "0.69rem"
      diagnosticsProfile.style.textTransform = "uppercase"
      diagnosticsProfile.style.letterSpacing = "0.06em"

      const diagnosticsHeader = createElement("div")
      diagnosticsHeader.style.display = "grid"
      diagnosticsHeader.style.gap = "0.24rem"
      diagnosticsHeader.style.padding = "0.18rem 0.06rem"

      const profileToggle = createElement("button", {
        textContent:
          state.detailProfile === "balanced"
            ? "Switch profile to showcase"
            : "Switch profile to balanced",
        testId: "deep-settings-profile-toggle"
      }) as HTMLButtonElement
      profileToggle.type = "button"
      profileToggle.style.width = "fit-content"
      profileToggle.style.padding = "0.5rem 0.72rem"
      profileToggle.style.borderRadius = "0.52rem"
      profileToggle.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 64%, var(--mps-color-telemetry-muted))"
      profileToggle.style.background = "linear-gradient(135deg, color-mix(in srgb, var(--mps-color-surface-raised) 82%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 86%, black) 100%)"
      profileToggle.style.color = "var(--mps-color-foreground-support)"
      profileToggle.style.textTransform = "uppercase"
      profileToggle.style.fontSize = "0.72rem"
      profileToggle.style.letterSpacing = "0.05em"
      profileToggle.style.boxShadow = "inset 0 0 0 1px rgba(122, 217, 255, 0.08)"
      profileToggle.addEventListener("click", () => {
        state.detailProfile = state.detailProfile === "balanced" ? "showcase" : "balanced"
        render()
      })

      const diagnosticsExportButton = createElement("button", {
        textContent: "Export crash package",
        testId: "diagnostics-export-crash-report"
      }) as HTMLButtonElement
      diagnosticsExportButton.type = "button"
      diagnosticsExportButton.style.width = "fit-content"
      diagnosticsExportButton.style.padding = "0.5rem 0.72rem"
      diagnosticsExportButton.style.borderRadius = "0.52rem"
      diagnosticsExportButton.style.border = "1px solid color-mix(in srgb, var(--mps-color-accent-ring) 66%, var(--mps-color-border))"
      diagnosticsExportButton.style.background = "linear-gradient(135deg, color-mix(in srgb, var(--mps-color-accent-muted) 76%, black) 0%, color-mix(in srgb, var(--mps-color-accent-soft) 65%, black) 100%)"
      diagnosticsExportButton.style.color = "var(--mps-color-foreground-emphasis)"
      diagnosticsExportButton.style.textTransform = "uppercase"
      diagnosticsExportButton.style.fontSize = "0.72rem"
      diagnosticsExportButton.style.letterSpacing = "0.05em"
      diagnosticsExportButton.style.boxShadow = "0 8px 16px rgba(12, 24, 44, 0.24), inset 0 0 0 1px rgba(122, 217, 255, 0.08)"
      diagnosticsExportButton.addEventListener("click", () => {
        exportCrashReport(handoff)
      })

      const diagnosticsExportStatus = createElement("p", {
        textContent: diagnosticsExportError
          ? `Crash export failed: ${diagnosticsExportError}`
          : diagnosticsLastExportAt
            ? `Crash export complete at ${diagnosticsLastExportAt}`
            : "Crash export ready.",
        testId: "diagnostics-export-status"
      })
      diagnosticsExportStatus.style.margin = "0"
      diagnosticsExportStatus.style.color = diagnosticsExportError
        ? "#ffd8d8"
        : "var(--mps-color-foreground-muted)"
      diagnosticsExportStatus.style.fontFamily = "var(--mps-font-mono)"
      diagnosticsExportStatus.style.fontSize = "0.68rem"

      const diagnosticsTelemetryRail = createElement("div")
      diagnosticsTelemetryRail.style.display = "grid"
      diagnosticsTelemetryRail.style.gridTemplateColumns = "repeat(auto-fit, minmax(11.6rem, 1fr))"
      diagnosticsTelemetryRail.style.gap = "0.46rem"

      const diagnosticsActions = createElement("div")
      diagnosticsActions.style.display = "grid"
      diagnosticsActions.style.gridTemplateColumns = "repeat(auto-fit, minmax(11.6rem, max-content))"
      diagnosticsActions.style.alignItems = "center"
      diagnosticsActions.style.gap = "0.42rem"
      diagnosticsActions.style.paddingTop = "0.1rem"

      diagnosticsHeader.append(diagnosticsHeading, diagnosticsSubheading)
      diagnosticsTelemetryRail.append(
        diagnosticsLibraries,
        diagnosticsIngestion,
        diagnosticsSamplingInterval,
        diagnosticsFps,
        diagnosticsMemory,
        diagnosticsReconnect,
        diagnosticsRetention,
        diagnosticsProfile
      )
      diagnosticsActions.append(profileToggle, diagnosticsExportButton, diagnosticsExportStatus)

      diagnosticsPanel.append(
        diagnosticsHeader,
        diagnosticsTelemetryRail,
        diagnosticsActions
      )
    }

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
      reconnectAction.style.padding = "0.47rem 0.68rem"
      reconnectAction.style.borderRadius = "0.5rem"
      reconnectAction.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 62%, var(--mps-color-telemetry-muted))"
      reconnectAction.style.background = "linear-gradient(134deg, color-mix(in srgb, var(--mps-color-surface-raised) 82%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 86%, black) 100%)"
      reconnectAction.style.color = "var(--mps-color-foreground-emphasis)"
      reconnectAction.style.fontSize = "0.75rem"
      reconnectAction.style.textTransform = "uppercase"
      reconnectAction.style.letterSpacing = "0.04em"
      reconnectAction.style.boxShadow = "inset 0 0 0 1px rgba(122, 217, 255, 0.08)"
      reconnectAction.addEventListener("click", () => {
        window.history.pushState({}, "", "/")
        render()
      })

      reconnectGuide.append(reconnectLabel, reconnectReason, reconnectMeta, reconnectAction)
    }

    const logoutButton = createElement("button", { textContent: "Logout", testId: "logout-button" })
    applyControlButtonSkin(logoutButton, "accent")
    attachButtonHover(logoutButton)
    logoutButton.addEventListener("click", () => {
      void handleLogout()
    })

    const controlsContainer = createElement("div", { testId: "wall-controls-container" })
    controlsContainer.style.gridColumn = "1 / -1"
    controlsContainer.style.position = "relative"
    controlsContainer.style.zIndex = "3"
    controlsContainer.style.display = "grid"
    controlsContainer.style.gap = "0.72rem"
    controlsContainer.style.padding = "0.74rem"
    controlsContainer.style.borderRadius = "0.78rem"
    controlsContainer.style.border = "1px solid color-mix(in srgb, var(--mps-color-orbit-glow-halo) 70%, var(--mps-color-border))"
    controlsContainer.style.background = [
      "linear-gradient(150deg, color-mix(in srgb, var(--mps-color-surface) 86%, black) 0%, color-mix(in srgb, var(--mps-color-surface-raised) 78%, black) 100%)",
      "radial-gradient(circle at 4% 0%, color-mix(in srgb, var(--mps-color-telemetry-soft) 48%, transparent) 0%, transparent 42%)"
    ].join(",")
    controlsContainer.style.boxShadow = "0 14px 28px rgba(3, 8, 18, 0.22), inset 0 0 0 1px rgba(122, 217, 255, 0.1)"
    controlsContainer.style.backdropFilter = "blur(6px)"
    controlsContainer.style.transitionProperty = "opacity, transform"
    controlsContainer.style.transitionDuration = `${DETAIL_CARD_TRANSITION_MS}ms`
    controlsContainer.style.transitionTimingFunction = "ease"
    controlsContainer.style.opacity = state.wallControlsHidden ? "0" : "1"
    controlsContainer.style.transform = state.wallControlsHidden ? "translateY(0.5rem)" : "translateY(0)"
    controlsContainer.style.visibility = state.wallControlsHidden ? "hidden" : "visible"
    controlsContainer.style.pointerEvents = state.wallControlsHidden ? "none" : "auto"

    const controlsHeader = createElement("div")
    controlsHeader.style.display = "grid"
    controlsHeader.style.gridTemplateColumns = "minmax(0, 1fr) minmax(max-content, auto)"
    controlsHeader.style.alignItems = "center"
    controlsHeader.style.gap = "0.5rem"

    const controlsRow = createElement("div")
    controlsRow.style.display = "grid"
    controlsRow.style.gridTemplateColumns = "repeat(auto-fit, minmax(10.8rem, 1fr))"
    controlsRow.style.gap = "0.54rem"

    const controlsHeading = createElement("p", {
      textContent: "Operational controls"
    })
    controlsHeading.style.margin = "0"
    controlsHeading.style.fontFamily = "var(--mps-font-mono)"
    controlsHeading.style.fontSize = "0.67rem"
    controlsHeading.style.letterSpacing = "0.12em"
    controlsHeading.style.textTransform = "uppercase"
    controlsHeading.style.color = "var(--mps-color-foreground-muted)"

    const controlsSubheading = createElement("p", {
      textContent: state.diagnosticsOpen
        ? "Diagnostics relay active"
        : "Diagnostics relay standby"
    })
    controlsSubheading.style.margin = "0"
    controlsSubheading.style.padding = "0.42rem 0.56rem"
    controlsSubheading.style.borderRadius = "999px"
    controlsSubheading.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 66%, var(--mps-color-telemetry-muted))"
    controlsSubheading.style.background = "color-mix(in srgb, var(--mps-overlay-depth-near) 76%, black)"
    controlsSubheading.style.color = "var(--mps-color-foreground-support)"
    controlsSubheading.style.fontFamily = "var(--mps-font-mono)"
    controlsSubheading.style.fontSize = "0.63rem"
    controlsSubheading.style.letterSpacing = "0.08em"
    controlsSubheading.style.textTransform = "uppercase"

    const primaryCluster = createElement("div")
    primaryCluster.style.display = "grid"
    primaryCluster.style.gridTemplateColumns = "repeat(auto-fit, minmax(10.4rem, 1fr))"
    primaryCluster.style.gap = "0.46rem"
    primaryCluster.style.padding = "0.5rem"
    primaryCluster.style.borderRadius = "0.66rem"
    primaryCluster.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 66%, var(--mps-color-telemetry-muted))"
    primaryCluster.style.background = "color-mix(in srgb, var(--mps-overlay-depth-near) 82%, black)"

    const supportCluster = createElement("div")
    supportCluster.style.display = "grid"
    supportCluster.style.gridTemplateColumns = "repeat(auto-fit, minmax(10.4rem, 1fr))"
    supportCluster.style.gap = "0.46rem"
    supportCluster.style.padding = "0.5rem"
    supportCluster.style.borderRadius = "0.66rem"
    supportCluster.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 64%, var(--mps-color-accent-ring))"
    supportCluster.style.background = "color-mix(in srgb, var(--mps-color-surface-raised) 84%, black)"

    const calloutStack = createElement("div")
    calloutStack.style.display = "grid"
    calloutStack.style.gap = "0.44rem"

    controlsHeader.append(controlsHeading, controlsSubheading)
    controlsContainer.append(controlsHeader)
    primaryCluster.append(refreshButton)
    supportCluster.append(diagnosticsButton, logoutButton)
    controlsRow.append(primaryCluster, supportCluster)
    controlsContainer.append(controlsRow)

    if (diagnosticsPanel) {
      controlsContainer.append(diagnosticsPanel)
    }

    if (ingestionError) {
      calloutStack.append(ingestionError)
    }

    if (reconnectGuide) {
      calloutStack.append(reconnectGuide)
    }

    if (calloutStack.childElementCount > 0) {
      controlsContainer.append(calloutStack)
    }

    const detailCard = createElement("aside", { testId: "detail-card" })
    detailCard.style.display = "grid"
    detailCard.style.gap = "0.58rem"
    detailCard.style.padding = "0.86rem"
    detailCard.style.borderRadius = "0.78rem"
    detailCard.style.position = "absolute"
    detailCard.style.zIndex = "4"
    detailCard.style.width = WALL_DETAIL_CARD_WIDTH
    detailCard.style.minWidth = WALL_DETAIL_CARD_MIN_WIDTH
    detailCard.style.maxWidth = WALL_DETAIL_CARD_MAX_WIDTH
    detailCard.style.border = "1px solid color-mix(in srgb, var(--mps-color-orbit-glow) 32%, var(--mps-color-border))"
    detailCard.style.background = [
      "linear-gradient(155deg, color-mix(in srgb, var(--mps-overlay-depth-near) 74%, black) 0%, color-mix(in srgb, var(--mps-overlay-depth-far) 78%, black) 100%)",
      "radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--mps-color-orbit-glow-halo) 72%, transparent) 0%, transparent 40%)"
    ].join(",")
    detailCard.style.boxShadow = "var(--mps-elevation-orbit), inset 0 0 0 1px rgba(122, 217, 255, 0.08)"
    detailCard.style.backdropFilter = "blur(7px)"
    detailCard.style.transitionProperty = "opacity, transform"
    detailCard.style.transitionDuration = `${DETAIL_CARD_TRANSITION_MS}ms`
    detailCard.style.transitionTimingFunction = "cubic-bezier(0.2, 0.8, 0.2, 1)"

    const selectedPoster =
      typeof state.activePosterIndex === "number"
      ? state.ingestionItems[state.activePosterIndex] ?? null
      : null
    const detailCardVisible = selectedPoster !== null && !state.wallControlsHidden

    if (selectedPoster) {
      const placement = resolveDetailCardPlacement(state.activePosterIndex ?? 0, state.ingestionItems.length)
      detailCard.style.left = placement.left
      detailCard.style.top = placement.top
      detailCard.dataset.placement = `${placement.left}-${placement.top}`
    } else {
      detailCard.style.left = "64%"
      detailCard.style.top = "56%"
      detailCard.dataset.placement = "default"
    }

    detailCard.style.opacity = detailCardVisible ? "1" : "0"
    detailCard.style.transform = detailCardVisible ? "translateY(0) scale(1)" : "translateY(0.95rem) scale(0.985)"
    detailCard.style.visibility = detailCardVisible ? "visible" : "hidden"
    detailCard.style.pointerEvents = detailCardVisible ? "auto" : "none"

    const detailOverlay = createElement("div")
    detailOverlay.setAttribute("aria-hidden", "true")
    detailOverlay.style.position = "absolute"
    detailOverlay.style.inset = "0"
    detailOverlay.style.pointerEvents = "none"
    detailOverlay.style.borderRadius = "inherit"
    detailOverlay.style.opacity = "0.3"
    detailOverlay.style.backgroundImage = "linear-gradient(115deg, transparent 0%, rgba(122, 217, 255, 0.24) 46%, transparent 72%)"
    detailCard.append(detailOverlay)

    const detailBody = createElement("div")
    detailBody.style.position = "relative"
    detailBody.style.zIndex = "1"
    detailBody.style.display = "grid"
    detailBody.style.gap = "0.5rem"

    const accentRail = createElement("p", {
      textContent: "Selected transmission"
    })
    accentRail.style.margin = "0"
    accentRail.style.fontFamily = "var(--mps-font-mono)"
    accentRail.style.fontSize = "0.66rem"
    accentRail.style.letterSpacing = "0.11em"
    accentRail.style.textTransform = "uppercase"
    accentRail.style.color = "var(--mps-color-foreground-muted)"

    const detailTitle = createElement("h2", {
      textContent: selectedPoster?.title ?? ""
    })
    detailTitle.style.margin = "0"
    detailTitle.style.fontSize = "1.08rem"
    detailTitle.style.lineHeight = "1.22"
    detailTitle.style.fontFamily = "var(--mps-font-display)"
    detailTitle.style.color = "var(--mps-color-foreground-emphasis)"

    const detailPosterChip = selectedPoster
      ? createElement("div")
      : null
    if (detailPosterChip && selectedPoster) {
      detailPosterChip.style.aspectRatio = "16 / 9"
      detailPosterChip.style.borderRadius = "0.55rem"
      detailPosterChip.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 62%, var(--mps-color-orbit-glow-halo))"
      detailPosterChip.style.backgroundImage = `linear-gradient(180deg, rgba(5, 8, 18, 0.1) 0%, rgba(5, 8, 18, 0.68) 100%), url(${selectedPoster.poster.url})`
      detailPosterChip.style.backgroundPosition = "center"
      detailPosterChip.style.backgroundSize = "cover"
      detailPosterChip.style.boxShadow = "inset 0 -24px 40px rgba(5, 8, 18, 0.55)"
    }

    const detailMetaText = selectedPoster ? formatDetailMeta(selectedPoster) : ""
    const detailMeta = hasText(detailMetaText)
      ? createElement("p", { textContent: detailMetaText, testId: "detail-card-meta" })
      : null
    if (detailMeta) {
      detailMeta.style.margin = "0"
      detailMeta.style.color = "var(--mps-color-foreground-support)"
      detailMeta.style.fontFamily = "var(--mps-font-mono)"
      detailMeta.style.fontSize = "0.72rem"
      detailMeta.style.letterSpacing = "0.03em"
      detailMeta.style.textTransform = "uppercase"
    }

    const detailOverview = selectedPoster && hasText(selectedPoster.overview)
      ? createElement("p", { textContent: selectedPoster.overview, testId: "detail-card-overview" })
      : null
    if (detailOverview) {
      detailOverview.style.margin = "0"
      detailOverview.style.lineHeight = "1.45"
      detailOverview.style.color = "var(--mps-color-foreground)"
      detailOverview.style.fontSize = "0.84rem"
    }

    const exitHotspot = createElement("button", {
      textContent: "Close detail",
      testId: "exit-hotspot"
    }) as HTMLButtonElement
    exitHotspot.type = "button"
    exitHotspot.style.width = "fit-content"
    exitHotspot.style.padding = "0.47rem 0.68rem"
    exitHotspot.style.borderRadius = "0.5rem"
    exitHotspot.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 62%, var(--mps-color-telemetry-muted))"
    exitHotspot.style.background = "linear-gradient(134deg, color-mix(in srgb, var(--mps-color-surface-raised) 82%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 86%, black) 100%)"
    exitHotspot.style.color = "var(--mps-color-foreground-emphasis)"
    exitHotspot.style.fontSize = "0.75rem"
    exitHotspot.style.textTransform = "uppercase"
    exitHotspot.style.letterSpacing = "0.04em"
    exitHotspot.addEventListener("click", () => {
      const shouldRender = dismissActiveDetailCard()
      if (!shouldRender) {
        return
      }

      wallInteractionController.scheduleIdleHide()
      render()
    })

    detailBody.append(accentRail)
    detailBody.append(detailTitle)
    if (detailPosterChip) {
      detailBody.append(detailPosterChip)
    }
    if (detailMeta) {
      detailBody.append(detailMeta)
    }
    if (detailOverview) {
      detailBody.append(detailOverview)
    }
    detailBody.append(exitHotspot)
    detailCard.append(detailBody)

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
    wallInteractionController.detach()
    state.activePosterIndex = null
    state.wallControlsHidden = false
    disposeIngestionRuntime()
    renderOnboarding(target)
  }

  function onPopState(): void {
    render()
  }

  return {
    start: () => {
      window.addEventListener("popstate", onPopState)
      render()
      queueRememberedPasswordHydration()
      void initializePlatformExtensions()
    },
    dispose: () => {
      stopDiagnosticsSampling()
      wallInteractionController.detach()
      disposeIngestionRuntime()
      window.removeEventListener("popstate", onPopState)
      target.replaceChildren()
    }
  }
}
