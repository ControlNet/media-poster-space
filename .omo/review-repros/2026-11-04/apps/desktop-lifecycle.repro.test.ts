import { webcrypto } from "node:crypto"

import { createDesktopOnboardingAppRuntime } from "../../../../apps/desktop/src/onboarding/runtime.ts"
import type { DesktopPlatformBridge } from "../../../../apps/desktop/src/features/platform/tauri-bridge.ts"

import {
  TEST_SERVER,
  blurServerInput,
  clickByTestId,
  createFetchHarness,
  listTestIds,
  seedPersistedSessionAndHandoff,
  setInputValue
} from "./harness"

function createBridge(overrides: Partial<DesktopPlatformBridge> = {}): DesktopPlatformBridge {
  return {
    getCapabilities: async () => ({
      isDesktop: true,
      isLinux: true,
      isPortable: false,
      secureCredentialStorage: true,
      linuxSecretServiceAvailable: true
    }),
    listDisplays: async () => [{ id: "display-primary", label: "Primary display", isPrimary: true }],
    getDisplaySelection: async () => "display-primary",
    setDisplaySelection: async () => undefined,
    getAutostartEnabled: async () => false,
    setAutostartEnabled: async () => undefined,
    getFullscreenEnabled: async () => false,
    setFullscreenEnabled: async () => undefined,
    readCredential: async () => null,
    writeCredential: async () => ({ storageKind: "secure-service", warning: null }),
    clearCredential: async () => undefined,
    clearAllCredentials: async () => undefined,
    ...overrides
  }
}

beforeEach(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true })
  }
  window.history.pushState({}, "", "/")
  window.localStorage.clear()
  window.sessionStorage.clear()
  document.body.replaceChildren()
})

describe("REPRO desktop render() re-entrancy via tryAutomaticWallEntry", () => {
  it("relaunch at '/' with persisted session+handoff: URL becomes /wall but onboarding form is rendered", async () => {
    globalThis.fetch = createFetchHarness()
    seedPersistedSessionAndHandoff(window.localStorage)

    // Platform init never settles -> isolates the effect of the first render.
    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: createBridge({ getFullscreenEnabled: () => new Promise<boolean>(() => {}) })
    })
    runtime.start()

    await new Promise((resolve) => setTimeout(resolve, 300))
    const ids = listTestIds()
    console.log("[repro-a] pathname=", window.location.pathname, "hasWallRoot=", ids.includes("poster-wall-root"),
      "hasServerInput=", ids.includes("server-url-input"), "ids=", ids.slice(0, 12).join(","))

    expect(window.location.pathname).toBe("/wall")
    expect(ids.includes("poster-wall-root")).toBe(false)
    runtime.dispose()
  })

  it("same relaunch with a working bridge self-heals only after platform init re-renders", async () => {
    globalThis.fetch = createFetchHarness()
    seedPersistedSessionAndHandoff(window.localStorage)

    const runtime = createDesktopOnboardingAppRuntime(document.body, { platformBridge: createBridge() })
    runtime.start()
    const syncIds = listTestIds()
    console.log("[repro-a2] synchronously after start(): pathname=", window.location.pathname,
      "hasWallRoot=", syncIds.includes("poster-wall-root"), "hasServerInput=", syncIds.includes("server-url-input"))

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
    })
    const itemFetches = (globalThis.fetch as unknown as { calls: string[] }).calls.filter((url) => url.includes("/Users/user-1/Items")).length
    console.log("[repro-a2] wall mounted later; item fetch count=", itemFetches)
    runtime.dispose()
  })
})

describe("REPRO desktop wall clock is never refreshed", () => {
  it("wall-clock-heading stays at mount-time text after the system clock moves", async () => {
    globalThis.fetch = createFetchHarness()
    seedPersistedSessionAndHandoff(window.localStorage)
    window.history.pushState({}, "", "/wall")

    const runtime = createDesktopOnboardingAppRuntime(document.body, { platformBridge: createBridge() })
    runtime.start()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
    })
    await new Promise((resolve) => setTimeout(resolve, 300))

    const before = document.querySelector('[data-testid="wall-clock-heading"]')?.textContent
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000 + 7 * 60 * 1000))
    await new Promise((resolve) => setTimeout(resolve, 2_500))
    const after = document.querySelector('[data-testid="wall-clock-heading"]')?.textContent
    const expectedNow = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })
    vi.useRealTimers()
    console.log("[repro-b desktop] before=", before, "after=", after, "expectedNow=", expectedNow)
    expect(after).toBe(before)
    expect(after).not.toBe(expectedNow)
    runtime.dispose()
  })
})

