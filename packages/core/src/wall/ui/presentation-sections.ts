import type { MediaItem } from "../../types/media"

import type { ElementFactory } from "./element-factory"
import { bindMouseOnlyHover } from "./mouse-only-button"
import type { WallHandoff } from "./types"

export type WallPosterRowDirection = "normal" | "reverse"

export interface WallPosterRect {
  left: number
  right: number
  top: number
  bottom: number
}

export interface WallPosterTileState {
  tile: object
  posterThumb: Pick<HTMLElement, "style">
}

export interface WallPosterGridRowState {
  entryIndices: number[]
  tiles: WallPosterTileState[]
}

export interface WallPosterGridStreamState {
  items: MediaItem[]
  itemIndexByIdentity: Map<string, number>
  nextIncomingRowPointer: number
  pendingIncomingItems: MediaItem[]
  rows: WallPosterGridRowState[]
  // Monotonic counter stamped on a tile when it receives a poster; the oldest stamp is replaced first.
  nextWriteSequence: number
}

export type WallPosterGridStreamApplyStatus =
  | "applied"
  | "deferred"
  | "noop"
  | "unavailable"

export interface WallPosterGridStreamApplyResult {
  status: WallPosterGridStreamApplyStatus
  queuedItemCount: number
  appliedItemCount: number
  pendingItemCount: number
}

export type WallPosterGridStreamApplier = (
  items: readonly MediaItem[]
) => WallPosterGridStreamApplyResult

export const WALL_POSTER_GRID_STREAM_APPLIER_KEY = "__mpsApplyWallPosterStreamItems" as const
// Horizontal distance from one tile to the next: 200px poster + 2.5rem (40px) gap.
export const WALL_POSTER_TILE_STRIDE_PX = 240
// Each row scrolls by this fraction of the viewport width before the animation loops.
export const WALL_POSTER_ROW_SHIFT_RATIO = 0.62
// The wall layout centres the 168vw-wide grid (shifted by its -8vw margin), so a row's first tile
// sits about 0.37 viewport widths left of the screen (measured in Chromium at 1280-3840px wide).
// A row is therefore on screen from that offset (scroll start) to offset + 100vw + 62vw (scroll end).
const WALL_POSTER_ROW_LEADING_OFFSET_RATIO = 0.38
// Extra tiles beyond the computed coverage absorb the 3D tilt and float animation of the wall.
const WALL_POSTER_ROW_BUFFER_TILES = 2

const wallPosterGridStreamStates = new WeakMap<HTMLElement, WallPosterGridStreamState>()
const wallPosterTileIdentityByElement = new WeakMap<object, string>()
const wallPosterTileWriteSequenceByElement = new WeakMap<object, number>()

interface WallPosterGridStreamElement extends HTMLElement {
  [WALL_POSTER_GRID_STREAM_APPLIER_KEY]?: WallPosterGridStreamApplier
}

export function toWallPosterMediaIdentity(item: Pick<MediaItem, "providerId" | "id">): string {
  return `${item.providerId.trim()}::${item.id.trim()}`
}

export function getWallPosterTileMediaIdentity(tile: object): string | null {
  return wallPosterTileIdentityByElement.get(tile) ?? null
}

function createWallPosterItemIndexByIdentity(items: readonly MediaItem[]): Map<string, number> {
  const identityToIndex = new Map<string, number>()

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!item) {
      continue
    }

    identityToIndex.set(toWallPosterMediaIdentity(item), index)
  }

  return identityToIndex
}

export function collectIncomingWallPosterItems(
  previousItems: readonly MediaItem[],
  nextItems: readonly MediaItem[]
): MediaItem[] {
  const previousIdentities = new Set(previousItems.map((item) => toWallPosterMediaIdentity(item)))
  const incomingItems: MediaItem[] = []
  const seenIncomingIdentities = new Set<string>()

  for (const item of nextItems) {
    const mediaIdentity = toWallPosterMediaIdentity(item)
    if (previousIdentities.has(mediaIdentity) || seenIncomingIdentities.has(mediaIdentity)) {
      continue
    }

    seenIncomingIdentities.add(mediaIdentity)
    incomingItems.push(item)
  }

  return incomingItems
}

function dedupeWallPosterItemsByIdentity(items: readonly MediaItem[]): MediaItem[] {
  const dedupedItems: MediaItem[] = []
  const seenIdentities = new Set<string>()

  for (const item of items) {
    const mediaIdentity = toWallPosterMediaIdentity(item)
    if (seenIdentities.has(mediaIdentity)) {
      continue
    }

    seenIdentities.add(mediaIdentity)
    dedupedItems.push(item)
  }

  return dedupedItems
}

