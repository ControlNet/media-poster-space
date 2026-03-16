import {
  ONBOARDING_AUTH_SESSION_STORAGE_KEY,
  ONBOARDING_RECONNECT_GUIDE_THRESHOLD_MS,
  ONBOARDING_RECONNECT_INITIAL_BACKOFF_MS,
  ONBOARDING_RECONNECT_MAX_BACKOFF_MS,
  ONBOARDING_REMEMBERED_SERVER_STORAGE_KEY,
  ONBOARDING_REMEMBERED_USERNAME_STORAGE_KEY,
  ONBOARDING_WALL_PATHNAME,
  WALL_IDLE_HIDE_MS,
  clearOnboardingSessionArtifacts,
  isOnboardingWallRouteActive,
  persistRememberedString,
  readOnboardingActiveSession,
  readOnboardingWallHandoff,
  saveOnboardingSession,
  saveOnboardingWallHandoff,
  applyWallInteractionTransitionState,
  createOnboardingBaseState,
  createOnboardingFormView,
  createOnboardingIngestionController,
  createOnboardingWallRouteCallbacks,
  shouldSuppressIdleHideTransitionWhenDiagnosticsOpen,
  createOnboardingWallRouteView,
  getOnboardingWallFallbackContent,
  hasSuccessfulPreflightForServer,
  prepareOnboardingWallRoute,
  runOnboardingBackToServer,
  runOnboardingFinish,
  runOnboardingLogin,
  runOnboardingLogoutReset,
  runOnboardingPreflight,
  shouldRunAutomaticPreflight,
  createOnboardingDiagnosticsController,
  createOnboardingElementFactory,
  getOrCreateDeviceId,
  parseJson,
  safeGetStorage,
  toAuthErrorMessage,
  toLibraryCheckboxTestId,
  toPosterCacheStorageKey,
  toReconnectGuideReason,
  createWallDismissDetailTransition,
  createWallFallbackShell,
  createWallIdleHideTransition,
  createWallInteractionController,
  WALL_POSTER_GRID_STREAM_APPLIER_KEY,
  createWallRevealControlsTransition,
  createPosterCache,
  createRuntimePosterQueueRefillFetchAdapter,
  createMediaIngestionRuntime,
  createJellyfinMediaProvider,
  normalizeWallActivePosterIndex,
  POSTER_CACHE_DEFAULT_TTL_MS,
  resolveWallDetailPlacement,
  resolveWallTransitionMs,
  type MediaIngestionRefreshTrigger,
  type MediaItem,
  type MediaLibrary,
  type ProviderErrorCategory,
  type ProviderSession,
  type OnboardingAppRuntime,
  type OnboardingBaseState,
  type WallPosterGridStreamApplyResult,
  type WallPosterGridStreamApplier,
  type WallHandoff,
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
  type DiagnosticsLogEntry,
  type DiagnosticsSample
} from "../features/diagnostics/runtime-diagnostics"
import {
  createCrashReportPackage,
  exportCrashReportPackageLocally
} from "../features/crash-export/crash-export"

export {
  DESKTOP_PASSWORD_STORE_STORAGE_KEY,
  createEncryptedLocalPasswordVault,
  createPlatformBackedPasswordVault
} from "../features/platform/password-vault-adapter"
export type { DesktopPasswordVault } from "../features/platform/password-vault-adapter"

const REMEMBERED_SERVER_STORAGE_KEY = ONBOARDING_REMEMBERED_SERVER_STORAGE_KEY
const REMEMBERED_USERNAME_STORAGE_KEY = ONBOARDING_REMEMBERED_USERNAME_STORAGE_KEY
const REMEMBER_PASSWORD_ENABLED_STORAGE_KEY = "mps.onboarding.remember-password-enabled"
const AUTH_SESSION_STORAGE_KEY = ONBOARDING_AUTH_SESSION_STORAGE_KEY
const WALL_PATHNAME = ONBOARDING_WALL_PATHNAME
const DETAIL_CARD_TRANSITION_MS = resolveWallTransitionMs()
const RECONNECT_INITIAL_BACKOFF_MS = ONBOARDING_RECONNECT_INITIAL_BACKOFF_MS
const RECONNECT_MAX_BACKOFF_MS = ONBOARDING_RECONNECT_MAX_BACKOFF_MS
const RECONNECT_GUIDE_THRESHOLD_MS = ONBOARDING_RECONNECT_GUIDE_THRESHOLD_MS
const DESKTOP_APP_VERSION = "0.1.0"
const WALL_STREAM_INTERVAL_MS = DIAGNOSTICS_SAMPLING_INTERVAL_MS

const UNAVAILABLE_WALL_POSTER_GRID_STREAM_APPLY_RESULT: WallPosterGridStreamApplyResult = {
  status: "unavailable",
  queuedItemCount: 0,
  appliedItemCount: 0,
  pendingItemCount: 0
}

interface WallPosterGridStreamElement extends HTMLElement {
  [WALL_POSTER_GRID_STREAM_APPLIER_KEY]?: WallPosterGridStreamApplier
}

interface OnboardingState extends OnboardingBaseState<
  ProviderSession,
  MediaLibrary,
  MediaItem,
  ProviderErrorCategory,
  MediaIngestionRefreshTrigger
