/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"
import { createOnboardingFormView } from "../../src/runtime/onboarding-form"
import { createOnboardingElementFactory, toLibraryCheckboxTestId } from "../../src/runtime/onboarding-shared"

const baseState = {
  selectedProviderId: "emby" as const,
  serverUrl: "https://emby.home.lan",
  rememberServer: true,
  preflightPending: false,
  preflightCheckedServerUrl: "https://emby.home.lan",
  preflightServerVersion: "4.8.10.0",
  preflightLatencyMs: 44,
  preflightError: null,
  username: "curator",
  password: "",
  rememberUsername: true,
  rememberPasswordRequested: false,
  loginPending: false,
  authError: null,
  libraries: [],
  selectedLibraryIds: new Set<string>(),
  finishPending: false,
  libraryError: null
}

const noop = () => {}
function build(overrides: Record<string, unknown> = {}) {
  return createOnboardingFormView({
    createElement: createOnboardingElementFactory(document),
    state: baseState,
    rememberPasswordLabel: "Remember password",
    authenticationAvailable: true,
    providerSelectionMessage: null,
    toLibraryCheckboxTestId,
    onProviderChange: noop,
    onServerInput: noop,
    onServerBlur: noop,
    onRememberServerChange: noop,
    onUsernameInput: noop,
    onPasswordInput: noop,
    onRememberUsernameChange: noop,
    onRememberPasswordChange: noop,
    onLogin: noop,
    onBack: noop,
    onLibrarySelectionChange: noop,
    onFinish: noop,
    ...overrides
  } as never)
}

