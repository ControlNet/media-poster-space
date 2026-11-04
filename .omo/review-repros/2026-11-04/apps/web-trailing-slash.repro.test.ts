import { createOnboardingAppRuntime } from "../../../../apps/web/src/onboarding/runtime.ts"

import { createFetchHarness, createMousePointerEvent, seedPersistedSessionAndHandoff } from "./harness"

beforeEach(() => {
  window.history.pushState({}, "", "/")
  window.localStorage.clear()
  window.sessionStorage.clear()
  document.body.replaceChildren()
})

async function idleHideStateAt(pathname: string): Promise<{ wallMounted: boolean; controlsVisibilityAfterIdle: string }> {
  globalThis.fetch = createFetchHarness()
  seedPersistedSessionAndHandoff(window.localStorage)
  window.history.pushState({}, "", pathname)
  const runtime = createOnboardingAppRuntime(document.body)
  runtime.start()
  await vi.waitFor(() => {
    expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
  })
  await new Promise((resolve) => setTimeout(resolve, 300))
  vi.useFakeTimers()
  try {
    window.dispatchEvent(createMousePointerEvent("pointermove"))
    vi.advanceTimersByTime(30_000)
    await Promise.resolve()
    const controls = document.querySelector('[data-testid="wall-controls-container"]') as HTMLElement | null
    return {
      wallMounted: Boolean(document.querySelector('[data-testid="poster-wall-root"]')),
      controlsVisibilityAfterIdle: controls?.style.visibility ?? "missing"
    }
  } finally {
    vi.useRealTimers()
    runtime.dispose()
  }
}

describe("REPRO web /wall/ (trailing slash) renders a half-alive wall", () => {
  it("controls never idle-hide at /wall/ but do at /wall", async () => {
    const exact = await idleHideStateAt("/wall")
    window.localStorage.clear()
    window.sessionStorage.clear()
    document.body.replaceChildren()
    const trailing = await idleHideStateAt("/wall/")
    console.log("[trailing-slash] /wall ->", JSON.stringify(exact), "| /wall/ ->", JSON.stringify(trailing))
    expect(exact.controlsVisibilityAfterIdle).toBe("hidden")
    expect(trailing.wallMounted).toBe(true)
    expect(trailing.controlsVisibilityAfterIdle).not.toBe("hidden")
  })
})
