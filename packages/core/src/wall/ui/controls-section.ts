import type { ElementFactory } from "./element-factory"
import { bindMouseOnlyButtonAction, bindMouseOnlyHover } from "./mouse-only-button"

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
  function applyIconButtonSkin(
    button: HTMLButtonElement,
    isActive: boolean = false
  ): void {
    button.style.width = "2.8rem"
    button.style.height = "2.8rem"
    button.style.borderRadius = "50%"
    button.style.display = "flex"
    button.style.alignItems = "center"
    button.style.justifyContent = "center"
    button.style.border = "none"
    button.style.transition = "all 200ms cubic-bezier(0.2, 0.8, 0.2, 1)"
    button.style.cursor = "pointer"
    
    if (isActive) {
      button.style.background = "color-mix(in srgb, var(--mps-color-accent) 15%, transparent)"
      button.style.color = "var(--mps-color-accent)"
    } else {
      button.style.background = "transparent"
      button.style.color = "var(--mps-color-foreground-support)"
    }
  }

  function attachButtonHover(button: HTMLButtonElement, tone: "accent" | "neutral" | "danger", isActive: boolean = false): void {
    bindMouseOnlyHover(button, () => {
      button.style.transform = "translateY(-2px) scale(1.05)"
      if (tone === "accent" || isActive) {
        button.style.background = "color-mix(in srgb, var(--mps-color-accent) 25%, transparent)"
        button.style.color = "var(--mps-color-accent)"
      } else if (tone === "danger") {
        button.style.background = "rgba(255, 50, 50, 0.15)"
        button.style.color = "#ff6b6b"
      } else {
        button.style.background = "rgba(255, 255, 255, 0.1)"
        button.style.color = "white"
      }
    }, () => {
      button.style.transform = "translateY(0)"
      if (isActive) {
        button.style.background = "color-mix(in srgb, var(--mps-color-accent) 15%, transparent)"
        button.style.color = "var(--mps-color-accent)"
      } else {
        button.style.background = "transparent"
        button.style.color = "var(--mps-color-foreground-support)"
      }
    })
  }

  const refreshIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`
  const refreshButton = createElement("button", { testId: "manual-refresh-button" }) as HTMLButtonElement
  refreshButton.type = "button"
  refreshButton.title = options.ingestionStatus === "refreshing" ? "Refreshing…" : "Refresh posters now"
  refreshButton.innerHTML = refreshIcon
  applyIconButtonSkin(refreshButton)
  attachButtonHover(refreshButton, "accent")
  refreshButton.disabled = options.ingestionStatus === "refreshing"
  refreshButton.style.pointerEvents = "auto"
  if (options.ingestionStatus === "refreshing") {
    refreshButton.style.opacity = "0.5"
    refreshButton.style.animation = "spin 2s linear infinite"
  }
  bindMouseOnlyButtonAction(refreshButton, options.onRefresh)

  const diagIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`
  const diagnosticsButton = createElement("button", { testId: "diagnostics-open" }) as HTMLButtonElement
  diagnosticsButton.type = "button"
  diagnosticsButton.title = options.diagnosticsOpen ? "Hide diagnostics" : "Open diagnostics"
  diagnosticsButton.innerHTML = diagIcon
  applyIconButtonSkin(diagnosticsButton, options.diagnosticsOpen)
  attachButtonHover(diagnosticsButton, "neutral", options.diagnosticsOpen)
  diagnosticsButton.style.pointerEvents = "auto"
  bindMouseOnlyButtonAction(diagnosticsButton, options.onToggleDiagnostics)

  const logoutIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
  const logoutButton = createElement("button", { testId: "logout-button" }) as HTMLButtonElement
  logoutButton.title = "Logout"
  logoutButton.innerHTML = logoutIcon
  applyIconButtonSkin(logoutButton)
  attachButtonHover(logoutButton, "danger")
  logoutButton.style.pointerEvents = "auto"
  bindMouseOnlyButtonAction(logoutButton, options.onLogout)

  const controlsContainer = createElement("div", { testId: "wall-controls-container" })
  controlsContainer.style.position = "fixed"
  controlsContainer.style.left = "50%"
  controlsContainer.style.bottom = "2.2rem"
  controlsContainer.style.zIndex = "100"
  controlsContainer.style.display = "flex"
  controlsContainer.style.flexDirection = "column"
  controlsContainer.style.alignItems = "center"
  controlsContainer.style.gap = "0.8rem"
  controlsContainer.style.transitionProperty = "opacity, transform"
  controlsContainer.style.transitionDuration = `${options.transitionMs}ms`
  controlsContainer.style.transitionTimingFunction = "ease"
  controlsContainer.style.opacity = options.controlsHidden ? "0" : "1"
  controlsContainer.style.transform = `translateX(-50%) ${options.controlsHidden ? "translateY(1rem)" : "translateY(0)"}`
  controlsContainer.style.visibility = options.controlsHidden ? "hidden" : "visible"
  controlsContainer.style.pointerEvents = "none"

  const navbar = createElement("div")
  navbar.style.display = "flex"
  navbar.style.alignItems = "center"
  navbar.style.gap = "0.4rem"
  navbar.style.padding = "0.4rem"
  navbar.style.borderRadius = "999px"
  navbar.style.border = "1px solid rgba(255, 255, 255, 0.05)"
  navbar.style.background = "rgba(10, 10, 10, 0.35)"
  navbar.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.2)"
  navbar.style.backdropFilter = "blur(30px) saturate(1.5)"
  navbar.style.pointerEvents = "auto"

  navbar.append(refreshButton)

  if (options.showFullscreenControl && options.onToggleFullscreen) {
    const expandIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`
    const collapseIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`
    
    const fullscreenButton = createElement("button", { testId: "wall-fullscreen-button" }) as HTMLButtonElement
    fullscreenButton.type = "button"
    fullscreenButton.title = options.fullscreenActive ? "Exit fullscreen" : "Enter fullscreen"
    fullscreenButton.innerHTML = options.fullscreenActive ? collapseIcon : expandIcon
    applyIconButtonSkin(fullscreenButton)
    attachButtonHover(fullscreenButton, "neutral")
    fullscreenButton.style.pointerEvents = "auto"
    bindMouseOnlyButtonAction(fullscreenButton, options.onToggleFullscreen)
    navbar.append(fullscreenButton)
  }

  const separator = createElement("div")
  separator.style.width = "1px"
  separator.style.height = "1.5rem"
  separator.style.background = "rgba(255, 255, 255, 0.15)"
  separator.style.margin = "0 0.2rem"
  navbar.append(separator)

  navbar.append(diagnosticsButton, logoutButton)

  const calloutStack = createElement("div")
  calloutStack.style.display = "flex"
  calloutStack.style.flexDirection = "column"
  calloutStack.style.alignItems = "center"
  calloutStack.style.gap = "0.44rem"
  calloutStack.style.pointerEvents = "none"

  controlsContainer.append(calloutStack)

  if (options.diagnosticsPanel) {
    options.diagnosticsPanel.style.pointerEvents = "auto"
    calloutStack.append(options.diagnosticsPanel)
  }

  if (options.fullscreenWarning) {
    calloutStack.append(options.fullscreenWarning)
  }

  if (options.ingestionError) {
    calloutStack.append(options.ingestionError)
  }

  if (options.reconnectGuide) {
    calloutStack.append(options.reconnectGuide)
  }
  
  controlsContainer.append(navbar)

  return controlsContainer
}
