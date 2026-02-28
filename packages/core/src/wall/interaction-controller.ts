export interface WallInteractionController {
  isIdleHideScheduled: () => boolean
  scheduleIdleHide: () => void
  revealAndResetIdleTimer: () => void
  attach: () => void
  detach: () => void
}

export function createWallInteractionController(options: {
  idleHideMs: number
  isWallRouteActive: () => boolean
  onIdleHide: () => boolean
  onRevealControls: () => boolean
  onEscape: () => boolean
  onRenderRequest: () => void
}): WallInteractionController {
  const {
    idleHideMs,
    isWallRouteActive,
    onIdleHide,
    onRevealControls,
    onEscape,
    onRenderRequest
  } = options

  let wallIdleTimerId: ReturnType<typeof setTimeout> | null = null
  let wallInteractionListenersAttached = false

  function clearWallIdleTimer(): void {
    if (wallIdleTimerId) {
      clearTimeout(wallIdleTimerId)
      wallIdleTimerId = null
    }
  }

  function scheduleIdleHide(): void {
    clearWallIdleTimer()

    if (!isWallRouteActive()) {
      return
    }

    wallIdleTimerId = setTimeout(() => {
      if (!isWallRouteActive()) {
        return
      }

      if (onIdleHide()) {
        onRenderRequest()
      }
    }, idleHideMs)
  }

  function revealAndResetIdleTimer(): void {
    if (!isWallRouteActive()) {
      return
    }

    const shouldRender = onRevealControls()
    scheduleIdleHide()

    if (shouldRender) {
      onRenderRequest()
    }
  }

  function onWallPointerOrFocusInteraction(): void {
    revealAndResetIdleTimer()
  }

  function onWallKeyDown(event: KeyboardEvent): void {
    if (!isWallRouteActive()) {
      return
    }

    if (event.key !== "Escape") {
      return
    }

    const shouldRender = onEscape()
    if (!shouldRender) {
      return
    }

    scheduleIdleHide()
    onRenderRequest()
  }

  function attach(): void {
    if (wallInteractionListenersAttached) {
      return
    }

    window.addEventListener("pointerdown", onWallPointerOrFocusInteraction)
    window.addEventListener("pointermove", onWallPointerOrFocusInteraction)
    window.addEventListener("focusin", onWallPointerOrFocusInteraction)
    window.addEventListener("keydown", onWallKeyDown)
    wallInteractionListenersAttached = true
  }

  function detach(): void {
    if (!wallInteractionListenersAttached) {
      clearWallIdleTimer()
      return
    }

    window.removeEventListener("pointerdown", onWallPointerOrFocusInteraction)
    window.removeEventListener("pointermove", onWallPointerOrFocusInteraction)
    window.removeEventListener("focusin", onWallPointerOrFocusInteraction)
    window.removeEventListener("keydown", onWallKeyDown)
    wallInteractionListenersAttached = false
    clearWallIdleTimer()
  }

  return {
    isIdleHideScheduled: () => wallIdleTimerId !== null,
    scheduleIdleHide,
    revealAndResetIdleTimer,
    attach,
    detach
  }
}
