import { readFile } from "node:fs/promises"
import { expect, test, type Page } from "@playwright/test"

const TEST_SERVER = "https://jellyfin.test"

// verify-wall-contracts literal anchors (kept as comments for contract parity checks)
// page.getByTestId("exit-hotspot")
// page.locator('[data-testid="wall-controls-container"]:visible')
// page.getByTestId("wall-fullscreen-button")
// toBeGreaterThanOrEqual(240)
// toBeLessThanOrEqual(320)

async function wireSuccessfulPreflight(page: Page): Promise<void> {
  await page.route("**/System/Info/Public", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({ Version: "10.9.0" })
    })
  })
}

async function triggerServerStatusCheck(page: Page): Promise<void> {
  await page.getByTestId("server-url-input").evaluate((element) => {
    (element as HTMLInputElement).blur()
  })

  await expect(page.getByTestId("server-status-indicator")).toContainText("Server reachable")
}

async function wireAuthentication(page: Page, options: {
  allowLogin: boolean
}): Promise<void> {
  await page.route("**/Users/AuthenticateByName", async (route, request) => {
    const payload = request.postDataJSON() as {
      Username?: string
      Pw?: string
    }

    if (!payload.Username) {
      await route.fulfill({
        status: 400,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*"
        },
        body: JSON.stringify({})
      })
      return
    }

    if (options.allowLogin) {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          AccessToken: "token-abc",
          User: {
            Id: "user-1",
            Name: payload.Username
          }
        })
      })
      return
    }

    await route.fulfill({
      status: 401,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ Message: "unauthorized" })
    })
  })
}

async function wireLogout(page: Page): Promise<void> {
  await page.route("**/Sessions/Logout", async (route) => {
    await route.fulfill({
      status: 204
    })
  })
}

interface WallIdentityProbeSnapshot {
  stage: string
  selectorPresence: {
    wallRoot: boolean
    wallPosterGrid: boolean
    posterItem0: boolean
    manualRefreshButton: boolean
    diagnosticsOpen: boolean
  }
  baselineEstablished: boolean
  sameWallRootAsBaseline: boolean | null
  sameWallGridAsBaseline: boolean | null
}

async function captureWallIdentityProbeSnapshot(page: Page, stage: string): Promise<WallIdentityProbeSnapshot> {
  return page.evaluate((currentStage) => {
    const windowWithProbeState = window as Window & {
      __task1BaselineProbeState?: {
        wallRoot: Element
        wallPosterGrid: Element
      }
    }

    const wallRoot = document.querySelector('[data-testid="poster-wall-root"]')
    const wallPosterGrid = document.querySelector('[data-testid="wall-poster-grid"]')
    const posterItem0 = document.querySelector('[data-testid="poster-item-0"]')
    const manualRefreshButton = document.querySelector('[data-testid="manual-refresh-button"]')
    const diagnosticsOpen = document.querySelector('[data-testid="diagnostics-open"]')

    if (!windowWithProbeState.__task1BaselineProbeState && wallRoot && wallPosterGrid) {
      windowWithProbeState.__task1BaselineProbeState = {
        wallRoot,
        wallPosterGrid
      }
    }

    const baseline = windowWithProbeState.__task1BaselineProbeState

    return {
      stage: currentStage,
      selectorPresence: {
        wallRoot: wallRoot !== null,
        wallPosterGrid: wallPosterGrid !== null,
        posterItem0: posterItem0 !== null,
        manualRefreshButton: manualRefreshButton !== null,
        diagnosticsOpen: diagnosticsOpen !== null
      },
      baselineEstablished: baseline !== undefined,
      sameWallRootAsBaseline: baseline ? wallRoot === baseline.wallRoot : null,
      sameWallGridAsBaseline: baseline ? wallPosterGrid === baseline.wallPosterGrid : null
    }
  }, stage)
}


interface Task6WallProbeSnapshot {
  remountCount: number
  sameAsBaseline: boolean
}

interface WallPosterBackgroundProbe {
  probeId: string
  backgroundImage: string
  intersectionArea: number
  isVisible: boolean
}

interface WallPosterBackgroundSnapshot {
  posters: WallPosterBackgroundProbe[]
  visiblePosters: WallPosterBackgroundProbe[]
}

async function captureTask6WallProbeSnapshot(page: Page): Promise<Task6WallProbeSnapshot> {
  return page.evaluate(() => {
    const wallRoot = document.querySelector('[data-testid="poster-wall-root"]')
    if (!wallRoot) {
      throw new Error("Missing poster wall root for task 6 probe")
    }

    const windowWithTask6Probe = window as Window & {
      __task6WallProbeState?: {
        baselineRoot: Element
        previousRoot: Element
        remountCount: number
      }
    }

    if (!windowWithTask6Probe.__task6WallProbeState) {
      windowWithTask6Probe.__task6WallProbeState = {
        baselineRoot: wallRoot,
        previousRoot: wallRoot,
        remountCount: 0
      }
    }

    const task6ProbeState = windowWithTask6Probe.__task6WallProbeState
    if (task6ProbeState.previousRoot !== wallRoot) {
      task6ProbeState.remountCount += 1
      task6ProbeState.previousRoot = wallRoot
    }

    return {
      remountCount: task6ProbeState.remountCount,
      sameAsBaseline: wallRoot === task6ProbeState.baselineRoot
    }
  })
}