const q = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`)

describe("provider-first connect view", () => {
  it("renders one panel per platform, the selected one wide", () => {
    const view = build()
    const panels = [...view.querySelectorAll<HTMLElement>(".mps-connect-panel")]
    expect(panels.map((p) => p.dataset.provider)).toEqual(["jellyfin", "emby", "plex"])
    expect(panels.map((p) => p.dataset.selected)).toEqual(["false", "true", "false"])
    expect(panels[1]!.style.width).toContain("calc(")
    expect(panels[0]!.style.width).toBe("120px")
  })

  it("keeps every platform clickable and preserves the test ids", () => {
    const view = build()
    for (const id of ["jellyfin", "emby", "plex"]) {
      expect(q(view, `provider-option-${id}`)).not.toBeNull()
    }
    expect(view.dataset.testid).toBe("app-shell")
    for (const id of ["provider-selector", "onboarding-title", "server-url-input",
      "server-status-indicator", "remember-server-checkbox", "username-input", "password-input",
      "remember-username-checkbox", "remember-password-checkbox", "login-submit"]) {
      expect(q(view, id), id).not.toBeNull()
    }
    expect(q(view, "onboarding-title")!.textContent).toContain("Connect Media Server")
    expect(q(view, "server-status-indicator")!.textContent).toContain("Server reachable")
    expect(q(view, "server-status-indicator")!.dataset.tone).toBe("ok")
    expect(q(view, "login-submit")!.textContent).toBe("Login")
  })

  it("ignores a click on the platform that is already selected", () => {
    let calls = 0
    const view = build({ onProviderChange: () => { calls += 1 } })
    q(view, "provider-option-emby")!.click()
    expect(calls).toBe(0)
    q(view, "provider-option-plex")!.click()
    expect(calls).toBe(1)
  })

  it("resizes from where the panels actually were, not from the logical state", () => {
    // jellyfin wide, the other two railed - the layout the switch is leaving
    const previousLayout = {
      shellWidth: 1440,
      panelWidths: { jellyfin: 1200, emby: 120, plex: 120 }
    }
    const switched = build({ providerTransitionFrom: "jellyfin", previousLayout })
    const panels = [...switched.querySelectorAll<HTMLElement>(".mps-connect-panel")]
    expect(panels[0]!.style.getPropertyValue("--mps-connect-panel-from")).toBe("1200px")
    expect(panels[0]!.style.animation).toContain("mps-connect-panel-resize")
    expect(panels[1]!.style.getPropertyValue("--mps-connect-panel-from")).toBe("120px")
    expect(panels[1]!.style.animation).toContain("mps-connect-panel-resize")
    // the rail nobody touched must not move or blink
    expect(panels[2]!.style.animation).toBe("")
  })

  it("picks the motion up mid-flight when a re-render interrupts it", () => {
    // a preflight render landing while the panels are part-way through
    const midFlight = build({
      previousLayout: { shellWidth: 1440, panelWidths: { jellyfin: 700, emby: 620, plex: 120 } }
    })
    const panels = [...midFlight.querySelectorAll<HTMLElement>(".mps-connect-panel")]
    expect(panels[1]!.style.getPropertyValue("--mps-connect-panel-from")).toBe("620px")
    expect(panels[1]!.style.animation).toContain("mps-connect-panel-resize")
    expect(panels[2]!.style.animation).toBe("")
  })

  it("leaves the layout alone when a render does not move anything", () => {
    const settled = build({
      previousLayout: { shellWidth: 1440, panelWidths: { jellyfin: 120, emby: 1200, plex: 120 } }
    })
    expect([...settled.querySelectorAll<HTMLElement>(".mps-connect-panel")]
      .every((p) => p.style.animation === "")).toBe(true)
  })

  it("plays the content stagger only on a platform change", () => {
    expect(build().querySelector(".mps-connect-rise")).toBeNull()
    expect(build({ providerTransitionFrom: "jellyfin" }).querySelector(".mps-connect-rise")).not.toBeNull()
  })

  it("fades in only the rail that just gave up the selection", () => {
    const switched = build({ providerTransitionFrom: "jellyfin" })
    const faded = [...switched.querySelectorAll<HTMLElement>(".mps-connect-fade")]
      .map((el) => el.dataset.provider)
    expect(faded).toEqual(["jellyfin"])
  })

  it("puts the library step in the wide panel and keeps the rails", () => {
    const view = build({
      state: {
        ...baseState,
        libraries: [{ id: "movies", name: "Movies", kind: "movies" }],
        selectedLibraryIds: new Set(["movies"])
      }
    })
    const selected = view.querySelector<HTMLElement>('.mps-connect-panel[data-selected="true"]')!
    expect(selected.dataset.provider).toBe("emby")
    expect(selected.contains(q(view, "onboarding-finish"))).toBe(true)
    expect(selected.contains(q(view, "change-server-button"))).toBe(true)
    expect(q(view, "library-checkbox-movies")).not.toBeNull()
    expect(view.querySelectorAll('.mps-connect-panel[data-selected="false"]')).toHaveLength(2)
  })

  it("keeps the status row one line tall in every tone", () => {
    const idle = build({
      state: { ...baseState, serverUrl: "", preflightCheckedServerUrl: null, preflightServerVersion: null }
    })
    const idleStatus = q(idle, "server-status-indicator")!
    expect(idleStatus.dataset.tone).toBe("idle")
    expect(idleStatus.textContent).toContain("when you leave this field")
    expect(idleStatus.style.minHeight).toBe("2.5rem")

    const reachable = q(build(), "server-status-indicator")!
    expect(reachable.dataset.tone).toBe("ok")
    expect(reachable.textContent).toContain("Server reachable")
    expect(reachable.style.minHeight).toBe("2.5rem")

    // every tone must fit the reserved single line, or the credentials move
    for (const text of [idleStatus.textContent, reachable.textContent]) {
      expect(text!.length).toBeLessThanOrEqual(66)
    }
  })

  it("shows the unsupported notice and disables the primary action", () => {
    const view = build({
      state: { ...baseState, selectedProviderId: "plex" },
      authenticationAvailable: false,
      providerSelectionMessage: "Plex support is coming soon"
    })
    expect(q(view, "provider-support-banner")!.textContent).toBe("Plex support is coming soon")
    expect((q(view, "login-submit") as HTMLButtonElement).disabled).toBe(true)
    expect(q(view, "server-status-indicator")!.dataset.tone).toBe("notice")
  })
})
