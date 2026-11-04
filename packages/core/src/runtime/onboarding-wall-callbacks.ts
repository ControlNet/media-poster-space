import { type WallInteractionTransitionResult } from "../wall"
import type { CreateOnboardingWallRouteViewOptions } from "./onboarding-wall-route"

export interface OnboardingWallCallbackState {
  detailProfile: "balanced" | "showcase"
  diagnosticsOpen: boolean
  activePosterIndex: number | null
  wallControlsHidden: boolean
}

export function shouldSuppressIdleHideTransitionWhenDiagnosticsOpen(state: Pick<OnboardingWallCallbackState, "diagnosticsOpen">): boolean {
  return state.diagnosticsOpen
}

export function createOnboardingWallRouteCallbacks(options: {
  state: OnboardingWallCallbackState
  applyWallInteractionTransition: (transition: WallInteractionTransitionResult) => boolean
  scheduleIdleHide: () => void
  dismissActiveDetailCard: () => boolean
  // Called before leaving the wall. Without it the persisted handoff makes the
  // onboarding route resume the wall straight away, so the user could never leave.
  clearWallHandoff: () => void
  navigateToOnboarding: () => void
  onRefresh: () => void
  onLogout: () => void
  onExportCrashReport: () => void
  onRenderRequest: () => void
}): Pick<
  CreateOnboardingWallRouteViewOptions,
  | "onToggleDetailProfile"
  | "onExportCrashReport"
  | "onReturnToOnboarding"
  | "onRefresh"
  | "onToggleDiagnostics"
  | "onLogout"
  | "onCloseDetailCard"
> {
  return {
    onToggleDetailProfile: () => {
      options.state.detailProfile = options.state.detailProfile === "balanced" ? "showcase" : "balanced"
      options.onRenderRequest()
    },
    onExportCrashReport: options.onExportCrashReport,
    onReturnToOnboarding: () => {
      options.clearWallHandoff()
      options.navigateToOnboarding()
      options.onRenderRequest()
    },
    onRefresh: options.onRefresh,
    onToggleDiagnostics: () => {
      options.state.diagnosticsOpen = !options.state.diagnosticsOpen
      options.onRenderRequest()
    },
    onLogout: options.onLogout,
    onCloseDetailCard: () => {
      const shouldRender = options.dismissActiveDetailCard()
      if (!shouldRender) {
        return
      }

      options.scheduleIdleHide()
      options.onRenderRequest()
    }
  }
}