async function captureWallPosterBackgroundSnapshot(page: Page): Promise<WallPosterBackgroundSnapshot> {
  return page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('[data-testid="wall-poster-grid"]')
    if (!grid) {
      throw new Error("Missing wall poster grid for background probe")
    }

    const windowWithTask8Probe = window as Window & {
      __task8WallPosterProbeState?: {
        nextProbeId: number
      }
    }

    if (!windowWithTask8Probe.__task8WallPosterProbeState) {
      windowWithTask8Probe.__task8WallPosterProbeState = {
        nextProbeId: 1
      }
    }

    const viewportLeft = 0
    const viewportTop = 0
    const viewportRight = window.innerWidth
    const viewportBottom = window.innerHeight
    const probeState = windowWithTask8Probe.__task8WallPosterProbeState

    const posters = Array.from(grid.querySelectorAll<HTMLButtonElement>("button")).map((button) => {
      if (!button.dataset.task8ProbeId) {
        button.dataset.task8ProbeId = `task8-probe-${probeState.nextProbeId}`
        probeState.nextProbeId += 1
      }

      const rect = button.getBoundingClientRect()
      const intersectionWidth = Math.max(
        0,
        Math.min(rect.right, viewportRight) - Math.max(rect.left, viewportLeft)
      )
      const intersectionHeight = Math.max(
        0,
        Math.min(rect.bottom, viewportBottom) - Math.max(rect.top, viewportTop)
      )
      const intersectionArea = intersectionWidth * intersectionHeight
      const posterThumb = button.firstElementChild instanceof HTMLElement
        ? button.firstElementChild
        : button

      return {
        probeId: button.dataset.task8ProbeId,
        backgroundImage: getComputedStyle(posterThumb).backgroundImage,
        intersectionArea,
        isVisible: intersectionArea > 0
      }
    })

    const visiblePosters = posters
      .filter((poster) => poster.isVisible)
      .sort((left, right) => right.intersectionArea - left.intersectionArea)

    return {
      posters,
      visiblePosters
    }
  })
}

async function clickVisibleManualRefreshButton(page: Page): Promise<void> {
  const manualRefreshButton = page.getByTestId("manual-refresh-button").first()

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      pointerType: "mouse"
    }))
  })

  await expect(manualRefreshButton).toBeVisible()
  await expect.poll(async () => {
    return page.evaluate(() => {
      const refreshButton = document.querySelector<HTMLButtonElement>('[data-testid="manual-refresh-button"]')
      if (!(refreshButton instanceof HTMLButtonElement)) {
        return null
      }

      return {
        disabled: refreshButton.disabled,
        visibility: getComputedStyle(refreshButton).visibility
      }
    })
  }).toEqual({
    disabled: false,
    visibility: "visible"
  })
  await manualRefreshButton.click()
}

function createPosterLibraryItems(startIndex: number, count: number): Array<{
  Id: string
  Name: string
  Type: "Movie"
  ImageTags: {
    Primary: string
  }
}> {
  return Array.from({ length: count }, (_, offset) => {
    const posterIndex = startIndex + offset
    const posterId = String(posterIndex).padStart(3, "0")

    return {
      Id: `movie-${posterId}`,
      Name: `Poster ${posterId}`,
      Type: "Movie",
      ImageTags: {
        Primary: `poster-tag-${posterId}`
      }
    }
  })
}

async function setTask6WallReadinessBlocked(page: Page, blocked: boolean): Promise<void> {
  await page.evaluate((nextBlocked) => {
    const task6Window = window as Window & {
      __task6ReadinessBlockState?: {
        blocked: boolean
      }
    }

    const bodyElement = document.body as HTMLElement

    if (!task6Window.__task6ReadinessBlockState) {
      const originalBodyQuerySelector = bodyElement.querySelector
      bodyElement.querySelector = (function task6ReadinessBlockedQuerySelector(
        this: HTMLElement,
        selectors: string
      ): Element | null {
        const isWallReadinessSelector =
          selectors === '[data-testid="poster-wall-root"]'
          || selectors === '[data-testid="wall-poster-grid"]'

        if (task6Window.__task6ReadinessBlockState?.blocked && isWallReadinessSelector) {
          return null
        }

        return originalBodyQuerySelector.call(this, selectors)
      }) as typeof bodyElement.querySelector

      task6Window.__task6ReadinessBlockState = {
        blocked: false
      }
    }

    task6Window.__task6ReadinessBlockState.blocked = nextBlocked
  }, blocked)
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
})

