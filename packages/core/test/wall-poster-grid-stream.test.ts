import { afterEach, describe, expect, it, vi } from "vitest"

import {
  applyWallPosterGridStreamItems,
  applyWallPosterGridStreamState,
  collectIncomingWallPosterItems,
  collectPendingWallPosterIncomingItems,
  collectReplaceableWallPosterTileIndices,
  collectVisibleWallPosterTileIndices,
  consumeWallPosterIncomingRowIndex,
  createWallPosterGridSection,
  createWallPosterEntryEdgeIndices,
  createWallPosterRowOrder,
  createWallPosterTileFillOrder,
  getWallPosterTileMediaIdentity,
  resolveWallPosterRowTileCount,
  resolveWallPosterTileCount,
  toWallPosterMediaIdentity,
  WALL_POSTER_GRID_STREAM_APPLIER_KEY
} from "../src/wall/ui/presentation-sections"
import type { MediaItem } from "../src/types/media"
import type { ElementFactory } from "../src/wall/ui/element-factory"
import type {
  WallPosterGridStreamApplier,
  WallPosterGridRowState,
  WallPosterGridStreamState,
  WallPosterRect,
  WallPosterTileState
} from "../src/wall/ui/presentation-sections"

function createMediaItem(id: string, providerId = "provider-main"): MediaItem {
  return {
    id,
    providerId,
    libraryId: "movies-main",
    kind: "movie",
    title: `Title ${id}`,
    genres: [],
    tags: [],
    people: [],
    poster: {
      url: `https://posters.test/${id}.jpg`
    }
  }
}

function createWallPosterRect(
  left: number,
  right: number,
  top = 0,
  bottom = 100
): WallPosterRect {
  return {
    left,
    right,
    top,
    bottom
  }
}

function createWallPosterTileState(options: {
  rect?: WallPosterRect
  getRect?: () => WallPosterRect
  initialItem?: MediaItem
} = {}): WallPosterTileState {
  const tile: {
    getBoundingClientRect?: () => WallPosterRect
  } = {}
  if (typeof options.getRect === "function") {
    tile.getBoundingClientRect = options.getRect
  } else if (options.rect) {
    const rect = { ...options.rect }
    tile.getBoundingClientRect = () => rect
  }

  return {
    tile,
    posterThumb: {
      style: {
        backgroundImage: options.initialItem ? `url(${options.initialItem.poster.url})` : ""
      } as CSSStyleDeclaration
    }
  }
}

function createMutableWallPosterTileState(options: {
  rect: WallPosterRect
  initialItem?: MediaItem
}): {
  tileState: WallPosterTileState
  setRect: (rect: WallPosterRect) => void
} {
  let currentRect = { ...options.rect }
  const tileStateOptions: {
    getRect: () => WallPosterRect
    initialItem?: MediaItem
  } = {
    getRect: () => currentRect
  }
  if (options.initialItem) {
    tileStateOptions.initialItem = options.initialItem
  }

  return {
    tileState: createWallPosterTileState(tileStateOptions),
    setRect(rect: WallPosterRect) {
      currentRect = { ...rect }
    }
  }
}

function createWallPosterGridRowState(
  entryIndices: number[],
  tileCountOrOptions:
    | number
    | {
        tileCount?: number
        tiles?: WallPosterTileState[]
      } = entryIndices.length
): WallPosterGridRowState {
  const options = typeof tileCountOrOptions === "number"
    ? {
        tileCount: tileCountOrOptions
      }
    : tileCountOrOptions

  return {
    entryIndices: [...entryIndices],
    tiles: options.tiles ?? Array.from(
      { length: options.tileCount ?? entryIndices.length },
      () => createWallPosterTileState()
    )
  }
}

function createWallPosterGridStreamState(options?: {
  items?: MediaItem[]
  pendingIncomingItems?: MediaItem[]
  nextIncomingRowPointer?: number
  rows?: WallPosterGridRowState[]
}): WallPosterGridStreamState {
  const items = [...(options?.items ?? [])]

  return {
    items,
    itemIndexByIdentity: new Map(
      items.map((item, index) => [toWallPosterMediaIdentity(item), index] as const)
    ),
    nextIncomingRowPointer: options?.nextIncomingRowPointer ?? 0,
    pendingIncomingItems: [...(options?.pendingIncomingItems ?? [])],
    rows: [...(options?.rows ?? [])],
    nextWriteSequence: 0
  }
}

