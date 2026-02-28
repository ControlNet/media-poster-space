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
  type DiagnosticsLogEntry
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

interface OnboardingState extends OnboardingBaseState<
  ProviderSession,
  MediaLibrary,
  MediaItem,
  ProviderErrorCategory,
  MediaIngestionRefreshTrigger
> {
  fullscreenWarning: string | null
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

  function applyWallInteractionTransition(transition: WallInteractionTransitionResult): boolean {
    return applyWallInteractionTransitionState(state, transition)
  }

  const diagnosticsController = createOnboardingDiagnosticsController({
    state,
    logStore: diagnosticsLogStore,
    isWallRouteActive,
    onRenderRequest: () => {
      render()
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
    appendDiagnosticsLog,
    toReconnectGuideReason,
    isWallRouteActive,
    onRenderRequest: () => {
      render()
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
    return readOnboardingActiveSession({
      currentSession: state.session,
      sessionStorageRef
    })
  }

  function ensureIngestionRuntime(session: ProviderSession, selectedLibraryIds: readonly string[]): void {
    ingestionController.ensureRuntime(session, selectedLibraryIds)
  }

  function isWallRouteActive(): boolean {
    return isOnboardingWallRouteActive(window.location.href, WALL_PATHNAME)
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
  }

  function saveSession(session: ProviderSession): void {
    saveOnboardingSession(sessionStorageRef, session)
  }

  function saveWallHandoff(handoff: WallHandoff): void {
    saveOnboardingWallHandoff(sessionStorageRef, handoff)
  }

  function readWallHandoff(): WallHandoff | null {
    return readOnboardingWallHandoff(sessionStorageRef)
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
      wallInteractionController.detach()
      disposeIngestionRuntime()
      window.removeEventListener("popstate", onPopState)
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      document.removeEventListener("fullscreenerror", onFullscreenError)
      target.replaceChildren()
    }
  }
}