> {
  platformReady: boolean
  platformPortable: boolean
  platformDisplays: DesktopDisplayOption[]
  selectedDisplayId: string | null
  autostartEnabled: boolean
  fullscreenEnabled: boolean
  platformWarning: string | null
}

function createOnboardingState(localStorageRef: Storage | null): OnboardingState {
  const rememberedServer = localStorageRef?.getItem(REMEMBERED_SERVER_STORAGE_KEY) ?? ""
  const rememberedUsername = localStorageRef?.getItem(REMEMBERED_USERNAME_STORAGE_KEY) ?? ""
  const rememberedPasswordEnabled = localStorageRef?.getItem(REMEMBER_PASSWORD_ENABLED_STORAGE_KEY) === "1"

  return {
    ...createOnboardingBaseState<
      ProviderSession,
      MediaLibrary,
      MediaItem,
      ProviderErrorCategory,
      MediaIngestionRefreshTrigger
    >({
      rememberedServer,
      rememberedUsername,
      rememberPasswordRequested: rememberedPasswordEnabled
    }),
    platformReady: false,
    platformPortable: false,
    platformDisplays: [],
    selectedDisplayId: null,
    autostartEnabled: false,
    fullscreenEnabled: false,
    platformWarning: null
  }
}

function isHealthyWallPosterGridStreamApplyResult(
  result: WallPosterGridStreamApplyResult
): boolean {
  return result.status === "applied"
    || result.status === "deferred"
    || result.status === "noop"
}