export function collectPendingWallPosterIncomingItems(
  previousItems: readonly MediaItem[],
  nextItems: readonly MediaItem[],
  pendingIncomingItems: readonly MediaItem[]
): MediaItem[] {
  const mergedPendingItems = dedupeWallPosterItemsByIdentity(pendingIncomingItems)
  const queuedIdentities = new Set(mergedPendingItems.map((item) => toWallPosterMediaIdentity(item)))

  for (const incomingItem of collectIncomingWallPosterItems(previousItems, nextItems)) {
    const mediaIdentity = toWallPosterMediaIdentity(incomingItem)
    if (queuedIdentities.has(mediaIdentity)) {
      continue
    }

    queuedIdentities.add(mediaIdentity)
    mergedPendingItems.push(incomingItem)
  }

  return mergedPendingItems
}

export function createWallPosterEntryEdgeIndices(
  tileCount: number,
  direction: WallPosterRowDirection
): number[] {
  if (tileCount <= 0) {
    return []
  }

  if (direction === "normal") {
    return Array.from({ length: tileCount }, (_, index) => tileCount - 1 - index)
  }

  return Array.from({ length: tileCount }, (_, index) => index)
}

function normalizeWallPosterRect(rect: WallPosterRect): WallPosterRect {
  const rawLeft = Number.isFinite(rect.left) ? rect.left : 0
  const rawRight = Number.isFinite(rect.right) ? rect.right : 0
  const rawTop = Number.isFinite(rect.top) ? rect.top : 0
  const rawBottom = Number.isFinite(rect.bottom) ? rect.bottom : 0

  return {
    left: Math.min(rawLeft, rawRight),
    right: Math.max(rawLeft, rawRight),
    top: Math.min(rawTop, rawBottom),
    bottom: Math.max(rawTop, rawBottom)
  }
}

function intersectsWallPosterViewport(
  viewportRect: WallPosterRect,
  tileRect: WallPosterRect
): boolean {
  return tileRect.right > viewportRect.left
    && tileRect.left < viewportRect.right
    && tileRect.bottom > viewportRect.top
    && tileRect.top < viewportRect.bottom
}

function isWallPosterEntrySideWritable(
  viewportRect: WallPosterRect,
  tileRect: WallPosterRect,
  direction: WallPosterRowDirection
): boolean {
  if (direction === "normal") {
    return tileRect.left >= viewportRect.right
  }

  return tileRect.right <= viewportRect.left
}

function resolveWallPosterEntrySideDistance(
  viewportRect: WallPosterRect,
  tileRect: WallPosterRect,
  direction: WallPosterRowDirection
): number {
  if (direction === "normal") {
    return tileRect.left - viewportRect.right
  }

  return viewportRect.left - tileRect.right
}

export function collectVisibleWallPosterTileIndices(
  viewportRect: WallPosterRect,
  tileRects: readonly (WallPosterRect | null | undefined)[]
): number[] {
  const normalizedViewportRect = normalizeWallPosterRect(viewportRect)
  const visibleIndices: number[] = []

  for (let tileIndex = 0; tileIndex < tileRects.length; tileIndex += 1) {
    const tileRect = tileRects[tileIndex]
    if (!tileRect) {
      continue
    }

    if (intersectsWallPosterViewport(normalizedViewportRect, normalizeWallPosterRect(tileRect))) {
      visibleIndices.push(tileIndex)
    }
  }

  return visibleIndices
}

function resolveWallPosterExitSideDistance(
  viewportRect: WallPosterRect,
  tileRect: WallPosterRect,
  direction: WallPosterRowDirection
): number {
  if (direction === "normal") {
    return viewportRect.left - tileRect.right
  }

  return tileRect.left - viewportRect.right
}

/**
 * Off-screen tiles that may receive a new poster. Tiles about to scroll in (entry side, nearest
 * first) come before tiles that already scrolled out, which come back into view when the row
 * animation loops. Tiles intersecting the viewport are never returned.
 */
export function collectReplaceableWallPosterTileIndices(
  viewportRect: WallPosterRect,
  tileRects: readonly (WallPosterRect | null | undefined)[],
  direction: WallPosterRowDirection
): number[] {
  const normalizedViewportRect = normalizeWallPosterRect(viewportRect)
  const entrySide: Array<{ tileIndex: number, distance: number }> = []
  const exitSide: Array<{ tileIndex: number, distance: number }> = []

  for (let tileIndex = 0; tileIndex < tileRects.length; tileIndex += 1) {
    const tileRect = tileRects[tileIndex]
    if (!tileRect) {
      continue
    }

    const normalizedTileRect = normalizeWallPosterRect(tileRect)
    if (intersectsWallPosterViewport(normalizedViewportRect, normalizedTileRect)) {
      continue
    }

    if (isWallPosterEntrySideWritable(normalizedViewportRect, normalizedTileRect, direction)) {
      entrySide.push({
        tileIndex,
        distance: resolveWallPosterEntrySideDistance(normalizedViewportRect, normalizedTileRect, direction)
      })
      continue
    }

    exitSide.push({
      tileIndex,
      distance: resolveWallPosterExitSideDistance(normalizedViewportRect, normalizedTileRect, direction)
    })
  }

  const byDistance = (
    left: { tileIndex: number, distance: number },
    right: { tileIndex: number, distance: number }
  ): number => left.distance - right.distance || left.tileIndex - right.tileIndex

  return [...entrySide.sort(byDistance), ...exitSide.sort(byDistance)].map(({ tileIndex }) => tileIndex)
}

