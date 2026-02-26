export interface WallDetailCardPlacement {
  left: string;
  top: string;
}

export function resolveWallDetailCardPlacement(
  activePosterIndex: number,
  totalItems: number
): WallDetailCardPlacement {
  const estimatedColumns = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(totalItems))));
  const columnIndex = activePosterIndex % estimatedColumns;
  const rowIndex = Math.floor(activePosterIndex / estimatedColumns);
  const estimatedRows = Math.max(1, Math.ceil(totalItems / estimatedColumns));

  const horizontalAnchor = columnIndex >= estimatedColumns / 2 ? "8%" : "64%";
  const verticalAnchor = rowIndex >= estimatedRows / 2 ? "10%" : "56%";

  return {
    left: horizontalAnchor,
    top: verticalAnchor
  };
}
