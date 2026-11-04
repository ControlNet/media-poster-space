import { createOnboardingAppRuntime } from "../../../../apps/web/src/onboarding/runtime.ts"
import { restorePendingPagesRedirect } from "../../../../apps/web/src/routing/base-path.ts"

import {
  clickByTestId,
  clickElement,
  createFetchHarness,
  listTestIds,
  seedPersistedSessionAndHandoff
} from "./harness"

beforeEach(() => {
  window.history.pushState({}, "", "/")
  window.localStorage.clear()
  window.sessionStorage.clear()
  document.body.replaceChildren()
})

describe("REPRO web reconnect guide 'Return to onboarding' bounces back to the wall", () => {
  it("auth failure -> click Return to onboarding -> still on wall", async () => {
    globalThis.fetch = createFetchHarness({ mediaStatus: 401 })
    seedPersistedSessionAndHandoff(window.localStorage)
    window.history.pushState({}, "", "/wall")
    const runtime = createOnboardingAppRuntime(document.body)
    runtime.start()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="reconnect-guide"]')).toBeTruthy()
    })
    const reason = document.querySelector('[data-testid="reconnect-guide"]')?.textContent
    const button = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Return to onboarding")
    if (!button) throw new Error("no return button")
    clickElement(button)
    await new Promise((resolve) => setTimeout(resolve, 500))
    const ids = listTestIds()
    console.log("[web return] guideText=", reason?.slice(0, 90), "| pathname=", window.location.pathname,
      "wall=", ids.includes("poster-wall-root"), "serverInput=", ids.includes("server-url-input"))
    expect(window.location.pathname).toBe("/wall")
    expect(ids.includes("server-url-input")).toBe(false)
    runtime.dispose()
  })
})

describe("REPRO web logout waits on server invalidation before clearing token", () => {
  it("token still in localStorage and wall still shown 1s after clicking logout", async () => {
    globalThis.fetch = createFetchHarness({ logoutDelayMs: 3_000 })
    seedPersistedSessionAndHandoff(window.localStorage)
    window.history.pushState({}, "", "/wall")
    const runtime = createOnboardingAppRuntime(document.body)
    runtime.start()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="logout-button"]')).toBeTruthy()
    })
    const startedAt = Date.now()
    clickByTestId("logout-button")
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    const tokenStillPersisted = window.localStorage.getItem("mps.auth.session")
    console.log("[web logout +1s] pathname=", window.location.pathname,
      "localStorage token present=", Boolean(tokenStillPersisted && tokenStillPersisted.includes("token-abc")),
      "wall=", Boolean(document.querySelector('[data-testid="poster-wall-root"]')))
    expect(window.location.pathname).toBe("/wall")
    expect(tokenStillPersisted).toContain("token-abc")
    await vi.waitFor(() => {
      expect(window.localStorage.getItem("mps.auth.session")).toBeNull()
    }, { timeout: 5_000 })
    console.log("[web logout] cleared after ms=", Date.now() - startedAt)
    runtime.dispose()
  })
})

describe("REPRO web wall clock ticks (contrast with desktop)", () => {
  it("wall-clock-heading follows the system clock", async () => {
    globalThis.fetch = createFetchHarness()
    seedPersistedSessionAndHandoff(window.localStorage)
    window.history.pushState({}, "", "/wall")
    const runtime = createOnboardingAppRuntime(document.body)
    runtime.start()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
    })
    const before = document.querySelector('[data-testid="wall-clock-heading"]')?.textContent
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000 + 7 * 60 * 1000))
    await new Promise((resolve) => setTimeout(resolve, 2_500))
    const after = document.querySelector('[data-testid="wall-clock-heading"]')?.textContent
    vi.useRealTimers()
    console.log("[web clock] before=", before, "after=", after)
    expect(after).not.toBe(before)
    runtime.dispose()
  })
})

describe("REPRO web session persistence", () => {
  it("finish without any remember toggles still persists bearer token in localStorage", async () => {
    globalThis.fetch = createFetchHarness()
    const runtime = createOnboardingAppRuntime(document.body)
    runtime.start()
    const server = document.querySelector('[data-testid="server-url-input"]') as HTMLInputElement
    server.value = "https://jellyfin.test"
    server.dispatchEvent(new Event("input", { bubbles: true }))
    server.dispatchEvent(new Event("blur"))
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="server-status-indicator"]')?.textContent).toContain("Server reachable")
    })
    for (const [id, value] of [["username-input", "demo-user"], ["password-input", "pw"]] as const) {
      const input = document.querySelector(`[data-testid="${id}"]`) as HTMLInputElement
      input.value = value
      input.dispatchEvent(new Event("input", { bubbles: true }))
    }
    const rememberToggles = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
      .map((box) => `${box.dataset.testid}=${box.checked}`)
    clickByTestId("login-submit")
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="onboarding-finish"]')).toBeTruthy()
    })
    clickByTestId("onboarding-finish")
    await new Promise((resolve) => setTimeout(resolve, 100))
    console.log("[web persist] toggles=", rememberToggles.join(","), "| localStorage keys=",
      Object.keys(window.localStorage).join(","), "| password in storage=",
      JSON.stringify({ ...window.localStorage }).includes("\"pw\""))
    runtime.dispose()
  })
})

describe("REPRO base-path restore with protocol-relative target", () => {
  it("replaceState throws SecurityError for //host targets", () => {
    window.sessionStorage.setItem("mps.pages.redirect-target", "//evil.example/x?y=1#z")
    let thrown: unknown = null
    try {
      restorePendingPagesRedirect()
    } catch (error) {
      thrown = error
    }
    console.log("[base-path] thrown=", thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown),
      "| key removed=", window.sessionStorage.getItem("mps.pages.redirect-target") === null,
      "| pathname=", window.location.pathname)
    expect(thrown).not.toBeNull()
  })

  it("normal deep link keeps query and hash", () => {
    window.sessionStorage.setItem("mps.pages.redirect-target", "/wall?mode=test#frag")
    restorePendingPagesRedirect()
    console.log("[base-path] restored=", `${window.location.pathname}${window.location.search}${window.location.hash}`)
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/wall?mode=test#frag")
  })
})