export function consumeWallPosterIncomingRowIndex(
  rowCount: number,
  nextRowPointer: number
): {
  rowIndex: number | null
  nextRowPointer: number
} {
  const normalizedRowCount = Number.isFinite(rowCount)
    ? Math.max(Math.trunc(rowCount), 0)
    : 0
  if (normalizedRowCount === 0) {
    return {
      rowIndex: null,
      nextRowPointer: 0
    }
  }

  const normalizedPointerBase = Number.isFinite(nextRowPointer)
    ? Math.trunc(nextRowPointer)
    : 0
  const normalizedPointer =
    ((normalizedPointerBase % normalizedRowCount) + normalizedRowCount)
    % normalizedRowCount

  return {
    rowIndex: normalizedPointer,
    nextRowPointer: (normalizedPointer + 1) % normalizedRowCount
  }
}

function resolveWallPosterViewportExtent(value: number, fallback: number): number {
  return Number.isFinite(value)
    ? Math.max(Math.trunc(value), 1)
    : fallback
}

function resolveCurrentWallPosterViewportRect(): WallPosterRect {
  if (typeof window === "undefined") {
    return {
      left: 0,
      right: 1920,
      top: 0,
      bottom: 1080
    }
  }

  return {
    left: 0,
    right: resolveWallPosterViewportExtent(window.innerWidth, 1920),
    top: 0,
    bottom: resolveWallPosterViewportExtent(window.innerHeight, 1080)
  }
}

function toWallPosterFiniteRectValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null
}

function toWallPosterRectCandidate(
  rectCandidate: Partial<WallPosterRect> | null | undefined
): WallPosterRect | null {
  if (!rectCandidate) {
    return null
  }

  const left = toWallPosterFiniteRectValue(rectCandidate.left)
  const right = toWallPosterFiniteRectValue(rectCandidate.right)
  const top = toWallPosterFiniteRectValue(rectCandidate.top)
  const bottom = toWallPosterFiniteRectValue(rectCandidate.bottom)
  if (left === null || right === null || top === null || bottom === null) {
    return null
  }

  return {
    left,
    right,
    top,
    bottom
  }
}

function resolveWallPosterTileRect(tile: object): WallPosterRect | null {
  const tileWithRectSource = tile as Partial<WallPosterRect> & {
    getBoundingClientRect?: () => Partial<WallPosterRect> | null | undefined
  }

  if (typeof tileWithRectSource.getBoundingClientRect === "function") {
    const snapshotRect = toWallPosterRectCandidate(tileWithRectSource.getBoundingClientRect())
    if (snapshotRect) {
      return snapshotRect
    }
  }

  return toWallPosterRectCandidate(tileWithRectSource)
}

function collectWallPosterTileRects(
  tileStates: readonly WallPosterTileState[]
): Array<WallPosterRect | null> {
  return tileStates.map((tileState) => resolveWallPosterTileRect(tileState.tile))
}

function resolveWallPosterRowDirection(entryIndices: readonly number[]): WallPosterRowDirection {
  let firstEntryIndex: number | null = null
  let lastEntryIndex: number | null = null

  for (const entryIndex of entryIndices) {
    if (typeof entryIndex === "number") {
      firstEntryIndex = entryIndex
      break
    }
  }

  for (let index = entryIndices.length - 1; index >= 0; index -= 1) {
    const entryIndex = entryIndices[index]
    if (typeof entryIndex === "number") {
      lastEntryIndex = entryIndex
      break
    }
  }

  if (
    typeof firstEntryIndex === "number"
    && typeof lastEntryIndex === "number"
    && firstEntryIndex < lastEntryIndex
  ) {
    return "reverse"
  }

  return "normal"
}

function collectReplaceableWallPosterRowTileIndices(
  rowState: WallPosterGridRowState,
  viewportRect: WallPosterRect
): number[] {
  return collectReplaceableWallPosterTileIndices(
    viewportRect,
    collectWallPosterTileRects(rowState.tiles),
    resolveWallPosterRowDirection(rowState.entryIndices)
  )
}

function applyWallPosterTileMedia(tileState: WallPosterTileState, item: MediaItem): void {
  tileState.posterThumb.style.backgroundImage = `url(${item.poster.url})`
  wallPosterTileIdentityByElement.set(tileState.tile, toWallPosterMediaIdentity(item))
}