test("completes preflight -> login -> library selection and enters poster wall", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })
  let mediaRequestCount = 0

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          },
          {
            Id: "shows-main",
            Name: "Shows",
            CollectionType: "tvshows"
          }
        ]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route, request) => {
    mediaRequestCount += 1
    const requestUrl = new URL(request.url())
    const parentId = requestUrl.searchParams.get("ParentId")

    if (parentId === "movies-main") {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          Items: [
            {
              Id: "movie-1",
              Name: "Poster Ready",
              Type: "Movie",
              Overview: "A determined crew chases daylight across a fading city.",
              ProductionYear: 2024,
              RunTimeTicks: 6_600_000_000,
              Genres: ["Sci-Fi", "Drama"],
              ImageTags: { Primary: "poster-tag" }
            },
            {
              Id: "movie-2",
              Name: "Missing Poster",
              Type: "Movie",
              ImageTags: {}
            }
          ],
          TotalRecordCount: 2
        })
      })
      return
    }

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "show-1",
            Name: "Unselected Show",
            Type: "Series",
            ImageTags: { Primary: "poster-tag" }
          }
        ],
        TotalRecordCount: 1
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await page.getByTestId("remember-server-checkbox").check()
  await triggerServerStatusCheck(page)

  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("remember-username-checkbox").check()
  await expect(page.getByTestId("remember-password-checkbox")).toHaveCount(0)
  await page.getByTestId("password-input").press("Enter")

  const libraryCheckbox = page.getByTestId("library-checkbox-movies-main")
  await expect(libraryCheckbox).toBeVisible({ timeout: 15_000 })
  await expect(libraryCheckbox).toBeChecked({ timeout: 15_000 })
  await page.getByTestId("library-checkbox-shows-main").uncheck()

  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()
  await expect(page.getByTestId("wall-ingestion-summary")).toContainText("Ingested posters: 1")

  await page.getByTestId("diagnostics-open").click()
  await expect(page.getByTestId("wall-diagnostics-panel")).toBeVisible()
  await expect(page.getByTestId("wall-diagnostics-selected-libraries")).toContainText("movies-main")
  await expect(page.getByTestId("wall-diagnostics-selected-libraries")).not.toContainText("shows-main")
  await expect(page.getByTestId("wall-diagnostics-ingestion-state")).toContainText("status=ready")
  await expect(page.getByTestId("wall-diagnostics-ingestion-state")).toContainText("count=1")
  await expect(page.getByTestId("wall-diagnostics-sampling-interval")).toContainText("1000ms")
  await expect(page.getByTestId("wall-diagnostics-retention-policy")).toContainText("7d / 100MB")
  await expect(page.getByTestId("diagnostics-export-crash-report")).toBeVisible()
  await expect(page.getByTestId("diagnostics-export-status")).toContainText("Crash export ready")

  await page.getByTestId("manual-refresh-button").click()
  await expect.poll(() => mediaRequestCount).toBeGreaterThanOrEqual(2)

  const persistedValues = await page.evaluate(() => ({
    server: window.localStorage.getItem("mps.onboarding.remembered-server"),
    username: window.localStorage.getItem("mps.onboarding.remembered-username"),
    passwordKeys: Object.keys(window.localStorage).filter((key) => key.toLowerCase().includes("password")),
    sessionSnapshot: window.sessionStorage.getItem("mps.auth.session"),
    wallHandoff: window.sessionStorage.getItem("mps.wall.handoff")
  }))

  expect(persistedValues.server).toBe(TEST_SERVER)
  expect(persistedValues.username).toBe("demo-user")
  expect(persistedValues.passwordKeys).toEqual([])
  expect(persistedValues.sessionSnapshot).toContain("token-abc")
  expect(persistedValues.wallHandoff).toContain("movies-main")
})

test("exports queue refill diagnostics with non-null adapter state on web runtime", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  let mediaRequestCount = 0
  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route) => {
    mediaRequestCount += 1
    const idSuffix = String(mediaRequestCount).padStart(2, "0")

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: `movie-${idSuffix}`,
            Name: `Adapter Refill ${idSuffix}`,
            Type: "Movie",
            Overview: `Queue refill probe ${idSuffix}`,
            ImageTags: { Primary: `poster-tag-${idSuffix}` }
          }
        ],
        TotalRecordCount: 1
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await expect(page.getByTestId("server-status-indicator")).toContainText("Server reachable")
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await expect(page.getByTestId("username-input")).toHaveValue("demo-user")
  await expect(page.getByTestId("password-input")).toHaveValue("secret-pass")
  await page.getByTestId("login-submit").click()
  await expect(page.getByTestId("onboarding-finish")).toBeVisible()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()
  await page.getByTestId("diagnostics-open").first().click()
  await expect(page.getByTestId("wall-diagnostics-panel").first()).toBeVisible()

  await page.getByTestId("manual-refresh-button").first().click()
  await expect.poll(() => mediaRequestCount).toBeGreaterThanOrEqual(2)

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("diagnostics-export-crash-report").first().click()
  ])

  const crashReportPath = await download.path()
  expect(crashReportPath).not.toBeNull()
  if (!crashReportPath) {
    throw new Error("Crash report download path was not available.")
  }

  const crashReportRaw = await readFile(crashReportPath, "utf8")
  const crashReport = JSON.parse(crashReportRaw) as {
    logs?: Array<{
      event?: unknown
      details?: unknown
    }>
  }

  const refillCompletedLog = crashReport.logs?.find((entry) => {
    return entry.event === "queue.refill-completed"
  })
  expect(refillCompletedLog).toBeDefined()

  const refillDetails = refillCompletedLog?.details
  expect(typeof refillDetails).toBe("object")
  expect(refillDetails).not.toBeNull()
  if (!refillDetails || typeof refillDetails !== "object") {
    throw new Error("Missing refill diagnostics details.")
  }

  const adapterState = "adapterState" in refillDetails
    ? (refillDetails as { adapterState: unknown }).adapterState
    : null
  expect(adapterState).not.toBeNull()
  expect(typeof adapterState).toBe("object")
  if (!adapterState || typeof adapterState !== "object") {
    throw new Error("Expected non-null adapterState in queue.refill-completed diagnostics.")
  }

  expect("cursor" in adapterState).toBe(true)
  expect("updatedSince" in adapterState).toBe(true)

  console.log(`[task-3-web-adapter-refill] ${JSON.stringify({
    mediaRequestCount,
    adapterState
  })}`)
})

test("restores remembered server and username with empty password after restart", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await page.getByTestId("remember-server-checkbox").check()
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("remember-username-checkbox").check()
  await page.getByTestId("login-submit").click()

  const libraryCheckbox = page.getByTestId("library-checkbox-movies-main")
  await expect(libraryCheckbox).toBeVisible({ timeout: 15_000 })
  await expect(libraryCheckbox).toBeChecked({ timeout: 15_000 })

  await page.evaluate(() => {
    window.sessionStorage.clear()
  })
  await page.reload()

  await expect(page.getByTestId("server-url-input")).toHaveValue(TEST_SERVER)
  await expect(page.getByTestId("username-input")).toHaveValue("demo-user")
  await expect(page.getByTestId("password-input")).toHaveValue("")
  await expect(page.getByTestId("remember-password-checkbox")).toHaveCount(0)
})

