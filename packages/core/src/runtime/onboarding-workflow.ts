import type { AuthCredentials, ProviderSession } from "../types"
import type { MediaLibrary, ProviderPreflightRequest, ProviderPreflightResult } from "../provider"
import type { WallHandoff } from "../wall"
import type { DiagnosticsLogEntry } from "./diagnostics"

export interface OnboardingPreflightState {
  serverUrl: string
  preflightError: string | null
  authError: string | null
  preflightPending: boolean
  preflightCheckedServerUrl: string | null
  preflightServerVersion: string | null
  preflightLatencyMs: number | null
}

export function hasSuccessfulPreflightForServer(state: Pick<
  OnboardingPreflightState,
  "serverUrl" | "preflightError" | "preflightCheckedServerUrl" | "preflightServerVersion"
>): boolean {
  const trimmedServerUrl = state.serverUrl.trim()

  return trimmedServerUrl.length > 0
    && state.preflightError === null
    && state.preflightCheckedServerUrl === trimmedServerUrl
    && state.preflightServerVersion !== null
}

export function shouldRunAutomaticPreflight(state: Pick<
  OnboardingPreflightState,
  "serverUrl"
  | "preflightPending"
  | "preflightError"
  | "preflightCheckedServerUrl"
  | "preflightServerVersion"
>): boolean {
  const trimmedServerUrl = state.serverUrl.trim()

  if (trimmedServerUrl.length === 0 || state.preflightPending) {
    return false
  }

  if (hasSuccessfulPreflightForServer(state)) {
    return false
  }

  return state.preflightCheckedServerUrl !== trimmedServerUrl || state.preflightError !== null
}

export interface RunOnboardingPreflightOptions {
  state: OnboardingPreflightState
  preflight: (request: ProviderPreflightRequest) => Promise<ProviderPreflightResult>
  origin: string
  persistRememberedServer: () => void
  shouldApplyResult?: () => boolean
  onSuccess?: () => void | Promise<void>
  onRenderRequest: () => void
}

export async function runOnboardingPreflight(options: RunOnboardingPreflightOptions): Promise<void> {
  const trimmedServerUrl = options.state.serverUrl.trim()

  options.state.preflightError = null
  options.state.authError = null

  if (!trimmedServerUrl) {
    options.state.preflightPending = false
    options.state.preflightCheckedServerUrl = null
    options.state.preflightServerVersion = null
    options.state.preflightLatencyMs = null
    options.onRenderRequest()
    return
  }

  options.state.preflightPending = true
  options.state.preflightCheckedServerUrl = trimmedServerUrl
  options.state.preflightServerVersion = null
  options.state.preflightLatencyMs = null
  options.onRenderRequest()

  const result = await options.preflight({
    serverUrl: trimmedServerUrl,
    origin: options.origin
  })

  if (options.shouldApplyResult && !options.shouldApplyResult()) {
    return
  }

  options.state.preflightPending = false

  if (!result.ok) {
    options.state.preflightError = result.error.message
    options.state.preflightServerVersion = null
    options.state.preflightLatencyMs = null
    options.onRenderRequest()
    return
  }

  options.state.preflightCheckedServerUrl = trimmedServerUrl
  options.state.preflightServerVersion = result.serverVersion ?? null
  options.state.preflightLatencyMs = result.latencyMs ?? null
  options.persistRememberedServer()
  await options.onSuccess?.()
  options.onRenderRequest()
}

export interface OnboardingLoginState<Session extends ProviderSession, Library extends MediaLibrary> {
  authError: string | null
  libraryError: string | null
  serverUrl: string
  username: string
  password: string
  loginPending: boolean
  session: Session | null
  libraries: Library[]
  selectedLibraryIds: Set<string>
}

