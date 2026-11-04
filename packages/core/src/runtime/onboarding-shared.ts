import type { PosterCacheSnapshot } from "../cache"
import type { MediaItem, ProviderErrorCategory, ProviderSession } from "../types"
import type { WallHandoff, WallInteractionTransitionResult } from "../wall"
import {
  createDiagnosticsSampler,
  type DiagnosticsLogEntry,
  type DiagnosticsSample
} from "./diagnostics"
import type { OnboardingProviderId } from "./onboarding-form"

export const ONBOARDING_REMEMBERED_SERVER_STORAGE_KEY = "mps.onboarding.remembered-server"
export const ONBOARDING_REMEMBERED_USERNAME_STORAGE_KEY = "mps.onboarding.remembered-username"
export const ONBOARDING_REMEMBERED_LIBRARY_SELECTION_STORAGE_KEY_PREFIX = "mps.onboarding.remembered-library-selection.v1"
export const ONBOARDING_DEVICE_ID_STORAGE_KEY = "mps.onboarding.device-id"
export const ONBOARDING_AUTH_SESSION_STORAGE_KEY = "mps.auth.session"
export const ONBOARDING_WALL_HANDOFF_STORAGE_KEY = "mps.wall.handoff"
export const ONBOARDING_WALL_PATHNAME = "/wall"
export const ONBOARDING_WALL_CACHE_STORAGE_KEY_PREFIX = "mps.wall.poster-cache.v1::"
export const ONBOARDING_RECONNECT_INITIAL_BACKOFF_MS = 2_000
export const ONBOARDING_RECONNECT_MAX_BACKOFF_MS = 60_000
export const ONBOARDING_RECONNECT_GUIDE_THRESHOLD_MS = 60_000
// Samples drive the live diagnostics view every second, but only one in this many is
// kept in the retained log so a days-long wall session does not fill memory with them.
export const DIAGNOSTICS_SAMPLE_LOG_EVERY = 60
// The poster cache is persisted as one localStorage value. Browsers allow roughly 5M
// UTF-16 characters per origin, so keep the serialized cache well below that.
export const ONBOARDING_POSTER_CACHE_MAX_TOTAL_SIZE_BYTES = 1_500_000

export interface OnboardingAppRuntime {
  start: () => void
  dispose: () => void
}

export interface OnboardingElementOptions {
  className?: string
  textContent?: string
  testId?: string
}

export type OnboardingElementFactory = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: OnboardingElementOptions
) => HTMLElementTagNameMap[K]

export function createOnboardingElementFactory(doc: Document = document): OnboardingElementFactory {
  return function createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    options?: OnboardingElementOptions
  ): HTMLElementTagNameMap[K] {
    const element = doc.createElement(tagName)

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
}

export interface OnboardingBaseState<
  Session,
  Library,
  Item,
  ErrorCategory,
  Trigger
> {
  selectedProviderId: OnboardingProviderId
  serverUrl: string
  username: string
  password: string
  rememberServer: boolean
  rememberUsername: boolean
  rememberPasswordRequested: boolean
  preflightPending: boolean
  preflightCheckedServerUrl: string | null
  preflightServerVersion: string | null
  preflightLatencyMs: number | null
  loginPending: boolean
  finishPending: boolean
  preflightError: string | null
  authError: string | null
  libraryError: string | null
  session: Session | null
  libraries: Library[]
  selectedLibraryIds: Set<string>
  ingestionStatus: "idle" | "refreshing" | "ready" | "error"
  ingestionItems: Item[]
  ingestionItemCount: number
  ingestionFetchedAt: string | null
  ingestionError: string | null
  ingestionErrorCategory: ErrorCategory | null
  ingestionTrigger: Trigger | null
  reconnectAttempt: number
  reconnectNextDelayMs: number | null
  reconnectGuideVisible: boolean
  reconnectGuideReason: "auth" | "network" | "timeout" | "unknown" | null
  diagnosticsOpen: boolean
  detailProfile: "balanced" | "showcase"
  activePosterIndex: number | null
  wallControlsHidden: boolean
}

export function createOnboardingBaseState<
  Session,
  Library,
  Item,
  ErrorCategory,
  Trigger
