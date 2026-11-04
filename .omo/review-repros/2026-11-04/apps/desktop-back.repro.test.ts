import { webcrypto } from "node:crypto"

import { createDesktopOnboardingAppRuntime } from "../../../../apps/desktop/src/onboarding/runtime.ts"
import type { DesktopPlatformBridge } from "../../../../apps/desktop/src/features/platform/tauri-bridge.ts"

import {
  clickElement,
  createFetchHarness,
  listTestIds,
  seedPersistedSessionAndHandoff
} from "./harness"

function createBridge(): DesktopPlatformBridge {
  return {
    getCapabilities: async () => ({ isDesktop: true, isLinux: true, isPortable: false, secureCredentialStorage: true, linuxSecretServiceAvailable: true }),
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
    clearAllCredentials: async () => undefined
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

describe("REPRO desktop leaving the wall while session+handoff are persisted", () => {
  it("baseline: start directly at /wall, count item fetches", async () => {
    const fetchHarness = createFetchHarness()
    globalThis.fetch = fetchHarness
    seedPersistedSessionAndHandoff(window.localStorage)
    window.history.pushState({}, "", "/wall")
    const runtime = createDesktopOnboardingAppRuntime(document.body, { platformBridge: createBridge() })
    runtime.start()
    await new Promise((resolve) => setTimeout(resolve, 600))
    console.log("[baseline] item fetches=", fetchHarness.calls.filter((u) => u.includes("/Users/user-1/Items")).length)
    runtime.dispose()
  })

  it("relaunch at '/' (normal Tauri entry): count item fetches", async () => {
    const fetchHarness = createFetchHarness()
    globalThis.fetch = fetchHarness
    seedPersistedSessionAndHandoff(window.localStorage)
    const runtime = createDesktopOnboardingAppRuntime(document.body, { platformBridge: createBridge() })
    runtime.start()
    await new Promise((resolve) => setTimeout(resolve, 600))
    console.log("[relaunch] item fetches=", fetchHarness.calls.filter((u) => u.includes("/Users/user-1/Items")).length,
      "wall=", Boolean(document.querySelector('[data-testid="poster-wall-root"]')))
    runtime.dispose()
  })

  it("popstate back to '/' from a mounted wall leaves onboarding UI under /wall", async () => {
    globalThis.fetch = createFetchHarness()
    seedPersistedSessionAndHandoff(window.localStorage)
    window.history.pushState({}, "", "/wall")
    const runtime = createDesktopOnboardingAppRuntime(document.body, { platformBridge: createBridge() })
    runtime.start()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="poster-item-0"]')).toBeTruthy()
    })
    await new Promise((resolve) => setTimeout(resolve, 300))

    window.history.pushState({}, "", "/")
    window.dispatchEvent(new PopStateEvent("popstate"))
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    const ids = listTestIds()
    console.log("[back] pathname=", window.location.pathname, "wall=", ids.includes("poster-wall-root"),
      "ids=", ids.slice(0, 15).join(","))
    runtime.dispose()
  })

  it("reconnect-guide 'Return to onboarding' (auth failure) on desktop", async () => {
    globalThis.fetch = createFetchHarness({ mediaStatus: 401 })
    seedPersistedSessionAndHandoff(window.localStorage)
    window.history.pushState({}, "", "/wall")
    const runtime = createDesktopOnboardingAppRuntime(document.body, { platformBridge: createBridge() })
    runtime.start()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="reconnect-guide"]')).toBeTruthy()
    })
    const button = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Return to onboarding")
    if (!button) throw new Error("no return button")
    clickElement(button)
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    const ids = listTestIds()
    console.log("[desktop return] pathname=", window.location.pathname, "wall=", ids.includes("poster-wall-root"),
      "guide=", ids.includes("reconnect-guide"), "ids=", ids.slice(0, 15).join(","))
    runtime.dispose()
  })
})
