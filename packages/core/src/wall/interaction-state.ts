export interface WallInteractionStateSnapshot {
  activePosterIndex: number | null;
  wallControlsHidden: boolean;
}

export interface WallInteractionTransitionResult extends WallInteractionStateSnapshot {
  shouldRender: boolean;
}

function toTransitionResult(
  previousState: WallInteractionStateSnapshot,
  nextState: WallInteractionStateSnapshot,
  forceRender = false
): WallInteractionTransitionResult {
  const didChange = previousState.activePosterIndex !== nextState.activePosterIndex
    || previousState.wallControlsHidden !== nextState.wallControlsHidden;

  return {
    ...nextState,
    shouldRender: forceRender || didChange
  };
}

export function normalizeWallActivePosterIndex(
  activePosterIndex: number | null,
  totalItems: number
): number | null {
  const normalizedTotalItems = Number.isFinite(totalItems)
    ? Math.max(0, Math.floor(totalItems))
    : 0;

  if (typeof activePosterIndex !== "number" || !Number.isInteger(activePosterIndex)) {
    return null;
  }

  if (activePosterIndex < 0 || activePosterIndex >= normalizedTotalItems) {
    return null;
  }

  return activePosterIndex;
}

export function createWallPosterSelectionTransition(
  previousState: WallInteractionStateSnapshot,
  nextPosterIndex: number
): WallInteractionTransitionResult {
  return toTransitionResult(previousState, {
    activePosterIndex: nextPosterIndex,
    wallControlsHidden: false
  }, true);
}

export function createWallIdleHideTransition(
  previousState: WallInteractionStateSnapshot
): WallInteractionTransitionResult {
  return toTransitionResult(previousState, {
    activePosterIndex: null,
    wallControlsHidden: true
  });
}

export function createWallRevealControlsTransition(
  previousState: WallInteractionStateSnapshot
): WallInteractionTransitionResult {
  return toTransitionResult(previousState, {
    activePosterIndex: previousState.activePosterIndex,
    wallControlsHidden: false
  });
}

export function createWallDismissDetailTransition(
  previousState: WallInteractionStateSnapshot
): WallInteractionTransitionResult {
  return toTransitionResult(previousState, {
    activePosterIndex: null,
    wallControlsHidden: false
  });
}
