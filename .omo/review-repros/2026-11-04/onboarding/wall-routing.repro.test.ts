// Throwaway repro (review only). Drives the real web + desktop runtimes in jsdom.
import { webcrypto } from "node:crypto"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { createDesktopOnboardingAppRuntime } from "../../../../apps/desktop/src/onboarding/runtime"
import { createOnboardingAppRuntime } from "../../../../apps/web/src/onboarding/runtime"

const SESSION = {
  providerId: "jellyfin",
  serverUrl: "https://jellyfin.test",
  userId: "user-1",
  username: "demo",
  accessToken: "token-abc",
  createdAt: "2026-01-01T00:00:00.000Z"
}
const HANDOFF = {
  selectedLibraryIds: ["movies-main"],
  preferences: { rememberServer: false, rememberUsername: false, rememberPasswordRequested: false }
}

function mousePointerDown(): Event {
  const event = new Event("pointerdown", { bubbles: true })
  Object.defineProperty(event, "pointerType", { value: "mouse" })
  Object.defineProperty(event, "button", { value: 0 })
  return event
}

function fetch401ForMedia(): typeof fetch {
  return vi.fn(async (input: URL | RequestInfo) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    if (url.includes("/Users/user-1/Items")) {
      return new Response(JSON.stringify({ Message: "revoked" }), { status: 401, headers: { "content-type": "application/json" } })
    }
    return new Response("{}", { status: 404, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
}

function findReturnButton(): HTMLButtonElement | null {
  const guide = document.querySelector('[data-testid="reconnect-guide"]')
  const button = guide ? Array.from(guide.querySelectorAll("button")).find((b) => b.textContent === "Return to onboarding") : undefined
  return button ?? null
}

beforeEach(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true })
  }
  window.localStorage.clear()
  window.sessionStorage.clear()
  document.body.replaceChildren()
})

for (const surface of ["web", "desktop"] as const) {
  it(`${surface}: 'Return to onboarding' in the reconnect guide lands back on the wall`, async () => {
    globalThis.fetch = fetch401ForMedia()
    window.localStorage.setItem("mps.auth.session", JSON.stringify(SESSION))
    window.localStorage.setItem("mps.wall.handoff", JSON.stringify(HANDOFF))
    window.history.pushState({}, "", "/wall")

    const runtime = surface === "web"
      ? createOnboardingAppRuntime(document.body)
      : createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    await vi.waitFor(() => {
      expect(findReturnButton()).not.toBeNull()
    }, { timeout: 5_000 })
    console.log(`[${surface}] guide text:`, document.querySelector('[data-testid="reconnect-guide"]')?.textContent)

    findReturnButton()?.dispatchEvent(mousePointerDown())
    await new Promise((r) => setTimeout(r, 50))
    const snapshots: string[] = []
    for (let i = 0; i < 20; i += 1) {
      snapshots.push(`${window.location.pathname}|onb=${document.querySelector('[data-testid="server-url-input"]') !== null}|wall=${document.querySelector('[data-testid="poster-wall-root"]') !== null}`)
      await new Promise((r) => setTimeout(r, 50))
    }
    console.log(`[${surface}] route timeline over 1s:`, [...new Set(snapshots)].join("  ->  "))

    const serverInput = document.querySelector<HTMLInputElement>('[data-testid="server-url-input"]')
    if (serverInput) {
      // user starts filling the form; leaving the field triggers a preflight render
      serverInput.value = "https://jellyfin.test"
      serverInput.dispatchEvent(new Event("input", { bubbles: true }))
      serverInput.dispatchEvent(new Event("blur"))
      await new Promise((r) => setTimeout(r, 50))
      console.log(`[${surface}] after first form interaction: pathname=${window.location.pathname} onb=${document.querySelector('[data-testid="server-url-input"]') !== null} wall=${document.querySelector('[data-testid="poster-wall-root"]') !== null}`)
    }
    const onOnboarding = document.querySelector('[data-testid="server-url-input"]') !== null
    const onWall = document.querySelector('[data-testid="poster-wall-root"]') !== null
    console.log(`[${surface}] after click: pathname=${window.location.pathname} onboardingVisible=${onOnboarding} wallVisible=${onWall}`)

    expect(window.location.pathname).toBe("/wall")
    expect(onWall).toBe(true)
    expect(onOnboarding).toBe(false)
    runtime.dispose()
  })
}

it("web: a persisted handoff without selectedLibraryIds makes start() throw and leaves a blank page", () => {
  globalThis.fetch = fetch401ForMedia()
  window.localStorage.setItem("mps.auth.session", JSON.stringify(SESSION))
  window.localStorage.setItem("mps.wall.handoff", "{}")
  window.history.pushState({}, "", "/")

  const runtime = createOnboardingAppRuntime(document.body)
  let thrown: unknown = null
  try {
    runtime.start()
  } catch (error) {
    thrown = error
  }
  console.log("[web] start() threw:", thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : thrown)
  console.log("[web] body children after start():", document.body.children.length, "pathname:", window.location.pathname)
  expect(thrown).toBeInstanceOf(TypeError)
  expect(document.body.children.length).toBe(0)
  runtime.dispose()
})