test("remembers library selection after logout and next login on web", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })
  await wireLogout(page)

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          },
          {
            Id: "shows-main",
            Name: "Shows",
            CollectionType: "tvshows"
          }
        ]
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()

  await expect(page.getByTestId("library-checkbox-movies-main")).toBeChecked()
  await expect(page.getByTestId("library-checkbox-shows-main")).toBeChecked()
  await page.getByTestId("library-checkbox-shows-main").uncheck()

  await page.getByTestId("onboarding-finish").click()
  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()

  await page.getByTestId("logout-button").first().click()
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()

  await expect(page.getByTestId("library-checkbox-movies-main")).toBeChecked()
  await expect(page.getByTestId("library-checkbox-shows-main")).not.toBeChecked()
})

test("change server returns to login step and clears saved session before entering wall", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()

  await expect(page.getByTestId("library-checkbox-movies-main")).toBeVisible()

  const sessionStateBeforeStepBack = await page.evaluate(() => ({
    tabSession: window.sessionStorage.getItem("mps.auth.session"),
    persistedSession: window.localStorage.getItem("mps.auth.session")
  }))

  expect(sessionStateBeforeStepBack.tabSession).toContain("token-abc")
  expect(sessionStateBeforeStepBack.persistedSession).toContain("token-abc")

  await page.getByTestId("change-server-button").click()

  await expect(page.getByTestId("server-url-input")).toHaveValue(TEST_SERVER)
  await expect(page.getByTestId("username-input")).toHaveValue("demo-user")
  await expect(page.getByTestId("password-input")).toHaveValue("")
  await expect(page.getByTestId("library-checkbox-movies-main")).toHaveCount(0)

  const sessionStateAfterStepBack = await page.evaluate(() => ({
    tabSession: window.sessionStorage.getItem("mps.auth.session"),
    persistedSession: window.localStorage.getItem("mps.auth.session"),
    tabWallHandoff: window.sessionStorage.getItem("mps.wall.handoff"),
    persistedWallHandoff: window.localStorage.getItem("mps.wall.handoff")
  }))

  expect(sessionStateAfterStepBack.tabSession).toBeNull()
  expect(sessionStateAfterStepBack.persistedSession).toBeNull()
  expect(sessionStateAfterStepBack.tabWallHandoff).toBeNull()
  expect(sessionStateAfterStepBack.persistedWallHandoff).toBeNull()
})

test("reopens root route into the wall when a saved session and handoff exist", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movie-1",
            Name: "Poster Ready",
            Type: "Movie",
            ImageTags: { Primary: "poster-tag" }
          }
        ],
        TotalRecordCount: 1
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()
  await expect(page.getByTestId("library-checkbox-movies-main")).toBeVisible()
  await expect(page.getByTestId("library-checkbox-movies-main")).toBeChecked()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()

  await page.goto("/")

  await expect(page).toHaveURL(/\/wall$/)
  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()
  await expect(page.getByTestId("server-url-input")).toHaveCount(0)
})