export interface RunOnboardingLoginOptions<Session extends ProviderSession, Library extends MediaLibrary> {
  state: OnboardingLoginState<Session, Library>
  authenticate: (credentials: AuthCredentials) => Promise<Session>
  listLibraries: (session: Session) => Promise<Library[]>
  clientName: string
  deviceId: string
  clearSessionArtifacts: () => void
  persistRememberedUsername: () => void
  persistRememberedServer: () => void
  saveSession: (session: Session) => void
  toAuthErrorMessage: (error: unknown) => string
  resolveSelectedLibraryIds?: (context: {
    session: Session
    libraries: readonly Library[]
    getLibraryId: (library: Library) => string
    defaultSelectedLibraryIds: readonly string[]
  }) => readonly string[] | Promise<readonly string[]>
  onAfterSessionEstablished?: (context: {
    session: Session
    serverUrl: string
    username: string
    password: string
  }) => void | Promise<void>
  shouldApplyResult?: () => boolean
  getLibraryId?: (library: Library) => string
  onRenderRequest: () => void
}

export async function runOnboardingLogin<
  Session extends ProviderSession,
  Library extends MediaLibrary
>(options: RunOnboardingLoginOptions<Session, Library>): Promise<void> {
  options.state.authError = null
  options.state.libraryError = null

  const trimmedServerUrl = options.state.serverUrl.trim()
  const trimmedUsername = options.state.username.trim()
  const submittedPassword = options.state.password

  if (!trimmedServerUrl || !trimmedUsername || !submittedPassword) {
    options.state.authError = "Server URL, username, and password are required."
    options.onRenderRequest()
    return
  }

  options.state.loginPending = true
  options.clearSessionArtifacts()
  options.onRenderRequest()

  const getLibraryId = options.getLibraryId ?? ((library: Library) => library.id)

  try {
    const session = await options.authenticate({
      serverUrl: trimmedServerUrl,
      username: trimmedUsername,
      password: submittedPassword,
      clientName: options.clientName,
      deviceId: options.deviceId
    })

    if (options.shouldApplyResult && !options.shouldApplyResult()) {
      return
    }

    const libraries = await options.listLibraries(session)

    if (options.shouldApplyResult && !options.shouldApplyResult()) {
      return
    }

    const defaultSelectedLibraryIds = libraries.map((library) => getLibraryId(library))
    const resolvedSelectedLibraryIds = options.resolveSelectedLibraryIds
      ? await options.resolveSelectedLibraryIds({
          session,
          libraries,
          getLibraryId,
          defaultSelectedLibraryIds
        })
      : defaultSelectedLibraryIds
    const availableLibraryIdSet = new Set(defaultSelectedLibraryIds)
    const normalizedSelectedLibraryIds = [...new Set(resolvedSelectedLibraryIds.filter((libraryId) => {
      return availableLibraryIdSet.has(libraryId)
    }))]

    options.state.session = session
    options.state.libraries = libraries
    options.state.selectedLibraryIds = new Set(
      normalizedSelectedLibraryIds.length > 0 ? normalizedSelectedLibraryIds : defaultSelectedLibraryIds
    )
    options.state.loginPending = false
    options.state.password = ""
    options.persistRememberedUsername()
    options.persistRememberedServer()

    if (options.shouldApplyResult && !options.shouldApplyResult()) {
      return
    }

    await options.onAfterSessionEstablished?.({
      session,
      serverUrl: trimmedServerUrl,
      username: trimmedUsername,
      password: submittedPassword
    })

    if (options.shouldApplyResult && !options.shouldApplyResult()) {
      return
    }

    options.saveSession(session)
    options.onRenderRequest()
  } catch (error) {
    if (options.shouldApplyResult && !options.shouldApplyResult()) {
      return
    }

    options.state.loginPending = false
    options.state.session = null
    options.state.password = ""
    options.state.authError = options.toAuthErrorMessage(error)
    options.clearSessionArtifacts()
    options.onRenderRequest()
  }
}

export interface OnboardingBackToServerState<Session extends ProviderSession, Library> {
  session: Session | null
  libraries: Library[]
  selectedLibraryIds: Set<string>
  preflightPending: boolean
  preflightError: string | null
  loginPending: boolean
  authError: string | null
  finishPending: boolean
  libraryError: string | null
}

