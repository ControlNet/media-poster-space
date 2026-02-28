import type { ElementFactory } from "./element-factory"

export function createWallControlsSection(
  createElement: ElementFactory,
  options: {
    ingestionStatus: "idle" | "refreshing" | "ready" | "error"
    diagnosticsOpen: boolean
    controlsHidden: boolean
    transitionMs: number
    onRefresh: () => void
    onToggleDiagnostics: () => void
    onLogout: () => void
    diagnosticsPanel: HTMLElement | null
    ingestionError: HTMLElement | null
    reconnectGuide: HTMLElement | null
    showFullscreenControl?: boolean
    fullscreenActive?: boolean
    onToggleFullscreen?: () => void
    fullscreenWarning?: HTMLElement | null
  }
): HTMLElement {
  function applyControlButtonSkin(
    button: HTMLButtonElement,
    tone: "accent" | "neutral"
  ): void {
    button.style.width = "fit-content"
    button.style.padding = "0.58rem 0.78rem"
    button.style.borderRadius = "0.56rem"
    button.style.fontWeight = "600"
    button.style.fontSize = "0.78rem"
    button.style.letterSpacing = "0.015em"
    button.style.textTransform = "uppercase"
    button.style.transition = "transform 150ms ease, border-color 150ms ease"

    if (tone === "accent") {
      button.style.border = "1px solid color-mix(in srgb, var(--mps-color-accent-ring) 72%, var(--mps-color-telemetry))"
      button.style.background = "linear-gradient(135deg, color-mix(in srgb, var(--mps-color-accent) 82%, black) 0%, color-mix(in srgb, var(--mps-color-accent-soft) 74%, black) 100%)"
      button.style.color = "var(--mps-color-accent-foreground)"
      return
    }

    button.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 64%, var(--mps-color-telemetry-muted))"
    button.style.background = "linear-gradient(135deg, color-mix(in srgb, var(--mps-color-surface-raised) 82%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 88%, black) 100%)"
    button.style.color = "var(--mps-color-foreground-support)"
  }

  function attachButtonHover(button: HTMLButtonElement): void {
    button.addEventListener("mouseenter", () => {
      button.style.transform = "translateY(-1px)"
    })

    button.addEventListener("mouseleave", () => {
      button.style.transform = "translateY(0)"
    })
  }

  const refreshButton = createElement("button", {
    textContent: options.ingestionStatus === "refreshing" ? "Refreshing…" : "Refresh posters now",
    testId: "manual-refresh-button"
  }) as HTMLButtonElement
  refreshButton.type = "button"
  applyControlButtonSkin(refreshButton, "accent")
  attachButtonHover(refreshButton)
  refreshButton.disabled = options.ingestionStatus === "refreshing"
  refreshButton.addEventListener("click", options.onRefresh)

  const diagnosticsButton = createElement("button", {
    textContent: options.diagnosticsOpen ? "Hide diagnostics" : "Open diagnostics",
    testId: "diagnostics-open"
  }) as HTMLButtonElement
  diagnosticsButton.type = "button"
  applyControlButtonSkin(diagnosticsButton, "neutral")
  attachButtonHover(diagnosticsButton)
  diagnosticsButton.addEventListener("click", options.onToggleDiagnostics)

  const logoutButton = createElement("button", { textContent: "Logout", testId: "logout-button" })
  applyControlButtonSkin(logoutButton, "accent")
  attachButtonHover(logoutButton)
  logoutButton.addEventListener("click", options.onLogout)

  const controlsContainer = createElement("div", { testId: "wall-controls-container" })
  controlsContainer.style.gridColumn = "1 / -1"
  controlsContainer.style.position = "relative"
  controlsContainer.style.zIndex = "3"
  controlsContainer.style.display = "grid"
  controlsContainer.style.gap = "0.72rem"
  controlsContainer.style.padding = "0.74rem"
  controlsContainer.style.borderRadius = "0.78rem"
  controlsContainer.style.border = "1px solid color-mix(in srgb, var(--mps-color-orbit-glow-halo) 70%, var(--mps-color-border))"
  controlsContainer.style.background = [
    "linear-gradient(150deg, color-mix(in srgb, var(--mps-color-surface) 86%, black) 0%, color-mix(in srgb, var(--mps-color-surface-raised) 78%, black) 100%)",
    "radial-gradient(circle at 4% 0%, color-mix(in srgb, var(--mps-color-telemetry-soft) 48%, transparent) 0%, transparent 42%)"
  ].join(",")
  controlsContainer.style.boxShadow = "0 14px 28px rgba(3, 8, 18, 0.22), inset 0 0 0 1px rgba(122, 217, 255, 0.1)"
  controlsContainer.style.backdropFilter = "blur(6px)"
  controlsContainer.style.transitionProperty = "opacity, transform"
  controlsContainer.style.transitionDuration = `${options.transitionMs}ms`
  controlsContainer.style.transitionTimingFunction = "ease"
  controlsContainer.style.opacity = options.controlsHidden ? "0" : "1"
  controlsContainer.style.transform = options.controlsHidden ? "translateY(0.5rem)" : "translateY(0)"
  controlsContainer.style.visibility = options.controlsHidden ? "hidden" : "visible"
  controlsContainer.style.pointerEvents = options.controlsHidden ? "none" : "auto"

  const controlsHeader = createElement("div")
  controlsHeader.style.display = "grid"
  controlsHeader.style.gridTemplateColumns = "minmax(0, 1fr) minmax(max-content, auto)"
  controlsHeader.style.alignItems = "center"
  controlsHeader.style.gap = "0.5rem"

  const controlsRow = createElement("div")
  controlsRow.style.display = "grid"
  controlsRow.style.gridTemplateColumns = "repeat(auto-fit, minmax(10.8rem, 1fr))"
  controlsRow.style.gap = "0.54rem"

  const controlsHeading = createElement("p", {
    textContent: "Operational controls"
  })
  controlsHeading.style.margin = "0"
  controlsHeading.style.fontFamily = "var(--mps-font-mono)"
  controlsHeading.style.fontSize = "0.67rem"
  controlsHeading.style.letterSpacing = "0.12em"
  controlsHeading.style.textTransform = "uppercase"
  controlsHeading.style.color = "var(--mps-color-foreground-muted)"

  const controlsSubheading = createElement("p", {
    textContent: options.diagnosticsOpen
      ? "Diagnostics relay active"
      : "Diagnostics relay standby"
  })
  controlsSubheading.style.margin = "0"
  controlsSubheading.style.padding = "0.42rem 0.56rem"
  controlsSubheading.style.borderRadius = "999px"
  controlsSubheading.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 66%, var(--mps-color-telemetry-muted))"
  controlsSubheading.style.background = "color-mix(in srgb, var(--mps-overlay-depth-near) 76%, black)"
  controlsSubheading.style.color = "var(--mps-color-foreground-support)"
  controlsSubheading.style.fontFamily = "var(--mps-font-mono)"
  controlsSubheading.style.fontSize = "0.63rem"
  controlsSubheading.style.letterSpacing = "0.08em"
  controlsSubheading.style.textTransform = "uppercase"

  const primaryCluster = createElement("div")
  primaryCluster.style.display = "grid"
  primaryCluster.style.gridTemplateColumns = "repeat(auto-fit, minmax(10.4rem, 1fr))"
  primaryCluster.style.gap = "0.46rem"
  primaryCluster.style.padding = "0.5rem"
  primaryCluster.style.borderRadius = "0.66rem"
  primaryCluster.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 66%, var(--mps-color-telemetry-muted))"
  primaryCluster.style.background = "color-mix(in srgb, var(--mps-overlay-depth-near) 82%, black)"

  const supportCluster = createElement("div")
  supportCluster.style.display = "grid"
  supportCluster.style.gridTemplateColumns = "repeat(auto-fit, minmax(10.4rem, 1fr))"
  supportCluster.style.gap = "0.46rem"
  supportCluster.style.padding = "0.5rem"
  supportCluster.style.borderRadius = "0.66rem"
  supportCluster.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 64%, var(--mps-color-accent-ring))"
  supportCluster.style.background = "color-mix(in srgb, var(--mps-color-surface-raised) 84%, black)"

  const calloutStack = createElement("div")
  calloutStack.style.display = "grid"
  calloutStack.style.gap = "0.44rem"

  controlsHeader.append(controlsHeading, controlsSubheading)
  controlsContainer.append(controlsHeader)

  primaryCluster.append(refreshButton)
  if (options.showFullscreenControl && options.onToggleFullscreen) {
    const fullscreenButton = createElement("button", {
      textContent: options.fullscreenActive ? "Exit fullscreen" : "Enter fullscreen",
      testId: "wall-fullscreen-button"
    }) as HTMLButtonElement
    fullscreenButton.type = "button"
    applyControlButtonSkin(fullscreenButton, "neutral")
    attachButtonHover(fullscreenButton)
    fullscreenButton.addEventListener("click", options.onToggleFullscreen)
    primaryCluster.append(fullscreenButton)
  }

  supportCluster.append(diagnosticsButton, logoutButton)
  controlsRow.append(primaryCluster, supportCluster)
  controlsContainer.append(controlsRow)

  if (options.fullscreenWarning) {
    calloutStack.append(options.fullscreenWarning)
  }

  if (options.diagnosticsPanel) {
    controlsContainer.append(options.diagnosticsPanel)
  }

  if (options.ingestionError) {
    calloutStack.append(options.ingestionError)
  }

  if (options.reconnectGuide) {
    calloutStack.append(options.reconnectGuide)
  }

  if (calloutStack.childElementCount > 0) {
    controlsContainer.append(calloutStack)
  }

  return controlsContainer
}