describe("REPRO desktop platform init poisoned by getFullscreenEnabled rejection", () => {
  it("display select and autostart stay disabled with no warning banner", async () => {
    globalThis.fetch = createFetchHarness()
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown): void => { unhandled.push(reason) }
    process.on("unhandledRejection", onUnhandled)

    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: createBridge({ getFullscreenEnabled: async () => { throw "window not found" } })
    })
    runtime.start()

    setInputValue("server-url-input", TEST_SERVER)
    blurServerInput()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="server-status-indicator"]')?.textContent).toContain("Server reachable")
    })
    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "pw")
    clickByTestId("login-submit")
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="display-selection-select"]')).toBeTruthy()
    })
    await new Promise((resolve) => setTimeout(resolve, 200))

    const select = document.querySelector('[data-testid="display-selection-select"]') as HTMLSelectElement
    const autostart = document.querySelector('[data-testid="autostart-toggle-checkbox"]') as HTMLInputElement
    const banner = document.querySelector('[data-testid="platform-warning-banner"]')
    console.log("[repro-g] selectDisabled=", select.disabled, "autostartDisabled=", autostart.disabled,
      "banner=", banner?.textContent ?? null, "unhandled=", JSON.stringify(unhandled))
    process.off("unhandledRejection", onUnhandled)
    expect(select.disabled).toBe(true)
    expect(autostart.disabled).toBe(true)
    expect(banner).toBeNull()
    runtime.dispose()
  })
})

describe("REPRO desktop fullscreen failure on wall is invisible", () => {
  it("setFullscreenEnabled rejection leaves no warning on the wall", async () => {
    globalThis.fetch = createFetchHarness()
    seedPersistedSessionAndHandoff(window.localStorage)
    window.history.pushState({}, "", "/wall")

    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: createBridge({ setFullscreenEnabled: async () => { throw "Failed to set fullscreen: os error" } })
    })
    runtime.start()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="wall-fullscreen-button"]')).toBeTruthy()
    })
    clickByTestId("wall-fullscreen-button")
    await new Promise((resolve) => setTimeout(resolve, 200))
    const text = document.body.textContent ?? ""
    console.log("[repro-k] wall still mounted=", Boolean(document.querySelector('[data-testid="poster-wall-root"]')),
      "mentionsFullscreenFailure=", /fullscreen/i.test(text) && /fail/i.test(text),
      "banner=", Boolean(document.querySelector('[data-testid="platform-warning-banner"]')))
    runtime.dispose()
  })
})

describe("REPRO desktop display label is parsed as HTML", () => {
  it("label markup becomes DOM inside the select", async () => {
    globalThis.fetch = createFetchHarness()
    const runtime = createDesktopOnboardingAppRuntime(document.body, {
      platformBridge: createBridge({
        listDisplays: async () => [
          { id: "display-0-1920x1080-0,0", label: "AT&amp;T</option><option value=\"injected\">Injected", isPrimary: true }
        ],
        getDisplaySelection: async () => "display-0-1920x1080-0,0"
      })
    })
    runtime.start()
    setInputValue("server-url-input", TEST_SERVER)
    blurServerInput()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="server-status-indicator"]')?.textContent).toContain("Server reachable")
    })
    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "pw")
    clickByTestId("login-submit")
    await vi.waitFor(() => {
      const select = document.querySelector('[data-testid="display-selection-select"]') as HTMLSelectElement | null
      expect(select?.disabled).toBe(false)
    })
    const select = document.querySelector('[data-testid="display-selection-select"]') as HTMLSelectElement
    console.log("[repro-h] option values=", JSON.stringify(Array.from(select.options).map((o) => [o.value, o.textContent])))
    expect(select.options.length).toBe(2)
    runtime.dispose()
  })
})
