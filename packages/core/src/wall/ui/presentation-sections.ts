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

export interface WallPosterEntryBufferEligibility {
  visibleIndices: number[]
  entrySideWritableIndices: number[]
  orderedWritableIndices: number[]
}

export interface WallPosterTileState {
  tile: object
  posterThumb: Pick<HTMLElement, "style">
}

export interface WallPosterGridRowState {
  entryIndices: number[]
  nextEntryPointer: number
  tiles: WallPosterTileState[]
}

export interface WallPosterGridStreamState {
  items: MediaItem[]
  itemIndexByIdentity: Map<string, number>
  nextIncomingRowPointer: number
  pendingIncomingItems: MediaItem[]
  rows: WallPosterGridRowState[]
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
export const WALL_POSTER_ENTRY_BUFFER_LIMIT = 2 as const

const wallPosterGridStreamStates = new WeakMap<HTMLElement, WallPosterGridStreamState>()
const wallPosterTileIdentityByElement = new WeakMap<object, string>()

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

export function collectEntrySideWallPosterWritableIndices(
  viewportRect: WallPosterRect,
  tileRects: readonly (WallPosterRect | null | undefined)[],
  direction: WallPosterRowDirection
): number[] {
  const normalizedViewportRect = normalizeWallPosterRect(viewportRect)
  const entryIndices = createWallPosterEntryEdgeIndices(tileRects.length, direction)
  const writableIndices: number[] = []

  for (const tileIndex of entryIndices) {
    const tileRect = tileRects[tileIndex]
    if (!tileRect) {
      continue
    }

    const normalizedTileRect = normalizeWallPosterRect(tileRect)
    if (intersectsWallPosterViewport(normalizedViewportRect, normalizedTileRect)) {
      continue
    }

    if (!isWallPosterEntrySideWritable(normalizedViewportRect, normalizedTileRect, direction)) {
      continue
    }

    writableIndices.push(tileIndex)
  }

  return writableIndices
}

export function collectOrderedWallPosterWritableIndices(
  viewportRect: WallPosterRect,
  tileRects: readonly (WallPosterRect | null | undefined)[],
  direction: WallPosterRowDirection,
  maxWritableCount = WALL_POSTER_ENTRY_BUFFER_LIMIT
): number[] {
  const normalizedMaxWritableCount = Number.isFinite(maxWritableCount)
    ? Math.max(Math.trunc(maxWritableCount), 0)
    : 0
  if (normalizedMaxWritableCount === 0) {
    return []
  }

  const normalizedViewportRect = normalizeWallPosterRect(viewportRect)

  return collectEntrySideWallPosterWritableIndices(normalizedViewportRect, tileRects, direction)
    .map((tileIndex, candidateOrder) => {
      const tileRect = tileRects[tileIndex]
      return {
        tileIndex,
        candidateOrder,
        distance: tileRect
          ? resolveWallPosterEntrySideDistance(
            normalizedViewportRect,
            normalizeWallPosterRect(tileRect),
            direction
          )
          : Number.POSITIVE_INFINITY
      }
    })
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance
      }

      return left.candidateOrder - right.candidateOrder
    })
    .slice(0, normalizedMaxWritableCount)
    .map(({ tileIndex }) => tileIndex)
}