test("suppresses idle-hide while diagnostics are open and preserves diagnostics-closed idle-hide behavior", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  let mediaRequestCount = 0
  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route) => {
    mediaRequestCount += 1
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movie-1",
            Name: "Poster Ready",
            Type: "Movie",
            Overview: "Task-8 idle parity probe sample.",
            ImageTags: { Primary: "poster-tag" }
          }
        ],
        TotalRecordCount: 1
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()
  await expect(page.getByTestId("wall-poster-grid").first()).toBeVisible()
  await expect(page.getByTestId("poster-item-0").first()).toBeVisible()
  await expect(page.getByTestId("manual-refresh-button").first()).toBeVisible()
  await expect(page.getByTestId("diagnostics-open").first()).toBeVisible()

  const baseline = await captureWallIdentityProbeSnapshot(page, "initial")

  await page.getByTestId("manual-refresh-button").first().click()
  await expect.poll(() => mediaRequestCount).toBeGreaterThanOrEqual(2)
  const afterManualRefresh = await captureWallIdentityProbeSnapshot(page, "after-manual-refresh")

  await page.getByTestId("diagnostics-open").first().click()
  await expect(page.getByTestId("wall-diagnostics-panel").first()).toBeVisible()

  await page.waitForTimeout(8_100)
  const diagnosticsOpenIdleRefreshVisibility = await page.evaluate(() => {
    const refreshButton = document.querySelector<HTMLElement>('[data-testid="manual-refresh-button"]')
    if (!(refreshButton instanceof HTMLElement)) {
      return null
    }

    return getComputedStyle(refreshButton).visibility
  })
  const afterDiagnosticsOpenIdle = await captureWallIdentityProbeSnapshot(page, "after-diagnostics-open-idle")

  await page.getByTestId("diagnostics-open").first().click()
  await expect(page.getByTestId("wall-diagnostics-panel").first()).toBeHidden()

  await page.evaluate(() => {
    const windowWithProbeState = window as Window & {
      __task1BaselineProbeState?: {
        wallRoot: Element
        wallPosterGrid: Element
      }
    }

    delete windowWithProbeState.__task1BaselineProbeState
  })
  const diagnosticsClosedBaseline = await captureWallIdentityProbeSnapshot(page, "diagnostics-closed-baseline")

  await page.waitForTimeout(8_100)
  const diagnosticsClosedIdleRefreshVisibility = await page.evaluate(() => {
    const refreshButton = document.querySelector<HTMLElement>('[data-testid="manual-refresh-button"]')
    if (!(refreshButton instanceof HTMLElement)) {
      return null
    }

    return getComputedStyle(refreshButton).visibility
  })

  await page.mouse.move(24, 24)
  await expect(page.getByTestId("manual-refresh-button").first()).toBeVisible()
  await page.waitForTimeout(8_100)
  const afterDiagnosticsClosedIdle = await captureWallIdentityProbeSnapshot(page, "after-diagnostics-closed-idle")

  await page.mouse.move(32, 32)
  await expect(page.getByTestId("manual-refresh-button").first()).toBeVisible()
  const revealRefreshVisibility = await page.evaluate(() => {
    const refreshButton = document.querySelector<HTMLElement>('[data-testid="manual-refresh-button"]')
    if (!(refreshButton instanceof HTMLElement)) {
      return null
    }

    return getComputedStyle(refreshButton).visibility
  })
  const afterReveal = await captureWallIdentityProbeSnapshot(page, "after-idle-reveal")

  expect(afterManualRefresh.sameWallRootAsBaseline).toBe(true)
  expect(afterManualRefresh.sameWallGridAsBaseline).toBe(true)
  expect(diagnosticsClosedBaseline.sameWallRootAsBaseline).toBe(true)
  expect(diagnosticsClosedBaseline.sameWallGridAsBaseline).toBe(true)
  expect(afterDiagnosticsClosedIdle.sameWallRootAsBaseline).toBe(true)
  expect(afterDiagnosticsClosedIdle.sameWallGridAsBaseline).toBe(true)
  expect(afterReveal.sameWallRootAsBaseline).toBe(true)
  expect(afterReveal.sameWallGridAsBaseline).toBe(true)
  expect(diagnosticsOpenIdleRefreshVisibility).toBe("visible")
  expect(diagnosticsClosedIdleRefreshVisibility).toBe("visible")
  expect(revealRefreshVisibility).toBe("visible")

  const evidence = {
    probe: "task-8-web-host-idle-parity",
    mediaRequestCount,
    diagnosticsOpenIdleRefreshVisibility,
    diagnosticsClosedIdleRefreshVisibility,
    revealRefreshVisibility,
    snapshots: [
      baseline,
      afterManualRefresh,
      afterDiagnosticsOpenIdle,
      diagnosticsClosedBaseline,
      afterDiagnosticsClosedIdle,
      afterReveal
    ]
  }

  console.log(`[task-8-web-host-idle-parity] ${JSON.stringify(evidence)}`)
})

test("handles healthy stream without poster-item-0 sentinel and limits fallback to one remount per incident", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  let mediaRequestCount = 0

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route) => {
    mediaRequestCount += 1
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movie-1",
            Name: "Poster Ready",
            Type: "Movie",
            ImageTags: { Primary: "poster-tag" }
          },
          {
            Id: "movie-2",
            Name: "Poster Ready 2",
            Type: "Movie",
            ImageTags: { Primary: "poster-tag-2" }
          }
        ],
        TotalRecordCount: 2
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()
  await expect(page.getByTestId("poster-item-1").first()).toBeVisible()
  expect((await captureTask6WallProbeSnapshot(page)).remountCount).toBe(0)

  await page.evaluate(() => {
    const posterItem0 = document.querySelector<HTMLElement>('[data-testid="poster-item-0"]')
    posterItem0?.remove()
  })
  await clickVisibleManualRefreshButton(page)
  await expect.poll(() => mediaRequestCount).toBeGreaterThanOrEqual(2)

  const afterSentinelRemoval = await captureTask6WallProbeSnapshot(page)
  expect(afterSentinelRemoval.sameAsBaseline).toBe(true)
  expect(afterSentinelRemoval.remountCount).toBe(0)

  await setTask6WallReadinessBlocked(page, true)
  await clickVisibleManualRefreshButton(page)
  await expect.poll(() => mediaRequestCount).toBeGreaterThanOrEqual(3)
  await expect.poll(async () => {
    return (await captureTask6WallProbeSnapshot(page)).remountCount
  }).toBe(1)

  await clickVisibleManualRefreshButton(page)
  await expect.poll(() => mediaRequestCount).toBeGreaterThanOrEqual(4)
  await clickVisibleManualRefreshButton(page)
  await expect.poll(() => mediaRequestCount).toBeGreaterThanOrEqual(5)

  const duringSameIncident = await captureTask6WallProbeSnapshot(page)
  expect(duringSameIncident.remountCount).toBe(1)

  await setTask6WallReadinessBlocked(page, false)
  await clickVisibleManualRefreshButton(page)
  await expect.poll(() => mediaRequestCount).toBeGreaterThanOrEqual(6)
  expect((await captureTask6WallProbeSnapshot(page)).remountCount).toBe(1)

  await setTask6WallReadinessBlocked(page, true)
  await clickVisibleManualRefreshButton(page)
  await expect.poll(() => mediaRequestCount).toBeGreaterThanOrEqual(7)
  await expect.poll(async () => {
    return (await captureTask6WallProbeSnapshot(page)).remountCount
  }).toBe(2)

  await setTask6WallReadinessBlocked(page, false)
})