>(options: {
  rememberedServer: string
  rememberedUsername: string
  rememberPasswordRequested: boolean
}): OnboardingBaseState<Session, Library, Item, ErrorCategory, Trigger> {
  return {
    selectedProviderId: "jellyfin",
    serverUrl: options.rememberedServer,
    username: options.rememberedUsername,
    password: "",
    rememberServer: options.rememberedServer.length > 0,
    rememberUsername: options.rememberedUsername.length > 0,
    rememberPasswordRequested: options.rememberPasswordRequested,
    preflightPending: false,
    preflightCheckedServerUrl: null,
    preflightServerVersion: null,
    preflightLatencyMs: null,
    loginPending: false,
    finishPending: false,
    preflightError: null,
    authError: null,
    libraryError: null,
    session: null,
    libraries: [],
    selectedLibraryIds: new Set<string>(),
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
    wallControlsHidden: false
  }
}

export interface OnboardingDiagnosticsController {
  appendLog: (entry: DiagnosticsLogEntry) => void
  startSampling: () => void
  stopSampling: () => void
  getLatestSample: () => DiagnosticsSample | null
}

export function createOnboardingDiagnosticsController(options: {
  state: {
    reconnectAttempt: number
    reconnectNextDelayMs: number | null
  }
  logStore: {
    append: (entry: DiagnosticsLogEntry) => unknown
  }
  isWallRouteActive: () => boolean
  onDiagnosticsRenderRequest: (sample: DiagnosticsSample) => void
  samplingIntervalMs: number
}): OnboardingDiagnosticsController {
  let diagnosticsSampler: ReturnType<typeof createDiagnosticsSampler> | null = null
  let diagnosticsLatestSample: DiagnosticsSample | null = null
  let diagnosticsSampleCount = 0

  const appendLog = (entry: DiagnosticsLogEntry): void => {
    options.logStore.append(entry)
  }

  return {
    appendLog,
    startSampling: () => {
      if (diagnosticsSampler) {
        return
      }

      diagnosticsSampler = createDiagnosticsSampler({
        getReconnectMetrics: () => ({
          attempt: options.state.reconnectAttempt,
          nextDelayMs: options.state.reconnectNextDelayMs
        }),
        onSample: (sample) => {
          diagnosticsLatestSample = sample
          const shouldLogSample = diagnosticsSampleCount % DIAGNOSTICS_SAMPLE_LOG_EVERY === 0
          diagnosticsSampleCount += 1

          if (shouldLogSample) {
            appendLog({
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
          }

          if (options.isWallRouteActive()) {
            options.onDiagnosticsRenderRequest(sample)
          }
        }
      })

      diagnosticsSampleCount = 0
      diagnosticsSampler.start()
      appendLog({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "diagnostics.sampling-started",
        details: {
          intervalMs: options.samplingIntervalMs
        }
      })
    },
    stopSampling: () => {
      if (!diagnosticsSampler) {
        return
      }

      diagnosticsSampler.dispose()
      diagnosticsSampler = null
      diagnosticsLatestSample = null
      appendLog({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "diagnostics.sampling-stopped"
      })
    },
    getLatestSample: () => diagnosticsLatestSample
  }
}

export function applyWallInteractionTransitionState(
  state: {
    activePosterIndex: number | null
    wallControlsHidden: boolean
  },
  transition: WallInteractionTransitionResult
): boolean {
  state.activePosterIndex = transition.activePosterIndex
  state.wallControlsHidden = transition.wallControlsHidden
  return transition.shouldRender
}

export function persistRememberedString(options: {
  storage: Storage | null
  key: string
  remember: boolean
  value: string
}): void {
  const normalizedValue = options.value.trim()
  if (options.remember && normalizedValue.length > 0) {
    options.storage?.setItem(options.key, normalizedValue)
    return
  }

  options.storage?.removeItem(options.key)
}

function toRememberedLibrarySelectionStorageKey(session: Pick<ProviderSession, "providerId" | "serverUrl" | "userId">): string {
  const normalizedServerUrl = session.serverUrl.trim().replace(/\/+$/, "")
  return `${ONBOARDING_REMEMBERED_LIBRARY_SELECTION_STORAGE_KEY_PREFIX}::${session.providerId}::${normalizedServerUrl}::${session.userId}`
}

export function saveRememberedLibrarySelection(options: {
  storage: Storage | null
  session: Pick<ProviderSession, "providerId" | "serverUrl" | "userId">
  selectedLibraryIds: readonly string[]
}): void {
  const normalizedSelectedLibraryIds = [...new Set(options.selectedLibraryIds.map((libraryId) => {
    return libraryId.trim()
  }).filter((libraryId) => {
    return libraryId.length > 0
  }))].sort()

  const key = toRememberedLibrarySelectionStorageKey(options.session)
  if (normalizedSelectedLibraryIds.length === 0) {
    options.storage?.removeItem(key)
    return
  }

  options.storage?.setItem(key, JSON.stringify(normalizedSelectedLibraryIds))
}

export function readRememberedLibrarySelection(options: {
  storage: Storage | null
  session: Pick<ProviderSession, "providerId" | "serverUrl" | "userId">
  availableLibraryIds: readonly string[]
}): readonly string[] | null {
  const rememberedLibraryIds = parseJson(
    options.storage?.getItem(toRememberedLibrarySelectionStorageKey(options.session)) ?? null
  )

  if (!Array.isArray(rememberedLibraryIds)) {
    return null
  }

  const availableLibraryIdSet = new Set(options.availableLibraryIds)
  const normalizedSelectedLibraryIds = [...new Set(rememberedLibraryIds.filter((libraryId): libraryId is string => {
    return typeof libraryId === "string"
  }).map((libraryId) => {
    return libraryId.trim()
  }).filter((libraryId) => {
    return libraryId.length > 0 && availableLibraryIdSet.has(libraryId)
  }))]

  return normalizedSelectedLibraryIds.length > 0 ? normalizedSelectedLibraryIds : null
}

export function clearOnboardingSessionArtifacts(sessionStorageRef: Storage | null): void {
  sessionStorageRef?.removeItem(ONBOARDING_AUTH_SESSION_STORAGE_KEY)
  sessionStorageRef?.removeItem(ONBOARDING_WALL_HANDOFF_STORAGE_KEY)
}

export function clearOnboardingWallHandoff(storageRef: Storage | null): void {
  storageRef?.removeItem(ONBOARDING_WALL_HANDOFF_STORAGE_KEY)
}

export function saveOnboardingSession(sessionStorageRef: Storage | null, session: ProviderSession): void {
  sessionStorageRef?.setItem(ONBOARDING_AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function saveOnboardingWallHandoff(sessionStorageRef: Storage | null, handoff: WallHandoff): void {
  sessionStorageRef?.setItem(ONBOARDING_WALL_HANDOFF_STORAGE_KEY, JSON.stringify(handoff))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function isWallHandoff(value: unknown): value is WallHandoff {
  if (!isRecord(value) || !Array.isArray(value.selectedLibraryIds) || !isRecord(value.preferences)) {
    return false
  }

  const preferences = value.preferences
  return value.selectedLibraryIds.every((libraryId) => typeof libraryId === "string")
    && typeof preferences.rememberServer === "boolean"
    && typeof preferences.rememberUsername === "boolean"
    && typeof preferences.rememberPasswordRequested === "boolean"
}

export function isPersistedProviderSession(value: unknown): value is ProviderSession {
  if (!isRecord(value)) {
    return false
  }

  return isNonEmptyString(value.providerId)
    && isNonEmptyString(value.serverUrl)
    && isNonEmptyString(value.userId)
    && typeof value.username === "string"
    && isNonEmptyString(value.accessToken)
    && typeof value.createdAt === "string"
    && (value.expiresAt === undefined || typeof value.expiresAt === "string")
    && (value.refreshToken === undefined || typeof value.refreshToken === "string")
}

// The wall only needs these fields; anything else in a cached item is optional metadata.
export function isPersistedMediaItem(value: unknown): value is MediaItem {
  if (!isRecord(value) || !isRecord(value.poster)) {
    return false
  }

  return isNonEmptyString(value.id)
    && isNonEmptyString(value.providerId)
    && isNonEmptyString(value.libraryId)
    && typeof value.kind === "string"
    && typeof value.title === "string"
    && isNonEmptyString(value.poster.url)
    && Array.isArray(value.genres)
    && Array.isArray(value.tags)
    && Array.isArray(value.people)
}

/**
 * Reads a persisted value and drops it when it is malformed, so a corrupted or
 * outdated entry cannot break every later page load.
 */
function readValidatedStorageValue<T>(
  storage: Storage | null,
  key: string,
  isValid: (value: unknown) => value is T
): T | null {
  const raw = storage?.getItem(key) ?? null
  if (raw === null) {
    return null
  }

  const parsed = parseJson(raw)
  if (isValid(parsed)) {
    return parsed
  }

  console.warn(`[mps] Discarding malformed persisted value for "${key}".`)
  storage?.removeItem(key)
  return null
}

export function readOnboardingWallHandoff(sessionStorageRef: Storage | null): WallHandoff | null {
  return readValidatedStorageValue(sessionStorageRef, ONBOARDING_WALL_HANDOFF_STORAGE_KEY, isWallHandoff)
}

/**
 * Parses a persisted poster cache snapshot, keeping only entries whose value is a usable
 * media item. Returns null for a missing or unrecognised snapshot.
 */
export function parsePosterCacheSnapshot(value: string | null): PosterCacheSnapshot<MediaItem> | null {
  const parsed = parseJson(value)
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    if (parsed !== null) {
      console.warn("[mps] Ignoring unrecognised persisted poster cache snapshot.")
    }
    return null
  }

  const entries: PosterCacheSnapshot<MediaItem>["entries"] = []
  for (const entry of parsed.entries) {
    if (
      isRecord(entry)
      && typeof entry.key === "string"
      && isPersistedMediaItem(entry.value)
      && typeof entry.sizeBytes === "number"
      && typeof entry.createdAtMs === "number"
      && typeof entry.lastAccessedAtMs === "number"
      && typeof entry.expiresAtMs === "number"
      && typeof entry.accessCount === "number"
    ) {
      entries.push({
        key: entry.key,
        value: entry.value,
        sizeBytes: entry.sizeBytes,
        createdAtMs: entry.createdAtMs,
        lastAccessedAtMs: entry.lastAccessedAtMs,
        expiresAtMs: entry.expiresAtMs,
        accessCount: entry.accessCount,
        preheated: entry.preheated === true
      })
    }
  }

  if (entries.length !== parsed.entries.length) {
    console.warn(
      `[mps] Dropped ${parsed.entries.length - entries.length} malformed poster cache entries.`
    )
  }

  return { version: 1, entries }
}

/** Removes every persisted poster cache (all servers/users/library selections). */
export function clearPersistedPosterCaches(storage: Storage | null): void {
  if (!storage) {
    return
  }

  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(ONBOARDING_WALL_CACHE_STORAGE_KEY_PREFIX)) {
      keys.push(key)
    }
  }

  for (const key of keys) {
    storage.removeItem(key)
  }
}

export function readOnboardingActiveSession(options: {
  currentSession: ProviderSession | null
  sessionStorageRef: Storage | null
}): ProviderSession | null {
  if (options.currentSession) {
    return options.currentSession
  }

  return readValidatedStorageValue(
    options.sessionStorageRef,
    ONBOARDING_AUTH_SESSION_STORAGE_KEY,
    isPersistedProviderSession
  )
}

export function getOnboardingIngestionRuntimeKey(
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

export function isOnboardingWallRouteActive(locationHref: string, wallPathname: string): boolean {
  return new URL(locationHref).pathname === wallPathname
}

export function safeGetStorage(type: "local" | "session"): Storage | null {
  try {
    return type === "local" ? window.localStorage : window.sessionStorage
  } catch (error) {
    // Storage access throws when it is disabled (privacy settings, sandboxed frames).
    // The app still runs; nothing is remembered across reloads.
    console.warn(
      `[mps] ${type}Storage is unavailable; continuing without persistence.`,
      error instanceof Error ? error.name : String(error)
    )
    return null
  }
}

/**
 * Parses JSON from storage. Returns `unknown` on purpose: callers must narrow the value
 * with a type guard. Malformed input yields null with a warning (the error message is not
 * logged because it can quote the stored value, which may hold a token).
 */
export function parseJson(value: string | null): unknown {
  if (!value) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(value)
    return parsed
  } catch (error) {
    console.warn(
      "[mps] Ignoring malformed persisted JSON.",
      error instanceof Error ? error.name : String(error)
    )
    return null
  }
}

export function toReconnectGuideReason(errorCategory: ProviderErrorCategory | null): "auth" | "network" | "timeout" | "unknown" {
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

export function toPosterCacheStorageKey(runtimeKey: string): string {
  return `${ONBOARDING_WALL_CACHE_STORAGE_KEY_PREFIX}${encodeURIComponent(runtimeKey)}`
}

export function toAuthErrorMessage(error: unknown): string {
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

export function createRandomDeviceId(): string {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID()
  }

  return `mps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function getOrCreateDeviceId(storage: Storage | null): string {
  const existing = storage?.getItem(ONBOARDING_DEVICE_ID_STORAGE_KEY)
  if (existing) {
    return existing
  }

  const created = createRandomDeviceId()
  storage?.setItem(ONBOARDING_DEVICE_ID_STORAGE_KEY, created)
  return created
}

export function toLibraryCheckboxTestId(libraryId: string): string {
  const normalized = libraryId.replace(/[^a-zA-Z0-9-_]/g, "-")
  return `library-checkbox-${normalized}`
}
