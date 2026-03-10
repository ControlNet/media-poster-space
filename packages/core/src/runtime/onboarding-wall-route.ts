import type { MediaItem } from "../types"
import {
  createWallControlsSection,
  createWallDetailCard,
  createWallDiagnosticsSection,
  createWallHeadingSection,
  createWallIngestionErrorSection,
  createWallIngestionSummarySection,
  createWallPosterGridSection,
  createWallReconnectGuideSection,
  createWallRouteShell,
  type WallDiagnosticsSample,
  type WallHandoff
} from "../wall"
import type { OnboardingElementFactory } from "./onboarding-shared"

export interface OnboardingWallRouteState {
  ingestionStatus: "idle" | "refreshing" | "ready" | "error"
  ingestionItems: MediaItem[]
  ingestionItemCount: number
  ingestionFetchedAt: string | null
  ingestionTrigger: string | null
  ingestionError: string | null
  reconnectAttempt: number
  reconnectNextDelayMs: number | null
  reconnectGuideVisible: boolean
  reconnectGuideReason: "auth" | "network" | "timeout" | "unknown" | null
  diagnosticsOpen: boolean
  detailProfile: "balanced" | "showcase"
  activePosterIndex: number | null
  wallControlsHidden: boolean
}

export interface CreateOnboardingWallRouteViewOptions {
  createElement: OnboardingElementFactory
  handoff: WallHandoff
  state: OnboardingWallRouteState
  detailCardTransitionMs: number
  diagnosticsLatestSample: WallDiagnosticsSample | null
  diagnosticsRetentionSnapshot: {
    count: number
    byteSize: number
  }
  diagnosticsLastExportAt: string | null
  diagnosticsExportError: string | null
  samplingIntervalMs: number
  retentionMaxAgeMs: number
  retentionMaxBytes: number
  onToggleDetailProfile: () => void
  onExportCrashReport: () => void
  onReturnToOnboarding: () => void
  onRefresh: () => void
  onToggleDiagnostics: () => void
  onLogout: () => void
  onCloseDetailCard: () => void
  resolveDetailPlacement: (activePosterIndex: number, totalItems: number) => {
    left: string
    top: string
  }
  controls: {
    showFullscreenControl: boolean
    fullscreenActive?: boolean
    onToggleFullscreen?: () => void
    fullscreenWarning?: HTMLElement | null
  }
}

export function createOnboardingWallRouteView(
  options: CreateOnboardingWallRouteViewOptions
): HTMLElement {
  const { root, wallCard } = createWallRouteShell(options.createElement)
  const { heading, libraries, preferences } = createWallHeadingSection(options.createElement, options.handoff)

  const ingestionSummary = createWallIngestionSummarySection(options.createElement, {
    ingestionItemCount: options.state.ingestionItemCount,
    ingestionStatus: options.state.ingestionStatus,
    ingestionTrigger: options.state.ingestionTrigger,
    ingestionFetchedAt: options.state.ingestionFetchedAt
  })

  const posterGrid = createWallPosterGridSection(options.createElement, {
    items: options.state.ingestionItems
  })

  const diagnosticsPanel = createWallDiagnosticsSection(options.createElement, {
    diagnosticsOpen: options.state.diagnosticsOpen,
    handoff: options.handoff,
    ingestionStatus: options.state.ingestionStatus,
    ingestionItemCount: options.state.ingestionItemCount,
    ingestionTrigger: options.state.ingestionTrigger,
    ingestionFetchedAt: options.state.ingestionFetchedAt,
    ingestionError: options.state.ingestionError,
    reconnectAttempt: options.state.reconnectAttempt,
    reconnectNextDelayMs: options.state.reconnectNextDelayMs,
    detailProfile: options.state.detailProfile,
    diagnosticsLatestSample: options.diagnosticsLatestSample,
    diagnosticsRetentionSnapshot: options.diagnosticsRetentionSnapshot,
    diagnosticsLastExportAt: options.diagnosticsLastExportAt,
    diagnosticsExportError: options.diagnosticsExportError,
    samplingIntervalMs: options.samplingIntervalMs,
    retentionMaxAgeMs: options.retentionMaxAgeMs,
    retentionMaxBytes: options.retentionMaxBytes,
    onToggleDetailProfile: options.onToggleDetailProfile,
    onExportCrashReport: options.onExportCrashReport
  })

  const ingestionError = createWallIngestionErrorSection(options.createElement, {
    ingestionError: options.state.ingestionError
  })

  const reconnectGuide = createWallReconnectGuideSection(options.createElement, {
    reconnectGuideVisible: options.state.reconnectGuideVisible,
    reconnectGuideReason: options.state.reconnectGuideReason,
    reconnectAttempt: options.state.reconnectAttempt,
    reconnectNextDelayMs: options.state.reconnectNextDelayMs,
    onReturnToOnboarding: options.onReturnToOnboarding
  })

  const controlsContainer = createWallControlsSection(options.createElement, {
    ingestionStatus: options.state.ingestionStatus,
    diagnosticsOpen: options.state.diagnosticsOpen,
    controlsHidden: options.state.wallControlsHidden,
    transitionMs: options.detailCardTransitionMs,
    onRefresh: options.onRefresh,
    onToggleDiagnostics: options.onToggleDiagnostics,
    onLogout: options.onLogout,
    showFullscreenControl: options.controls.showFullscreenControl,
    diagnosticsPanel,
    ingestionError,
    reconnectGuide,
    ...(options.controls.fullscreenActive !== undefined
      ? { fullscreenActive: options.controls.fullscreenActive }
      : {}),
    ...(options.controls.onToggleFullscreen !== undefined
      ? { onToggleFullscreen: options.controls.onToggleFullscreen }
      : {}),
    ...(options.controls.fullscreenWarning !== undefined
      ? { fullscreenWarning: options.controls.fullscreenWarning }
      : {})
  })

  const selectedPoster =
    typeof options.state.activePosterIndex === "number"
      ? options.state.ingestionItems[options.state.activePosterIndex] ?? null
      : null
  const detailCardVisible = selectedPoster !== null && !options.state.wallControlsHidden

  const detailCard = createWallDetailCard(options.createElement, {
    selectedPoster,
    detailCardVisible,
    detailCardTransitionMs: options.detailCardTransitionMs,
    placement: selectedPoster
      ? options.resolveDetailPlacement(options.state.activePosterIndex ?? 0, options.state.ingestionItems.length)
      : null,
    onClose: options.onCloseDetailCard
  })

  wallCard.append(posterGrid)
  root.append(wallCard, controlsContainer, heading, libraries, preferences, ingestionSummary, detailCard)
  return root
}