function countWallPosterTileIdentities(rows: readonly WallPosterGridRowState[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const rowState of rows) {
    for (const tileState of rowState.tiles) {
      const identity = wallPosterTileIdentityByElement.get(tileState.tile)
      if (identity) {
        counts.set(identity, (counts.get(identity) ?? 0) + 1)
      }
    }
  }

  return counts
}

/**
 * Picks the tile for the next incoming poster: rows take turns. Within a row an off-screen tile
 * showing a poster that is also on another tile goes first, then an on-screen one, then the
 * off-screen tile written longest ago. An on-screen tile with a poster shown only there is kept.
 */
function takeReplaceableWallPosterTile(
  streamState: WallPosterGridStreamState,
  replaceableIndicesByRow: readonly (readonly number[])[],
  usedTiles: Set<object>,
  identityCounts: ReadonlyMap<string, number>
): WallPosterTileState | null {
  for (let attempt = 0; attempt < streamState.rows.length; attempt += 1) {
    const rowSelection = consumeWallPosterIncomingRowIndex(
      streamState.rows.length,
      streamState.nextIncomingRowPointer
    )
    streamState.nextIncomingRowPointer = rowSelection.nextRowPointer
    if (rowSelection.rowIndex === null) {
      return null
    }

    const rowState = streamState.rows[rowSelection.rowIndex]
    const offScreenIndices = replaceableIndicesByRow[rowSelection.rowIndex] ?? []
    const offScreenIndexSet = new Set(offScreenIndices)
    const rowTiles = rowState?.tiles ?? []
    // Off-screen tiles in their write order (entry side nearest first), then the on-screen ones.
    const candidateIndices = [
      ...offScreenIndices,
      ...rowTiles.map((_, tileIndex) => tileIndex).filter((tileIndex) => !offScreenIndexSet.has(tileIndex))
    ]
    let best: { tileState: WallPosterTileState, rank: number, sequence: number } | null = null

    for (const tileIndex of candidateIndices) {
      const tileState = rowTiles[tileIndex]
      if (!tileState || usedTiles.has(tileState.tile)) {
        continue
      }

      const identity = wallPosterTileIdentityByElement.get(tileState.tile)
      const isDuplicate = identity !== undefined && (identityCounts.get(identity) ?? 0) > 1
      const isOffScreen = offScreenIndexSet.has(tileIndex)
      // On-screen tiles are left alone unless they repeat a poster shown elsewhere (a wall that
      // was first drawn from a pool smaller than itself): then a poster that is not on the wall
      // yet is the better picture.
      const rank = isOffScreen ? (isDuplicate ? 0 : 2) : (isDuplicate ? 1 : null)
      if (rank === null) {
        continue
      }

      const sequence = wallPosterTileWriteSequenceByElement.get(tileState.tile) ?? 0
      if (
        best === null
        || rank < best.rank
        || (rank === best.rank && sequence < best.sequence)
      ) {
        best = { tileState, rank, sequence }
      }
    }

    if (best) {
      usedTiles.add(best.tileState.tile)
      return best.tileState
    }
  }

  return null
}

function createWallPosterGridStreamApplyResult(
  status: WallPosterGridStreamApplyStatus,
  queuedItemCount: number,
  appliedItemCount: number,
  pendingItemCount: number
): WallPosterGridStreamApplyResult {
  return {
    status,
    queuedItemCount,
    appliedItemCount,
    pendingItemCount
  }
}

