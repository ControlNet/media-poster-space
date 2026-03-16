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
  onRenderRequest: () => void
}): WallInteractionController {
  const {
    idleHideMs,
    isWallRouteActive,
    onIdleHide,
    onRevealControls,
    onRenderRequest
  } = options

  let wallIdleTimerId: ReturnType<typeof setTimeout> | null = null
  let wallInteractionListenersAttached = false

  function isMousePointerEvent(event: Event): event is Event & { pointerType: string } {
    return "pointerType" in event && event.pointerType === "mouse"
  }

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

  function onWallPointerInteraction(event: Event): void {
    if (!isMousePointerEvent(event)) {
      return
    }

    revealAndResetIdleTimer()
  }

  function attach(): void {
    if (wallInteractionListenersAttached) {
      return
    }

    window.addEventListener("pointerdown", onWallPointerInteraction)
    window.addEventListener("pointermove", onWallPointerInteraction)
    wallInteractionListenersAttached = true
  }

  function detach(): void {
    if (!wallInteractionListenersAttached) {
      clearWallIdleTimer()
      return
    }

    window.removeEventListener("pointerdown", onWallPointerInteraction)
    window.removeEventListener("pointermove", onWallPointerInteraction)
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
