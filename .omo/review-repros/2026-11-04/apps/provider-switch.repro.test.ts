import { webcrypto } from "node:crypto"

import { createOnboardingAppRuntime } from "../../../../apps/web/src/onboarding/runtime.ts"
import { createDesktopOnboardingAppRuntime } from "../../../../apps/desktop/src/onboarding/runtime.ts"
import type { OnboardingAppRuntime } from "@mps/core"

import { TEST_SERVER, blurServerInput, clickByTestId, createFetchHarness, setInputValue } from "./harness"

beforeEach(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true })
  }
  window.history.pushState({}, "", "/")
  window.localStorage.clear()
  window.sessionStorage.clear()
  document.body.replaceChildren()
})

function selectedPanel(): string {
  const pressed = document.querySelector('[data-testid^="provider-option-"][aria-pressed="true"]') as HTMLElement | null
  return pressed?.dataset.provider ?? "none"
}

async function loginThenSwitch(create: () => OnboardingAppRuntime): Promise<{ afterFirst: string; afterSecond: string }> {
  globalThis.fetch = createFetchHarness()
  const runtime = create()
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
    expect(document.querySelector('[data-testid="onboarding-finish"]')).toBeTruthy()
  })
  clickByTestId("provider-option-emby")
  await new Promise((resolve) => setTimeout(resolve, 100))
  const afterFirst = selectedPanel()
  clickByTestId("provider-option-emby")
  await new Promise((resolve) => setTimeout(resolve, 100))
  const afterSecond = selectedPanel()
  runtime.dispose()
  return { afterFirst, afterSecond }
}

describe("REPRO switching provider after a successful login", () => {
  it("web reverts the selection to the stored session's provider; desktop does not", async () => {
    const web = await loginThenSwitch(() => createOnboardingAppRuntime(document.body))
    window.history.pushState({}, "", "/")
    window.localStorage.clear()
    window.sessionStorage.clear()
    document.body.replaceChildren()
    const desktop = await loginThenSwitch(() => createDesktopOnboardingAppRuntime(document.body))
    console.log("[provider-switch] web=", JSON.stringify(web), "desktop=", JSON.stringify(desktop))
  })
})