export interface RunOnboardingBackToServerOptions<
  Session extends ProviderSession,
  Library
> {
  state: OnboardingBackToServerState<Session, Library>
  clearSessionArtifacts: () => void
  onAfterStateReset?: () => void
  onRenderRequest: () => void
}

export function runOnboardingBackToServer<
  Session extends ProviderSession,
  Library
>(options: RunOnboardingBackToServerOptions<Session, Library>): void {
  options.clearSessionArtifacts()

  options.state.session = null
  options.state.libraries = []
  options.state.selectedLibraryIds = new Set<string>()
  options.state.preflightPending = false
  options.state.preflightError = null
  options.state.loginPending = false
  options.state.authError = null
  options.state.finishPending = false
  options.state.libraryError = null

  options.onAfterStateReset?.()
  options.onRenderRequest()
}

export interface OnboardingFinishState<Session extends ProviderSession> {
  session: Session | null
  selectedLibraryIds: Set<string>
  rememberServer: boolean
  rememberUsername: boolean
  finishPending: boolean
  libraryError: string | null
}

export interface RunOnboardingFinishOptions<Session extends ProviderSession> {
  state: OnboardingFinishState<Session>
  resolveRememberPasswordRequested: () => boolean
  saveSession: (session: Session) => void
  saveWallHandoff: (handoff: WallHandoff) => void
  navigateToWall: () => void
  onRenderRequest: () => void
}

export function runOnboardingFinish<Session extends ProviderSession>(
  options: RunOnboardingFinishOptions<Session>
): void {
  if (!options.state.session) {
    options.state.libraryError = "Sign in before entering the wall."
    options.onRenderRequest()
    return
  }

  if (options.state.selectedLibraryIds.size === 0) {
    options.state.libraryError = "Select at least one library before entering the wall."
    options.onRenderRequest()
    return
  }

  const handoff: WallHandoff = {
    selectedLibraryIds: [...options.state.selectedLibraryIds],
    preferences: {
      rememberServer: options.state.rememberServer,
      rememberUsername: options.state.rememberUsername,
      rememberPasswordRequested: options.resolveRememberPasswordRequested()
    }
  }

  options.state.finishPending = true
  options.saveSession(options.state.session)
  options.saveWallHandoff(handoff)
  options.navigateToWall()
  options.state.finishPending = false
  options.onRenderRequest()
}

export interface OnboardingLogoutState<Session extends ProviderSession, Library> {
  session: Session | null
  libraries: Library[]
  selectedLibraryIds: Set<string>
  diagnosticsOpen: boolean
  detailProfile: "balanced" | "showcase"
  authError: string | null
}

export interface RunOnboardingLogoutResetOptions<
  Session extends ProviderSession,
  Library
> {
  state: OnboardingLogoutState<Session, Library>
  disposeIngestionRuntime: () => void
  clearSessionArtifacts: () => void
  onBeforeStateReset?: () => void | Promise<void>
  onAfterCommonStateReset?: () => void
  onResetDiagnostics: () => void
  appendDiagnosticsLog: (entry: DiagnosticsLogEntry) => void
  now?: () => string
  navigateToOnboarding: () => void
  onRenderRequest: () => void
}

export async function runOnboardingLogoutReset<
  Session extends ProviderSession,
  Library
>(options: RunOnboardingLogoutResetOptions<Session, Library>): Promise<void> {
  options.disposeIngestionRuntime()
  options.clearSessionArtifacts()
  await options.onBeforeStateReset?.()

  options.state.session = null
  options.state.libraries = []
  options.state.selectedLibraryIds = new Set<string>()
  options.state.diagnosticsOpen = false
  options.state.detailProfile = "balanced"
  options.state.authError = null
  options.onAfterCommonStateReset?.()

  options.onResetDiagnostics()
  options.appendDiagnosticsLog({
    timestamp: (options.now ?? (() => new Date().toISOString()))(),
    level: "info",
    event: "session.logout"
  })

  options.navigateToOnboarding()
  options.onRenderRequest()
}
