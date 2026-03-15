import { afterEach, describe, expect, it, vi } from "vitest"

import {
  applyWallPosterGridStreamItems,
  applyWallPosterGridStreamState,
  collectIncomingWallPosterItems,
  collectPendingWallPosterIncomingItems,
  collectEntrySideWallPosterWritableIndices,
  collectOrderedWallPosterWritableIndices,
  collectVisibleWallPosterTileIndices,
  consumeWallPosterIncomingRowIndex,
  createWallPosterGridSection,
  createWallPosterEntryEdgeIndices,
  createWallPosterRowOrder,
  getWallPosterTileMediaIdentity,
  resolveWallPosterEntryBufferEligibility,
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
        nextEntryPointer?: number
      } = entryIndices.length
): WallPosterGridRowState {
  const options = typeof tileCountOrOptions === "number"
    ? {
        tileCount: tileCountOrOptions
      }
    : tileCountOrOptions

  return {
    entryIndices: [...entryIndices],
    nextEntryPointer: options.nextEntryPointer ?? 0,
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
    rows: [...(options?.rows ?? [])]
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

  it("computes right-side writable entry buffer for normal rows", () => {
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
    expect(collectEntrySideWallPosterWritableIndices(viewportRect, tileRects, "normal")).toEqual([
      6,
      5,
      4
    ])
    expect(collectOrderedWallPosterWritableIndices(viewportRect, tileRects, "normal")).toEqual([
      4,
      5
    ])
    expect(resolveWallPosterEntryBufferEligibility(viewportRect, tileRects, "normal")).toEqual({
      visibleIndices: [2, 3],
      entrySideWritableIndices: [6, 5, 4],
      orderedWritableIndices: [4, 5]
    })
  })

  it("treats any viewport intersection as protected for reverse rows", () => {
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
    expect(collectEntrySideWallPosterWritableIndices(viewportRect, tileRects, "reverse")).toEqual([
      0,
      1,
      2
    ])
    expect(collectOrderedWallPosterWritableIndices(viewportRect, tileRects, "reverse")).toEqual([
      2,
      1
    ])
  })

  it("makes tiles writable again only after full viewport exit", () => {
    const viewportRect = createWallPosterRect(0, 100)
    const tileRects = [
      createWallPosterRect(99, 199),
      createWallPosterRect(100, 200)
    ]

    expect(collectVisibleWallPosterTileIndices(viewportRect, tileRects)).toEqual([0])
    expect(collectOrderedWallPosterWritableIndices(viewportRect, tileRects, "normal")).toEqual([1])
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

  it("applies incoming posters only to eligible entry-buffer tiles", () => {
    vi.stubGlobal("window", {
      innerWidth: 100,
      innerHeight: 100
    })

    const visibleMedia1 = createMediaItem("visible-1")
    const visibleMedia2 = createMediaItem("visible-2")
    const writableMedia1 = createMediaItem("writable-1")
    const writableMedia2 = createMediaItem("writable-2")
    const incomingMedia1 = createMediaItem("incoming-1")
    const incomingMedia2 = createMediaItem("incoming-2")
    const incomingMedia3 = createMediaItem("incoming-3")
    const rowState = createWallPosterGridRowState(
      createWallPosterEntryEdgeIndices(6, "normal"),
      {
        tiles: [
          createWallPosterTileState({
            rect: createWallPosterRect(-240, -140),
            initialItem: createMediaItem("exit-0")
          }),
          createWallPosterTileState({
            rect: createWallPosterRect(-120, -20),
            initialItem: createMediaItem("exit-1")
          }),
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
            initialItem: writableMedia1
          }),
          createWallPosterTileState({
            rect: createWallPosterRect(220, 320),
            initialItem: writableMedia2
          })
        ]
      }
    )
    const streamState = createWallPosterGridStreamState({
      items: [visibleMedia1, visibleMedia2],
      rows: [rowState]
    })

    expect(
      applyWallPosterGridStreamState(
        streamState,
        [visibleMedia1, visibleMedia2, incomingMedia1, incomingMedia2, incomingMedia3]
      )
    ).toEqual({
      status: "applied",
      queuedItemCount: 3,
      appliedItemCount: 2,
      pendingItemCount: 1
    })
    expect(streamState.pendingIncomingItems.map((item) => item.id)).toEqual(["incoming-3"])
    expect(rowState.tiles[2]?.posterThumb.style.backgroundImage).toBe(`url(${visibleMedia1.poster.url})`)
    expect(rowState.tiles[3]?.posterThumb.style.backgroundImage).toBe(`url(${visibleMedia2.poster.url})`)
    expect(rowState.tiles[4]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia1.poster.url})`)
    expect(rowState.tiles[5]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia2.poster.url})`)
    expect(getWallPosterTileMediaIdentity(rowState.tiles[4]?.tile ?? {})).toBe(
      toWallPosterMediaIdentity(incomingMedia1)
    )
    expect(getWallPosterTileMediaIdentity(rowState.tiles[5]?.tile ?? {})).toBe(
      toWallPosterMediaIdentity(incomingMedia2)
    )
  })

  it("reclassifies writable entry slots after viewport expansion without mutating visible tiles", () => {
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
    expect(rowState.tiles[3]?.posterThumb.style.backgroundImage).toBe(`url(${visibleMedia2.poster.url})`)
    expect(rowState.tiles[4]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia1.poster.url})`)
    expect(rowState.tiles[5]?.posterThumb.style.backgroundImage).toBe(`url(${incomingMedia3.poster.url})`)
    expect(rowState.tiles[6]?.posterThumb.style.backgroundImage).toBe(`url(${farBufferMedia.poster.url})`)
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

  it("preserves row round-robin distribution while using bounded writable slots", () => {
    vi.stubGlobal("window", {
      innerWidth: 100,
      innerHeight: 100
    })

    const media1 = createMediaItem("media-1")
    const backlog1 = createMediaItem("backlog-1")
    const backlog2 = createMediaItem("backlog-2")
    const incoming1 = createMediaItem("incoming-1")
    const incoming2 = createMediaItem("incoming-2")
    const incoming3 = createMediaItem("incoming-3")
    const firstRow = createWallPosterGridRowState(
      createWallPosterEntryEdgeIndices(6, "normal"),
      {
        tiles: [
          createWallPosterTileState({ rect: createWallPosterRect(-240, -140) }),
          createWallPosterTileState({ rect: createWallPosterRect(-120, -20) }),
          createWallPosterTileState({ rect: createWallPosterRect(-40, 60) }),
          createWallPosterTileState({ rect: createWallPosterRect(60, 160) }),
          createWallPosterTileState({ rect: createWallPosterRect(100, 200) }),
          createWallPosterTileState({ rect: createWallPosterRect(220, 320) })
        ]
      }
    )
    const secondRow = createWallPosterGridRowState(
      createWallPosterEntryEdgeIndices(6, "reverse"),
      {
        tiles: [
          createWallPosterTileState({ rect: createWallPosterRect(-320, -220) }),
          createWallPosterTileState({ rect: createWallPosterRect(-200, -100) }),
          createWallPosterTileState({ rect: createWallPosterRect(-40, 60) }),
          createWallPosterTileState({ rect: createWallPosterRect(40, 140) }),
          createWallPosterTileState({ rect: createWallPosterRect(180, 280) }),
          createWallPosterTileState({ rect: createWallPosterRect(300, 400) })
        ]
      }
    )
    const streamState = createWallPosterGridStreamState({
      items: [media1],
      pendingIncomingItems: [backlog1, backlog2],
      rows: [firstRow, secondRow]
    })

    expect(applyWallPosterGridStreamState(streamState, [media1, incoming1, incoming2, incoming3])).toEqual({
      status: "applied",
      queuedItemCount: 5,
      appliedItemCount: 4,
      pendingItemCount: 1
    })
    expect(streamState.pendingIncomingItems.map((item) => item.id)).toEqual(["incoming-3"])
    expect(firstRow.tiles[4]?.posterThumb.style.backgroundImage).toBe(`url(${backlog1.poster.url})`)
    expect(firstRow.tiles[5]?.posterThumb.style.backgroundImage).toBe(`url(${incoming1.poster.url})`)
    expect(secondRow.tiles[1]?.posterThumb.style.backgroundImage).toBe(`url(${backlog2.poster.url})`)
    expect(secondRow.tiles[0]?.posterThumb.style.backgroundImage).toBe(`url(${incoming2.poster.url})`)
    expect(getWallPosterTileMediaIdentity(firstRow.tiles[4]?.tile ?? {})).toBe(
      toWallPosterMediaIdentity(backlog1)
    )
    expect(getWallPosterTileMediaIdentity(firstRow.tiles[5]?.tile ?? {})).toBe(
      toWallPosterMediaIdentity(incoming1)
    )
    expect(getWallPosterTileMediaIdentity(secondRow.tiles[1]?.tile ?? {})).toBe(
      toWallPosterMediaIdentity(backlog2)
    )
    expect(getWallPosterTileMediaIdentity(secondRow.tiles[0]?.tile ?? {})).toBe(
      toWallPosterMediaIdentity(incoming2)
    )
  })
})