export function resolveWallPosterEntryBufferEligibility(
  viewportRect: WallPosterRect,
  tileRects: readonly (WallPosterRect | null | undefined)[],
  direction: WallPosterRowDirection,
  maxWritableCount = WALL_POSTER_ENTRY_BUFFER_LIMIT
): WallPosterEntryBufferEligibility {
  return {
    visibleIndices: collectVisibleWallPosterTileIndices(viewportRect, tileRects),
    entrySideWritableIndices: collectEntrySideWallPosterWritableIndices(
      viewportRect,
      tileRects,
      direction
    ),
    orderedWritableIndices: collectOrderedWallPosterWritableIndices(
      viewportRect,
      tileRects,
      direction,
      maxWritableCount
    )
  }
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

interface WallPosterGridRowWritableSnapshot {
  orderedWritableIndices: number[]
  consumedWritableOrders: Set<number>
}

function resolveWallPosterGridRowEligibilityFromCurrentGeometry(
  rowState: WallPosterGridRowState,
  viewportRect: WallPosterRect
): WallPosterEntryBufferEligibility {
  const rowDirection = resolveWallPosterRowDirection(rowState.entryIndices)

  return resolveWallPosterEntryBufferEligibility(
    viewportRect,
    collectWallPosterTileRects(rowState.tiles),
    rowDirection
  )
}

function createWallPosterGridRowWritableSnapshot(
  rowState: WallPosterGridRowState,
  viewportRect: WallPosterRect
): WallPosterGridRowWritableSnapshot {
  const eligibility = resolveWallPosterGridRowEligibilityFromCurrentGeometry(rowState, viewportRect)

  return {
    orderedWritableIndices: [...eligibility.orderedWritableIndices],
    consumedWritableOrders: new Set<number>()
  }
}

function applyWallPosterTileMedia(tileState: WallPosterTileState, item: MediaItem): void {
  tileState.posterThumb.style.backgroundImage = `url(${item.poster.url})`
  wallPosterTileIdentityByElement.set(tileState.tile, toWallPosterMediaIdentity(item))
}

function consumeWallPosterWritableEntryIndex(
  rowState: WallPosterGridRowState,
  orderedWritableIndices: readonly number[],
  consumedWritableOrders: Set<number>
): number | null {
  if (orderedWritableIndices.length === 0 || consumedWritableOrders.size >= orderedWritableIndices.length) {
    return null
  }

  const normalizedPointerBase = Number.isFinite(rowState.nextEntryPointer)
    ? Math.trunc(rowState.nextEntryPointer)
    : 0
  const normalizedPointer =
    ((normalizedPointerBase % orderedWritableIndices.length) + orderedWritableIndices.length)
    % orderedWritableIndices.length

  for (let offset = 0; offset < orderedWritableIndices.length; offset += 1) {
    const writableOrder = (normalizedPointer + offset) % orderedWritableIndices.length
    if (consumedWritableOrders.has(writableOrder)) {
      continue
    }

    consumedWritableOrders.add(writableOrder)
    const entryIndex = orderedWritableIndices[writableOrder]
    if (typeof entryIndex !== "number") {
      continue
    }

    rowState.nextEntryPointer = (writableOrder + 1) % orderedWritableIndices.length
    return entryIndex
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
  const rowWritableSnapshots = streamState.rows.map((rowState) => {
    return createWallPosterGridRowWritableSnapshot(rowState, viewportRect)
  })
  const nextPendingIncomingItems: MediaItem[] = []
  let appliedItemCount = 0

  for (const incomingItem of streamState.pendingIncomingItems) {
    const incomingRowSelection = consumeWallPosterIncomingRowIndex(
      streamState.rows.length,
      streamState.nextIncomingRowPointer
    )
    streamState.nextIncomingRowPointer = incomingRowSelection.nextRowPointer

    if (incomingRowSelection.rowIndex === null) {
      nextPendingIncomingItems.push(incomingItem)
      continue
    }

    const rowState = streamState.rows[incomingRowSelection.rowIndex]
    if (!rowState) {
      nextPendingIncomingItems.push(incomingItem)
      continue
    }

    const rowWritableSnapshot = rowWritableSnapshots[incomingRowSelection.rowIndex]
    if (!rowWritableSnapshot) {
      nextPendingIncomingItems.push(incomingItem)
      continue
    }

    const entryIndex = consumeWallPosterWritableEntryIndex(
      rowState,
      rowWritableSnapshot.orderedWritableIndices,
      rowWritableSnapshot.consumedWritableOrders
    )
    if (entryIndex === null) {
      nextPendingIncomingItems.push(incomingItem)
      continue
    }

    const tileState = rowState.tiles[entryIndex]
    if (!tileState) {
      nextPendingIncomingItems.push(incomingItem)
      continue
    }

    applyWallPosterTileMedia(tileState, incomingItem)
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
    rows: []
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

  const viewportWidth = typeof window === "undefined"
    ? 1920
    : Math.max(1, window.innerWidth)
  const viewportHeight = typeof window === "undefined"
    ? 1080
    : Math.max(1, window.innerHeight)
  const rowCount = Math.max(5, Math.min(10, Math.ceil((viewportHeight * 1.25) / 340)))
  const tileStridePx = 240
  const baseCycles = 4
  const defaultHalfWidthPx = options.items.length * baseCycles * tileStridePx * 0.5
  const requiredHalfWidthPx = viewportWidth * 1.15
  const cycles = defaultHalfWidthPx >= requiredHalfWidthPx
    ? baseCycles
    : Math.min(
      24,
      Math.max(
        baseCycles,
        Math.ceil((requiredHalfWidthPx * 2) / (options.items.length * tileStridePx))
      )
    )
  const baseDurations = [84, 96, 90, 104, 88, 100, 86, 102, 92, 108]
  const fixedSpeedScale = 1.8

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = createElement("div")
    const rowDirection: WallPosterRowDirection = rowIndex % 2 === 0 ? "normal" : "reverse"
    const rowTileStates: WallPosterTileState[] = []
    const rowOrder = createWallPosterRowOrder(options.items.length, rowIndex)
    const rowOrderLength = rowOrder.length
    row.style.display = "flex"
    row.style.gap = "2.5rem"
    row.style.width = "max-content"
    row.style.setProperty("--mps-row-shift-end", `-${Math.round(viewportWidth * 0.62)}px`)
    const rowDurationSeconds = (baseDurations[rowIndex] ?? 78) * fixedSpeedScale
    row.style.animation = `mps-wall-row-scroll ${rowDurationSeconds}s linear infinite`
    row.style.animationDirection = rowDirection

    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const cycleOffset = rowOrderLength > 0
        ? (cycle * (rowIndex + 3)) % rowOrderLength
        : 0

      for (let orderIndex = 0; orderIndex < rowOrderLength; orderIndex += 1) {
        const mappedIndex = rowOrder[(orderIndex + cycleOffset) % rowOrderLength]
        if (typeof mappedIndex !== "number") {
          continue
        }

        const item = options.items[mappedIndex]
        if (!item) {
          continue
        }

        const tile = createElement("button", {
          ...(rowIndex === 0 && cycle === 0 ? { testId: `poster-item-${mappedIndex}` } : {})
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
    }

    posterGrid.append(row)
    streamState.rows.push({
      entryIndices: createWallPosterEntryEdgeIndices(rowTileStates.length, rowDirection),
      nextEntryPointer: 0,
      tiles: rowTileStates
    })
  }

  return posterGrid
}
