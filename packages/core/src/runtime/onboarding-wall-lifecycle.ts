import type { ProviderSession } from "../types"
import type { WallHandoff } from "../wall"

export type OnboardingWallFallbackReason = "missing-handoff" | "missing-session"

export interface OnboardingWallTransientState {
  activePosterIndex: number | null
  wallControlsHidden: boolean
}

export type PrepareOnboardingWallRouteResult<Session extends ProviderSession> =
  | {
      kind: "fallback"
      reason: OnboardingWallFallbackReason
    }
  | {
      kind: "ready"
      handoff: WallHandoff
      activeSession: Session
    }

export function prepareOnboardingWallRoute<Session extends ProviderSession>(options: {
  handoff: WallHandoff | null
  activeSession: Session | null
  state: OnboardingWallTransientState
  disposeIngestionRuntime: () => void
  detachWallInteraction: () => void
}): PrepareOnboardingWallRouteResult<Session> {
  if (!options.handoff) {
    resetWallTransientState(options)
    return {
      kind: "fallback",
      reason: "missing-handoff"
    }
  }

  if (!options.activeSession) {
    resetWallTransientState(options)
    return {
      kind: "fallback",
      reason: "missing-session"
    }
  }

  return {
    kind: "ready",
    handoff: options.handoff,
    activeSession: options.activeSession
  }
}

function resetWallTransientState(options: {
  state: OnboardingWallTransientState
  disposeIngestionRuntime: () => void
  detachWallInteraction: () => void
}): void {
  options.disposeIngestionRuntime()
  options.detachWallInteraction()
  options.state.activePosterIndex = null
  options.state.wallControlsHidden = false
}

export function getOnboardingWallFallbackContent(reason: OnboardingWallFallbackReason): {
  title: string
  body: string
} {
  if (reason === "missing-handoff") {
    return {
      title: "Poster wall is not ready",
      body: "No onboarding handoff was found. Run onboarding and finish with at least one library."
    }
  }

  return {
    title: "Session expired",
    body: "Wall ingestion requires an active session. Sign in again to refresh posters."
  }
}