function shouldFallbackToWallRender(
  result: WallPosterGridStreamApplyResult,
  options: {
    itemCount: number
    hasMountedPosterTiles: boolean
  }
): boolean {
  if (!isHealthyWallPosterGridStreamApplyResult(result)) {
    return true
  }

  return options.itemCount > 0
    && !options.hasMountedPosterTiles
    && result.status !== "applied"
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
  const createElement = createOnboardingElementFactory(document)
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
  let platformInitNonce = 0
  let isDisposed = false

  let passwordHydrationNonce = 0
  let automaticWallEntryAttemptKey: string | null = null
  let automaticWallEntryInFlight = false
  const diagnosticsLogStore = createDiagnosticsLogStore()
  let diagnosticsLastExportAt: string | null = null
  let diagnosticsExportError: string | null = null
  let wallPatchFallbackRequested = false
  let wallPatchFallbackIncidentActive = false
  let wallStreamIntervalId: ReturnType<typeof setInterval> | null = null
  let wallStreamTickInFlight = false
  let isWallRendering = false
  let wallPatchDeferredDuringRender = false
  let preflightInFlightPromise: Promise<void> | null = null

  function applyWallInteractionTransition(transition: WallInteractionTransitionResult): boolean {
    return applyWallInteractionTransitionState(state, transition)
  }

  const diagnosticsController = createOnboardingDiagnosticsController({
    state,
    logStore: diagnosticsLogStore,
    isWallRouteActive,
    onDiagnosticsRenderRequest: (sample) => {
      syncWallDiagnosticsTelemetry(sample)
    },
    samplingIntervalMs: DIAGNOSTICS_SAMPLING_INTERVAL_MS
  })

  function appendDiagnosticsLog(entry: DiagnosticsLogEntry): void {
    diagnosticsController.appendLog(entry)
  }

  function startDiagnosticsSampling(): void {
    diagnosticsController.startSampling()
  }

  function stopDiagnosticsSampling(): void {
    diagnosticsController.stopSampling()
  }

  function requestRender(): void {
    if (isDisposed) {
      return
    }

    render()
  }

  function exportCrashReport(handoff: WallHandoff): void {
    try {
      const crashReport = createCrashReportPackage({
        version: DESKTOP_APP_VERSION,
        configSummary: {
          surface: "desktop",
          route: window.location.pathname,
          selectedLibraryIds: handoff.selectedLibraryIds,
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

    requestRender()
  }

  appendDiagnosticsLog({
    timestamp: new Date().toISOString(),
    level: "info",
    event: "runtime.started",
    details: {
      surface: "desktop"
    }
  })

  const ingestionController = createOnboardingIngestionController({
    state,
    localStorageRef,
    posterCache,
    parseSnapshot: (value) => {
      return parseJson<ReturnType<typeof posterCache.toSnapshot>>(value)
    },
    toPosterCacheStorageKey,
    createRuntime: ({ session, selectedLibraryIds, onStateChange }) => {
      return createMediaIngestionRuntime({
        provider,
        session,
        selectedLibraryIds,
        onStateChange
      })
    },
    createQueueRefillFetchAdapter: ({ session, selectedLibraryIds, cursor, updatedSince }) => {
      return createRuntimePosterQueueRefillFetchAdapter({
        provider,
        session,
        selectedLibraryIds,
        ...(cursor ? { cursor } : {}),
        ...(updatedSince ? { updatedSince } : {})
      })
    },
    appendDiagnosticsLog,
    toReconnectGuideReason,
    isWallRouteActive,
    onRenderRequest: () => {
      handleIngestionRenderRequest()
    },
    onStreamReadyTransition: () => {
      if (!isWallRouteActive()) {
        return
      }

      applyWallStreamItems(state.ingestionItems)
    },
    normalizeWallActivePosterIndex,
    reconnectInitialBackoffMs: RECONNECT_INITIAL_BACKOFF_MS,
    reconnectMaxBackoffMs: RECONNECT_MAX_BACKOFF_MS,
    reconnectGuideThresholdMs: RECONNECT_GUIDE_THRESHOLD_MS,
    cacheTtlMs: POSTER_CACHE_DEFAULT_TTL_MS,
    cacheSetPreheated: false,
    markHydratedItemsAsPreheated: true
  })

  async function initializePlatformExtensions(): Promise<void> {
    const initNonce = ++platformInitNonce

    const [platformState, fullscreenEnabled] = await Promise.all([
      initializeDesktopWallPlatform({
        platformBridge,
        existingWarning: state.platformWarning
      }),
      platformBridge.getFullscreenEnabled()
    ])

    if (isDisposed || platformInitNonce !== initNonce) {
      return
    }

    state.platformReady = platformState.platformReady
    state.platformPortable = platformState.platformPortable
    state.platformDisplays = platformState.platformDisplays
    state.selectedDisplayId = platformState.selectedDisplayId
    state.autostartEnabled = platformState.autostartEnabled
    state.fullscreenEnabled = fullscreenEnabled
    state.platformWarning = platformState.platformWarning

    requestRender()
  }

  function disposeIngestionRuntime(): void {
    ingestionController.disposeRuntime()
  }

  function readActiveSession(): ProviderSession | null {
    return readPersistedActiveSession()
  }

  function ensureIngestionRuntime(session: ProviderSession, selectedLibraryIds: readonly string[]): void {
    ingestionController.ensureRuntime(session, selectedLibraryIds)
  }

  function isWallRouteActive(): boolean {
    return isOnboardingWallRouteActive(window.location.href, WALL_PATHNAME)
  }

  function setWallDiagnosticsText(testId: string, textContent: string): void {
    if (isDisposed) {
      return
    }

    const diagnosticsNode = target.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
    if (!diagnosticsNode) {
      return
    }

    diagnosticsNode.textContent = textContent
  }

  function syncWallIngestionTelemetry(): void {
    setWallDiagnosticsText(
      "wall-ingestion-summary",
      `Ingested posters: ${state.ingestionItemCount}; status: ${state.ingestionStatus}; trigger: ${state.ingestionTrigger ?? "n/a"}; last refresh: ${state.ingestionFetchedAt ?? "pending"}.`
    )

    if (!state.diagnosticsOpen) {
      return
    }

    setWallDiagnosticsText(
      "wall-diagnostics-ingestion-state",
      `Ingestion state: status=${state.ingestionStatus}; count=${state.ingestionItemCount}; trigger=${state.ingestionTrigger ?? "n/a"}; fetchedAt=${state.ingestionFetchedAt ?? "pending"}; error=${state.ingestionError ?? "none"}; reconnectAttempts=${state.reconnectAttempt}; nextRetryMs=${state.reconnectNextDelayMs ?? "n/a"}.`
    )
  }

  function syncWallErrorTelemetry(): void {
    const ingestionErrorNode = target.querySelector<HTMLElement>("[data-testid=\"wall-ingestion-error\"]")
    if (ingestionErrorNode && state.ingestionError) {
      ingestionErrorNode.textContent = state.ingestionError
    }

    const reconnectGuide = target.querySelector<HTMLElement>("[data-testid=\"reconnect-guide\"]")
    if (!reconnectGuide) {
      return
    }

    const reconnectMetaNode = Array.from(reconnectGuide.querySelectorAll("p")).find((node) => {
      return node.textContent?.includes("Retry attempts:")
    })

    if (reconnectMetaNode instanceof HTMLElement) {
      reconnectMetaNode.textContent =
        `Retry attempts: ${state.reconnectAttempt}; next retry in ${state.reconnectNextDelayMs ?? "n/a"}ms.`
    }
  }

  function applyWallStreamItems(items: readonly MediaItem[]): WallPosterGridStreamApplyResult {
    const wallPosterGrid = target.querySelector<WallPosterGridStreamElement>("[data-testid=\"wall-poster-grid\"]")
    const applyStreamItems = wallPosterGrid?.[WALL_POSTER_GRID_STREAM_APPLIER_KEY]
    if (typeof applyStreamItems !== "function") {
      return UNAVAILABLE_WALL_POSTER_GRID_STREAM_APPLY_RESULT
    }

    return applyStreamItems(items)
  }

  function clearWallPatchFallbackState(): void {
    wallPatchFallbackRequested = false
    wallPatchFallbackIncidentActive = false
    wallPatchDeferredDuringRender = false
  }

  function requestWallPatchFallbackOnce(): void {
    if (isDisposed) {
      return
    }

    if (wallPatchFallbackRequested || wallPatchFallbackIncidentActive) {
      return
    }

    wallPatchFallbackRequested = true
    wallPatchFallbackIncidentActive = true
    requestRender()
  }

  function readWallPatchReadiness(): {
    wallRoot: HTMLElement | null
    wallPosterGrid: WallPosterGridStreamElement | null
    applyStreamItems: WallPosterGridStreamApplier | null
    hasMountedPosterTiles: boolean
  } {
    const wallRoot = target.querySelector<HTMLElement>("[data-testid=\"poster-wall-root\"]")
    const wallPosterGrid = target.querySelector<WallPosterGridStreamElement>("[data-testid=\"wall-poster-grid\"]")
    const applyStreamItemsCandidate = wallPosterGrid?.[WALL_POSTER_GRID_STREAM_APPLIER_KEY]

    return {
      wallRoot,
      wallPosterGrid: wallPosterGrid ?? null,
      applyStreamItems: typeof applyStreamItemsCandidate === "function" ? applyStreamItemsCandidate : null,
      hasMountedPosterTiles: wallPosterGrid?.querySelector("button") !== null
    }
  }


  function handleIngestionRenderRequest(): void {
    if (isDisposed) {
      return
    }

    if (!isWallRouteActive()) {
      clearWallPatchFallbackState()
      requestRender()
      return
    }

    const wallPatchReadiness = readWallPatchReadiness()
    if (!wallPatchReadiness.wallRoot || !wallPatchReadiness.wallPosterGrid || !wallPatchReadiness.applyStreamItems) {
      if (isWallRendering) {
        wallPatchDeferredDuringRender = true
        return
      }

      requestWallPatchFallbackOnce()
      return
    }

    if (state.ingestionStatus === "error") {
      const hasIngestionError = target.querySelector<HTMLElement>("[data-testid=\"wall-ingestion-error\"]") !== null
      const hasReconnectGuide = target.querySelector<HTMLElement>("[data-testid=\"reconnect-guide\"]") !== null
      if (!hasIngestionError || !hasReconnectGuide) {
        requestWallPatchFallbackOnce()
        return
      }

      clearWallPatchFallbackState()
      syncWallErrorTelemetry()
      syncWallIngestionTelemetry()
      return
    }

    const streamApplyResult = wallPatchReadiness.applyStreamItems(state.ingestionItems)
    if (shouldFallbackToWallRender(streamApplyResult, {
      itemCount: state.ingestionItems.length,
      hasMountedPosterTiles: wallPatchReadiness.hasMountedPosterTiles
    })) {
      requestWallPatchFallbackOnce()
      return
    }

    clearWallPatchFallbackState()
    syncWallIngestionTelemetry()
  }


  async function handleWallStreamTick(): Promise<void> {
    if (!isWallRouteActive() || wallStreamTickInFlight) {
      return
    }

    wallStreamTickInFlight = true
    try {
      await ingestionController.consumeNextPosterForStream()
    } catch (error) {
      appendDiagnosticsLog({
        timestamp: new Date().toISOString(),
        level: "warn",
        event: "wall.stream.tick-failed",
        details: {
          message: error instanceof Error ? error.message : "Unknown stream tick failure"
        }
      })
    } finally {
      wallStreamTickInFlight = false
    }
  }

  function startWallStreamLoop(): void {
    if (wallStreamIntervalId !== null) {
      return
    }

    wallStreamIntervalId = setInterval(() => {
      void handleWallStreamTick()
    }, WALL_STREAM_INTERVAL_MS)
  }

  function stopWallStreamLoop(): void {
    if (wallStreamIntervalId !== null) {
      clearInterval(wallStreamIntervalId)
      wallStreamIntervalId = null
    }

    wallStreamTickInFlight = false
  }

  function syncWallDiagnosticsTelemetry(sample: DiagnosticsSample): void {
    if (!isWallRouteActive() || !state.diagnosticsOpen) {
      return
    }

    const retentionSnapshot = diagnosticsLogStore.getRetentionSnapshot()
    const memoryLabel = typeof sample.memoryMb === "number"
      ? `${sample.memoryMb.toFixed(1)} MB`
      : "n/a"
    const reconnectNextDelayMs = sample.reconnectNextDelayMs ?? state.reconnectNextDelayMs ?? "n/a"
    const retentionLabel =
      `Retention policy: ${Math.round(DIAGNOSTICS_RETENTION_MAX_AGE_MS / (24 * 60 * 60 * 1_000))}d / `
      + `${Math.round(DIAGNOSTICS_RETENTION_MAX_BYTES / (1024 * 1024))}MB; `
      + `logs=${retentionSnapshot.count}; bytes=${retentionSnapshot.byteSize}.`

    setWallDiagnosticsText("wall-diagnostics-fps", `FPS (last 1s): ${sample.fps}`)
    setWallDiagnosticsText("wall-diagnostics-memory", `Memory usage: ${memoryLabel}`)
    setWallDiagnosticsText(
      "wall-diagnostics-reconnect",
      `Reconnect metrics: attempts=${sample.reconnectAttempt}; nextRetryMs=${reconnectNextDelayMs}.`
    )
    setWallDiagnosticsText("wall-diagnostics-retention-policy", retentionLabel)
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

  function applyWallInteractionPatchInPlace(): boolean {
    if (!isWallRouteActive()) {
      return false
    }

    const wallRoot = target.querySelector<HTMLElement>('[data-testid="poster-wall-root"]')
    const wallPosterGrid = target.querySelector<HTMLElement>('[data-testid="wall-poster-grid"]')
    const controlsContainer = target.querySelector<HTMLElement>('[data-testid="wall-controls-container"]')
    const detailCard = target.querySelector<HTMLElement>('[data-testid="detail-card"]')
    const wallClock = target.querySelector<HTMLElement>('[data-testid="wall-clock-heading"]')

    if (!wallRoot || !wallPosterGrid || !controlsContainer || !detailCard) {
      return false
    }

    const controlsHidden = state.wallControlsHidden
    if (wallClock) {
      wallClock.style.opacity = controlsHidden ? "0.22" : "0.85"
    }
    controlsContainer.style.opacity = controlsHidden ? "0" : "1"
    controlsContainer.style.transform = `translateX(-50%) ${controlsHidden ? "translateY(1rem)" : "translateY(0)"}`
    controlsContainer.style.visibility = controlsHidden ? "hidden" : "visible"
    controlsContainer.style.pointerEvents = "none"

    const activePosterIndex = state.activePosterIndex
    const hasActivePoster =
      typeof activePosterIndex === "number"
      && activePosterIndex >= 0
      && activePosterIndex < state.ingestionItems.length
    const detailCardVisible = hasActivePoster && !controlsHidden

    if (typeof activePosterIndex === "number" && hasActivePoster) {
      const placement = resolveWallDetailPlacement(activePosterIndex, state.ingestionItems.length)
      detailCard.style.left = placement.left
      detailCard.style.top = placement.top
      detailCard.dataset.placement = `${placement.left}-${placement.top}`
    }

    detailCard.style.opacity = detailCardVisible ? "1" : "0"
    detailCard.style.transform = detailCardVisible
      ? "translateY(0) translateZ(28px) scale(1)"
      : "translateY(0.95rem) translateZ(0) scale(0.985)"
    detailCard.style.visibility = detailCardVisible ? "visible" : "hidden"
    detailCard.style.pointerEvents = detailCardVisible ? "auto" : "none"

    return true
  }

  function requestWallInteractionPatchOrRender(): void {
    if (applyWallInteractionPatchInPlace()) {
      return
    }

    requestRender()
  }

  const wallInteractionController = createWallInteractionController({
    idleHideMs: WALL_IDLE_HIDE_MS,
    isWallRouteActive,
    onIdleHide: () => {
      if (shouldSuppressIdleHideTransitionWhenDiagnosticsOpen(state)) {
        return false
      }

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
    onRenderRequest: () => {
      requestWallInteractionPatchOrRender()
    }
  })

  function persistRememberedServer(): void {
    persistRememberedString({
      storage: localStorageRef,
      key: REMEMBERED_SERVER_STORAGE_KEY,
      remember: state.rememberServer,
      value: state.serverUrl
    })
  }

  function persistRememberedUsername(): void {
    persistRememberedString({
      storage: localStorageRef,
      key: REMEMBERED_USERNAME_STORAGE_KEY,
      remember: state.rememberUsername,
      value: state.username
    })
  }

  function persistRememberPasswordPreference(): void {
    if (state.rememberPasswordRequested) {
      localStorageRef?.setItem(REMEMBER_PASSWORD_ENABLED_STORAGE_KEY, "1")
      return
    }

    localStorageRef?.removeItem(REMEMBER_PASSWORD_ENABLED_STORAGE_KEY)
  }

  function clearSessionArtifacts(): void {
    clearOnboardingSessionArtifacts(sessionStorageRef)
    clearOnboardingSessionArtifacts(localStorageRef)
  }

  function saveSession(session: ProviderSession): void {
    saveOnboardingSession(sessionStorageRef, session)
    saveOnboardingSession(localStorageRef, session)
  }

  function saveWallHandoff(handoff: WallHandoff): void {
    saveOnboardingWallHandoff(sessionStorageRef, handoff)
    saveOnboardingWallHandoff(localStorageRef, handoff)
  }

  function readWallHandoff(): WallHandoff | null {
    const handoffFromSession = readOnboardingWallHandoff(sessionStorageRef)
    if (handoffFromSession) {
      return handoffFromSession
    }

    const persistedHandoff = readOnboardingWallHandoff(localStorageRef)
    if (persistedHandoff) {
      saveOnboardingWallHandoff(sessionStorageRef, persistedHandoff)
    }

    return persistedHandoff
  }

  function readPersistedActiveSession(): ProviderSession | null {
    const sessionFromSessionStorage = readOnboardingActiveSession({
      currentSession: state.session,
      sessionStorageRef
    })
    if (sessionFromSessionStorage) {
      if (!sessionStorageRef?.getItem(AUTH_SESSION_STORAGE_KEY)) {
        saveOnboardingSession(sessionStorageRef, sessionFromSessionStorage)
      }

      return sessionFromSessionStorage
    }

    const persistedSession = readOnboardingActiveSession({
      currentSession: null,
      sessionStorageRef: localStorageRef
    })
    if (persistedSession) {
      saveOnboardingSession(sessionStorageRef, persistedSession)
    }

    return persistedSession
  }

  function resetAutomaticWallEntryAttempt(): void {
    automaticWallEntryAttemptKey = null
    automaticWallEntryInFlight = false
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
      if (isDisposed || hydrationNonce !== passwordHydrationNonce) {
        return
      }

      if (!rememberedPassword || state.password.length > 0) {
        return
      }

      state.password = rememberedPassword
      requestRender()
    })
  }

  async function tryAutomaticWallEntry(): Promise<void> {
    if (
      isDisposed
      || isWallRouteActive()
      || automaticWallEntryInFlight
      || state.preflightPending
      || state.loginPending
      || state.finishPending
    ) {
      return
    }

    const handoff = readWallHandoff()
    if (!handoff || handoff.selectedLibraryIds.length === 0) {
      return
    }

    const persistedSession = readPersistedActiveSession()
    if (persistedSession) {
      state.session = persistedSession
      window.history.replaceState({}, "", WALL_PATHNAME)
      requestRender()
      return
    }

    if (!state.rememberPasswordRequested) {
      return
    }

    const serverUrl = state.serverUrl.trim()
    const username = state.username.trim()
    if (!serverUrl || !username) {
      return
    }

    const automaticWallEntryKey = `${serverUrl}::${username}::${handoff.selectedLibraryIds.join(",")}`
    if (automaticWallEntryAttemptKey === automaticWallEntryKey) {
      return
    }

    automaticWallEntryAttemptKey = automaticWallEntryKey
    automaticWallEntryInFlight = true

    try {
      const rememberedPassword = await passwordVault.read({ serverUrl, username })
      if (isDisposed || !rememberedPassword) {
        return
      }

      state.password = rememberedPassword
      state.preflightError = null
      state.authError = null
      await handleLogin()
      if (isDisposed || !state.session) {
        return
      }

      const availableLibraryIds = new Set(state.libraries.map((library) => library.id))
      state.selectedLibraryIds = new Set(handoff.selectedLibraryIds.filter((libraryId) => availableLibraryIds.has(libraryId)))
      if (state.selectedLibraryIds.size === 0) {
        return
      }

      runOnboardingFinish({
        state,
        resolveRememberPasswordRequested: () => {
          return state.rememberPasswordRequested
        },
        saveSession,
        saveWallHandoff,
        navigateToWall: () => {
          window.history.pushState({}, "", WALL_PATHNAME)
        },
        onRenderRequest: requestRender
      })
    } finally {
      automaticWallEntryInFlight = false
    }
  }

  function handlePreflight(options: { force?: boolean } = {}): Promise<void> {
    state.serverUrl = state.serverUrl.trim()

    if (preflightInFlightPromise) {
      return preflightInFlightPromise
    }

    if (!options.force && !shouldRunAutomaticPreflight(state)) {
      return Promise.resolve()
    }

    const preflightPromise = runOnboardingPreflight({
      state,
      preflight: (request) => {
        return provider.preflight(request)
      },
      origin: window.location.origin,
      persistRememberedServer,
      onSuccess: () => {
        queueRememberedPasswordHydration()
      },
      onRenderRequest: requestRender
    }).finally(() => {
      if (preflightInFlightPromise === preflightPromise) {
        preflightInFlightPromise = null
      }
    })

    preflightInFlightPromise = preflightPromise
    return preflightPromise
  }

  async function handleLogin(): Promise<void> {
    if (!hasSuccessfulPreflightForServer(state)) {
      await handlePreflight({ force: false })
      if (!hasSuccessfulPreflightForServer(state)) {
        return
      }
    }

    await runOnboardingLogin({
      state,
      authenticate: (credentials) => {
        return provider.authenticate(credentials)
      },
      listLibraries: (session) => {
        return provider.listLibraries(session)
      },
      clientName: "Media Poster Space Desktop",
      deviceId,
      clearSessionArtifacts,
      persistRememberedUsername,
      persistRememberedServer,
      saveSession,
      toAuthErrorMessage,
      resolveSelectedLibraryIds: ({ defaultSelectedLibraryIds }) => {
        const handoff = readWallHandoff()
        return handoff?.selectedLibraryIds ?? defaultSelectedLibraryIds
      },
      onAfterSessionEstablished: async ({ serverUrl, username, password }) => {
        persistRememberPasswordPreference()

        if (state.rememberPasswordRequested) {
          const writeResult = await passwordVault.write({
            serverUrl,
            username,
            password
          })

          if (writeResult.warning) {
            state.platformWarning = writeResult.warning
          }
          return
        }

        await passwordVault.clearForIdentity({
          serverUrl,
          username
        })
      },
      onRenderRequest: requestRender
    })
  }

  async function handleLogout(): Promise<void> {
    const activeSession = readPersistedActiveSession()

    await runOnboardingLogoutReset({
      state,
      disposeIngestionRuntime,
      clearSessionArtifacts,
      onBeforeStateReset: async () => {
        await passwordVault.clearAll()
      },
      onAfterCommonStateReset: () => {
        resetAutomaticWallEntryAttempt()
        state.password = ""
        state.libraryError = null
      },
      onResetDiagnostics: () => {
        diagnosticsLastExportAt = null
        diagnosticsExportError = null
      },
      appendDiagnosticsLog,
      navigateToOnboarding: () => {
        window.history.pushState({}, "", "/")
      },
      onRenderRequest: requestRender
    })

    if (activeSession) {
      void provider.invalidateSession(activeSession).catch((error) => {
        appendDiagnosticsLog({
          timestamp: new Date().toISOString(),
          level: "warn",
          event: "auth.logout.invalidate-session-failed",
          details: {
            message: error instanceof Error ? error.message : "Unknown logout invalidation failure"
          }
        })
      })
    }
  }

  function handleChangeServer(): void {
    const activeSession = state.session

    runOnboardingBackToServer({
      state,
      clearSessionArtifacts,
      onAfterStateReset: () => {
        resetAutomaticWallEntryAttempt()
        state.password = ""
      },
      onRenderRequest: requestRender
    })

    if (activeSession) {
      void provider.invalidateSession(activeSession).catch((error) => {
        appendDiagnosticsLog({
          timestamp: new Date().toISOString(),
          level: "warn",
          event: "auth.change-server.invalidate-session-failed",
          details: {
            message: error instanceof Error ? error.message : "Unknown step-back invalidation failure"
          }
        })
      })
    }
  }

  function handleFullscreenToggle(): void {
    const nextFullscreenEnabled = !state.fullscreenEnabled
    void platformBridge.setFullscreenEnabled(nextFullscreenEnabled).then(() => {
      if (isDisposed) {
        return
      }

      state.fullscreenEnabled = nextFullscreenEnabled
      requestRender()
    }).catch((error) => {
      if (isDisposed) {
        return
      }

      state.platformWarning = error instanceof Error
        ? error.message
        : "Desktop fullscreen request failed."
      requestRender()
    })
  }

  function renderOnboarding(container: HTMLElement): void {
    container.innerHTML = ""

    const onboardingView = createOnboardingFormView({
      createElement,
      state,
      descriptionText:
        "Desktop onboarding: server preflight, username/password authentication, then library selection.",
      rememberPasswordLabel: "Remember password (stored encrypted on this device)",
      toLibraryCheckboxTestId,
      onServerInput: (value) => {
        resetAutomaticWallEntryAttempt()
        state.serverUrl = value
        state.preflightError = null

        if (!state.password) {
          queueRememberedPasswordHydration()
        }
      },
      onServerBlur: () => {
        void handlePreflight({ force: false })
      },
      onRememberServerChange: (remember) => {
        state.rememberServer = remember
        persistRememberedServer()
      },
      onUsernameInput: (value) => {
        resetAutomaticWallEntryAttempt()
        state.username = value
        state.authError = null

        if (!state.password) {
          queueRememberedPasswordHydration()
        }
      },
      onPasswordInput: (value) => {
        resetAutomaticWallEntryAttempt()
        state.password = value
        state.authError = null
      },
      onRememberUsernameChange: (remember) => {
        state.rememberUsername = remember
        persistRememberedUsername()
      },
      onRememberPasswordChange: (remember) => {
        state.rememberPasswordRequested = remember
        persistRememberPasswordPreference()

      if (state.rememberPasswordRequested) {
          resetAutomaticWallEntryAttempt()
          queueRememberedPasswordHydration()
          return
        }

        resetAutomaticWallEntryAttempt()
        state.password = ""
        const serverUrl = state.serverUrl.trim()
        const username = state.username.trim()

        if (serverUrl && username) {
          void passwordVault.clearForIdentity({ serverUrl, username })
        }

        requestRender()
      },
      onLogin: () => {
        void handleLogin()
      },
      onBack: () => {
        handleChangeServer()
      },
      onLibrarySelectionChange: (libraryId, selected) => {
        if (selected) {
          state.selectedLibraryIds.add(libraryId)
        } else {
          state.selectedLibraryIds.delete(libraryId)
        }

        state.libraryError = null
      },
      onFinish: () => {
        runOnboardingFinish({
          state,
          resolveRememberPasswordRequested: () => {
            return state.rememberPasswordRequested
          },
          saveSession,
          saveWallHandoff,
          navigateToWall: () => {
            window.history.pushState({}, "", WALL_PATHNAME)
          },
          onRenderRequest: requestRender
        })
      },
      renderLibraryExtras: () => {
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
            requestRender()
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
            requestRender()
          })
        })

        const autostartLabelText = state.platformPortable
          ? "Autostart unavailable in portable package mode"
          : "Launch automatically on desktop startup"
        const autostartText = createElement("span", { textContent: autostartLabelText })
        autostartLabel.append(autostartCheckbox, autostartText)

        const portableBadge = createElement("p", {
          testId: "portable-mode-badge",
          textContent: state.platformPortable
            ? "Portable package mode active"
            : "Installed package mode active"
        })
        portableBadge.style.margin = "0"
        portableBadge.style.color = "var(--mps-color-foreground-muted)"

        return [displayLabel, autostartLabel, portableBadge]
      },
      renderCardFooter: () => {
        if (!state.platformWarning) {
          return null
        }

        const platformWarningBanner = createElement("p", {
          textContent: state.platformWarning,
          testId: "platform-warning-banner"
        })
        platformWarningBanner.style.margin = "0"
        platformWarningBanner.style.padding = "0.68rem 0.84rem"
        platformWarningBanner.style.borderRadius = "0.9rem"
        platformWarningBanner.style.border = "1px solid rgba(255, 183, 77, 0.5)"
        platformWarningBanner.style.background = "linear-gradient(148deg, rgba(117, 74, 20, 0.46) 0%, rgba(78, 49, 14, 0.62) 100%)"
        platformWarningBanner.style.color = "#ffe0b2"
        platformWarningBanner.style.fontFamily = "var(--mps-font-mono)"
        platformWarningBanner.style.fontSize = "0.69rem"
        platformWarningBanner.style.letterSpacing = "0.03em"
        platformWarningBanner.style.boxShadow = "0 14px 30px rgba(36, 19, 4, 0.34), inset 0 0 0 1px rgba(255, 201, 133, 0.2)"
        platformWarningBanner.style.backdropFilter = "blur(12px)"
        return platformWarningBanner
      }
    })

    container.append(onboardingView)
  }

  function renderWall(container: HTMLElement): void {
    isWallRendering = true
    try {
      stopWallStreamLoop()
      wallPatchFallbackRequested = false
      container.innerHTML = ""

      const wallRoutePreparation = prepareOnboardingWallRoute({
        handoff: readWallHandoff(),
        activeSession: readActiveSession(),
        state,
        disposeIngestionRuntime,
        detachWallInteraction: () => {
          wallInteractionController.detach()
        }
      })

      if (wallRoutePreparation.kind === "fallback") {
        const fallbackContent = getOnboardingWallFallbackContent(wallRoutePreparation.reason)
        const fallback = createWallFallbackShell(createElement, {
          title: fallbackContent.title,
          body: fallbackContent.body,
          onBack: () => {
            window.history.pushState({}, "", "/")
            requestRender()
          }
        })
        container.append(fallback)
        return
      }

      const handoff = wallRoutePreparation.handoff
      const activeSession = wallRoutePreparation.activeSession

      ensureIngestionRuntime(activeSession, handoff.selectedLibraryIds)
      wallInteractionController.attach()
      if (!wallInteractionController.isIdleHideScheduled()) {
        wallInteractionController.scheduleIdleHide()
      }

      const wallView = createOnboardingWallRouteView({
        createElement,
        handoff,
        state,
        detailCardTransitionMs: DETAIL_CARD_TRANSITION_MS,
        diagnosticsLatestSample: diagnosticsController.getLatestSample(),
        diagnosticsRetentionSnapshot: diagnosticsLogStore.getRetentionSnapshot(),
        diagnosticsLastExportAt,
        diagnosticsExportError,
        samplingIntervalMs: DIAGNOSTICS_SAMPLING_INTERVAL_MS,
        retentionMaxAgeMs: DIAGNOSTICS_RETENTION_MAX_AGE_MS,
        retentionMaxBytes: DIAGNOSTICS_RETENTION_MAX_BYTES,
        ...createOnboardingWallRouteCallbacks({
          state,
          applyWallInteractionTransition,
          scheduleIdleHide: () => {
            wallInteractionController.scheduleIdleHide()
          },
          dismissActiveDetailCard,
          navigateToOnboarding: () => {
            window.history.pushState({}, "", "/")
          },
          onRefresh: () => {
            void ingestionController.refreshNow()
          },
          onLogout: () => {
            void handleLogout()
          },
          onExportCrashReport: () => {
            exportCrashReport(handoff)
          },
          onRenderRequest: requestRender
        }),
        resolveDetailPlacement: resolveWallDetailPlacement,
        controls: {
          showFullscreenControl: true,
          fullscreenActive: state.fullscreenEnabled,
          onToggleFullscreen: handleFullscreenToggle
        }
      })

      container.append(wallView)
      syncWallIngestionTelemetry()
      startWallStreamLoop()
    } finally {
      isWallRendering = false
      if (wallPatchDeferredDuringRender) {
        wallPatchDeferredDuringRender = false
        handleIngestionRenderRequest()
      }
    }
  }

  function render(): void {
    if (isDisposed) {
      return
    }

    const url = new URL(window.location.href)

    if (url.pathname !== WALL_PATHNAME) {
      void tryAutomaticWallEntry()
    }

    if (url.pathname === WALL_PATHNAME) {
      startDiagnosticsSampling()
      renderWall(target)
      return
    }

    stopDiagnosticsSampling()
    stopWallStreamLoop()
    wallInteractionController.detach()
    state.activePosterIndex = null
    state.wallControlsHidden = false
    clearWallPatchFallbackState()
    disposeIngestionRuntime()
    renderOnboarding(target)
  }

  function onPopState(): void {
    requestRender()
  }

  return {
    start: () => {
      isDisposed = false
      resetAutomaticWallEntryAttempt()
      window.addEventListener("popstate", onPopState)
      requestRender()
      queueRememberedPasswordHydration()
      void initializePlatformExtensions()
    },
    dispose: () => {
      isDisposed = true
      resetAutomaticWallEntryAttempt()
      platformInitNonce += 1
      passwordHydrationNonce += 1
      stopDiagnosticsSampling()
      stopWallStreamLoop()
      wallInteractionController.detach()
      disposeIngestionRuntime()
      window.removeEventListener("popstate", onPopState)
      target.replaceChildren()
    }
  }
}
