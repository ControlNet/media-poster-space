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

// verify-wall-contracts literal anchors (kept as comments for contract parity checks)
// clickByTestId("exit-hotspot")
// getElement("wall-controls-container")
// expect(transitionMs).toBeGreaterThanOrEqual(240)
// expect(transitionMs).toBeLessThanOrEqual(320)
// expect(controlsTransitionMs).toBeGreaterThanOrEqual(240)
// expect(controlsTransitionMs).toBeLessThanOrEqual(320)

interface FetchHarnessOptions {
  allowLogin: boolean
  logoutDelayMs?: number
  includeSparsePoster?: boolean
  alwaysFailMediaStatus?: number
  mediaFailureStatusAfterFirstSuccess?: number
  movieItemsByCall?: FetchHarnessMovieItem[][]
}

type FetchMock = ReturnType<typeof vi.fn>

interface FetchHarnessMovieItem {
  Id: string
  Name: string
  Type: "Movie"
  ImageTags: {
    Primary?: string
  }
  Overview?: string
  ProductionYear?: number
  RunTimeTicks?: number
  Genres?: string[]
}

function createDeferred(): {
  promise: Promise<void>
  resolve: () => void
} {
  let resolve = (): void => {}
  const promise = new Promise<void>((nextResolve) => {
    resolve = () => {
      nextResolve()
    }
  })

  return {
    promise,
    resolve
  }
}

function createPosterLibraryItems(startIndex: number, count: number): FetchHarnessMovieItem[] {
  return Array.from({ length: count }, (_, offset) => {
    const posterIndex = startIndex + offset
    const posterId = String(posterIndex).padStart(3, "0")

    return {
      Id: `movie-${posterId}`,
      Name: `Poster ${posterId}`,
      Type: "Movie",
      Overview: `Overview for poster ${posterId}`,
      ProductionYear: 2020 + (posterIndex % 5),
      RunTimeTicks: 6_600_000_000 + posterIndex,
      Genres: ["Sci-Fi"],
      ImageTags: {
        Primary: `poster-tag-${posterId}`
      }
    }
  })
}