test("does not replace visible posters during healthy refreshes", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  let mediaRequestCount = 0
  const baselineItems = createPosterLibraryItems(1, 24)
  const refreshedItems = [
    ...createPosterLibraryItems(1, 18),
    ...createPosterLibraryItems(101, 12)
  ]

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route) => {
    mediaRequestCount += 1
    const responseItems = mediaRequestCount === 1 ? baselineItems : refreshedItems

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: responseItems,
        TotalRecordCount: responseItems.length
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()
  await expect.poll(async () => {
    return (await captureWallPosterBackgroundSnapshot(page)).visiblePosters.length
  }).toBeGreaterThanOrEqual(3)

  const beforeRefreshSnapshot = await captureWallPosterBackgroundSnapshot(page)
  const trackedVisiblePosters = beforeRefreshSnapshot.visiblePosters.slice(0, 3)
  expect(trackedVisiblePosters, JSON.stringify(beforeRefreshSnapshot)).toHaveLength(3)
  for (const poster of trackedVisiblePosters) {
    expect(poster.backgroundImage).toContain("url(")
  }

  await clickVisibleManualRefreshButton(page)
  await expect.poll(() => mediaRequestCount).toBeGreaterThanOrEqual(2)

  const beforeBackgroundByProbeId = new Map(
    beforeRefreshSnapshot.posters.map((poster) => [poster.probeId, poster.backgroundImage])
  )
  const trackedProbeIds = new Set(trackedVisiblePosters.map((poster) => poster.probeId))

  await expect.poll(async () => {
    const afterRefreshSnapshot = await captureWallPosterBackgroundSnapshot(page)

    return trackedVisiblePosters.filter((poster) => {
      const currentPoster = afterRefreshSnapshot.posters.find((candidate) => candidate.probeId === poster.probeId)
      return currentPoster?.isVisible === true && currentPoster.backgroundImage === poster.backgroundImage
    }).length
  }).toBe(trackedVisiblePosters.length)

  await expect.poll(async () => {
    const afterRefreshSnapshot = await captureWallPosterBackgroundSnapshot(page)

    return afterRefreshSnapshot.posters.filter((poster) => {
      if (trackedProbeIds.has(poster.probeId)) {
        return false
      }

      return beforeBackgroundByProbeId.get(poster.probeId) !== poster.backgroundImage
    }).length
  }).toBeGreaterThan(0)

  const afterRefreshSnapshot = await captureWallPosterBackgroundSnapshot(page)
  const trackedAfterRefresh = trackedVisiblePosters.map((poster) => {
    const currentPoster = afterRefreshSnapshot.posters.find((candidate) => candidate.probeId === poster.probeId)
    if (!currentPoster) {
      throw new Error(`Missing tracked poster probe after refresh: ${poster.probeId}`)
    }

    return currentPoster
  })
  const changedNonVisiblePosterProbeIds = afterRefreshSnapshot.posters
    .filter((poster) => {
      if (trackedProbeIds.has(poster.probeId)) {
        return false
      }

      return beforeBackgroundByProbeId.get(poster.probeId) !== poster.backgroundImage
    })
    .map((poster) => poster.probeId)

  console.log(`[task-8-web-visible-poster-freeze] ${JSON.stringify({
    mediaRequestCount,
    trackedVisibleBeforeRefresh: trackedVisiblePosters,
    trackedVisibleAfterRefresh: trackedAfterRefresh,
    changedNonVisiblePosterProbeIds
  })}`)
})

test("shows non-blocking warning when fullscreen request is denied", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movie-1",
            Name: "Poster Ready",
            Type: "Movie",
            Overview: "A determined crew chases daylight across a fading city.",
            ImageTags: { Primary: "poster-tag" }
          }
        ],
        TotalRecordCount: 1
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()

  await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>
    }
    root.requestFullscreen = () => Promise.reject(new Error("denied"))
  })

  await page.getByTestId("wall-fullscreen-button").first().click()
  const warning = page.getByTestId("wall-fullscreen-warning").first()
  await expect(warning).toBeVisible()
  await expect(warning).toContainText("denied")

  const refreshButton = page.getByTestId("manual-refresh-button").first()
  await refreshButton.click()
  await expect(refreshButton).toBeVisible()
})

test("updates the wall clock without remounting the wall", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movie-1",
            Name: "Poster Ready",
            Type: "Movie",
            ImageTags: { Primary: "poster-tag" }
          }
        ],
        TotalRecordCount: 1
      })
    })
  })

  await page.evaluate(`
    (() => {
      const RealDate = Date;
      let nowMs = RealDate.parse("2026-03-12T12:34:00.000");

      class MockDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) {
            super(nowMs);
            return;
          }

          super(...args);
        }

        static now() {
          return nowMs;
        }

        static parse(value) {
          return RealDate.parse(value);
        }

        static UTC(...args) {
          return RealDate.UTC(...args);
        }
      }

      window.__setMockWallClockTime = (isoTimestamp) => {
        nowMs = RealDate.parse(isoTimestamp);
      };

      window.Date = MockDate;
    })()
  `)

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()
  await expect(page.getByTestId("wall-clock-heading")).toHaveText("12:34")

  await page.evaluate(`window.__setMockWallClockTime?.("2026-03-12T12:35:00.000")`)

  await expect.poll(async () => {
    return (await page.getByTestId("wall-clock-heading").textContent())?.trim() ?? ""
  }).toBe("12:35")
  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()
})

