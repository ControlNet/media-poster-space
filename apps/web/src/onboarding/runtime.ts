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
  readRememberedLibrarySelection,
  readOnboardingWallHandoff,
  saveOnboardingSession,
  saveRememberedLibrarySelection,
  saveOnboardingWallHandoff,
  applyWallInteractionTransitionState,
  createOnboardingBaseState,
  createOnboardingFormView,
  createOnboardingIngestionController,
  createRuntimePosterQueueRefillFetchAdapter,
  createOnboardingWallRouteCallbacks,
  shouldSuppressIdleHideTransitionWhenDiagnosticsOpen,
  createOnboardingWallRouteView,
  getOnboardingWallFallbackContent,
  prepareOnboardingWallRoute,
  runOnboardingBackToServer,
  runOnboardingFinish,
  runOnboardingLogin,
  runOnboardingLogoutReset,
  runOnboardingPreflight,
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
  type WallHandoff,
  type WallInteractionTransitionResult,
  type WallPosterGridStreamApplier,
  type WallPosterGridStreamApplyResult
} from "@mps/core"

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

const REMEMBERED_SERVER_STORAGE_KEY = ONBOARDING_REMEMBERED_SERVER_STORAGE_KEY
const REMEMBERED_USERNAME_STORAGE_KEY = ONBOARDING_REMEMBERED_USERNAME_STORAGE_KEY
const AUTH_SESSION_STORAGE_KEY = ONBOARDING_AUTH_SESSION_STORAGE_KEY
const WALL_PATHNAME = ONBOARDING_WALL_PATHNAME
const DETAIL_CARD_TRANSITION_MS = resolveWallTransitionMs()
const RECONNECT_INITIAL_BACKOFF_MS = ONBOARDING_RECONNECT_INITIAL_BACKOFF_MS
const RECONNECT_MAX_BACKOFF_MS = ONBOARDING_RECONNECT_MAX_BACKOFF_MS
const RECONNECT_GUIDE_THRESHOLD_MS = ONBOARDING_RECONNECT_GUIDE_THRESHOLD_MS
const WEB_APP_VERSION = "0.1.0"
const WALL_STREAM_INTERVAL_MS = DIAGNOSTICS_SAMPLING_INTERVAL_MS
const WALL_CLOCK_TICK_MS = 1_000
const WALL_FULLSCREEN_ENTER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`
const WALL_FULLSCREEN_EXIT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`

interface OnboardingState extends OnboardingBaseState<
  ProviderSession,
  MediaLibrary,
  MediaItem,
  ProviderErrorCategory,
  MediaIngestionRefreshTrigger
> {
  fullscreenWarning: string | null
}

interface WallPosterGridStreamElement extends HTMLElement {
  [WALL_POSTER_GRID_STREAM_APPLIER_KEY]?: WallPosterGridStreamApplier
}

interface PlatformCapabilities {
  canPersistPassword: boolean
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

function requestFullscreen(target: FullscreenCapableElement): Promise<void> {
  if (typeof target.requestFullscreen === "function") {
    return target.requestFullscreen()
  }

  if (typeof target.webkitRequestFullscreen === "function") {
    return Promise.resolve(target.webkitRequestFullscreen())
  }

  return Promise.reject(new Error("Fullscreen API is unavailable."))
}

function exitFullscreen(doc: FullscreenCapableDocument = document): Promise<void> {
  if (typeof doc.exitFullscreen === "function") {
    return doc.exitFullscreen()
  }

  if (typeof doc.webkitExitFullscreen === "function") {
    return Promise.resolve(doc.webkitExitFullscreen())
  }

  return Promise.reject(new Error("Fullscreen exit API is unavailable."))
}

function formatWallClockHeading(now: Date = new Date()): string {
  return now.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  })
}