function createMockStyle(): CSSStyleDeclaration {
  const style: Partial<CSSStyleDeclaration> = {
    backgroundImage: "",
    setProperty() {
    }
  }

  return style as CSSStyleDeclaration
}

function createMockElementFactory(): ElementFactory {
  return <K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    options?: {
      className?: string
      textContent?: string
      testId?: string
    }
  ): HTMLElementTagNameMap[K] => {
    const children: unknown[] = []

    return {
      tagName: tagName.toUpperCase(),
      className: options?.className ?? "",
      textContent: options?.textContent ?? "",
      style: createMockStyle(),
      append(...nodes: unknown[]) {
        children.push(...nodes)
      },
      addEventListener() {
      },
      get children(): HTMLCollection {
        return children as unknown as HTMLCollection
      },
      dataset: options?.testId
        ? ({ testid: options.testId } as DOMStringMap)
        : ({} as DOMStringMap)
    } as unknown as HTMLElementTagNameMap[K]
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("wall poster grid stream helpers", () => {
  it("normalizes provider/id media identity", () => {
    const identity = toWallPosterMediaIdentity({
      providerId: "  provider-main  ",
      id: "  media-001  "
    })

    expect(identity).toBe("provider-main::media-001")
  })

  it("collects only incoming identities in next-item order", () => {
    const previousItems = [
      createMediaItem("media-1"),
      createMediaItem("media-2")
    ]
    const nextItems = [
      createMediaItem("media-2"),
      createMediaItem("media-3"),
      createMediaItem("media-3"),
      createMediaItem("media-4")
    ]

    const incomingItems = collectIncomingWallPosterItems(previousItems, nextItems)

    expect(incomingItems.map((item) => item.id)).toEqual(["media-3", "media-4"])
  })

  it("dedupes pending backlog identities against previous, next, and queued items", () => {
    const media1 = createMediaItem("media-1")
    const media2 = createMediaItem("media-2")
    const media3 = createMediaItem("media-3")
    const media4 = createMediaItem("media-4")

    const pendingItems = collectPendingWallPosterIncomingItems(
      [media1, media2],
      [media1, media3, media2, media4, media3],
      [media2, media3, media3]
    )

    expect(pendingItems.map((item) => item.id)).toEqual(["media-2", "media-3", "media-4"])
  })

  it("uses right-edge entry traversal for normal rows", () => {
    expect(createWallPosterEntryEdgeIndices(5, "normal")).toEqual([4, 3, 2, 1, 0])
  })

  it("uses left-edge entry traversal for reverse rows", () => {
    expect(createWallPosterEntryEdgeIndices(5, "reverse")).toEqual([0, 1, 2, 3, 4])
  })

  it("returns empty traversal when row has no tiles", () => {
    expect(createWallPosterEntryEdgeIndices(0, "normal")).toEqual([])
  })

  it("lists off-screen tiles of a normal row: entry side nearest first, then the exit side", () => {
    const viewportRect = createWallPosterRect(0, 100)
    const tileRects = [
      createWallPosterRect(-240, -140),
      createWallPosterRect(-100, 0),
      createWallPosterRect(-40, 60),
      createWallPosterRect(99, 199),
      createWallPosterRect(100, 200),
      createWallPosterRect(220, 320),
      createWallPosterRect(340, 440)
    ]

    expect(collectVisibleWallPosterTileIndices(viewportRect, tileRects)).toEqual([2, 3])
    expect(collectReplaceableWallPosterTileIndices(viewportRect, tileRects, "normal")).toEqual([
      4, 5, 6, 1, 0
    ])
  })

  it("lists off-screen tiles of a reverse row with the left edge as the entry side", () => {
    const viewportRect = createWallPosterRect(0, 100)
    const tileRects = [
      createWallPosterRect(-340, -240),
      createWallPosterRect(-220, -120),
      createWallPosterRect(-100, 0),
      createWallPosterRect(-99, 1),
      createWallPosterRect(20, 120),
      createWallPosterRect(140, 240)
    ]

    expect(collectVisibleWallPosterTileIndices(viewportRect, tileRects)).toEqual([3, 4])
    expect(collectReplaceableWallPosterTileIndices(viewportRect, tileRects, "reverse")).toEqual([
      2, 1, 0, 5
    ])
  })

  it("never lists a tile that still overlaps the viewport by a pixel", () => {
    const viewportRect = createWallPosterRect(0, 100)
    const tileRects = [
      createWallPosterRect(99, 199),
      createWallPosterRect(100, 200)
    ]

    expect(collectVisibleWallPosterTileIndices(viewportRect, tileRects)).toEqual([0])
    expect(collectReplaceableWallPosterTileIndices(viewportRect, tileRects, "normal")).toEqual([1])
  })

  it("writes incoming posters to off-screen tiles on either side and never to visible ones", () => {
    vi.stubGlobal("window", { innerWidth: 100, innerHeight: 100 })

    const visibleMedia1 = createMediaItem("visible-1")
    const visibleMedia2 = createMediaItem("visible-2")
    const incoming = [1, 2, 3, 4, 5].map((index) => createMediaItem(`incoming-${index}`))
    const rowState = createWallPosterGridRowState(createWallPosterEntryEdgeIndices(6, "normal"), {
      tiles: [
        createWallPosterTileState({ rect: createWallPosterRect(-240, -140), initialItem: createMediaItem("exit-0") }),
        createWallPosterTileState({ rect: createWallPosterRect(-120, -20), initialItem: createMediaItem("exit-1") }),
        createWallPosterTileState({ rect: createWallPosterRect(-40, 60), initialItem: visibleMedia1 }),
        createWallPosterTileState({ rect: createWallPosterRect(60, 160), initialItem: visibleMedia2 }),
        createWallPosterTileState({ rect: createWallPosterRect(100, 200) }),
        createWallPosterTileState({ rect: createWallPosterRect(220, 320) })
      ]
    })
    const streamState = createWallPosterGridStreamState({
      items: [visibleMedia1, visibleMedia2],
      rows: [rowState]
    })

    expect(applyWallPosterGridStreamState(streamState, [visibleMedia1, visibleMedia2, ...incoming])).toEqual({
      status: "applied",
      queuedItemCount: 5,
      appliedItemCount: 4,
      pendingItemCount: 1
    })
    expect(streamState.pendingIncomingItems.map((item) => item.id)).toEqual(["incoming-5"])
    expect(rowState.tiles.map((tileState) => tileState.posterThumb.style.backgroundImage)).toEqual([
      `url(${incoming[3]?.poster.url})`,
      `url(${incoming[2]?.poster.url})`,
      `url(${visibleMedia1.poster.url})`,
      `url(${visibleMedia2.poster.url})`,
      `url(${incoming[0]?.poster.url})`,
      `url(${incoming[1]?.poster.url})`
    ])
    expect(getWallPosterTileMediaIdentity(rowState.tiles[4]?.tile ?? {})).toBe(
      toWallPosterMediaIdentity(incoming[0] ?? visibleMedia1)
    )
  })

  it("rotates through off-screen tiles, replacing the one written longest ago", () => {
    vi.stubGlobal("window", { innerWidth: 100, innerHeight: 100 })

    const rowState = createWallPosterGridRowState(createWallPosterEntryEdgeIndices(3, "normal"), {
      tiles: [
        createWallPosterTileState({ rect: createWallPosterRect(0, 100) }),
        createWallPosterTileState({ rect: createWallPosterRect(120, 220) }),
        createWallPosterTileState({ rect: createWallPosterRect(240, 340) })
      ]
    })
    const streamState = createWallPosterGridStreamState({ rows: [rowState] })
    const written: string[] = []

    let queue: MediaItem[] = []
    for (let step = 1; step <= 4; step += 1) {
      queue = [...queue, createMediaItem(`step-${step}`)]
      applyWallPosterGridStreamState(streamState, queue)
      written.push(rowState.tiles.map((tileState) => {
        return tileState.posterThumb.style.backgroundImage.replace(/^url\(https:\/\/posters\.test\/|\.jpg\)$/g, "") || "-"
      }).join(","))
    }

    // The nearest tile first, then the other one, then back to the first: never the same tile twice
    // in a row while another has been waiting longer.
    expect(written).toEqual([
      "-,step-1,-",
      "-,step-1,step-2",
      "-,step-3,step-2",
      "-,step-3,step-4"
    ])
  })

  it("replaces tiles that repeat a poster before tiles that show a unique one", () => {
    vi.stubGlobal("window", { innerWidth: 100, innerHeight: 100 })

    const repeated = createMediaItem("repeated")
    const unique = createMediaItem("unique")
    const incoming = createMediaItem("incoming")
    const offScreen = createWallPosterRect(500, 600)
    const tiles = [0, 1, 2].map(() => createMutableWallPosterTileState({ rect: offScreen }))
    // Give tiles 0 and 2 the same poster and tile 1 a unique one, through one-tile walls.
    const seed = (index: number, item: MediaItem): void => {
      const tileState = tiles[index]?.tileState
      if (!tileState) {
        throw new Error(`expected tile ${index}`)
      }
      applyWallPosterGridStreamState(
        createWallPosterGridStreamState({ rows: [createWallPosterGridRowState([0], { tiles: [tileState] })] }),
        [item]
      )
    }
    seed(0, repeated)
    seed(1, unique)
    seed(2, repeated)
    tiles[0]?.setRect(createWallPosterRect(0, 100))
    tiles[1]?.setRect(createWallPosterRect(120, 220))
    tiles[2]?.setRect(createWallPosterRect(240, 340))
    const rowState = createWallPosterGridRowState(createWallPosterEntryEdgeIndices(3, "normal"), {
      tiles: tiles.map((tile) => tile.tileState)
    })
    const streamState = createWallPosterGridStreamState({ rows: [rowState] })

    applyWallPosterGridStreamState(streamState, [incoming])

    // Tile 1 is nearer to the edge but unique, so the repeat on tile 2 takes the new poster.
    const identities = rowState.tiles.map((tileState) => getWallPosterTileMediaIdentity(tileState.tile))
    expect(identities).toEqual([
      toWallPosterMediaIdentity(repeated),
      toWallPosterMediaIdentity(unique),
      toWallPosterMediaIdentity(incoming)
    ])
  })

  it("swaps an on-screen repeat for a poster that is not on the wall, but keeps on-screen originals", () => {
    vi.stubGlobal("window", { innerWidth: 400, innerHeight: 100 })

    const repeated = createMediaItem("repeated")
    const unique = createMediaItem("unique")
    const incoming = [1, 2].map((index) => createMediaItem(`incoming-${index}`))
    // Every tile is on screen: tiles 0 and 2 repeat one poster, tile 1 shows one of its own.
    const tiles = [0, 1, 2].map(() => createMutableWallPosterTileState({ rect: createWallPosterRect(500, 600) }))
    const seed = (index: number, item: MediaItem): void => {
      const tileState = tiles[index]?.tileState
      if (!tileState) {
        throw new Error(`expected tile ${index}`)
      }
      applyWallPosterGridStreamState(
        createWallPosterGridStreamState({ rows: [createWallPosterGridRowState([0], { tiles: [tileState] })] }),
        [item]
      )
    }
    seed(0, repeated)
    seed(1, unique)
    seed(2, repeated)
    tiles[0]?.setRect(createWallPosterRect(0, 100))
    tiles[1]?.setRect(createWallPosterRect(120, 220))
    tiles[2]?.setRect(createWallPosterRect(240, 340))
    const rowState = createWallPosterGridRowState(createWallPosterEntryEdgeIndices(3, "normal"), {
      tiles: tiles.map((tile) => tile.tileState)
    })
    const streamState = createWallPosterGridStreamState({ rows: [rowState] })

    expect(applyWallPosterGridStreamState(streamState, incoming)).toEqual({
      status: "applied",
      queuedItemCount: 2,
      appliedItemCount: 1,
      pendingItemCount: 1
    })

    // One copy of the repeat takes the new poster; once nothing repeats, on-screen tiles are kept
    // and the second poster waits for a tile to scroll off.
    const identities = rowState.tiles.map((tileState) => getWallPosterTileMediaIdentity(tileState.tile))
    expect(identities.filter((identity) => identity === toWallPosterMediaIdentity(repeated))).toHaveLength(1)
    expect(identities).toContain(toWallPosterMediaIdentity(unique))
    expect(identities).toContain(toWallPosterMediaIdentity(incoming[0] ?? repeated))
    expect(streamState.pendingIncomingItems.map((item) => item.id)).toEqual(["incoming-2"])
  })

  it("does not put a second copy of a poster that is already on the wall", () => {
    vi.stubGlobal("window", { innerWidth: 100, innerHeight: 100 })

    const shown = createMediaItem("shown")
    const rowState = createWallPosterGridRowState(createWallPosterEntryEdgeIndices(2, "normal"), {
      tiles: [
        createWallPosterTileState({ rect: createWallPosterRect(120, 220) }),
        createWallPosterTileState({ rect: createWallPosterRect(240, 340) })
      ]
    })
    const streamState = createWallPosterGridStreamState({ rows: [rowState] })
    applyWallPosterGridStreamState(streamState, [shown])

    // The poster leaves the queue and comes back (the library wrapped around).
    applyWallPosterGridStreamState(streamState, [])
    expect(applyWallPosterGridStreamState(streamState, [shown])).toEqual({
      status: "noop",
      queuedItemCount: 1,
      appliedItemCount: 0,
      pendingItemCount: 0
    })
    expect(rowState.tiles.filter((tileState) => {
      return getWallPosterTileMediaIdentity(tileState.tile) === toWallPosterMediaIdentity(shown)
    })).toHaveLength(1)
  })

  it("sizes a row to its scroll range instead of repeating the poster list", () => {
    expect(resolveWallPosterRowTileCount(1280)).toBe(13)
    expect(resolveWallPosterRowTileCount(1920)).toBe(18)
    expect(resolveWallPosterRowTileCount(3840)).toBe(34)
  })

  it("counts the wall's tiles for a viewport", () => {
    expect(resolveWallPosterTileCount(1024, 768)).toBe(5 * 11)
    expect(resolveWallPosterTileCount(1920, 1080)).toBe(5 * 18)
    expect(resolveWallPosterTileCount(2560, 1440)).toBe(6 * 24)
    expect(resolveWallPosterTileCount(3840, 2160)).toBe(8 * 34)
  })

  it("fills the always-visible middle columns before the row ends", () => {
    const fillOrder = createWallPosterTileFillOrder(2, 18, 1920)

    expect([...fillOrder].sort((left, right) => left - right)).toEqual(Array.from({ length: 36 }, (_, index) => index))
    // At 1920px the middle of the scroll range is column 9; both rows' column 9 come first and the
    // row ends (columns 0 and 17) come last.
    expect(fillOrder.slice(0, 2)).toEqual([9, 27])
    expect(fillOrder.slice(-2)).toEqual([0, 18])
  })

  it("builds a wall where every tile shows a different poster when there are enough posters", () => {
    vi.stubGlobal("window", { innerWidth: 1920, innerHeight: 1080 })
    const items = Array.from({ length: 120 }, (_, index) => createMediaItem(`poster-${index}`))
    const posterGrid = createWallPosterGridSection(createMockElementFactory(), { items })
    const rows = [...(posterGrid.children as unknown as HTMLElement[])]
    const backgrounds = rows.flatMap((row) => {
      return [...(row.children as unknown as HTMLElement[])].map((tile) => {
        const thumb = (tile.children as unknown as HTMLElement[])[0]
        return thumb?.style.backgroundImage ?? ""
      })
    })

    expect(rows).toHaveLength(5)
    expect(backgrounds).toHaveLength(5 * 18)
    expect(new Set(backgrounds).size).toBe(5 * 18)
  })

  it("keeps repeats off the always-visible columns when there are fewer posters than tiles", () => {
    vi.stubGlobal("window", { innerWidth: 1920, innerHeight: 1080 })
    const items = Array.from({ length: 60 }, (_, index) => createMediaItem(`poster-${index}`))
    const posterGrid = createWallPosterGridSection(createMockElementFactory(), { items })
    const rows = [...(posterGrid.children as unknown as HTMLElement[])]
    const middleColumns = rows.flatMap((row) => {
      return [...(row.children as unknown as HTMLElement[])].slice(7, 12).map((tile) => {
        return (tile.children as unknown as HTMLElement[])[0]?.style.backgroundImage ?? ""
      })
    })
    const testIds = rows.flatMap((row) => {
      return [...(row.children as unknown as HTMLElement[])].map((tile) => tile.dataset.testid).filter(Boolean)
    })

    expect(new Set(middleColumns).size).toBe(middleColumns.length)
    expect(new Set(testIds).size).toBe(60)
    expect(testIds).toContain("poster-item-0")
  })

  it("creates deterministic row orders with full index coverage", () => {
    const firstOrder = createWallPosterRowOrder(8, 2)
    const secondOrder = createWallPosterRowOrder(8, 2)
    const neighboringRowOrder = createWallPosterRowOrder(8, 3)

    expect(firstOrder).toEqual(secondOrder)
    expect([...firstOrder].sort((left, right) => left - right)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(neighboringRowOrder).not.toEqual(firstOrder)
  })

  it("distributes incoming items across rows in round-robin order", () => {
    let nextPointer = 0
    const rowIndices: number[] = []

    for (let step = 0; step < 7; step += 1) {
      const consumedRow = consumeWallPosterIncomingRowIndex(3, nextPointer)
      nextPointer = consumedRow.nextRowPointer
      if (consumedRow.rowIndex !== null) {
        rowIndices.push(consumedRow.rowIndex)
      }
    }

    expect(rowIndices).toEqual([0, 1, 2, 0, 1, 2, 0])
  })

  it("returns null row selection when no row exists", () => {
    expect(consumeWallPosterIncomingRowIndex(0, 42)).toEqual({
      rowIndex: null,
      nextRowPointer: 0
    })
  })

  it("keeps incoming posters pending when no writable slots exist", () => {
    const media1 = createMediaItem("media-1")
    const media2 = createMediaItem("media-2")
    const media3 = createMediaItem("media-3")
    const streamState = createWallPosterGridStreamState({
      items: [media1],
      pendingIncomingItems: [media2, media2]
    })

    const applyResult = applyWallPosterGridStreamState(streamState, [media1, media2, media3, media3])

    expect(applyResult).toEqual({
      status: "deferred",
      queuedItemCount: 2,
      appliedItemCount: 0,
      pendingItemCount: 2
    })
    expect(streamState.pendingIncomingItems.map((item) => item.id)).toEqual(["media-2", "media-3"])
  })

  it("returns unavailable when poster grid stream state is missing", () => {
    expect(applyWallPosterGridStreamItems({} as HTMLElement, [createMediaItem("media-1")])).toEqual({
      status: "unavailable",
      queuedItemCount: 0,
      appliedItemCount: 0,
      pendingItemCount: 0
    })
  })

  it("returns the typed apply result from the element applier", () => {
    const posterGrid = createWallPosterGridSection(createMockElementFactory(), { items: [] }) as HTMLElement & {
      [WALL_POSTER_GRID_STREAM_APPLIER_KEY]?: WallPosterGridStreamApplier
    }
    const applyStreamItems = posterGrid[WALL_POSTER_GRID_STREAM_APPLIER_KEY]

    expect(typeof applyStreamItems).toBe("function")
    expect(applyStreamItems?.([createMediaItem("media-1")])).toEqual({
      status: "deferred",
      queuedItemCount: 1,
      appliedItemCount: 0,
      pendingItemCount: 1
    })
  })

  it("returns noop when no incoming or pending posters exist", () => {
    const media1 = createMediaItem("media-1")
    const media2 = createMediaItem("media-2")
    const streamState = createWallPosterGridStreamState({
      items: [media1, media2],
      rows: [createWallPosterGridRowState([0])]
    })

    expect(applyWallPosterGridStreamState(streamState, [media1, media2])).toEqual({
      status: "noop",
      queuedItemCount: 0,
      appliedItemCount: 0,
      pendingItemCount: 0
    })
    expect(streamState.pendingIncomingItems).toEqual([])
  })

  it("reclassifies replaceable tiles after viewport expansion without mutating visible tiles", () => {
    vi.stubGlobal("window", {
      innerWidth: 100,
      innerHeight: 100
    })

    const existingMedia = createMediaItem("existing-media")
    const visibleMedia1 = createMediaItem("visible-media-1")
    const visibleMedia2 = createMediaItem("visible-media-2")
    const nearEdgeMedia = createMediaItem("near-edge-media")
    const midBufferMedia = createMediaItem("mid-buffer-media")
    const farBufferMedia = createMediaItem("far-buffer-media")
    const incomingMedia1 = createMediaItem("incoming-media-1")
    const incomingMedia2 = createMediaItem("incoming-media-2")
    const incomingMedia3 = createMediaItem("incoming-media-3")
    const rowState = createWallPosterGridRowState(
      createWallPosterEntryEdgeIndices(7, "normal"),
      {
        tiles: [
          createWallPosterTileState({ rect: createWallPosterRect(-240, -140) }),
          createWallPosterTileState({ rect: createWallPosterRect(-120, -20) }),
          createWallPosterTileState({
            rect: createWallPosterRect(-40, 60),
            initialItem: visibleMedia1
          }),
          createWallPosterTileState({
            rect: createWallPosterRect(60, 160),
            initialItem: visibleMedia2
          }),
          createWallPosterTileState({
            rect: createWallPosterRect(100, 200),
            initialItem: nearEdgeMedia
          }),
          createWallPosterTileState({
            rect: createWallPosterRect(220, 320),
            initialItem: midBufferMedia
          }),
          createWallPosterTileState({
            rect: createWallPosterRect(340, 440),
            initialItem: farBufferMedia
          })
        ]
      }
    )
    const streamState = createWallPosterGridStreamState({
      items: [existingMedia],
      rows: [rowState]
    })

    expect(applyWallPosterGridStreamState(streamState, [existingMedia, incomingMedia1, incomingMedia2])).toEqual({
      status: "applied",
      queuedItemCount: 2,
      appliedItemCount: 2,
      pendingItemCount: 0
    })
    expect(rowState.tiles[4]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia1.poster.url})`)
    expect(rowState.tiles[5]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia2.poster.url})`)

    vi.stubGlobal("window", {
      innerWidth: 200,
      innerHeight: 100
    })

    expect(
      applyWallPosterGridStreamState(
        streamState,
        [existingMedia, incomingMedia1, incomingMedia2, incomingMedia3]
      )
    ).toEqual({
      status: "applied",
      queuedItemCount: 1,
      appliedItemCount: 1,
      pendingItemCount: 0
    })
    // Tile 4 is now on screen; tile 5 just received incoming-2, so the never-written tile 6 is
    // replaced instead of overwriting a poster before it has been seen.
    expect(rowState.tiles[3]?.posterThumb.style.backgroundImage).toBe(`url(${visibleMedia2.poster.url})`)
    expect(rowState.tiles[4]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia1.poster.url})`)
    expect(rowState.tiles[5]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia2.poster.url})`)
    expect(rowState.tiles[6]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia3.poster.url})`)
  })

  it("makes fully exited tiles writable again after viewport contraction", () => {
    vi.stubGlobal("window", {
      innerWidth: 200,
      innerHeight: 100
    })

    const existingMedia = createMediaItem("existing-media-contract")
    const visibleMedia1 = createMediaItem("visible-media-contract-1")
    const visibleMedia2 = createMediaItem("visible-media-contract-2")
    const regainsEligibilityMedia = createMediaItem("regains-eligibility-media")
    const farBufferMedia = createMediaItem("far-buffer-media-contract")
    const incomingMedia1 = createMediaItem("incoming-media-contract-1")
    const incomingMedia2 = createMediaItem("incoming-media-contract-2")
    const rowState = createWallPosterGridRowState(
      createWallPosterEntryEdgeIndices(6, "normal"),
      {
        tiles: [
          createWallPosterTileState({ rect: createWallPosterRect(-240, -140) }),
          createWallPosterTileState({ rect: createWallPosterRect(-120, -20) }),
          createWallPosterTileState({
            rect: createWallPosterRect(-40, 60),
            initialItem: visibleMedia1
          }),
          createWallPosterTileState({
            rect: createWallPosterRect(60, 160),
            initialItem: visibleMedia2
          }),
          createWallPosterTileState({
            rect: createWallPosterRect(120, 220),
            initialItem: regainsEligibilityMedia
          }),
          createWallPosterTileState({
            rect: createWallPosterRect(240, 340),
            initialItem: farBufferMedia
          })
        ]
      }
    )
    const streamState = createWallPosterGridStreamState({
      items: [existingMedia],
      rows: [rowState]
    })

    expect(applyWallPosterGridStreamState(streamState, [existingMedia, incomingMedia1])).toEqual({
      status: "applied",
      queuedItemCount: 1,
      appliedItemCount: 1,
      pendingItemCount: 0
    })
    expect(rowState.tiles[4]?.posterThumb.style.backgroundImage).toBe(`url(${regainsEligibilityMedia.poster.url})`)
    expect(rowState.tiles[5]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia1.poster.url})`)

    vi.stubGlobal("window", {
      innerWidth: 100,
      innerHeight: 100
    })

    expect(
      applyWallPosterGridStreamState(
        streamState,
        [existingMedia, incomingMedia1, incomingMedia2]
      )
    ).toEqual({
      status: "applied",
      queuedItemCount: 1,
      appliedItemCount: 1,
      pendingItemCount: 0
    })
    expect(rowState.tiles[3]?.posterThumb.style.backgroundImage).toBe(`url(${visibleMedia2.poster.url})`)
    expect(rowState.tiles[4]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia2.poster.url})`)
    expect(rowState.tiles[5]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia1.poster.url})`)
  })

  it("reclassifies reverse-row writable slots from the current geometry snapshot", () => {
    vi.stubGlobal("window", {
      innerWidth: 100,
      innerHeight: 100
    })

    const existingMedia = createMediaItem("existing-media-reverse")
    const nearLeftMedia = createMediaItem("near-left-media")
    const farLeftMedia = createMediaItem("far-left-media")
    const incomingMedia = createMediaItem("incoming-media-reverse")
    const farLeftTile = createMutableWallPosterTileState({
      rect: createWallPosterRect(-320, -220),
      initialItem: farLeftMedia
    })
    const nearLeftTile = createMutableWallPosterTileState({
      rect: createWallPosterRect(-200, -100),
      initialItem: nearLeftMedia
    })
    const rowState = createWallPosterGridRowState(
      createWallPosterEntryEdgeIndices(6, "reverse"),
      {
        tiles: [
          farLeftTile.tileState,
          nearLeftTile.tileState,
          createWallPosterTileState({ rect: createWallPosterRect(-40, 60) }),
          createWallPosterTileState({ rect: createWallPosterRect(40, 140) }),
          createWallPosterTileState({ rect: createWallPosterRect(180, 280) }),
          createWallPosterTileState({ rect: createWallPosterRect(300, 400) })
        ]
      }
    )
    const streamState = createWallPosterGridStreamState({
      items: [existingMedia],
      rows: [rowState]
    })

    farLeftTile.setRect(createWallPosterRect(-180, -80))
    nearLeftTile.setRect(createWallPosterRect(-60, 40))

    expect(applyWallPosterGridStreamState(streamState, [existingMedia, incomingMedia])).toEqual({
      status: "applied",
      queuedItemCount: 1,
      appliedItemCount: 1,
      pendingItemCount: 0
    })
    expect(rowState.tiles[0]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia.poster.url})`)
    expect(rowState.tiles[1]?.posterThumb.style.backgroundImage).toBe(`url(${nearLeftMedia.poster.url})`)
    expect(getWallPosterTileMediaIdentity(rowState.tiles[0]?.tile ?? {})).toBe(
      toWallPosterMediaIdentity(incomingMedia)
    )
  })

})
