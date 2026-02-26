import { expect, test, type Page } from "@playwright/test"

const TEST_SERVER = "https://jellyfin.test"

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
  await page.getByTestId("preflight-check-button").click()

  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("remember-username-checkbox").check()
  await expect(page.getByTestId("remember-password-checkbox")).toBeDisabled()
  await page.getByTestId("login-submit").click()

  const libraryCheckbox = page.getByTestId("library-checkbox-movies-main")
  await expect(libraryCheckbox).toBeVisible()
  await expect(libraryCheckbox).toBeChecked()
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
  await page.getByTestId("preflight-check-button").click()
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("remember-username-checkbox").check()
  await page.getByTestId("login-submit").click()

  await expect(page.getByTestId("library-checkbox-movies-main")).toBeVisible()

  await page.evaluate(() => {
    window.sessionStorage.clear()
  })
  await page.reload()

  await expect(page.getByTestId("server-url-input")).toHaveValue(TEST_SERVER)
  await expect(page.getByTestId("username-input")).toHaveValue("demo-user")
  await expect(page.getByTestId("password-input")).toHaveValue("")
  await expect(page.getByTestId("remember-password-checkbox")).toBeDisabled()
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
  await page.getByTestId("preflight-check-button").click()
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

test("poster tiles open detail card with idle hide and exit controls", async ({ page }) => {
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
  await page.getByTestId("preflight-check-button").click()
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("login-submit").click()
  await page.getByTestId("onboarding-finish").click()

  await expect(page.getByTestId("poster-item-0").first()).toBeVisible()
  await expect(page.getByTestId("wall-ingestion-summary")).toContainText("Ingested posters: 2")
  await page.getByTestId("poster-item-0").first().click()

  const detailCard = page.getByTestId("detail-card").first()
  await expect(detailCard).toBeVisible()
  await expect(detailCard).toContainText("Poster Ready")
  await expect(detailCard).toContainText("A determined crew chases daylight")
  await expect(detailCard).toContainText("2024")

  const detailCardLayout = await detailCard.evaluate((element) => {
    return {
      width: (element as HTMLElement).style.width,
      minWidth: (element as HTMLElement).style.minWidth,
      maxWidth: (element as HTMLElement).style.maxWidth,
      left: (element as HTMLElement).style.left,
      top: (element as HTMLElement).style.top,
      placement: (element as HTMLElement).dataset.placement ?? ""
    }
  })

  expect(detailCardLayout.width).toBe("28%")
  expect(detailCardLayout.minWidth).toBe("26%")
  expect(detailCardLayout.maxWidth).toBe("30%")
  expect(["8%", "64%"]).toContain(detailCardLayout.left)
  expect(["10%", "56%"]).toContain(detailCardLayout.top)
  expect(detailCardLayout.placement).not.toBe("default")

  const transitionDurationMs = await detailCard.evaluate((element) => {
    const transition = window.getComputedStyle(element).transitionDuration.split(",")[0]?.trim() ?? "0s"
    if (transition.endsWith("ms")) {
      return Number.parseFloat(transition)
    }

    if (transition.endsWith("s")) {
      return Number.parseFloat(transition) * 1_000
    }

    return 0
  })

  expect(transitionDurationMs).toBeGreaterThanOrEqual(240)
  expect(transitionDurationMs).toBeLessThanOrEqual(320)

  const controlsContainer = page.locator('[data-testid="wall-controls-container"]:visible').last()
  await expect(controlsContainer).toContainText("Operational controls")
  await expect.poll(async () => {
    const transition = await controlsContainer.evaluate((element) => {
      return window.getComputedStyle(element).transitionDuration.split(",")[0]?.trim() ?? "0s"
    })

    if (transition.endsWith("ms")) {
      return Number.parseFloat(transition)
    }

    if (transition.endsWith("s")) {
      return Number.parseFloat(transition) * 1_000
    }

    return 0
  }).toBeGreaterThanOrEqual(240)
  await expect.poll(async () => {
    const transition = await controlsContainer.evaluate((element) => {
      return window.getComputedStyle(element).transitionDuration.split(",")[0]?.trim() ?? "0s"
    })

    if (transition.endsWith("ms")) {
      return Number.parseFloat(transition)
    }

    if (transition.endsWith("s")) {
      return Number.parseFloat(transition) * 1_000
    }

    return 0
  }).toBeLessThanOrEqual(320)

  await expect(page.getByTestId("deep-settings-profile-toggle")).toHaveCount(0)
  await page.getByTestId("diagnostics-open").first().click()
  await expect(page.getByTestId("deep-settings-profile-toggle")).toBeVisible()
  await expect(page.getByTestId("deep-settings-profile-current")).toContainText("balanced")
  await page.getByTestId("deep-settings-profile-toggle").click()
  await expect(page.getByTestId("deep-settings-profile-current")).toContainText("showcase")

  await page.getByTestId("poster-item-1").first().click()
  await expect(detailCard).toContainText("Sparse Poster")
  await expect(page.getByTestId("detail-card-meta")).toContainText("movie")
  await expect(page.getByTestId("detail-card-meta")).not.toContainText("undefined")
  await expect(page.getByTestId("detail-card-overview")).toHaveCount(0)

  await page.keyboard.press("Escape")
  await expect(detailCard).toBeHidden()

  await page.getByTestId("poster-item-0").first().click()
  await expect(detailCard).toBeVisible()
  await page.getByTestId("exit-hotspot").first().click()
  await expect(detailCard).toBeHidden()

  await page.getByTestId("poster-item-0").first().click()
  await expect(detailCard).toBeVisible()
  await page.waitForTimeout(8_100)

  await expect(detailCard).toBeHidden()
  const refreshButton = page.getByTestId("manual-refresh-button").first()
  await expect(refreshButton).toBeHidden()

  await page.mouse.move(10, 10)
  await expect(refreshButton).toBeVisible()
})

test("shows explicit auth error and keeps session token cleared on invalid credentials", async ({ page }) => {
  await wireSuccessfulPreflight(page)
  await wireAuthentication(page, { allowLogin: false })

  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await page.getByTestId("preflight-check-button").click()

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
  await page.getByTestId("preflight-check-button").click()
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
  await page.getByTestId("preflight-check-button").click()
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
  await page.getByTestId("preflight-check-button").click()

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