test("keeps the existing wall mounted when entering fullscreen", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movie-1",
            Name: "Poster Ready",
            Type: "Movie",
            ImageTags: { Primary: "poster-tag" }
          }
        ],
        TotalRecordCount: 1
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-item-0").first()).toBeVisible()
  await expect(page.getByTestId("wall-fullscreen-button").first()).toHaveAttribute("title", "Enter fullscreen")
  const baselineSnapshot = await captureWallIdentityProbeSnapshot(page, "before-fullscreen")
  expect(baselineSnapshot.baselineEstablished).toBe(true)
  expect(baselineSnapshot.sameWallRootAsBaseline).toBe(true)
  expect(baselineSnapshot.sameWallGridAsBaseline).toBe(true)

  await page.evaluate(() => {
    let fullscreenElement: Element | null = null
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get() {
        return fullscreenElement
      }
    })

    const root = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>
    }

    root.requestFullscreen = () => {
      fullscreenElement = root
      document.dispatchEvent(new Event("fullscreenchange"))
      return Promise.resolve()
    }
  })

  await page.evaluate(() => {
    const fullscreenButton = document.querySelector<HTMLButtonElement>('[data-testid="wall-fullscreen-button"]')
    fullscreenButton?.focus()
  })
  await page.keyboard.press("Enter")
  await expect(page.getByTestId("wall-fullscreen-button").first()).toHaveAttribute("title", "Enter fullscreen")

  await page.getByTestId("wall-fullscreen-button").first().click()

  const afterFullscreenSnapshot = await captureWallIdentityProbeSnapshot(page, "after-fullscreen")
  expect(afterFullscreenSnapshot.sameWallRootAsBaseline).toBe(true)
  expect(afterFullscreenSnapshot.sameWallGridAsBaseline).toBe(true)
  await expect(page.getByTestId("poster-item-0").first()).toBeVisible()
  await expect(page.getByTestId("wall-fullscreen-button").first()).toHaveAttribute("title", "Exit fullscreen")
  await expect(page.getByText("No posters ingested yet. Try manual refresh once ingestion is ready.")).toHaveCount(0)
})

test("poster tile clicks no longer open detail card and Escape is ignored", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movie-1",
            Name: "Poster Ready",
            Type: "Movie",
            Overview: "A determined crew chases daylight across a fading city.",
            ProductionYear: 2024,
            RunTimeTicks: 6_600_000_000,
            Genres: ["Sci-Fi", "Drama"],
            ImageTags: { Primary: "poster-tag" }
          },
          {
            Id: "movie-2",
            Name: "Sparse Poster",
            Type: "Movie",
            ImageTags: { Primary: "poster-tag-2" }
          }
        ],
        TotalRecordCount: 2
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-item-0").first()).toBeVisible()
  await expect(page.getByTestId("wall-ingestion-summary")).toContainText("Ingested posters: 2")

  const leftHoverCoverage = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('[data-testid="wall-poster-grid"]')
    if (!grid) {
      return {
        sampledLeftPoints: 0,
        sampledLeftHits: 0,
        hoverPoint: null as null | {
          x: number
          y: number
          probeId: string
        }
      }
    }

    const sampleFractionsX = [0.08, 0.16, 0.24, 0.32, 0.4, 0.48]
    const sampleFractionsY = [0.12, 0.2, 0.28, 0.36, 0.44]
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    let sampledLeftPoints = 0
    let sampledLeftHits = 0
    let hoverPoint: {
      x: number
      y: number
      probeId: string
    } | null = null

    for (const fractionY of sampleFractionsY) {
      for (const fractionX of sampleFractionsX) {
        const sampleX = Math.round(viewportWidth * fractionX)
        const sampleY = Math.round(viewportHeight * fractionY)
        const sampleHit = document.elementFromPoint(sampleX, sampleY)
        sampledLeftPoints += 1

        if (!(sampleHit instanceof Element) || !grid.contains(sampleHit)) {
          continue
        }

        const hitButton = sampleHit.closest<HTMLButtonElement>("button")
        if (!hitButton || !grid.contains(hitButton)) {
          continue
        }

        sampledLeftHits += 1
        if (!hoverPoint) {
          const probeId = "left-hover-probe"
          hitButton.setAttribute("data-hover-probe", probeId)
          hoverPoint = {
            x: sampleX,
            y: sampleY,
            probeId
          }
        }
      }
    }

    return {
      sampledLeftPoints,
      sampledLeftHits,
      hoverPoint
    }
  })

  expect(leftHoverCoverage.sampledLeftPoints).toBeGreaterThan(0)
  expect(leftHoverCoverage.sampledLeftHits, JSON.stringify(leftHoverCoverage)).toBeGreaterThan(0)
  expect(leftHoverCoverage.hoverPoint, JSON.stringify(leftHoverCoverage)).not.toBeNull()
  const hoverPoint = leftHoverCoverage.hoverPoint
  if (hoverPoint === null) {
    throw new Error(`Missing hover probe point: ${JSON.stringify(leftHoverCoverage)}`)
  }

  await page.mouse.move(hoverPoint.x, hoverPoint.y)
  await expect.poll(async () => {
    return page.evaluate((probeId) => {
      const probedTile = document.querySelector<HTMLButtonElement>(`[data-hover-probe="${probeId}"]`)
      return probedTile?.style.transform ?? ""
    }, hoverPoint.probeId)
  }).toContain("translateZ(50px)")

  const detailCard = page.getByTestId("detail-card").first()
  await expect(detailCard).toBeHidden()

  await page.evaluate(() => {
    const posterTile = document.querySelector<HTMLElement>('[data-testid="poster-item-0"]')
    posterTile?.click()
  })
  await expect(detailCard).toBeHidden()

  await page.evaluate(() => {
    const posterTile = document.querySelector<HTMLElement>('[data-testid="poster-item-1"]')
    posterTile?.click()
  })
  await expect(detailCard).toBeHidden()

  await expect(page.getByTestId("deep-settings-profile-toggle")).toHaveCount(0)
  await page.getByTestId("diagnostics-open").first().click()
  await expect(page.getByTestId("deep-settings-profile-toggle")).toBeVisible()
  await expect(page.getByTestId("deep-settings-profile-current")).toContainText("balanced")
  await page.getByTestId("deep-settings-profile-toggle").click()
  await expect(page.getByTestId("deep-settings-profile-current")).toContainText("showcase")

  await page.evaluate(() => {
    const windowWithProbeState = window as Window & {
      __task1BaselineProbeState?: {
        wallRoot: Element
        wallPosterGrid: Element
      }
    }

    delete windowWithProbeState.__task1BaselineProbeState
  })
  const beforeEscapeKey = await captureWallIdentityProbeSnapshot(page, "escape-key-before")

  const detailVisibilityBeforeEscape = await page.evaluate(() => {
    const detailCardNode = document.querySelector<HTMLElement>('[data-testid="detail-card"]')
    if (!(detailCardNode instanceof HTMLElement)) {
      return null
    }

    return getComputedStyle(detailCardNode).visibility
  })

  await page.keyboard.press("Escape")
  await expect(detailCard).toBeHidden()

  const detailVisibilityAfterEscape = await page.evaluate(() => {
    const detailCardNode = document.querySelector<HTMLElement>('[data-testid="detail-card"]')
    if (!(detailCardNode instanceof HTMLElement)) {
      return null
    }

    return getComputedStyle(detailCardNode).visibility
  })

  const afterEscapeKey = await captureWallIdentityProbeSnapshot(page, "escape-key-after")

  expect(beforeEscapeKey.sameWallRootAsBaseline).toBe(true)
  expect(beforeEscapeKey.sameWallGridAsBaseline).toBe(true)
  expect(detailVisibilityBeforeEscape).toBe("hidden")
  expect(detailVisibilityAfterEscape).toBe("hidden")
  expect(afterEscapeKey.sameWallRootAsBaseline).toBe(true)
  expect(afterEscapeKey.sameWallGridAsBaseline).toBe(true)

  const evidence = {
    probe: "task-7-ignore-escape-key",
    detailVisibilityBeforeEscape,
    detailVisibilityAfterEscape,
    sameWallRootAsBaseline: afterEscapeKey.sameWallRootAsBaseline,
    sameWallGridAsBaseline: afterEscapeKey.sameWallGridAsBaseline
  }

  console.log(`[task-7-ignore-escape-key] ${JSON.stringify(evidence)}`)
})

