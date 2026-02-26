export const WALL_IDLE_HIDE_MS = 8_000;

export const WALL_TRANSITION_WINDOW_MIN_MS = 240;
export const WALL_TRANSITION_WINDOW_MAX_MS = 320;
export const WALL_DEFAULT_TRANSITION_MS = 280;

export const WALL_DETAIL_CARD_WIDTH = "28%";
export const WALL_DETAIL_CARD_MIN_WIDTH = "26%";
export const WALL_DETAIL_CARD_MAX_WIDTH = "30%";

export function isWallTransitionWithinGuard(durationMs: number): boolean {
  return durationMs >= WALL_TRANSITION_WINDOW_MIN_MS
    && durationMs <= WALL_TRANSITION_WINDOW_MAX_MS;
}

export function resolveWallTransitionMs(
  preferredDurationMs: number = WALL_DEFAULT_TRANSITION_MS
): number {
  const roundedDuration = Number.isFinite(preferredDurationMs)
    ? Math.round(preferredDurationMs)
    : WALL_DEFAULT_TRANSITION_MS;

  if (isWallTransitionWithinGuard(roundedDuration)) {
    return roundedDuration;
  }

  if (roundedDuration < WALL_TRANSITION_WINDOW_MIN_MS) {
    return WALL_TRANSITION_WINDOW_MIN_MS;
  }

  return WALL_TRANSITION_WINDOW_MAX_MS;
}