export function applyWallPosterGridStreamState(
  streamState: WallPosterGridStreamState,
  items: readonly MediaItem[]
): WallPosterGridStreamApplyResult {
  const previousItems = streamState.items
  const nextItems = [...items]
  streamState.items = nextItems
  streamState.itemIndexByIdentity = createWallPosterItemIndexByIdentity(nextItems)
  streamState.pendingIncomingItems = collectPendingWallPosterIncomingItems(
    previousItems,
    nextItems,
    streamState.pendingIncomingItems
  )

  const queuedItemCount = streamState.pendingIncomingItems.length
  if (queuedItemCount === 0) {
    return createWallPosterGridStreamApplyResult("noop", 0, 0, 0)
  }

  if (streamState.rows.length === 0) {
    return createWallPosterGridStreamApplyResult("deferred", queuedItemCount, 0, queuedItemCount)
  }

  const viewportRect = resolveCurrentWallPosterViewportRect()
  const replaceableIndicesByRow = streamState.rows.map((rowState) => {
    return collectReplaceableWallPosterRowTileIndices(rowState, viewportRect)
  })
  const identityCounts = countWallPosterTileIdentities(streamState.rows)
  const usedTiles = new Set<object>()
  const nextPendingIncomingItems: MediaItem[] = []
  let appliedItemCount = 0

  for (const incomingItem of streamState.pendingIncomingItems) {
    const incomingIdentity = toWallPosterMediaIdentity(incomingItem)
    // Already on a tile: a second copy would only add repetition.
    if ((identityCounts.get(incomingIdentity) ?? 0) > 0) {
      continue
    }

    const tileState = takeReplaceableWallPosterTile(
      streamState,
      replaceableIndicesByRow,
      usedTiles,
      identityCounts
    )
    if (!tileState) {
      nextPendingIncomingItems.push(incomingItem)
      continue
    }

    const replacedIdentity = wallPosterTileIdentityByElement.get(tileState.tile)
    if (replacedIdentity) {
      const remaining = (identityCounts.get(replacedIdentity) ?? 1) - 1
      if (remaining > 0) {
        identityCounts.set(replacedIdentity, remaining)
      } else {
        identityCounts.delete(replacedIdentity)
      }
    }

    applyWallPosterTileMedia(tileState, incomingItem)
    streamState.nextWriteSequence += 1
    wallPosterTileWriteSequenceByElement.set(tileState.tile, streamState.nextWriteSequence)
    identityCounts.set(incomingIdentity, 1)
    appliedItemCount += 1
  }

  streamState.pendingIncomingItems = nextPendingIncomingItems

  if (appliedItemCount > 0) {
    return createWallPosterGridStreamApplyResult(
      "applied",
      queuedItemCount,
      appliedItemCount,
      nextPendingIncomingItems.length
    )
  }

  if (nextPendingIncomingItems.length === 0) {
    return createWallPosterGridStreamApplyResult("noop", queuedItemCount, 0, 0)
  }

  return createWallPosterGridStreamApplyResult(
    "deferred",
    queuedItemCount,
    0,
    nextPendingIncomingItems.length
  )
}

export function applyWallPosterGridStreamItems(
  posterGrid: HTMLElement,
  items: readonly MediaItem[]
): WallPosterGridStreamApplyResult {
  const streamState = wallPosterGridStreamStates.get(posterGrid)
  if (!streamState) {
    return createWallPosterGridStreamApplyResult("unavailable", 0, 0, 0)
  }

  return applyWallPosterGridStreamState(streamState, items)
}

function toWallPosterRowShuffleSeed(rowIndex: number, itemCount: number): number {
  const normalizedRowIndex = Number.isFinite(rowIndex)
    ? Math.max(Math.trunc(rowIndex), 0)
    : 0
  const normalizedItemCount = Number.isFinite(itemCount)
    ? Math.max(Math.trunc(itemCount), 0)
    : 0
  const rowSeed = Math.imul(normalizedRowIndex + 1, 2_654_435_761)
  const itemCountSeed = Math.imul(normalizedItemCount + 1, 2_246_822_519)
  return (rowSeed ^ itemCountSeed) >>> 0
}

function createSeededWallPosterShuffleRandom(seed: number): () => number {
  let generatorState = seed >>> 0

  return () => {
    generatorState = (Math.imul(generatorState, 1_664_525) + 1_013_904_223) >>> 0
    return generatorState / 4_294_967_296
  }
}

export function createWallPosterRowOrder(length: number, rowIndex: number): number[] {
  const normalizedLength = Number.isFinite(length)
    ? Math.max(Math.trunc(length), 0)
    : 0
  const indices = Array.from({ length: normalizedLength }, (_, index) => index)
  const nextRandom = createSeededWallPosterShuffleRandom(
    toWallPosterRowShuffleSeed(rowIndex, normalizedLength)
  )

  for (let index = indices.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(nextRandom() * (index + 1))
    const currentValue = indices[index]
    const randomValue = indices[randomIndex]

    if (typeof currentValue !== "number" || typeof randomValue !== "number") {
      continue
    }

    indices[index] = randomValue
    indices[randomIndex] = currentValue
  }

  return indices
}

/**
 * Tiles per row so that the row covers the viewport at every point of its scroll animation, plus a
 * small buffer for the wall's 3D tilt. Tiles past this point would never be on screen.
 */
export function resolveWallPosterRowTileCount(viewportWidth: number): number {
  const normalizedWidth = Number.isFinite(viewportWidth) ? Math.max(viewportWidth, 1) : 1920
  const coveredWidthPx =
    normalizedWidth * (WALL_POSTER_ROW_LEADING_OFFSET_RATIO + 1 + WALL_POSTER_ROW_SHIFT_RATIO)

  return Math.ceil(coveredWidthPx / WALL_POSTER_TILE_STRIDE_PX) + WALL_POSTER_ROW_BUFFER_TILES
}

// Enough rows to cover the tilted wall vertically (5 at 1080p, 8 at 2160p).
export function resolveWallPosterRowCount(viewportHeight: number): number {
  const normalizedHeight = Number.isFinite(viewportHeight) ? Math.max(viewportHeight, 1) : 1080
  return Math.max(5, Math.min(10, Math.ceil((normalizedHeight * 1.25) / 340)))
}

