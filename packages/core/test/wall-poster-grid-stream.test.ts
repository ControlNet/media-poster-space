import { describe, expect, it } from "vitest"

import {
  collectIncomingWallPosterItems,
  consumeWallPosterIncomingRowIndex,
  createWallPosterEntryEdgeIndices,
  createWallPosterRowOrder,
  toWallPosterMediaIdentity
} from "../src/wall/ui/presentation-sections"
import type { MediaItem } from "../src/types/media"

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

  it("uses right-edge entry traversal for normal rows", () => {
    expect(createWallPosterEntryEdgeIndices(5, "normal")).toEqual([4, 3, 2, 1, 0])
  })

  it("uses left-edge entry traversal for reverse rows", () => {
    expect(createWallPosterEntryEdgeIndices(5, "reverse")).toEqual([0, 1, 2, 3, 4])
  })

  it("returns empty traversal when row has no tiles", () => {
    expect(createWallPosterEntryEdgeIndices(0, "normal")).toEqual([])
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
})