function createOnboardingState(localStorageRef: Storage | null): OnboardingState {
  const rememberedServer = localStorageRef?.getItem(REMEMBERED_SERVER_STORAGE_KEY) ?? ""
  const rememberedUsername = localStorageRef?.getItem(REMEMBERED_USERNAME_STORAGE_KEY) ?? ""

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
      rememberPasswordRequested: false
    }),
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
  const createElement = createOnboardingElementFactory(document)
  const localStorageRef = safeGetStorage("local")
  const sessionStorageRef = safeGetStorage("session")
  const platform = options.platform ?? webPlatformCapabilities
  const state = createOnboardingState(localStorageRef)
  const deviceId = getOrCreateDeviceId(localStorageRef)
  const posterCache = createPosterCache<MediaItem>()
  const diagnosticsLogStore = createDiagnosticsLogStore()
  let diagnosticsLastExportAt: string | null = null
  let diagnosticsExportError: string | null = null
  let wallPatchFallbackRequested = false
  let wallPatchFallbackIncidentActive = false
  let wallStreamIntervalId: ReturnType<typeof setInterval> | null = null
  let wallClockIntervalId: ReturnType<typeof setInterval> | null = null
  let wallStreamTickInFlight = false
  let isWallRendering = false
  let wallPatchDeferredDuringRender = false
  let isRendering = false
  let renderDeferred = false

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

  function exportCrashReport(handoff: WallHandoff): void {
    try {
      const crashReport = createCrashReportPackage({
        version: WEB_APP_VERSION,
        configSummary: {
          surface: "web",
          route: window.location.pathname,
          selectedLibraryIds: handoff.selectedLibraryIds,
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
    cacheTtlMs: POSTER_CACHE_DEFAULT_TTL_MS
  })

  function disposeIngestionRuntime(): void {
    ingestionController.disposeRuntime()
  }

  function readActiveSession(): ProviderSession | null {
    const sessionFromTab = readOnboardingActiveSession({
      currentSession: state.session,
      sessionStorageRef
    })

    if (sessionFromTab) {
      if (!sessionStorageRef?.getItem(AUTH_SESSION_STORAGE_KEY)) {
        saveOnboardingSession(sessionStorageRef, sessionFromTab)
      }

      return sessionFromTab
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

  function ensureIngestionRuntime(session: ProviderSession, selectedLibraryIds: readonly string[]): void {
    ingestionController.ensureRuntime(session, selectedLibraryIds)
  }

  function isWallRouteActive(): boolean {
    return isOnboardingWallRouteActive(window.location.href, WALL_PATHNAME)
  }

  function setWallDiagnosticsText(testId: string, textContent: string): void {
    const wallNode = target.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
    if (!wallNode) {
      return
    }

    wallNode.textContent = textContent
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

  function applyWallStreamItems(items: readonly MediaItem[]): WallPosterGridStreamApplyResult | null {
    const wallPosterGrid = target.querySelector<WallPosterGridStreamElement>("[data-testid=\"wall-poster-grid\"]")
    const applyStreamItems = wallPosterGrid?.[WALL_POSTER_GRID_STREAM_APPLIER_KEY]
    if (typeof applyStreamItems !== "function") {
      return null
    }

    return applyStreamItems(items)
  }

  function isHealthyWallStreamApplyResult(result: WallPosterGridStreamApplyResult): boolean {
    return result.status === "applied"
      || result.status === "deferred"
      || result.status === "noop"
  }

  function clearWallPatchFallbackState(): void {
    wallPatchFallbackRequested = false
    wallPatchFallbackIncidentActive = false
    wallPatchDeferredDuringRender = false
  }

  function requestWallPatchFallbackOnce(): void {
    if (wallPatchFallbackRequested || wallPatchFallbackIncidentActive) {
      return
    }

    wallPatchFallbackRequested = true
    wallPatchFallbackIncidentActive = true
    render()
  }

  function readWallPatchReadiness(): {
    wallRoot: HTMLElement | null
    wallPosterGrid: WallPosterGridStreamElement | null
    applyStreamItems: WallPosterGridStreamApplier | null
    hasPosterTiles: boolean
  } {
    const wallRoot = target.querySelector<HTMLElement>("[data-testid=\"poster-wall-root\"]")
    const wallPosterGrid = target.querySelector<WallPosterGridStreamElement>("[data-testid=\"wall-poster-grid\"]")
    const applyStreamItemsCandidate = wallPosterGrid?.[WALL_POSTER_GRID_STREAM_APPLIER_KEY]

    return {
      wallRoot,
      wallPosterGrid: wallPosterGrid ?? null,
      applyStreamItems: typeof applyStreamItemsCandidate === "function" ? applyStreamItemsCandidate : null,
      hasPosterTiles: wallPosterGrid?.querySelector<HTMLButtonElement>("button") !== null
    }
  }


  function syncWallDiagnosticsTelemetry(sample: DiagnosticsSample): void {
    if (!state.diagnosticsOpen) {
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

  function handleIngestionRenderRequest(): void {
    if (!isWallRouteActive()) {
      clearWallPatchFallbackState()
      render()
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
    const shouldFallbackToRender =
      streamApplyResult.status === "unavailable"
      || (state.ingestionItems.length > 0 && !wallPatchReadiness.hasPosterTiles)
    if (shouldFallbackToRender) {
      requestWallPatchFallbackOnce()
      return
    }

    if (!isHealthyWallStreamApplyResult(streamApplyResult)) {
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

  function syncWallClockHeadingInPlace(): boolean {
    const wallClock = target.querySelector<HTMLElement>('[data-testid="wall-clock-heading"]')
    if (!wallClock) {
      return false
    }

    const nextClockText = formatWallClockHeading()
    if (wallClock.textContent !== nextClockText) {
      wallClock.textContent = nextClockText
    }

    return true
  }

  function startWallClockLoop(): void {
    if (wallClockIntervalId !== null) {
      return
    }

    syncWallClockHeadingInPlace()
    wallClockIntervalId = setInterval(() => {
      if (!isWallRouteActive()) {
        return
      }

      syncWallClockHeadingInPlace()
    }, WALL_CLOCK_TICK_MS)
  }

  function stopWallClockLoop(): void {
    if (wallClockIntervalId === null) {
      return
    }

    clearInterval(wallClockIntervalId)
    wallClockIntervalId = null
  }

  function createFullscreenWarningElement(message: string): HTMLParagraphElement {
    const fullscreenWarning = createElement("p", { textContent: message, testId: "wall-fullscreen-warning" })
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
    return fullscreenWarning
  }

  function dismissActiveDetailCard(): boolean {
    if (!isWallRouteActive() || state.activePosterIndex === null) {
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
      wallClock.textContent = formatWallClockHeading()
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

  function syncWallFullscreenControlInPlace(): boolean {
    const fullscreenButton = target.querySelector<HTMLButtonElement>('[data-testid="wall-fullscreen-button"]')
    const controlsContainer = target.querySelector<HTMLElement>('[data-testid="wall-controls-container"]')
    if (!fullscreenButton || !controlsContainer) {
      return false
    }

    const fullscreenActive = isFullscreenActive()
    const buttonTitle = fullscreenActive ? "Exit fullscreen" : "Enter fullscreen"
    fullscreenButton.title = buttonTitle
    fullscreenButton.setAttribute("aria-label", buttonTitle)
    fullscreenButton.innerHTML = fullscreenActive ? WALL_FULLSCREEN_EXIT_ICON : WALL_FULLSCREEN_ENTER_ICON

    const existingWarning = target.querySelector<HTMLElement>('[data-testid="wall-fullscreen-warning"]')
    if (!state.fullscreenWarning) {
      existingWarning?.remove()
      return true
    }

    if (existingWarning) {
      existingWarning.textContent = state.fullscreenWarning
      return true
    }

    const calloutStack = controlsContainer.firstElementChild
    if (!(calloutStack instanceof HTMLElement)) {
      return false
    }

    calloutStack.append(createFullscreenWarningElement(state.fullscreenWarning))
    return true
  }

  function applyWallFullscreenPatchInPlace(): boolean {
    const interactionPatched = applyWallInteractionPatchInPlace()
    const fullscreenPatched = syncWallFullscreenControlInPlace()
    const clockPatched = syncWallClockHeadingInPlace()
    return interactionPatched && fullscreenPatched && clockPatched
  }

  function requestWallFullscreenPatchOrRender(): void {
    window.requestAnimationFrame(() => {
      if (!applyWallFullscreenPatchInPlace()) {
        render()
      }
    })
  }

  function requestWallInteractionPatchOrRender(): void {
    if (applyWallInteractionPatchInPlace()) {
      return
    }

    render()
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
    onEscape: () => {
      return dismissActiveDetailCard()
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

  function readPersistedLibrarySelection(
    session: ProviderSession,
    libraries: readonly MediaLibrary[]
  ): readonly string[] | null {
    return readRememberedLibrarySelection({
      storage: localStorageRef,
      session,
      availableLibraryIds: libraries.map((library) => library.id)
    })
  }

  function persistRememberedLibrarySelection(): void {
    if (!state.session) {
      return
    }

    saveRememberedLibrarySelection({
      storage: localStorageRef,
      session: state.session,
      selectedLibraryIds: [...state.selectedLibraryIds]
    })
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
    const wallHandoffFromTab = readOnboardingWallHandoff(sessionStorageRef)
    if (wallHandoffFromTab) {
      return wallHandoffFromTab
    }

    const persistedWallHandoff = readOnboardingWallHandoff(localStorageRef)
    if (persistedWallHandoff) {
      saveOnboardingWallHandoff(sessionStorageRef, persistedWallHandoff)
    }

    return persistedWallHandoff
  }

  async function handlePreflight(): Promise<void> {
    await runOnboardingPreflight({
      state,
      preflight: (request) => {
        return provider.preflight(request)
      },
      origin: window.location.origin,
      persistRememberedServer,
      onRenderRequest: render
    })
  }

  async function handleLogin(): Promise<void> {
    await runOnboardingLogin({
      state,
      authenticate: (credentials) => {
        return provider.authenticate(credentials)
      },
      listLibraries: (session) => {
        return provider.listLibraries(session)
      },
      clientName: "Media Poster Space Web",
      deviceId,
      clearSessionArtifacts,
      persistRememberedUsername,
      persistRememberedServer,
      saveSession,
      toAuthErrorMessage,
      resolveSelectedLibraryIds: ({ session, libraries, defaultSelectedLibraryIds }) => {
        return readPersistedLibrarySelection(session, libraries) ?? defaultSelectedLibraryIds
      },
      onRenderRequest: render
    })
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

    await runOnboardingLogoutReset({
      state,
      disposeIngestionRuntime,
      clearSessionArtifacts,
      onResetDiagnostics: () => {
        diagnosticsLastExportAt = null
        diagnosticsExportError = null
      },
      appendDiagnosticsLog,
      navigateToOnboarding: () => {
        window.history.pushState({}, "", "/")
      },
      onRenderRequest: render
    })
  }

  function handleChangeServer(): void {
    const activeSession = state.session

    runOnboardingBackToServer({
      state,
      clearSessionArtifacts,
      onAfterStateReset: () => {
        state.password = ""
      },
      onRenderRequest: render
    })

    if (activeSession) {
      void provider.invalidateSession(activeSession).catch(() => undefined)
    }
  }

  function handleFullscreenToggle(): void {
    const fullscreenRoot = document.documentElement as FullscreenCapableElement | null
    if (!fullscreenRoot || !canRequestFullscreen(fullscreenRoot)) {
      state.fullscreenWarning = "Fullscreen is not supported in this browser."
      render()
      return
    }

    const fullscreenRequest = isFullscreenActive()
      ? exitFullscreen()
      : requestFullscreen(fullscreenRoot)

    void fullscreenRequest.then(() => {
      state.fullscreenWarning = null
      if (isWallRouteActive()) {
        requestWallFullscreenPatchOrRender()
      }
    }).catch(() => {
      state.fullscreenWarning = "Fullscreen request was denied. Continue in windowed mode and retry anytime."
      if (isWallRouteActive() && applyWallFullscreenPatchInPlace()) {
        return
      }

      render()
    })
  }

  function onFullscreenChange(): void {
    if (!isWallRouteActive()) {
      return
    }

    requestWallFullscreenPatchOrRender()
  }

  function onFullscreenError(): void {
    state.fullscreenWarning = "Fullscreen request was denied. Continue in windowed mode and retry anytime."
    if (!isWallRouteActive()) {
      return
    }

    if (applyWallFullscreenPatchInPlace()) {
      return
    }

    render()
  }

  function renderOnboarding(container: HTMLElement): void {
    container.innerHTML = ""

    const onboardingView = createOnboardingFormView({
      createElement,
      state,
      descriptionText: "Three-step onboarding: server preflight, username/password authentication, then library selection.",
      rememberPasswordLabel: platform.canPersistPassword
        ? "Remember password"
        : "Remember password (Desktop app only)",
      rememberPasswordDisabled: !platform.canPersistPassword,
      showRememberPasswordToggle: platform.canPersistPassword,
      toLibraryCheckboxTestId,
      onServerInput: (value) => {
        state.serverUrl = value
        state.preflightError = null
      },
      onRememberServerChange: (remember) => {
        state.rememberServer = remember
        persistRememberedServer()
      },
      onPreflight: () => {
        void handlePreflight()
      },
      onUsernameInput: (value) => {
        state.username = value
        state.authError = null
      },
      onPasswordInput: (value) => {
        state.password = value
        state.authError = null
      },
      onRememberUsernameChange: (remember) => {
        state.rememberUsername = remember
        persistRememberedUsername()
      },
      onRememberPasswordChange: (remember) => {
        state.rememberPasswordRequested = remember
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
        persistRememberedLibrarySelection()
        state.libraryError = null
      },
      onFinish: () => {
        if (state.selectedLibraryIds.size > 0) {
          persistRememberedLibrarySelection()
        }

        runOnboardingFinish({
          state,
          resolveRememberPasswordRequested: () => {
            return platform.canPersistPassword && state.rememberPasswordRequested
          },
          saveSession,
          saveWallHandoff,
          navigateToWall: () => {
            window.history.pushState({}, "", WALL_PATHNAME)
          },
          onRenderRequest: render
        })
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
            render()
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

      const fullscreenWarning = state.fullscreenWarning
        ? createFullscreenWarningElement(state.fullscreenWarning)
        : null

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
          onRenderRequest: render
        }),
        resolveDetailPlacement: resolveWallDetailPlacement,
        controls: {
          showFullscreenControl: true,
          fullscreenActive: isFullscreenActive(),
          onToggleFullscreen: handleFullscreenToggle,
          fullscreenWarning
        }
      })

      container.append(wallView)
      syncWallClockHeadingInPlace()
      syncWallIngestionTelemetry()
      startWallClockLoop()
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
    if (isRendering) {
      renderDeferred = true
      return
    }

    isRendering = true
    try {
      const url = new URL(window.location.href)

      if (url.pathname !== WALL_PATHNAME) {
        const persistedSession = readActiveSession()
        const persistedWallHandoff = readWallHandoff()

        if (persistedSession && persistedWallHandoff) {
          state.session = persistedSession
          window.history.replaceState({}, "", WALL_PATHNAME)
          render()
          return
        }
      }

      if (url.pathname === WALL_PATHNAME) {
        startDiagnosticsSampling()
        renderWall(target)
        return
      }

      stopDiagnosticsSampling()
      stopWallClockLoop()
      stopWallStreamLoop()
      wallInteractionController.detach()
      state.activePosterIndex = null
      state.wallControlsHidden = false
      state.fullscreenWarning = null
      clearWallPatchFallbackState()
      disposeIngestionRuntime()
      renderOnboarding(target)
    } finally {
      isRendering = false
      if (renderDeferred) {
        renderDeferred = false
        render()
      }
    }
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
      stopWallClockLoop()
      stopWallStreamLoop()
      wallInteractionController.detach()
      disposeIngestionRuntime()
      window.removeEventListener("popstate", onPopState)
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      document.removeEventListener("fullscreenerror", onFullscreenError)
      target.replaceChildren()
    }
  }
}