export function resolveWallPosterTileCount(viewportWidth: number, viewportHeight: number): number {
  return resolveWallPosterRowCount(viewportHeight) * resolveWallPosterRowTileCount(viewportWidth)
}

function readWallPosterViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 1920, height: 1080 }
  }

  return { width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) }
}

// Tile count of a wall built for the current window (90 at 1920x1080, 272 at 3840x2160).
export function resolveWallPosterViewportTileCount(): number {
  const viewport = readWallPosterViewportSize()
  return resolveWallPosterTileCount(viewport.width, viewport.height)
}

/**
 * Order in which the wall's tiles (row-major indices) receive posters. Columns near the middle of
 * the scroll range never leave the screen, so a poster placed there can never be swapped out
 * unseen; they are filled first, which keeps any repeats (more tiles than posters) on the row ends
 * that scroll off screen and get replaced.
 */
export function createWallPosterTileFillOrder(
  rowCount: number,
  tilesPerRow: number,
  viewportWidth: number
): number[] {
  const normalizedWidth = Number.isFinite(viewportWidth) ? Math.max(viewportWidth, 1) : 1920
  const alwaysVisibleCenterColumn = (
    normalizedWidth * (WALL_POSTER_ROW_LEADING_OFFSET_RATIO + 0.5 + WALL_POSTER_ROW_SHIFT_RATIO / 2)
  ) / WALL_POSTER_TILE_STRIDE_PX
  const tiles: Array<{ wallTileIndex: number, distance: number, rowIndex: number }> = []

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < tilesPerRow; columnIndex += 1) {
      tiles.push({
        wallTileIndex: rowIndex * tilesPerRow + columnIndex,
        distance: Math.abs(columnIndex + 0.5 - alwaysVisibleCenterColumn),
        rowIndex
      })
    }
  }

  return tiles
    .sort((left, right) => left.distance - right.distance || left.rowIndex - right.rowIndex)
    .map(({ wallTileIndex }) => wallTileIndex)
}

export function createWallHeadingSection(
  createElement: ElementFactory,
  handoff: WallHandoff,
  options: { controlsHidden: boolean }
): {
  heading: HTMLHeadingElement
  libraries: HTMLParagraphElement
  preferences: HTMLParagraphElement
} {
  // Inject OLED protection keyframes if not already present
  if (typeof document !== "undefined" && !document.getElementById("mps-oled-protection-styles")) {
    const styleTag = document.createElement("style")
    styleTag.id = "mps-oled-protection-styles"
    styleTag.textContent = `
      @keyframes mps-oled-pixel-shift {
        0% { transform: translate(0, 0); }
        25% { transform: translate(12px, 8px); }
        50% { transform: translate(-8px, 15px); }
        75% { transform: translate(-14px, -6px); }
        100% { transform: translate(0, 0); }
      }
      @keyframes mps-oled-breathing {
        0%, 100% { filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3)) brightness(1); }
        50% { filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3)) brightness(0.7); }
      }
    `
    document.head.append(styleTag)
  }

  const now = new Date()
  const clockText = now.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  })

  const heading = createElement("h1", {
    textContent: clockText,
    testId: "wall-clock-heading"
  })
  heading.style.margin = "0"
  heading.style.position = "fixed"
  heading.style.left = "2.6rem"
  heading.style.bottom = "2.4rem"
  heading.style.zIndex = "101"
  heading.style.fontFamily = "var(--mps-font-body)"
  heading.style.fontSize = "clamp(3.5rem, 8vw, 7.5rem)"
  heading.style.fontWeight = "300"
  heading.style.lineHeight = "0.9"
  heading.style.letterSpacing = "-0.05em"
  heading.style.color = "transparent"
  heading.style.backgroundImage = "linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.5) 100%)"
  heading.style.backgroundClip = "text"
  heading.style.setProperty("-webkit-background-clip", "text")
  heading.style.setProperty("-webkit-text-fill-color", "transparent")
  heading.style.filter = "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3))"
  heading.style.pointerEvents = "none"

  // OLED Protection logic
  heading.style.transition = "opacity 1.2s ease-in-out, filter 1.2s ease-in-out"
  heading.style.opacity = options.controlsHidden ? "0.22" : "0.85"
  heading.style.animation = [
    "mps-oled-pixel-shift 600s linear infinite",
    "mps-oled-breathing 15s ease-in-out infinite"
  ].join(",")

  const libraries = createElement("p", {
    textContent: `Libraries selected: ${handoff.selectedLibraryIds.join(", ") || "none"}`,
    testId: "wall-selected-libraries"
  })
  libraries.style.margin = "0"
  libraries.style.position = "fixed"
  libraries.style.left = "3.1rem"
  libraries.style.bottom = "4.4rem"
  libraries.style.zIndex = "101"
  libraries.style.width = "min(30rem, calc(100vw - 6rem))"
  libraries.style.padding = "0.6rem 0"
  libraries.style.fontFamily = "var(--mps-font-mono)"
  libraries.style.fontSize = "0.64rem"
  libraries.style.letterSpacing = "0.09em"
  libraries.style.textTransform = "uppercase"
  libraries.style.color = "rgba(255, 255, 255, 0.56)"
  libraries.style.pointerEvents = "none"
  libraries.style.display = "none"

  const preferences = createElement("p", {
    textContent: `Remember server: ${handoff.preferences.rememberServer ? "yes" : "no"}; remember username: ${handoff.preferences.rememberUsername ? "yes" : "no"}; remember password: ${handoff.preferences.rememberPasswordRequested ? "yes" : "no"}.`
  })
  preferences.style.margin = "0"
  preferences.style.position = "fixed"
  preferences.style.left = "3.1rem"
  preferences.style.bottom = "2.8rem"
  preferences.style.zIndex = "101"
  preferences.style.width = "min(30rem, calc(100vw - 6rem))"
  preferences.style.padding = "0"
  preferences.style.fontFamily = "var(--mps-font-mono)"
  preferences.style.fontSize = "0.6rem"
  preferences.style.letterSpacing = "0.07em"
  preferences.style.textTransform = "uppercase"
  preferences.style.color = "rgba(255, 255, 255, 0.4)"
  preferences.style.pointerEvents = "none"
  preferences.style.display = "none"

  return {
    heading,
    libraries,
    preferences
  }
}

