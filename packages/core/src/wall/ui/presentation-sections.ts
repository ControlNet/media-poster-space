import type { MediaItem } from "../../types/media"

import type { ElementFactory } from "./element-factory"
import type { WallHandoff } from "./types"

type WallPosterRowDirection = "normal" | "reverse"

interface WallPosterTileState {
  tile: HTMLButtonElement
  posterThumb: HTMLElement
}

interface WallPosterGridRowState {
  entryIndices: number[]
  nextEntryPointer: number
  tiles: WallPosterTileState[]
}

interface WallPosterGridStreamState {
  items: MediaItem[]
  itemIndexByIdentity: Map<string, number>
  nextIncomingRowPointer: number
  rows: WallPosterGridRowState[]
}

export const WALL_POSTER_GRID_STREAM_APPLIER_KEY = "__mpsApplyWallPosterStreamItems" as const

const wallPosterGridStreamStates = new WeakMap<HTMLElement, WallPosterGridStreamState>()
const wallPosterTileIdentityByElement = new WeakMap<HTMLButtonElement, string>()

interface WallPosterGridStreamElement extends HTMLElement {
  [WALL_POSTER_GRID_STREAM_APPLIER_KEY]?: (items: readonly MediaItem[]) => boolean
}

export function toWallPosterMediaIdentity(item: Pick<MediaItem, "providerId" | "id">): string {
  return `${item.providerId.trim()}::${item.id.trim()}`
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

function applyWallPosterTileMedia(tileState: WallPosterTileState, item: MediaItem): void {
  tileState.posterThumb.style.backgroundImage = `url(${item.poster.url})`
  wallPosterTileIdentityByElement.set(tileState.tile, toWallPosterMediaIdentity(item))
}

function consumeWallPosterEntryIndex(rowState: WallPosterGridRowState): number | null {
  if (rowState.entryIndices.length === 0) {
    return null
  }

  const entryIndex = rowState.entryIndices[rowState.nextEntryPointer]
  if (typeof entryIndex !== "number") {
    return null
  }

  rowState.nextEntryPointer = (rowState.nextEntryPointer + 1) % rowState.entryIndices.length
  return entryIndex
}

function applyWallPosterGridStreamState(
  streamState: WallPosterGridStreamState,
  items: readonly MediaItem[]
): void {
  const previousItems = streamState.items
  const nextItems = [...items]
  streamState.items = nextItems
  streamState.itemIndexByIdentity = createWallPosterItemIndexByIdentity(nextItems)

  const incomingItems = collectIncomingWallPosterItems(previousItems, nextItems)
  if (incomingItems.length === 0 || streamState.rows.length === 0) {
    return
  }

  for (const incomingItem of incomingItems) {
    const incomingRowSelection = consumeWallPosterIncomingRowIndex(
      streamState.rows.length,
      streamState.nextIncomingRowPointer
    )
    streamState.nextIncomingRowPointer = incomingRowSelection.nextRowPointer

    if (incomingRowSelection.rowIndex === null) {
      continue
    }

    const rowState = streamState.rows[incomingRowSelection.rowIndex]
    if (!rowState) {
      continue
    }

    const entryIndex = consumeWallPosterEntryIndex(rowState)
    if (entryIndex === null) {
      continue
    }

    const tileState = rowState.tiles[entryIndex]
    if (!tileState) {
      continue
    }

    applyWallPosterTileMedia(tileState, incomingItem)
  }
}

export function applyWallPosterGridStreamItems(
  posterGrid: HTMLElement,
  items: readonly MediaItem[]
): boolean {
  const streamState = wallPosterGridStreamStates.get(posterGrid)
  if (!streamState) {
    return false
  }

  applyWallPosterGridStreamState(streamState, items)
  return true
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
  handoff: WallHandoff
): {
  heading: HTMLHeadingElement
  libraries: HTMLParagraphElement
  preferences: HTMLParagraphElement
} {
  const now = new Date()
  const clockText = now.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  })

  const heading = createElement("h1", { textContent: clockText })
  heading.style.margin = "0"
  heading.style.position = "fixed"
  heading.style.left = "3.1rem"
  heading.style.bottom = "8.6rem"
  heading.style.zIndex = "101"
  heading.style.fontFamily = "var(--mps-font-body)"
  heading.style.fontSize = "clamp(3.2rem, 7vw, 6rem)"
  heading.style.fontWeight = "300"
  heading.style.lineHeight = "1"
  heading.style.letterSpacing = "-0.04em"
  heading.style.color = "transparent"
  heading.style.backgroundImage = "linear-gradient(180deg, #ffffff 40%, #888888 100%)"
  heading.style.backgroundClip = "text"
  heading.style.webkitBackgroundClip = "text"
  heading.style.webkitTextFillColor = "transparent"
  heading.style.pointerEvents = "none"

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

  const preferences = createElement("p", {
    textContent: `Density: ${handoff.preferences.density}; remember server: ${handoff.preferences.rememberServer ? "yes" : "no"}; remember username: ${handoff.preferences.rememberUsername ? "yes" : "no"}; remember password: ${handoff.preferences.rememberPasswordRequested ? "yes" : "no"}.`
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
        tile.addEventListener("mouseenter", () => {
          tile.style.transform = "translateZ(50px) scale(1.05)"
          tile.style.borderColor = "rgba(255, 255, 255, 0.2)"
          posterThumb.style.filter = "grayscale(0%) brightness(1.1)"
        })
        tile.addEventListener("mouseleave", () => {
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
