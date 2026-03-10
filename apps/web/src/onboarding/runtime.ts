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
  createRuntimePosterQueueRefillFetchAdapter,
  createOnboardingWallRouteCallbacks,
  shouldSuppressIdleHideTransitionWhenDiagnosticsOpen,
  createOnboardingWallRouteView,
  getOnboardingWallFallbackContent,
  prepareOnboardingWallRoute,
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
  type WallInteractionTransitionResult
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
  [WALL_POSTER_GRID_STREAM_APPLIER_KEY]?: (items: readonly MediaItem[]) => boolean
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

  function applyWallStreamItems(items: readonly MediaItem[]): boolean {
    const wallPosterGrid = target.querySelector<WallPosterGridStreamElement>("[data-testid=\"wall-poster-grid\"]")
    const applyStreamItems = wallPosterGrid?.[WALL_POSTER_GRID_STREAM_APPLIER_KEY]
    if (typeof applyStreamItems !== "function") {
      return false
    }

    return applyStreamItems(items)
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
    applyStreamItems: ((items: readonly MediaItem[]) => boolean) | null
    hasPosterTileFamily: boolean
  } {
    const wallRoot = target.querySelector<HTMLElement>("[data-testid=\"poster-wall-root\"]")
    const wallPosterGrid = target.querySelector<WallPosterGridStreamElement>("[data-testid=\"wall-poster-grid\"]")
    const applyStreamItemsCandidate = wallPosterGrid?.[WALL_POSTER_GRID_STREAM_APPLIER_KEY]

    return {
      wallRoot,
      wallPosterGrid: wallPosterGrid ?? null,
      applyStreamItems: typeof applyStreamItemsCandidate === "function" ? applyStreamItemsCandidate : null,
      hasPosterTileFamily:
        wallPosterGrid?.querySelector<HTMLElement>("[data-testid^=\"poster-item-\"]") !== null
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

    const streamApplied = wallPatchReadiness.applyStreamItems(state.ingestionItems)
    const shouldFallbackToRender =
      !streamApplied
      || (state.ingestionItems.length > 0 && !wallPatchReadiness.hasPosterTileFamily)
    if (shouldFallbackToRender) {
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

    const onboardingView = createOnboardingFormView({
      createElement,
      state,
      descriptionText:
        "Three-step onboarding: server preflight, username/password authentication, then library and wall preferences.",
      rememberPasswordLabel: platform.canPersistPassword
        ? "Remember password"
        : "Remember password (Desktop app only)",
      rememberPasswordDisabled: !platform.canPersistPassword,
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
      onLibrarySelectionChange: (libraryId, selected) => {
        if (selected) {
          state.selectedLibraryIds.add(libraryId)
        } else {
          state.selectedLibraryIds.delete(libraryId)
        }
        state.libraryError = null
      },
      onDensityChange: (density) => {
        state.density = density
      },
      onFinish: () => {
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
          onToggleFullscreen: () => {
            void handleFullscreenToggle()
          },
          fullscreenWarning
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
    if (isRendering) {
      renderDeferred = true
      return
    }

    isRendering = true
    try {
      const url = new URL(window.location.href)

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
