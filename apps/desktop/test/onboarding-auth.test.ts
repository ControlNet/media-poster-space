import { webcrypto } from "node:crypto"

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createDesktopOnboardingAppRuntime,
  DESKTOP_PASSWORD_STORE_STORAGE_KEY
} from "../src/onboarding/runtime"
import type {
  DesktopDisplayOption,
  DesktopPlatformBridge
} from "../src/features/platform/tauri-bridge"

const TEST_SERVER = "https://jellyfin.test"

interface FetchHarnessOptions {
  allowLogin: boolean
  logoutDelayMs?: number
  includeSparsePoster?: boolean
  alwaysFailMediaStatus?: number
  mediaFailureStatusAfterFirstSuccess?: number
}

type FetchMock = ReturnType<typeof vi.fn>

function clickByTestId(testId: string): void {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing element: ${testId}`)
  }

  element.click()
}

function getElement(testId: string): HTMLElement {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing element: ${testId}`)
  }

  return element
}

function getInput(testId: string): HTMLInputElement {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${testId}`)
  }

  return element
}

function setInputValue(testId: string, value: string): void {
  const input = getInput(testId)
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function setChecked(testId: string, checked: boolean): void {
  const input = getInput(testId)
  input.checked = checked
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

function setSelectValue(testId: string, value: string): void {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`Missing select: ${testId}`)
  }

  element.value = value
  element.dispatchEvent(new Event("change", { bubbles: true }))
}

function pressEscape(): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
}

function createFetchHarness(options: FetchHarnessOptions): FetchMock & typeof fetch {
  let successfulMovieResponses = 0

  return vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

    if (url.endsWith("/System/Info/Public")) {
      return new Response(JSON.stringify({ Version: "10.9.0" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "http://localhost"
        }
      })
    }

    if (url.endsWith("/Users/AuthenticateByName")) {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as { Username?: string } : {}

      if (!body.Username) {
        return new Response(JSON.stringify({}), {
          status: 400,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "http://localhost"
          }
        })
      }

      if (!options.allowLogin) {
        return new Response(JSON.stringify({ Message: "unauthorized" }), {
          status: 401,
          headers: {
            "content-type": "application/json"
          }
        })
      }

      return new Response(JSON.stringify({
        AccessToken: "token-abc",
        User: {
          Id: "user-1",
          Name: body.Username
        }
      }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    }

    if (url.endsWith("/Users/user-1/Views")) {
      return new Response(JSON.stringify({
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
      }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    }

    if (url.includes("/Users/user-1/Items")) {
      const requestUrl = new URL(url)
      const parentId = requestUrl.searchParams.get("ParentId")

      if (parentId === "movies-main") {
        if (typeof options.alwaysFailMediaStatus === "number") {
          return new Response(JSON.stringify({ Message: "media-failure" }), {
            status: options.alwaysFailMediaStatus,
            headers: {
              "content-type": "application/json"
            }
          })
        }

        if (
          typeof options.mediaFailureStatusAfterFirstSuccess === "number"
          && successfulMovieResponses >= 1
        ) {
          return new Response(JSON.stringify({ Message: "media-failure" }), {
            status: options.mediaFailureStatusAfterFirstSuccess,
            headers: {
              "content-type": "application/json"
            }
          })
        }

        const movieItems = [
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
          },
          ...(options.includeSparsePoster
            ? [
                {
                  Id: "movie-3",
                  Name: "Sparse Poster",
                  Type: "Movie",
                  ImageTags: { Primary: "poster-tag-2" }
                }
              ]
            : [])
        ]

        successfulMovieResponses += 1

        return new Response(JSON.stringify({
          Items: movieItems,
          TotalRecordCount: movieItems.length
        }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        })
      }

      return new Response(JSON.stringify({
        Items: [
          {
            Id: "show-1",
            Name: "Should not ingest",
            Type: "Series",
            ImageTags: { Primary: "poster-tag" }
          }
        ],
        TotalRecordCount: 1
      }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    }

    if (url.endsWith("/Sessions/Logout")) {
      if (options.logoutDelayMs && options.logoutDelayMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, options.logoutDelayMs)
        })
      }

      return new Response(null, { status: 204 })
    }

    return new Response(null, { status: 404 })
  }) as FetchMock & typeof fetch
}

interface PlatformHarnessOptions {
  portable?: boolean
  linuxFallbackWarning?: string | null
  initialDisplayId?: string | null
  initialAutostartEnabled?: boolean
  displays?: DesktopDisplayOption[]
}

function createPlatformHarness(options: PlatformHarnessOptions = {}): {
  bridge: DesktopPlatformBridge
  snapshot: () => { displayId: string | null; autostartEnabled: boolean }
} {
  let displayId: string | null = options.initialDisplayId ?? "display-primary"
  let autostartEnabled = options.initialAutostartEnabled ?? false

  const displayOptions = options.displays ?? [
    {
      id: "display-primary",
      label: "Primary display",
      isPrimary: true
    },
    {
      id: "display-2",
      label: "Display 2",
      isPrimary: false
    }
  ]

  const credentialStore = new Map<string, string>()

  const bridge: DesktopPlatformBridge = {
    getCapabilities: async () => ({
      isDesktop: true,
      isLinux: true,
      isPortable: options.portable ?? false,
      secureCredentialStorage: !(options.linuxFallbackWarning && options.linuxFallbackWarning.length > 0),
      linuxSecretServiceAvailable: !(options.linuxFallbackWarning && options.linuxFallbackWarning.length > 0)
    }),
    listDisplays: async () => displayOptions,
    getDisplaySelection: async () => displayId,
    setDisplaySelection: async (nextDisplayId) => {
      displayId = nextDisplayId
    },
    getAutostartEnabled: async () => autostartEnabled,
    setAutostartEnabled: async (enabled) => {
      autostartEnabled = enabled
    },
    readCredential: async ({ serverUrl, username }) => {
      return credentialStore.get(`${serverUrl}::${username}`) ?? null
    },
    writeCredential: async ({ serverUrl, username, password }) => {
      credentialStore.set(`${serverUrl}::${username}`, password)
      return {
        storageKind: options.linuxFallbackWarning ? "linux-weak-fallback" : "secure-service",
        warning: options.linuxFallbackWarning ?? null
      }
    },
    clearCredential: async ({ serverUrl, username }) => {
      credentialStore.delete(`${serverUrl}::${username}`)
    },
    clearAllCredentials: async () => {
      credentialStore.clear()
    }
  }

  return {
    bridge,
    snapshot: () => ({
      displayId,
      autostartEnabled
    })
  }
}

beforeEach(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      configurable: true
    })
  }

  window.history.pushState({}, "", "/")
  window.localStorage.clear()
  window.sessionStorage.clear()
  document.body.replaceChildren()
})

describe("desktop onboarding auth runtime", () => {
  it("completes 3-step onboarding and persists encrypted remember-password data", async () => {
    const fetchHarness = createFetchHarness({ allowLogin: true })
    globalThis.fetch = fetchHarness
    const platformHarness = createPlatformHarness()

    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    setChecked("remember-server-checkbox", true)
    clickByTestId("preflight-check-button")

    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "super-secret")
    setChecked("remember-username-checkbox", true)
    setChecked("remember-password-checkbox", true)
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
    })

    setChecked("library-checkbox-shows-main", false)

    clickByTestId("onboarding-finish")

    expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="wall-ingestion-summary"]')?.textContent).toContain("Ingested posters: 1")
    })

    clickByTestId("diagnostics-open")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="wall-diagnostics-panel"]')).toBeTruthy()
      expect(document.querySelector('[data-testid="wall-diagnostics-selected-libraries"]')?.textContent).toContain("movies-main")
      expect(document.querySelector('[data-testid="wall-diagnostics-selected-libraries"]')?.textContent).not.toContain("shows-main")
      expect(document.querySelector('[data-testid="wall-diagnostics-ingestion-state"]')?.textContent).toContain("status=ready")
      expect(document.querySelector('[data-testid="wall-diagnostics-ingestion-state"]')?.textContent).toContain("count=1")
      expect(document.querySelector('[data-testid="wall-diagnostics-sampling-interval"]')?.textContent).toContain("1000ms")
      expect(document.querySelector('[data-testid="wall-diagnostics-retention-policy"]')?.textContent).toContain("7d / 100MB")
      expect(document.querySelector('[data-testid="diagnostics-export-crash-report"]')).toBeTruthy()
      expect(document.querySelector('[data-testid="diagnostics-export-status"]')?.textContent).toContain("Crash export ready")
    })

    const mediaCallsAfterInitialRefresh = fetchHarness.mock.calls.filter(([request]) => {
      const url = typeof request === "string"
        ? request
        : request instanceof URL
          ? request.toString()
          : request.url

      return url.includes("/Users/user-1/Items")
    })

    expect(mediaCallsAfterInitialRefresh).toHaveLength(1)
    expect(mediaCallsAfterInitialRefresh[0]).toBeTruthy()
    const initialMediaCallUrl = mediaCallsAfterInitialRefresh[0]?.[0]
    const initialMediaUrlValue = typeof initialMediaCallUrl === "string"
      ? initialMediaCallUrl
      : initialMediaCallUrl instanceof URL
        ? initialMediaCallUrl.toString()
        : initialMediaCallUrl?.url ?? ""
    expect(new URL(initialMediaUrlValue).searchParams.get("ParentId")).toBe("movies-main")

    clickByTestId("manual-refresh-button")

    await vi.waitFor(() => {
      const mediaCalls = fetchHarness.mock.calls.filter(([request]) => {
        const url = typeof request === "string"
          ? request
          : request instanceof URL
            ? request.toString()
            : request.url

        return url.includes("/Users/user-1/Items")
      })

      expect(mediaCalls.length).toBeGreaterThanOrEqual(2)
    })

    expect(window.localStorage.getItem("mps.onboarding.remembered-server")).toBe(TEST_SERVER)
    expect(window.localStorage.getItem("mps.onboarding.remembered-username")).toBe("demo-user")
    expect(window.sessionStorage.getItem("mps.auth.session")).toContain("token-abc")
    expect(window.sessionStorage.getItem("mps.wall.handoff")).toContain("movies-main")

    const encryptedSecret = window.localStorage.getItem(DESKTOP_PASSWORD_STORE_STORAGE_KEY)
    expect(encryptedSecret).toBeNull()
    await expect(platformHarness.bridge.readCredential({
      serverUrl: TEST_SERVER,
      username: "demo-user"
    })).resolves.toBe("super-secret")

    runtime.dispose()
    window.history.pushState({}, "", "/")

    const restartedRuntime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    restartedRuntime.start()

    await vi.waitFor(() => {
      expect(getInput("password-input").value).toBe("super-secret")
    })

    restartedRuntime.dispose()
  })

  it("persists selected display and autostart settings across desktop restarts", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: true })
    const platformHarness = createPlatformHarness()

    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    clickByTestId("preflight-check-button")
    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "super-secret")
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="display-selection-select"]')).toBeTruthy()
      expect(document.querySelector('[data-testid="autostart-toggle-checkbox"]')).toBeTruthy()
    })

    setSelectValue("display-selection-select", "display-2")
    setChecked("autostart-toggle-checkbox", true)

    expect(platformHarness.snapshot()).toEqual({
      displayId: "display-2",
      autostartEnabled: true
    })

    runtime.dispose()

    const restartedRuntime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    restartedRuntime.start()

    setInputValue("server-url-input", TEST_SERVER)
    clickByTestId("preflight-check-button")
    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "super-secret")
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      const displaySelection = document.querySelector(
        '[data-testid="display-selection-select"]'
      ) as HTMLSelectElement | null
      const autostartToggle = document.querySelector(
        '[data-testid="autostart-toggle-checkbox"]'
      ) as HTMLInputElement | null

      expect(displaySelection?.value).toBe("display-2")
      expect(autostartToggle?.checked).toBe(true)
    })

    restartedRuntime.dispose()
  })

  it("restores cached posters on offline desktop startup within 5 seconds", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: true })

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    clickByTestId("preflight-check-button")

    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "super-secret")
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
    })

    setChecked("library-checkbox-shows-main", false)
    clickByTestId("onboarding-finish")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="poster-item-0"]')).toBeTruthy()
    })

    runtime.dispose()

    globalThis.fetch = createFetchHarness({
      allowLogin: true,
      alwaysFailMediaStatus: 503
    })

    const restartStartedAt = Date.now()
    const restartedRuntime = createDesktopOnboardingAppRuntime(document.body)
    restartedRuntime.start()

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
      expect(document.querySelector('[data-testid="poster-item-0"]')).toBeTruthy()
    }, { timeout: 5_000 })

    expect(Date.now() - restartStartedAt).toBeLessThanOrEqual(5_000)

    restartedRuntime.dispose()
  })

  it("opens detail card from poster tiles, supports ESC/hotspot close, and idle-hides after 8 seconds", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: true, includeSparsePoster: true })

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    try {
      setInputValue("server-url-input", TEST_SERVER)
      clickByTestId("preflight-check-button")

      setInputValue("username-input", "demo-user")
      setInputValue("password-input", "super-secret")
      clickByTestId("login-submit")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
      })

      setChecked("library-checkbox-shows-main", false)
      clickByTestId("onboarding-finish")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="poster-item-0"]')).toBeTruthy()
        expect(document.querySelector('[data-testid="wall-ingestion-summary"]')?.textContent).toContain("Ingested posters: 2")
      })

      vi.useFakeTimers()

      clickByTestId("poster-item-0")

      const detailCard = getElement("detail-card")
      expect(getComputedStyle(detailCard).visibility).toBe("visible")
      expect(detailCard.textContent).toContain("Poster Ready")
      expect(detailCard.textContent).toContain("A determined crew chases daylight")
      expect(detailCard.textContent).toContain("2024")

      expect(detailCard.style.width).toBe("28%")
      expect(detailCard.style.minWidth).toBe("26%")
      expect(detailCard.style.maxWidth).toBe("30%")
      expect(["8%", "64%"]).toContain(detailCard.style.left)
      expect(["10%", "56%"]).toContain(detailCard.style.top)
      expect(detailCard.dataset.placement).not.toBe("default")

      const transitionRaw = getComputedStyle(detailCard).transitionDuration.split(",")[0]?.trim() ?? "0s"
      const transitionMs = transitionRaw.endsWith("ms")
        ? Number.parseFloat(transitionRaw)
        : transitionRaw.endsWith("s")
          ? Number.parseFloat(transitionRaw) * 1_000
          : 0
      expect(transitionMs).toBeGreaterThanOrEqual(240)
      expect(transitionMs).toBeLessThanOrEqual(320)

      const controlsTransitionRaw = getComputedStyle(getElement("wall-controls-container")).transitionDuration
        .split(",")[0]?.trim() ?? "0s"
      const controlsTransitionMs = controlsTransitionRaw.endsWith("ms")
        ? Number.parseFloat(controlsTransitionRaw)
        : controlsTransitionRaw.endsWith("s")
          ? Number.parseFloat(controlsTransitionRaw) * 1_000
          : 0
      expect(controlsTransitionMs).toBeGreaterThanOrEqual(240)
      expect(controlsTransitionMs).toBeLessThanOrEqual(320)
      expect(getElement("wall-controls-container").textContent).toContain("Operational controls")

      expect(document.querySelector('[data-testid="deep-settings-profile-toggle"]')).toBeNull()
      clickByTestId("diagnostics-open")
      expect(getElement("deep-settings-profile-current").textContent).toContain("balanced")
      clickByTestId("deep-settings-profile-toggle")
      expect(getElement("deep-settings-profile-current").textContent).toContain("showcase")

      clickByTestId("poster-item-1")
      expect(getElement("detail-card").textContent).toContain("Sparse Poster")
      expect(getElement("detail-card-meta").textContent).toContain("movie")
      expect(getElement("detail-card-meta").textContent).not.toContain("undefined")
      expect(document.querySelector('[data-testid="detail-card-overview"]')).toBeNull()

      pressEscape()
      expect(getComputedStyle(getElement("detail-card")).visibility).toBe("hidden")

      clickByTestId("poster-item-0")
      expect(getComputedStyle(getElement("detail-card")).visibility).toBe("visible")
      clickByTestId("exit-hotspot")
      expect(getComputedStyle(getElement("detail-card")).visibility).toBe("hidden")

      clickByTestId("poster-item-0")
      expect(getComputedStyle(getElement("detail-card")).visibility).toBe("visible")

      vi.advanceTimersByTime(8_000)
      await Promise.resolve()

      expect(getComputedStyle(getElement("detail-card")).visibility).toBe("hidden")
      expect(getComputedStyle(getElement("manual-refresh-button")).visibility).toBe("hidden")

      window.dispatchEvent(new Event("pointermove"))
      expect(getComputedStyle(getElement("manual-refresh-button")).visibility).toBe("visible")
    } finally {
      vi.useRealTimers()
      runtime.dispose()
    }
  })

  it("shows non-crashing warning when linux secret-service is unavailable and fallback encryption is used", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: true })
    const platformHarness = createPlatformHarness({
      linuxFallbackWarning:
        "Linux secret-service unavailable. Using weak encrypted fallback in local app data."
    })
    const warningLogger = { warn: vi.fn() }

    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge,
      warningLogger
    })
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    clickByTestId("preflight-check-button")
    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "super-secret")
    setChecked("remember-password-checkbox", true)
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
      expect(document.querySelector('[data-testid="platform-warning-banner"]')?.textContent).toContain(
        "Linux secret-service unavailable"
      )
    })

    expect(warningLogger.warn).toHaveBeenCalledWith(
      "Linux secret-service unavailable. Using weak encrypted fallback in local app data."
    )

    await expect(platformHarness.bridge.readCredential({
      serverUrl: TEST_SERVER,
      username: "demo-user"
    })).resolves.toBe("super-secret")
    expect(window.localStorage.getItem(DESKTOP_PASSWORD_STORE_STORAGE_KEY)).toBeNull()

    expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeNull()
    runtime.dispose()
  })

  it("disables autostart controls in portable package mode", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: true })
    const platformHarness = createPlatformHarness({ portable: true })

    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    clickByTestId("preflight-check-button")
    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "super-secret")
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="portable-mode-badge"]')?.textContent).toContain(
        "Portable package mode active"
      )

      const autostartToggle = document.querySelector(
        '[data-testid="autostart-toggle-checkbox"]'
      ) as HTMLInputElement | null
      expect(autostartToggle?.disabled).toBe(true)
    })

    expect(platformHarness.snapshot().autostartEnabled).toBe(false)
    runtime.dispose()
  })

  it("shows auth error on invalid credentials and keeps session/token storage clear", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: false })

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    clickByTestId("preflight-check-button")

    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "wrong-pass")
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      const authError = document.querySelector('[data-testid="auth-error-banner"]')
      expect(authError?.textContent).toContain("Invalid Jellyfin username or password")
    })

    expect(window.sessionStorage.getItem("mps.auth.session")).toBeNull()
    expect(window.sessionStorage.getItem("mps.wall.handoff")).toBeNull()
    expect(window.localStorage.getItem(DESKTOP_PASSWORD_STORE_STORAGE_KEY)).toBeNull()

    runtime.dispose()
  })

  it("uses reconnect backoff from 2s to 60s and surfaces reconnect guide after token revocation", async () => {
    const fetchHarness = createFetchHarness({
      allowLogin: true,
      mediaFailureStatusAfterFirstSuccess: 401
    })
    globalThis.fetch = fetchHarness

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    clickByTestId("preflight-check-button")

    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "super-secret")
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
    })

    setChecked("library-checkbox-shows-main", false)
    clickByTestId("onboarding-finish")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="poster-item-0"]')).toBeTruthy()
    })

    const getMediaCallCount = (): number => {
      return fetchHarness.mock.calls.filter(([request]) => {
        const url = typeof request === "string"
          ? request
          : request instanceof URL
            ? request.toString()
            : request.url

        return url.includes("/Users/user-1/Items")
      }).length
    }

    async function advanceAndExpectNextDelay(advanceMs: number, expectedDelayMs: number): Promise<void> {
      const callsBefore = getMediaCallCount()
      await vi.advanceTimersByTimeAsync(advanceMs)
      await vi.waitFor(() => {
        expect(getMediaCallCount()).toBeGreaterThan(callsBefore)
      })
      await vi.waitFor(() => {
        const reconnectGuide = document.querySelector('[data-testid="reconnect-guide"]')
        expect(reconnectGuide?.textContent).toContain(`next retry in ${expectedDelayMs}ms`)
      })
    }

    vi.useFakeTimers()

    try {
      clickByTestId("manual-refresh-button")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="wall-ingestion-error"]')).toBeTruthy()
        expect(document.querySelector('[data-testid="reconnect-guide"]')).toBeTruthy()
      })

      await vi.waitFor(() => {
        const reconnectGuide = document.querySelector('[data-testid="reconnect-guide"]')
        expect(reconnectGuide?.textContent).toContain("next retry in 2000ms")
      })

      await advanceAndExpectNextDelay(2_000, 4_000)
      await advanceAndExpectNextDelay(4_000, 8_000)
      await advanceAndExpectNextDelay(8_000, 16_000)
      await advanceAndExpectNextDelay(16_000, 32_000)
      await advanceAndExpectNextDelay(32_000, 60_000)
      await advanceAndExpectNextDelay(60_000, 60_000)
    } finally {
      vi.useRealTimers()
      runtime.dispose()
    }
  })

  it("clears token/password artifacts on logout within 1s and preserves remembered server/username", async () => {
    globalThis.fetch = createFetchHarness({
      allowLogin: true,
      logoutDelayMs: 1_500
    })

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    setChecked("remember-server-checkbox", true)
    clickByTestId("preflight-check-button")

    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "super-secret")
    setChecked("remember-username-checkbox", true)
    setChecked("remember-password-checkbox", true)
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
    })

    clickByTestId("onboarding-finish")

    expect(window.sessionStorage.getItem("mps.auth.session")).toContain("token-abc")
    expect(window.localStorage.getItem(DESKTOP_PASSWORD_STORE_STORAGE_KEY)).toBeTruthy()

    const logoutStartedAt = Date.now()
    clickByTestId("logout-button")

    await vi.waitFor(() => {
      expect(window.location.pathname).toBe("/")
      expect(window.sessionStorage.getItem("mps.auth.session")).toBeNull()
      expect(window.sessionStorage.getItem("mps.wall.handoff")).toBeNull()
      expect(window.localStorage.getItem(DESKTOP_PASSWORD_STORE_STORAGE_KEY)).toBeNull()
    })

    const elapsedMs = Date.now() - logoutStartedAt
    expect(elapsedMs).toBeLessThanOrEqual(1_000)
    await vi.waitFor(() => {
      expect(getInput("server-url-input").value).toBe(TEST_SERVER)
      expect(getInput("username-input").value).toBe("demo-user")
    })

    runtime.dispose()
  })
})