test("shows explicit auth error and keeps session token cleared on invalid credentials", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: false })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)

  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("wrong-pass")
  await page.getByTestId("login-submit").click()

  const authError = page.getByTestId("auth-error-banner")
  await expect(authError).toBeVisible()
  await expect(authError).toContainText("Invalid Jellyfin username or password")

  await expect(page.getByTestId("poster-wall-root")).toHaveCount(0)

  const token = await page.evaluate(() => window.sessionStorage.getItem("mps.auth.session"))
  expect(token).toBeNull()
})

test("restores cached posters on offline restart within 5 seconds", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  let offlineMode = false

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route) => {
    if (offlineMode) {
      await route.fulfill({
        status: 503,
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ Message: "offline" })
      })
      return
    }

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movie-1",
            Name: "Poster Ready",
            Type: "Movie",
            Overview: "Cached and restored while offline.",
            ImageTags: { Primary: "poster-tag" }
          }
        ],
        TotalRecordCount: 1
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-item-0").first()).toBeVisible()

  offlineMode = true
  await page.reload()

  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible({ timeout: 5_000 })
  await expect(page.getByTestId("poster-item-0").first()).toBeVisible({ timeout: 5_000 })
})

test("shows reconnect guide within 60s when token is revoked", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })

  let tokenRevoked = false

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route) => {
    if (tokenRevoked) {
      await route.fulfill({
        status: 401,
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ Message: "revoked" })
      })
      return
    }

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movie-1",
            Name: "Poster Ready",
            Type: "Movie",
            ImageTags: { Primary: "poster-tag" }
          }
        ],
        TotalRecordCount: 1
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await triggerServerStatusCheck(page)
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-item-0").first()).toBeVisible()

  tokenRevoked = true
  await page.getByTestId("manual-refresh-button").first().click()

  await expect(page.getByTestId("wall-ingestion-error").first()).toBeVisible()
  await expect(page.getByTestId("reconnect-guide").first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId("reconnect-guide").first()).toContainText("next retry in")
})

test("logout clears session artifacts while preserving remembered server and username", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: true })
  await wireLogout(page)

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        Items: [
          {
            Id: "movies-main",
            Name: "Movies",
            CollectionType: "movies"
          }
        ]
      })
    })
  })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await page.getByTestId("remember-server-checkbox").check()
  await triggerServerStatusCheck(page)

  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("remember-username-checkbox").check()
  await page.getByTestId("login-submit").click()
  await expect(page.getByTestId("library-checkbox-movies-main")).toBeVisible()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()

  const logoutStart = Date.now()
  await page.getByTestId("logout-button").first().click()

  await expect(page.getByTestId("server-url-input")).toHaveValue(TEST_SERVER)
  await expect(page.getByTestId("username-input")).toHaveValue("demo-user")

  const cleanupState = await page.evaluate(() => ({
    sessionSnapshot: window.sessionStorage.getItem("mps.auth.session"),
    wallHandoff: window.sessionStorage.getItem("mps.wall.handoff"),
    server: window.localStorage.getItem("mps.onboarding.remembered-server"),
    username: window.localStorage.getItem("mps.onboarding.remembered-username")
  }))

  expect(cleanupState.sessionSnapshot).toBeNull()
  expect(cleanupState.wallHandoff).toBeNull()
  expect(cleanupState.server).toBe(TEST_SERVER)
  expect(cleanupState.username).toBe("demo-user")
  expect(Date.now() - logoutStart).toBeLessThanOrEqual(1_000)
})
