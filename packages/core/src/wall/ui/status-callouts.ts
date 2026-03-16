import type { ElementFactory } from "./element-factory"
import { bindMouseOnlyButtonAction } from "./mouse-only-button"

export function createWallIngestionErrorSection(
  createElement: ElementFactory,
  options: {
    ingestionError: string | null
  }
): HTMLElement | null {
  if (!options.ingestionError) {
    return null
  }

  const ingestionError = createElement("p", {
    textContent: options.ingestionError,
    testId: "wall-ingestion-error"
  })
  ingestionError.style.margin = "0"
  ingestionError.style.padding = "0.68rem 0.84rem"
  ingestionError.style.borderRadius = "0.9rem"
  ingestionError.style.border = "1px solid rgba(255, 130, 130, 0.6)"
  ingestionError.style.background = [
    "linear-gradient(148deg, rgba(89, 24, 24, 0.54) 0%, rgba(54, 16, 16, 0.7) 100%)",
    "radial-gradient(circle at 100% 0%, rgba(255, 146, 146, 0.18) 0%, transparent 48%)"
  ].join(",")
  ingestionError.style.color = "#ffd8d8"
  ingestionError.style.fontFamily = "var(--mps-font-mono)"
  ingestionError.style.fontSize = "0.7rem"
  ingestionError.style.letterSpacing = "0.03em"
  ingestionError.style.boxShadow = "0 14px 30px rgba(35, 6, 6, 0.38), inset 0 0 0 1px rgba(255, 169, 169, 0.2)"

  return ingestionError
}

export function createWallReconnectGuideSection(
  createElement: ElementFactory,
  options: {
    reconnectGuideVisible: boolean
    reconnectGuideReason: "auth" | "network" | "timeout" | "unknown" | null
    reconnectAttempt: number
    reconnectNextDelayMs: number | null
    onReturnToOnboarding: () => void
  }
): HTMLElement | null {
  if (!options.reconnectGuideVisible) {
    return null
  }

  const reconnectGuide = createElement("section", { testId: "reconnect-guide" })
  reconnectGuide.style.display = "grid"
  reconnectGuide.style.gap = "0.54rem"
  reconnectGuide.style.padding = "0.78rem 0.86rem"
  reconnectGuide.style.borderRadius = "1rem"
  reconnectGuide.style.border = "1px solid color-mix(in srgb, var(--mps-color-orbit-glow-halo) 68%, var(--mps-color-border))"
  reconnectGuide.style.background = [
    "linear-gradient(150deg, color-mix(in srgb, var(--mps-overlay-depth-near) 78%, black) 0%, color-mix(in srgb, var(--mps-overlay-depth-far) 82%, black) 100%)",
    "radial-gradient(circle at 105% 8%, color-mix(in srgb, var(--mps-color-telemetry-soft) 54%, transparent) 0%, transparent 52%)"
  ].join(",")
  reconnectGuide.style.boxShadow = "0 16px 32px rgba(5, 11, 20, 0.36), inset 0 0 0 1px rgba(122, 217, 255, 0.12)"
  reconnectGuide.style.backdropFilter = "blur(14px)"

  const reconnectLabel = createElement("p", {
    textContent: "Reconnect guidance"
  })
  reconnectLabel.style.margin = "0"
  reconnectLabel.style.fontFamily = "var(--mps-font-mono)"
  reconnectLabel.style.fontSize = "0.64rem"
  reconnectLabel.style.letterSpacing = "0.12em"
  reconnectLabel.style.textTransform = "uppercase"
  reconnectLabel.style.color = "var(--mps-color-foreground-muted)"

  const reconnectReason = createElement("p", {
    textContent:
      options.reconnectGuideReason === "auth"
        ? "Session token appears invalid. Reconnect by signing in again."
        : "Connection to Jellyfin is unstable. Keep this screen open while reconnect retries continue."
  })
  reconnectReason.style.margin = "0"
  reconnectReason.style.color = "var(--mps-color-foreground-support)"
  reconnectReason.style.lineHeight = "1.38"

  const reconnectMeta = createElement("p", {
    textContent: `Retry attempts: ${options.reconnectAttempt}; next retry in ${options.reconnectNextDelayMs ?? "n/a"}ms.`
  })
  reconnectMeta.style.margin = "0"
  reconnectMeta.style.fontFamily = "var(--mps-font-mono)"
  reconnectMeta.style.fontSize = "0.7rem"
  reconnectMeta.style.color = "var(--mps-color-foreground-muted)"
  reconnectMeta.style.padding = "0.46rem 0.56rem"
  reconnectMeta.style.borderRadius = "0.74rem"
  reconnectMeta.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 72%, var(--mps-color-telemetry-muted))"
  reconnectMeta.style.background = "color-mix(in srgb, var(--mps-overlay-depth-near) 78%, black)"

  const reconnectAction = createElement("button", {
    textContent: "Return to onboarding"
  }) as HTMLButtonElement
  reconnectAction.type = "button"
  reconnectAction.style.width = "fit-content"
  reconnectAction.style.padding = "0.52rem 0.72rem"
  reconnectAction.style.borderRadius = "0.72rem"
  reconnectAction.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 64%, var(--mps-color-telemetry-muted))"
  reconnectAction.style.background = "linear-gradient(140deg, color-mix(in srgb, var(--mps-color-surface-raised) 82%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 88%, black) 100%)"
  reconnectAction.style.color = "var(--mps-color-foreground-emphasis)"
  reconnectAction.style.fontSize = "0.74rem"
  reconnectAction.style.textTransform = "uppercase"
  reconnectAction.style.letterSpacing = "0.06em"
  reconnectAction.style.boxShadow = "0 10px 22px rgba(0, 0, 0, 0.28), inset 0 0 0 1px rgba(122, 217, 255, 0.1)"
  bindMouseOnlyButtonAction(reconnectAction, options.onReturnToOnboarding)

  reconnectGuide.append(reconnectLabel, reconnectReason, reconnectMeta, reconnectAction)
  return reconnectGuide
}