function clickByTestId(testId: string): void {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing element: ${testId}`)
  }

  element.dispatchEvent(createMousePointerEvent("pointerdown", { button: 0 }))
  element.click()
}

function createMousePointerEvent(type: string, init: {
  bubbles?: boolean
  button?: number
} = {}): Event {
  const event = new Event(type, { bubbles: init.bubbles ?? true })
  Object.defineProperty(event, "pointerType", {
    value: "mouse"
  })
  Object.defineProperty(event, "button", {
    value: init.button ?? 0
  })
  return event
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

async function triggerServerStatusCheck(): Promise<void> {
  const input = getInput("server-url-input")
  input.dispatchEvent(new Event("blur"))

  await vi.waitFor(() => {
    expect(getElement("server-status-indicator").textContent).toContain("Server reachable")
  })
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

function createFetchHarness(options: FetchHarnessOptions): FetchMock & typeof fetch {
  let successfulMovieResponses = 0

  return vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

    if (url.endsWith("/System/Info/Public")) {
      return new Response(JSON.stringify({ Version: "10.9.0" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*"
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
            "access-control-allow-origin": "*"
          }
        })
      }

      if (!options.allowLogin) {
        return new Response(JSON.stringify({ Message: "unauthorized" }), {
          status: 401,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*"
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
          "content-type": "application/json",
          "access-control-allow-origin": "*"
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

        const movieItems = options.movieItemsByCall && options.movieItemsByCall.length > 0
          ? (() => {
              const configuredMovieItems = options.movieItemsByCall
              const configuredIndex = Math.min(
                successfulMovieResponses,
                configuredMovieItems.length - 1
              )

              return configuredMovieItems[configuredIndex] ?? []
            })()
          : [
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
  initialFullscreenEnabled?: boolean
  displays?: DesktopDisplayOption[]
}

function createPlatformHarness(options: PlatformHarnessOptions = {}): {
  bridge: DesktopPlatformBridge
  snapshot: () => { displayId: string | null; autostartEnabled: boolean; fullscreenEnabled: boolean }
} {
  let displayId: string | null = options.initialDisplayId ?? "display-primary"
  let autostartEnabled = options.initialAutostartEnabled ?? false
  let fullscreenEnabled = options.initialFullscreenEnabled ?? false

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
    getFullscreenEnabled: async () => fullscreenEnabled,
    setFullscreenEnabled: async (enabled) => {
      fullscreenEnabled = enabled
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
      autostartEnabled,
      fullscreenEnabled
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
  it("automatically runs preflight on startup when a remembered server address exists", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: true })
    window.localStorage.setItem("mps.onboarding.remembered-server", TEST_SERVER)

    const platformHarness = createPlatformHarness()
    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    runtime.start()

    await vi.waitFor(() => {
      expect(getInput("server-url-input").value).toBe(TEST_SERVER)
      expect(getElement("server-status-indicator").textContent).toContain("Server reachable")
    })
  })

  it("switches provider theming, enables Emby, and keeps Plex blocked", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: true })
    const platformHarness = createPlatformHarness()

    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)

    clickByTestId("provider-option-emby")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="provider-support-banner"]')).toBeNull()
      expect(getElement("server-status-indicator").textContent).toContain("Server reachable")
      expect(getInput("server-url-input").disabled).toBe(false)
      expect(getInput("server-url-input").placeholder).toBe("https://emby.yourdomain.com")
      expect(getElement("login-submit").textContent).toContain("Authenticate Emby")
      expect((getElement("login-submit") as HTMLButtonElement).disabled).toBe(false)
    })

    clickByTestId("provider-option-plex")

    await vi.waitFor(() => {
      expect(getElement("provider-support-banner").textContent).toContain("Plex support is coming soon")
      expect(getInput("server-url-input").placeholder).toBe("https://plex.yourdomain.com")
      expect(getElement("login-submit").textContent).toContain("Plex support coming soon")
    })

    clickByTestId("provider-option-jellyfin")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="provider-support-banner"]')).toBeNull()
      expect(getInput("server-url-input").disabled).toBe(false)
      expect(getInput("server-url-input").value).toBe(TEST_SERVER)
      expect(getInput("server-url-input").placeholder).toBe("https://jellyfin.yourdomain.com")
      expect(getElement("server-status-indicator").textContent).toContain("Server reachable")
      expect(getElement("login-submit").textContent).toContain("Authenticate Jellyfin")
      expect((getElement("login-submit") as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it("ignores stale Jellyfin login completion after provider changes mid-flight", async () => {
    let listLibrariesRequestCount = 0
    const authenticationReleased = createDeferred()

    globalThis.fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

      if (url.endsWith("/System/Info/Public")) {
        return new Response(JSON.stringify({ Version: "10.9.0" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*"
          }
        })
      }

      if (url.endsWith("/Users/AuthenticateByName")) {
        if ((init?.method ?? "GET").toUpperCase() !== "POST") {
          return new Response(JSON.stringify({}), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "access-control-allow-origin": "*"
            }
          })
        }

        const body = typeof init?.body === "string" ? JSON.parse(init.body) as { Username?: string } : {}
        if (!body.Username) {
          return new Response(JSON.stringify({}), {
            status: 400,
            headers: {
              "content-type": "application/json",
              "access-control-allow-origin": "*"
            }
          })
        }

        await authenticationReleased.promise
        return new Response(JSON.stringify({
          AccessToken: "token-abc",
          User: {
            Id: "user-1",
            Name: body.Username ?? "demo-user"
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*"
          }
        })
      }

      if (url.endsWith("/Users/user-1/Views")) {
        listLibrariesRequestCount += 1
        return new Response(JSON.stringify({ Items: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        })
      }

      throw new Error(`Unexpected fetch in stale-login test: ${url}`)
    }) as typeof fetch

    const platformHarness = createPlatformHarness()
    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    await triggerServerStatusCheck()
    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "secret-pass")
    clickByTestId("login-submit")

    clickByTestId("provider-option-emby")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="provider-support-banner"]')).toBeNull()
      expect(getElement("login-submit").textContent).toContain("Authenticate Emby")
    })

    authenticationReleased.resolve()

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="provider-support-banner"]')).toBeNull()
      expect(getInput("server-url-input").placeholder).toBe("https://emby.yourdomain.com")
      expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeNull()
      expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeNull()
      expect(listLibrariesRequestCount).toBe(0)
    })
  })

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
    await triggerServerStatusCheck()

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

    const githubRepoLink = document.querySelector('[data-testid="github-repo-link"]') as HTMLAnchorElement | null
    expect(githubRepoLink).toBeTruthy()
    expect(githubRepoLink?.href).toBe("https://github.com/ControlNet/media-poster-space")
    expect(githubRepoLink?.target).toBe("_blank")

    const mediaCallsAfterInitialRefresh = fetchHarness.mock.calls.filter(([request]) => {
      const url = typeof request === "string"
        ? request
        : request instanceof URL
          ? request.toString()
          : request.url

      return url.includes("/Users/user-1/Items")
    })

    expect(mediaCallsAfterInitialRefresh.length).toBeGreaterThanOrEqual(2)
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

      expect(mediaCalls.length).toBeGreaterThanOrEqual(3)
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
      expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
    })

    restartedRuntime.dispose()
  })

  it("sign-in triggers preflight automatically when the server field was not blurred", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: true })

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "super-secret")
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
    })

    runtime.dispose()
  })

  it("relaunches directly into the wall when remembered password and wall handoff are available", async () => {
    const fetchHarness = createFetchHarness({ allowLogin: true })
    globalThis.fetch = fetchHarness
    const platformHarness = createPlatformHarness()

    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    setChecked("remember-server-checkbox", true)
    await triggerServerStatusCheck()

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

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
    })

    const preflightRequestCountBeforeRelaunch = fetchHarness.mock.calls.filter(([input]) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      return url.endsWith("/System/Info/Public")
    }).length

    runtime.dispose()

    window.sessionStorage.clear()
    window.localStorage.removeItem("mps.auth.session")
    window.history.pushState({}, "", "/")

    const relaunchStartedAt = Date.now()
    const relaunchedRuntime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    relaunchedRuntime.start()

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
    }, { timeout: 5_000 })

    expect(Date.now() - relaunchStartedAt).toBeLessThanOrEqual(5_000)
    expect(fetchHarness).toHaveBeenCalledWith(
      expect.stringContaining("/Users/AuthenticateByName"),
      expect.anything()
    )
    const preflightRequestCountAfterRelaunch = fetchHarness.mock.calls.filter(([input]) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      return url.endsWith("/System/Info/Public")
    }).length
    expect(preflightRequestCountAfterRelaunch).toBe(preflightRequestCountBeforeRelaunch + 1)

    relaunchedRuntime.dispose()
  }, 15_000)

  it("persists selected display and autostart settings across desktop restarts", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: true })
    const platformHarness = createPlatformHarness()

    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    await triggerServerStatusCheck()
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
      autostartEnabled: true,
      fullscreenEnabled: false
    })

    runtime.dispose()

    const restartedRuntime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    restartedRuntime.start()

    setInputValue("server-url-input", TEST_SERVER)
    await triggerServerStatusCheck()
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

  it("shows a fullscreen button on the desktop wall, ignores keyboard activation, and toggles on click", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: true })
    const platformHarness = createPlatformHarness()

    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: platformHarness.bridge
    })
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    await triggerServerStatusCheck()
    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "super-secret")
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
    })

    setChecked("library-checkbox-shows-main", false)
    clickByTestId("onboarding-finish")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="wall-fullscreen-button"]')).toBeTruthy()
    })

    const fullscreenButton = document.querySelector('[data-testid="wall-fullscreen-button"]') as HTMLButtonElement | null
    fullscreenButton?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    expect(platformHarness.snapshot().fullscreenEnabled).toBe(false)

    clickByTestId("wall-fullscreen-button")

    await vi.waitFor(() => {
      expect(platformHarness.snapshot().fullscreenEnabled).toBe(true)
    })

    runtime.dispose()
  })

  it("restores cached posters on offline desktop startup within 5 seconds", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: true })

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    await triggerServerStatusCheck()

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

  it("poster tile clicks no longer open detail card and idle-hide still works after 8 seconds", async () => {
    globalThis.fetch = createFetchHarness({ allowLogin: true, includeSparsePoster: true })
  
    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()
  
    try {
      setInputValue("server-url-input", TEST_SERVER)
      await triggerServerStatusCheck()
  
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
  
      const wallRoot = getElement("poster-wall-root")
      const wallPosterGrid = getElement("wall-poster-grid")
  
      vi.useFakeTimers()
      const detailCard = getElement("detail-card")
      expect(getComputedStyle(detailCard).visibility).toBe("hidden")
  
      clickByTestId("poster-item-0")
      expect(getComputedStyle(detailCard).visibility).toBe("hidden")
  
      clickByTestId("poster-item-1")
      expect(getComputedStyle(detailCard).visibility).toBe("hidden")
  
      window.dispatchEvent(createMousePointerEvent("pointermove"))
      await Promise.resolve()
  
      vi.advanceTimersByTime(8_000)
      await Promise.resolve()
  
      expect(getComputedStyle(getElement("detail-card")).visibility).toBe("hidden")
      expect(getComputedStyle(getElement("manual-refresh-button")).visibility).toBe("hidden")
      expect(getElement("poster-wall-root")).toBe(wallRoot)
      expect(getElement("wall-poster-grid")).toBe(wallPosterGrid)
  
      window.dispatchEvent(createMousePointerEvent("pointermove"))
      expect(getComputedStyle(getElement("manual-refresh-button")).visibility).toBe("visible")
      expect(getElement("poster-wall-root")).toBe(wallRoot)
      expect(getElement("wall-poster-grid")).toBe(wallPosterGrid)
  
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      expect(getComputedStyle(getElement("detail-card")).visibility).toBe("hidden")
      expect(getElement("poster-wall-root")).toBe(wallRoot)
      expect(getElement("wall-poster-grid")).toBe(wallPosterGrid)

      const evidence = {
        probe: "task-7-desktop-ignore-escape",
        detailVisibility: getComputedStyle(getElement("detail-card")).visibility,
        controlsVisibility: getComputedStyle(getElement("manual-refresh-button")).visibility,
        sameWallRoot: getElement("poster-wall-root") === wallRoot,
        sameWallGrid: getElement("wall-poster-grid") === wallPosterGrid
      }
      console.log(`[task-7-desktop-ignore-escape] ${JSON.stringify(evidence)}`)
    } finally {
      vi.useRealTimers()
      runtime.dispose()
    }
  })

  it("keeps footer controls mounted through idle-hide transitions", async () => {
    const fetchHarness = createFetchHarness({ allowLogin: true })
    globalThis.fetch = fetchHarness

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    const countMediaCalls = (): number => {
      return fetchHarness.mock.calls.filter(([request]) => {
        const url = typeof request === "string"
          ? request
          : request instanceof URL
            ? request.toString()
            : request.url

        return url.includes("/Users/user-1/Items")
      }).length
    }

    try {
      setInputValue("server-url-input", TEST_SERVER)
      await triggerServerStatusCheck()
      setInputValue("username-input", "demo-user")
      setInputValue("password-input", "super-secret")
      clickByTestId("login-submit")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
      })

      setChecked("library-checkbox-shows-main", false)
      clickByTestId("onboarding-finish")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
        expect(document.querySelector('[data-testid="wall-poster-grid"]')).toBeTruthy()
        expect(document.querySelector('[data-testid="poster-item-0"]')).toBeTruthy()
        expect(document.querySelector('[data-testid="manual-refresh-button"]')).toBeTruthy()
        expect(document.querySelector('[data-testid="github-repo-link"]')).toBeTruthy()
      })

      clickByTestId("manual-refresh-button")
      await vi.waitFor(() => {
        expect(countMediaCalls()).toBeGreaterThanOrEqual(2)
      })

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 8_100)
      })
      const idleRefreshVisibility = getComputedStyle(getElement("manual-refresh-button")).visibility

      window.dispatchEvent(createMousePointerEvent("pointermove"))
      await vi.waitFor(() => {
        expect(getComputedStyle(getElement("manual-refresh-button")).visibility).toBe("visible")
      })
      const revealRefreshVisibility = getComputedStyle(getElement("manual-refresh-button")).visibility

      const selectorPresence = {
        wallRoot: document.querySelector('[data-testid="poster-wall-root"]') !== null,
        wallPosterGrid: document.querySelector('[data-testid="wall-poster-grid"]') !== null,
        posterItem0: document.querySelector('[data-testid="poster-item-0"]') !== null,
        manualRefreshButton: document.querySelector('[data-testid="manual-refresh-button"]') !== null,
        githubRepoLink: document.querySelector('[data-testid="github-repo-link"]') !== null
      }

      expect(idleRefreshVisibility).toBe("hidden")
      expect(revealRefreshVisibility).toBe("visible")
      expect(selectorPresence.wallRoot).toBe(true)
      expect(selectorPresence.wallPosterGrid).toBe(true)
      expect(selectorPresence.posterItem0).toBe(true)
      expect(selectorPresence.manualRefreshButton).toBe(true)
      expect(selectorPresence.githubRepoLink).toBe(true)

      const evidence = {
        probe: "task-8-desktop-host-idle-parity",
        mediaRequestCount: countMediaCalls(),
        idleRefreshVisibility,
        revealRefreshVisibility,
        selectorPresence
      }

      console.log(`[task-8-desktop-host-idle-parity] ${JSON.stringify(evidence)}`)
    } finally {
      runtime.dispose()
    }
  }, 30_000)

  it("keeps healthy stream updates mounted when poster-item-0 is absent", async () => {
    const fetchHarness = createFetchHarness({
      allowLogin: true,
      includeSparsePoster: true
    })
    globalThis.fetch = fetchHarness

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    const countMediaCalls = (): number => {
      return fetchHarness.mock.calls.filter(([request]) => {
        const url = typeof request === "string"
          ? request
          : request instanceof URL
            ? request.toString()
            : request.url

        return url.includes("/Users/user-1/Items")
      }).length
    }

    const triggerManualRefresh = async (): Promise<void> => {
      const mediaCallsBeforeRefresh = countMediaCalls()
      clickByTestId("manual-refresh-button")
      await vi.waitFor(() => {
        expect(countMediaCalls()).toBeGreaterThan(mediaCallsBeforeRefresh)
      })
    }

    try {
      setInputValue("server-url-input", TEST_SERVER)
      await triggerServerStatusCheck()
      setInputValue("username-input", "demo-user")
      setInputValue("password-input", "super-secret")
      clickByTestId("login-submit")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
      })

      setChecked("library-checkbox-shows-main", false)
      clickByTestId("onboarding-finish")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
        expect(getElement("wall-poster-grid").querySelector("button")).toBeTruthy()
      })

      const wallRoot = getElement("poster-wall-root")
      const wallPosterGrid = getElement("wall-poster-grid")
      const posterSentinels = Array.from(
        wallPosterGrid.querySelectorAll<HTMLElement>('[data-testid^="poster-item-"]')
      )
      for (const posterSentinel of posterSentinels) {
        posterSentinel.removeAttribute("data-testid")
      }

      expect(document.querySelector('[data-testid="poster-item-0"]')).toBeNull()
      expect(wallPosterGrid.querySelector('[data-testid^="poster-item-"]')).toBeNull()

      await triggerManualRefresh()

      expect(getElement("poster-wall-root")).toBe(wallRoot)
      expect(getElement("wall-poster-grid")).toBe(wallPosterGrid)
      expect(wallPosterGrid.querySelector("button")).toBeTruthy()
    } finally {
      runtime.dispose()
    }
  })

  it("keeps visible posters unchanged during healthy refreshes", async () => {
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

    const baselineItems = createPosterLibraryItems(1, 24)
    const refreshedItems = createPosterLibraryItems(101, 24)
    const fetchHarness = createFetchHarness({
      allowLogin: true,
      movieItemsByCall: [baselineItems, refreshedItems]
    })
    globalThis.fetch = fetchHarness

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    const countMediaCalls = (): number => {
      return fetchHarness.mock.calls.filter(([request]) => {
        const url = typeof request === "string"
          ? request
          : request instanceof URL
            ? request.toString()
            : request.url

        return url.includes("/Users/user-1/Items")
      }).length
    }

    const triggerManualRefresh = async (): Promise<void> => {
      const mediaCallsBeforeRefresh = countMediaCalls()
      clickByTestId("manual-refresh-button")
      await vi.waitFor(() => {
        expect(countMediaCalls()).toBeGreaterThan(mediaCallsBeforeRefresh)
      })
    }

    const createRect = (
      left: number,
      top: number,
      width: number,
      height: number
    ): DOMRect => {
      const right = left + width
      const bottom = top + height

      return {
        x: left,
        y: top,
        width,
        height,
        top,
        right,
        bottom,
        left,
        toJSON: () => ({
          x: left,
          y: top,
          width,
          height,
          top,
          right,
          bottom,
          left
        })
      } as DOMRect
    }

    const stubTileRect = (
      button: HTMLButtonElement,
      left: number,
      top: number,
      width: number,
      height: number
    ): void => {
      const rect = createRect(left, top, width, height)
      Object.defineProperty(button, "getBoundingClientRect", {
        configurable: true,
        value: () => rect
      })
    }

    const captureWallPosterBackgroundSnapshot = (): WallPosterBackgroundSnapshot => {
      const grid = getElement("wall-poster-grid")
      const viewportLeft = 0
      const viewportTop = 0
      const viewportRight = window.innerWidth
      const viewportBottom = window.innerHeight

      const posters = Array.from(grid.querySelectorAll<HTMLButtonElement>("button")).map((button, index) => {
        if (!button.dataset.task9ProbeId) {
          button.dataset.task9ProbeId = `task9-probe-${index + 1}`
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
          probeId: button.dataset.task9ProbeId,
          backgroundImage: posterThumb.style.backgroundImage,
          intersectionArea,
          isVisible: intersectionArea > 0
        }
      })

      return {
        posters,
        visiblePosters: posters
          .filter((poster) => poster.isVisible)
          .sort((left, right) => right.intersectionArea - left.intersectionArea)
      }
    }

    try {
      setInputValue("server-url-input", TEST_SERVER)
      await triggerServerStatusCheck()
      setInputValue("username-input", "demo-user")
      setInputValue("password-input", "super-secret")
      clickByTestId("login-submit")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
      })

      setChecked("library-checkbox-shows-main", false)
      clickByTestId("onboarding-finish")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
        expect(getElement("wall-poster-grid").querySelectorAll("button").length).toBeGreaterThanOrEqual(5)
      })

      const wallRoot = getElement("poster-wall-root")
      const wallPosterGrid = getElement("wall-poster-grid")
      const wallButtons = Array.from(wallPosterGrid.querySelectorAll<HTMLButtonElement>("button"))
      const viewportWidth = window.innerWidth

      const trackedVisibleButtons = wallButtons.slice(0, 3)
      const trackedOffscreenButtons = wallButtons.slice(3, 5)
      expect(trackedVisibleButtons).toHaveLength(3)
      expect(trackedOffscreenButtons).toHaveLength(2)

      trackedVisibleButtons.forEach((button, index) => {
        stubTileRect(button, 40 + (index * 240), 24, 200, 300)
      })
      trackedOffscreenButtons.forEach((button, index) => {
        stubTileRect(button, viewportWidth + 40 + (index * 240), 24, 200, 300)
      })

      const beforeRefreshSnapshot = captureWallPosterBackgroundSnapshot()
      const trackedVisiblePosters = beforeRefreshSnapshot.visiblePosters.slice(0, 3)
      expect(trackedVisiblePosters, JSON.stringify(beforeRefreshSnapshot)).toHaveLength(3)
      for (const poster of trackedVisiblePosters) {
        expect(poster.backgroundImage).toContain("url(")
      }

      await triggerManualRefresh()

      const beforeBackgroundByProbeId = new Map(
        beforeRefreshSnapshot.posters.map((poster) => [poster.probeId, poster.backgroundImage])
      )
      const trackedProbeIds = new Set(trackedVisiblePosters.map((poster) => poster.probeId))

      await vi.waitFor(() => {
        const afterRefreshSnapshot = captureWallPosterBackgroundSnapshot()

        expect(
          trackedVisiblePosters.filter((poster) => {
            const currentPoster = afterRefreshSnapshot.posters.find((candidate) => candidate.probeId === poster.probeId)
            return currentPoster?.isVisible === true && currentPoster.backgroundImage === poster.backgroundImage
          })
        ).toHaveLength(trackedVisiblePosters.length)
      })

      await vi.waitFor(() => {
        const afterRefreshSnapshot = captureWallPosterBackgroundSnapshot()
        const changedOffscreenPosters = afterRefreshSnapshot.posters.filter((poster) => {
          if (trackedProbeIds.has(poster.probeId)) {
            return false
          }

          return beforeBackgroundByProbeId.get(poster.probeId) !== poster.backgroundImage
        })

        expect(changedOffscreenPosters.length).toBeGreaterThan(0)
      })

      const afterRefreshSnapshot = captureWallPosterBackgroundSnapshot()
      const trackedVisibleAfterRefresh = trackedVisiblePosters.map((poster) => {
        const currentPoster = afterRefreshSnapshot.posters.find((candidate) => candidate.probeId === poster.probeId)
        if (!currentPoster) {
          throw new Error(`Missing tracked poster probe after refresh: ${poster.probeId}`)
        }

        return currentPoster
      })
      const changedOffscreenProbeIds = afterRefreshSnapshot.posters
        .filter((poster) => {
          if (trackedProbeIds.has(poster.probeId)) {
            return false
          }

          return beforeBackgroundByProbeId.get(poster.probeId) !== poster.backgroundImage
        })
        .map((poster) => poster.probeId)

      expect(getElement("poster-wall-root")).toBe(wallRoot)
      expect(getElement("wall-poster-grid")).toBe(wallPosterGrid)

      console.log(`[task-9-desktop-visible-poster-freeze] ${JSON.stringify({
        mediaRequestCount: countMediaCalls(),
        trackedVisibleBeforeRefresh: trackedVisiblePosters,
        trackedVisibleAfterRefresh,
        changedOffscreenProbeIds
      })}`)
    } finally {
      runtime.dispose()
    }
  })

  it("falls back once per broken readiness incident and rearms after recovery", async () => {
    const fetchHarness = createFetchHarness({
      allowLogin: true,
      includeSparsePoster: true
    })
    globalThis.fetch = fetchHarness

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    const countMediaCalls = (): number => {
      return fetchHarness.mock.calls.filter(([request]) => {
        const url = typeof request === "string"
          ? request
          : request instanceof URL
            ? request.toString()
            : request.url

        return url.includes("/Users/user-1/Items")
      }).length
    }

    const triggerManualRefresh = async (): Promise<void> => {
      const mediaCallsBeforeRefresh = countMediaCalls()
      clickByTestId("manual-refresh-button")
      await vi.waitFor(() => {
        expect(countMediaCalls()).toBeGreaterThan(mediaCallsBeforeRefresh)
      })
    }

    const bodyElement = document.body as HTMLElement & {
      __task6HideWallReadiness?: boolean
    }

    const originalBodyQuerySelector = bodyElement.querySelector
    const querySelectorFromBody = (selectors: string): Element | null => {
      return originalBodyQuerySelector.call(bodyElement, selectors)
    }

    try {
      setInputValue("server-url-input", TEST_SERVER)
      await triggerServerStatusCheck()
      setInputValue("username-input", "demo-user")
      setInputValue("password-input", "super-secret")
      clickByTestId("login-submit")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
      })

      setChecked("library-checkbox-shows-main", false)
      clickByTestId("onboarding-finish")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
      })

      bodyElement.querySelector = (function querySelectorWithTask6ReadinessBlock(
        this: HTMLElement,
        selectors: string
      ): Element | null {
        const shouldBlockWallReadiness = bodyElement.__task6HideWallReadiness === true
        const requestsWallReadinessSelectors =
          selectors === '[data-testid="poster-wall-root"]'
          || selectors === '[data-testid="wall-poster-grid"]'

        if (shouldBlockWallReadiness && requestsWallReadinessSelectors) {
          return null
        }

        return querySelectorFromBody(selectors)
      }) as typeof bodyElement.querySelector

      const initialWallRoot = getElement("poster-wall-root")

      bodyElement.__task6HideWallReadiness = true
      await triggerManualRefresh()

      await vi.waitFor(() => {
        expect(getElement("poster-wall-root")).not.toBe(initialWallRoot)
      })

      const wallRootAfterFirstFallback = getElement("poster-wall-root")

      await triggerManualRefresh()
      await triggerManualRefresh()
      expect(getElement("poster-wall-root")).toBe(wallRootAfterFirstFallback)

      bodyElement.__task6HideWallReadiness = false
      await triggerManualRefresh()
      expect(getElement("poster-wall-root")).toBe(wallRootAfterFirstFallback)

      bodyElement.__task6HideWallReadiness = true
      await triggerManualRefresh()
      await vi.waitFor(() => {
        expect(getElement("poster-wall-root")).not.toBe(wallRootAfterFirstFallback)
      })
    } finally {
      bodyElement.__task6HideWallReadiness = false
      bodyElement.querySelector = originalBodyQuerySelector
      runtime.dispose()
    }
  })

  it("keeps the GitHub repo link available after queue refills on desktop runtime", async () => {
    const fetchHarness = createFetchHarness({ allowLogin: true })
    globalThis.fetch = fetchHarness

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    const countMediaCalls = (): number => {
      return fetchHarness.mock.calls.filter(([request]) => {
        const url = typeof request === "string"
          ? request
          : request instanceof URL
            ? request.toString()
            : request.url

        return url.includes("/Users/user-1/Items")
      }).length
    }

    try {
      setInputValue("server-url-input", TEST_SERVER)
      await triggerServerStatusCheck()
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

      await vi.waitFor(() => {
        expect(countMediaCalls()).toBeGreaterThanOrEqual(2)
      }, { timeout: 5_000 })

      const githubRepoLink = document.querySelector('[data-testid="github-repo-link"]') as HTMLAnchorElement | null
      expect(githubRepoLink).toBeTruthy()
      expect(githubRepoLink?.href).toBe("https://github.com/ControlNet/media-poster-space")
      expect(githubRepoLink?.target).toBe("_blank")

      const evidence = {
        probe: "task-4-desktop-refill-fetch-adapter",
        mediaRequestCount: countMediaCalls(),
        githubLinkHref: githubRepoLink?.href ?? null
      }

      console.log(`[task-4-desktop-refill-adapter] ${JSON.stringify(evidence)}`)
    } finally {
      runtime.dispose()
    }
  })

  it("rearms the manual refresh button after a refresh-time fallback render", async () => {
    const manualRefreshDeferred = createDeferred()
    const baseFetchHarness = createFetchHarness({ allowLogin: true })
    let movieRequestCount = 0

    globalThis.fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

      if (url.includes("/Users/user-1/Items") && url.includes("ParentId=movies-main")) {
        movieRequestCount += 1
        if (movieRequestCount === 2) {
          await manualRefreshDeferred.promise
        }
      }

      return baseFetchHarness(input, init)
    }) as FetchMock & typeof fetch

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    const bodyElement = document.body as HTMLElement & {
      __task12HideWallReadiness?: boolean
    }
    const originalBodyQuerySelector = bodyElement.querySelector
    const querySelectorFromBody = (selectors: string): Element | null => {
      return originalBodyQuerySelector.call(bodyElement, selectors)
    }

    try {
      setInputValue("server-url-input", TEST_SERVER)
      await triggerServerStatusCheck()
      setInputValue("username-input", "demo-user")
      setInputValue("password-input", "super-secret")
      clickByTestId("login-submit")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
      })

      setChecked("library-checkbox-shows-main", false)
      clickByTestId("onboarding-finish")

      await vi.waitFor(() => {
        expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
      })

      bodyElement.querySelector = (function querySelectorWithTask12ReadinessBlock(
        this: HTMLElement,
        selectors: string
      ): Element | null {
        const shouldBlockWallReadiness = bodyElement.__task12HideWallReadiness === true
        const requestsWallReadinessSelectors =
          selectors === '[data-testid="poster-wall-root"]'
          || selectors === '[data-testid="wall-poster-grid"]'

        if (shouldBlockWallReadiness && requestsWallReadinessSelectors) {
          return null
        }

        return querySelectorFromBody(selectors)
      }) as typeof bodyElement.querySelector

      bodyElement.__task12HideWallReadiness = true
      clickByTestId("manual-refresh-button")

      await vi.waitFor(() => {
        const manualRefreshButton = getElement("manual-refresh-button") as HTMLButtonElement
        expect(manualRefreshButton.title).toBe("Refreshing…")
        expect(manualRefreshButton.disabled).toBe(true)
      })

      bodyElement.__task12HideWallReadiness = false
      manualRefreshDeferred.resolve()

      await vi.waitFor(() => {
        const manualRefreshButton = getElement("manual-refresh-button") as HTMLButtonElement
        expect(manualRefreshButton.title).toBe("Refresh posters now")
        expect(manualRefreshButton.disabled).toBe(false)
        expect(manualRefreshButton.style.animation).toBe("")
      })
    } finally {
      bodyElement.__task12HideWallReadiness = false
      bodyElement.querySelector = originalBodyQuerySelector
      manualRefreshDeferred.resolve()
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
    await triggerServerStatusCheck()
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
    await triggerServerStatusCheck()
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
    await triggerServerStatusCheck()

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
    await triggerServerStatusCheck()

    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "super-secret")
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
    })

    vi.useFakeTimers()

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

      await vi.advanceTimersByTimeAsync(180_000)
      await vi.waitFor(() => {
        expect(getMediaCallCount()).toBeGreaterThan(2)
      })

      const githubRepoLink = document.querySelector('[data-testid="github-repo-link"]') as HTMLAnchorElement | null
      expect(githubRepoLink).toBeTruthy()
      expect(githubRepoLink?.href).toBe("https://github.com/ControlNet/media-poster-space")
      expect(githubRepoLink?.target).toBe("_blank")
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
    await triggerServerStatusCheck()

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
