import {
  createWallPosterSelectionTransition,
  type WallInteractionTransitionResult
} from "../wall"
import type { CreateOnboardingWallRouteViewOptions } from "./onboarding-wall-route"

export interface OnboardingWallCallbackState {
  detailProfile: "balanced" | "showcase"
  diagnosticsOpen: boolean
  activePosterIndex: number | null
  wallControlsHidden: boolean
}

export function createOnboardingWallRouteCallbacks(options: {
  state: OnboardingWallCallbackState
  applyWallInteractionTransition: (transition: WallInteractionTransitionResult) => boolean
  scheduleIdleHide: () => void
  dismissActiveDetailCard: () => boolean
  navigateToOnboarding: () => void
  onRefresh: () => void
  onLogout: () => void
  onExportCrashReport: () => void
  onRenderRequest: () => void
}): Pick<
  CreateOnboardingWallRouteViewOptions,
  | "onToggleDetailProfile"
  | "onExportCrashReport"
  | "onPosterSelect"
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
    onPosterSelect: (index) => {
      const shouldRender = options.applyWallInteractionTransition(
        createWallPosterSelectionTransition({
          activePosterIndex: options.state.activePosterIndex,
          wallControlsHidden: options.state.wallControlsHidden
        }, index)
      )
      options.scheduleIdleHide()

      if (shouldRender) {
        options.onRenderRequest()
      }
    },
    onReturnToOnboarding: () => {
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