export function createWallIngestionSummarySection(
  createElement: ElementFactory,
  options: {
    ingestionItemCount: number
    ingestionStatus: "idle" | "refreshing" | "ready" | "error"
    ingestionTrigger: string | null
    ingestionFetchedAt: string | null
  }
): HTMLParagraphElement {
  const ingestionSummary = createElement("p", {
    textContent:
      `Ingested posters: ${options.ingestionItemCount}; `
      + `status: ${options.ingestionStatus}; `
      + `trigger: ${options.ingestionTrigger ?? "n/a"}; `
      + `last refresh: ${options.ingestionFetchedAt ?? "pending"}.`,
    testId: "wall-ingestion-summary"
  })
  ingestionSummary.style.margin = "0"
  ingestionSummary.style.position = "fixed"
  ingestionSummary.style.left = "3.1rem"
  ingestionSummary.style.bottom = "1.2rem"
  ingestionSummary.style.zIndex = "101"
  ingestionSummary.style.width = "min(30rem, calc(100vw - 6rem))"
  ingestionSummary.style.padding = "0"
  ingestionSummary.style.color = "rgba(255, 255, 255, 0.36)"
  ingestionSummary.style.fontFamily = "var(--mps-font-mono)"
  ingestionSummary.style.fontSize = "0.58rem"
  ingestionSummary.style.letterSpacing = "0.05em"
  ingestionSummary.style.textTransform = "uppercase"
  ingestionSummary.style.pointerEvents = "none"
  ingestionSummary.style.display = "none"

  return ingestionSummary
}

