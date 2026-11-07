import { expect, test, type Page } from "@playwright/test"

import { FIXTURE_SERVER_ORIGIN, routeUnstubbedFixtureServerTraffic } from "./support/fixture-server-routes"

// Test fixture: a library large enough that every wall tile can show a different poster.
const LIBRARY_SIZE = 500

async function wireLargeLibraryServer(page: Page): Promise<void> {
  await routeUnstubbedFixtureServerTraffic(page)
  await page.route("**/System/Info/Public", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    body: JSON.stringify({ Version: "10.9.0" })
  }))
  await page.route("**/Users/AuthenticateByName", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ AccessToken: "token-abc", User: { Id: "user-1", Name: "demo-user" } })
  }))
  await page.route("**/Users/user-1/Views", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ Items: [{ Id: "movies-main", Name: "Movies", CollectionType: "movies" }] })
  }))
  // Honours StartIndex/Limit paging like Jellyfin does.
  await page.route("**/Users/user-1/Items**", (route, request) => {
    const url = new URL(request.url())
    const startIndex = Number(url.searchParams.get("StartIndex") ?? "0")
    const limit = Number(url.searchParams.get("Limit") ?? "100")
    const items = []
    for (let index = startIndex; index < Math.min(startIndex + limit, LIBRARY_SIZE); index += 1) {
      const posterId = String(index).padStart(3, "0")
      items.push({
        Id: `movie-${posterId}`,
        Name: `Poster ${posterId}`,
        Type: "Movie",
        ParentId: "movies-main",
        ImageTags: { Primary: `poster-tag-${posterId}` }
      })
    }
    return route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ Items: items, TotalRecordCount: LIBRARY_SIZE })
    })
  })
}

async function enterWall(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByTestId("server-url-input").fill(FIXTURE_SERVER_ORIGIN)
  await page.getByTestId("server-url-input").evaluate((element) => {
    (element as HTMLInputElement).blur()
  })
  await expect(page.getByTestId("server-status-indicator")).toContainText("Server reachable")
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()
  await page.getByTestId("onboarding-finish").click()
  await expect(page.getByTestId("wall-poster-grid").locator("button").first()).toBeVisible()
}

interface WallPosterCensus {
  tileCount: number
  visibleTileCount: number
  visiblePosterCount: number
  posterIdsInWall: string[]
}

async function takeWallPosterCensus(page: Page): Promise<WallPosterCensus> {
  return page.evaluate(() => {
    const tiles = [...document.querySelectorAll<HTMLElement>('[data-testid="wall-poster-grid"] button')]
    const toPosterId = (tile: HTMLElement): string => {
      const thumb = tile.firstElementChild as HTMLElement | null
      return thumb?.style.backgroundImage.match(/Items\/([^/]+)\//)?.[1] ?? ""
    }
    const visibleIds = tiles
      .filter((tile) => {
        const rect = tile.getBoundingClientRect()
        return rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight
      })
      .map(toPosterId)

    return {
      tileCount: tiles.length,
      visibleTileCount: visibleIds.length,
      visiblePosterCount: new Set(visibleIds).size,
      posterIdsInWall: tiles.map(toPosterId)
    }
  })
}

test("shows a different poster on every visible tile of a 1080p wall", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await wireLargeLibraryServer(page)
  await enterWall(page)

  const census = await takeWallPosterCensus(page)

  // 5 rows of 18 tiles, each row sized to its scroll range (it used to be 5 x 160 tiles).
  expect(census.tileCount).toBe(90)
  expect(census.visibleTileCount).toBeGreaterThan(30)
  expect(census.visiblePosterCount).toBe(census.visibleTileCount)
  expect(new Set(census.posterIdsInWall).size).toBe(census.tileCount)
})

test("brings new posters onto the wall as the stream runs", async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await wireLargeLibraryServer(page)
  await page.clock.install()
  await enterWall(page)

  const seenPosterIds = new Set((await takeWallPosterCensus(page)).posterIdsInWall)
  const initialPosterCount = seenPosterIds.size
  for (let second = 1; second <= 180; second += 1) {
    await page.clock.runFor(1_000)
    // Lets the fixture-server responses for a refill arrive between stream ticks.
    await page.waitForTimeout(20)
    if (second % 30 === 0) {
      const census = await takeWallPosterCensus(page)
      for (const posterId of census.posterIdsInWall) {
        seenPosterIds.add(posterId)
      }
      expect(new Set(census.posterIdsInWall).size).toBe(census.tileCount)
    }
  }

  // Three minutes of one-poster-per-second streaming has to reach well past the first page; the
  // old wall stayed at 40 posters for the first minute and reached about 60 after three.
  expect(seenPosterIds.size).toBeGreaterThan(initialPosterCount + 100)
})

for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
  test(`keeps every row across the screen at both ends of its scroll at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await wireLargeLibraryServer(page)
    await enterWall(page)

    const gaps = await page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>('[data-testid="wall-poster-grid"]')
      const rows = grid ? [...grid.children] as HTMLElement[] : []
      const found: string[] = []
      for (const rowProgress of [0, 0.5, 0.999]) {
        for (const floatProgress of [0, 0.5, 1]) {
          for (const animation of document.getAnimations()) {
            const name = (animation as CSSAnimation).animationName
            const duration = Number(animation.effect?.getComputedTiming().duration ?? 0)
            animation.pause()
            if (name === "mps-wall-row-scroll") {
              animation.currentTime = duration * rowProgress
            }
            if (name === "mps-wall-scene-float") {
              animation.currentTime = duration * floatProgress
            }
          }
          rows.forEach((row, rowIndex) => {
            const rects = [...row.querySelectorAll("button")].map((tile) => tile.getBoundingClientRect())
            if (!rects.some((rect) => rect.bottom > 0 && rect.top < window.innerHeight)) {
              return
            }
            const left = Math.min(...rects.map((rect) => rect.left))
            const right = Math.max(...rects.map((rect) => rect.right))
            if (left > 0 || right < window.innerWidth) {
              found.push(`row ${rowIndex} (scroll ${rowProgress}, float ${floatProgress}): ${Math.round(left)}..${Math.round(right)}`)
            }
          })
        }
      }
      return found
    })

    expect(gaps).toEqual([])
  })
}