export function createWallPosterGridSection(
  createElement: ElementFactory,
  options: {
    items: MediaItem[]
  }
): HTMLElement {
  const posterGrid = createElement("section", { testId: "wall-poster-grid" })
  posterGrid.style.position = "relative"
  posterGrid.style.zIndex = "2"
  posterGrid.style.display = "flex"
  posterGrid.style.flexDirection = "column"
  posterGrid.style.gap = "2.5rem"
  posterGrid.style.width = "168vw"
  posterGrid.style.maxWidth = "none"
  posterGrid.style.marginLeft = "-8vw"
  posterGrid.style.marginTop = "-6vh"
  posterGrid.style.transformStyle = "preserve-3d"
  posterGrid.style.transform = "rotateX(15deg) rotateY(-2deg)"
  posterGrid.style.animation = "mps-wall-scene-float 30s infinite alternate ease-in-out"

  const streamState: WallPosterGridStreamState = {
    items: [...options.items],
    itemIndexByIdentity: createWallPosterItemIndexByIdentity(options.items),
    nextIncomingRowPointer: 0,
    pendingIncomingItems: [],
    rows: [],
    nextWriteSequence: 0
  }

  wallPosterGridStreamStates.set(posterGrid, streamState)
  const streamPosterGrid = posterGrid as WallPosterGridStreamElement
  streamPosterGrid[WALL_POSTER_GRID_STREAM_APPLIER_KEY] = (items) => {
    return applyWallPosterGridStreamItems(posterGrid, items)
  }

  if (options.items.length === 0) {
    const emptyPosterState = createElement("p", {
      textContent: "No posters ingested yet. Try manual refresh once ingestion is ready."
    })
    emptyPosterState.style.margin = "0"
    emptyPosterState.style.padding = "0.9rem"
    emptyPosterState.style.borderRadius = "0.7rem"
    emptyPosterState.style.border = "1px dashed rgba(255, 255, 255, 0.22)"
    emptyPosterState.style.color = "rgba(255, 255, 255, 0.7)"
    emptyPosterState.style.background = "rgba(10, 12, 18, 0.7)"
    posterGrid.append(emptyPosterState)
    return posterGrid
  }

  const { width: viewportWidth, height: viewportHeight } = readWallPosterViewportSize()
  const rowCount = resolveWallPosterRowCount(viewportHeight)
  const tilesPerRow = resolveWallPosterRowTileCount(viewportWidth)
  // One shuffle laid across the whole wall: a poster repeats only when the wall has more tiles
  // than there are posters, and the repeats land on tiles that scroll off screen.
  const wallOrder = createWallPosterRowOrder(options.items.length, 0)
  const itemOrderByWallTile = new Map<number, number>()
  createWallPosterTileFillOrder(rowCount, tilesPerRow, viewportWidth).forEach((wallTileIndex, fillIndex) => {
    itemOrderByWallTile.set(wallTileIndex, fillIndex % Math.max(wallOrder.length, 1))
  })
  const labelledItemIndices = new Set<number>()
  const baseDurations = [84, 96, 90, 104, 88, 100, 86, 102, 92, 108]
  const fixedSpeedScale = 1.8

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = createElement("div")
    const rowDirection: WallPosterRowDirection = rowIndex % 2 === 0 ? "normal" : "reverse"
    const rowTileStates: WallPosterTileState[] = []
    row.style.display = "flex"
    row.style.gap = "2.5rem"
    row.style.width = "max-content"
    row.style.setProperty(
      "--mps-row-shift-end",
      `-${Math.round(viewportWidth * WALL_POSTER_ROW_SHIFT_RATIO)}px`
    )
    const rowDurationSeconds = (baseDurations[rowIndex] ?? 78) * fixedSpeedScale
    row.style.animation = `mps-wall-row-scroll ${rowDurationSeconds}s linear infinite`
    row.style.animationDirection = rowDirection

    for (let columnIndex = 0; columnIndex < tilesPerRow; columnIndex += 1) {
      const wallTileIndex = rowIndex * tilesPerRow + columnIndex
      const mappedIndex = wallOrder[itemOrderByWallTile.get(wallTileIndex) ?? 0]
      if (typeof mappedIndex !== "number") {
        continue
      }

      const item = options.items[mappedIndex]
      if (!item) {
        continue
      }

      const isFirstTileForItem = !labelledItemIndices.has(mappedIndex)
      labelledItemIndices.add(mappedIndex)
      const tile = createElement("button", {
        ...(isFirstTileForItem ? { testId: `poster-item-${mappedIndex}` } : {})
      }) as HTMLButtonElement
      tile.type = "button"
      tile.tabIndex = -1
      tile.style.width = "200px"
      tile.style.height = "300px"
      tile.style.padding = "0"
      tile.style.borderRadius = "16px"
      tile.style.overflow = "hidden"
      tile.style.flexShrink = "0"
      tile.style.position = "relative"
      tile.style.transformStyle = "preserve-3d"
      tile.style.cursor = "default"
      tile.style.background = "#111"
      tile.style.border = "1px solid rgba(255, 255, 255, 0.05)"
      tile.style.boxShadow = "0 20px 50px rgba(0, 0, 0, 0.8)"
      tile.style.transition = "transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.8s ease"

      const posterThumb = createElement("div")
      posterThumb.style.width = "100%"
      posterThumb.style.height = "100%"
      posterThumb.style.backgroundSize = "cover"
      posterThumb.style.backgroundPosition = "center"
      posterThumb.style.filter = "grayscale(20%) brightness(0.8)"
      posterThumb.style.transition = "filter 0.8s ease"

      const tileState: WallPosterTileState = {
        tile,
        posterThumb
      }
      applyWallPosterTileMedia(tileState, item)

      tile.append(posterThumb)
      bindMouseOnlyHover(tile, () => {
        tile.style.transform = "translateZ(50px) scale(1.05)"
        tile.style.borderColor = "rgba(255, 255, 255, 0.2)"
        posterThumb.style.filter = "grayscale(0%) brightness(1.1)"
      }, () => {
        tile.style.transform = "translateZ(0) scale(1)"
        tile.style.borderColor = "rgba(255, 255, 255, 0.05)"
        posterThumb.style.filter = "grayscale(20%) brightness(0.8)"
      })

      row.append(tile)
      rowTileStates.push(tileState)
    }

    posterGrid.append(row)
    streamState.rows.push({
      entryIndices: createWallPosterEntryEdgeIndices(rowTileStates.length, rowDirection),
      tiles: rowTileStates
    })
  }

  return posterGrid
}
