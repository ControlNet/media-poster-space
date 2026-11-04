/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"
import { createWallControlsSection } from "../../src/wall/ui/controls-section"
import type { ElementFactory, ElementFactoryOptions } from "../../src/wall/ui/element-factory"

const noop = () => {}

const createElement: ElementFactory = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: ElementFactoryOptions
) => {
  const element = document.createElement(tagName)
  if (options?.className) element.className = options.className
  if (options?.textContent) element.textContent = options.textContent
  if (options?.testId) element.dataset.testid = options.testId
  return element
}
const order = (fullscreen: boolean) => {
  const section = createWallControlsSection(createElement, {
    ingestionStatus: "ready", diagnosticsOpen: false, controlsHidden: false, transitionMs: 200,
    onRefresh: noop, onToggleDiagnostics: noop, onLogout: noop,
    diagnosticsPanel: null, ingestionError: null, reconnectGuide: null,
    showFullscreenControl: fullscreen, fullscreenActive: false,
    // exactOptionalPropertyTypes: the key has to be absent, not undefined
    ...(fullscreen ? { onToggleFullscreen: noop } : {})
  })
  const navbar = [...section.children].find((c) => c.querySelector('[data-testid="logout-button"]'))!
  return [...navbar.children].map((c) => (c as HTMLElement).dataset.testid ?? "separator")
}

describe("wall navbar", () => {
  it("puts leaving the wall on the left and acting on it on the right", () => {
    expect(order(true)).toEqual([
      "github-repo-link", "logout-button", "separator", "manual-refresh-button", "diagnostics-open", "wall-fullscreen-button"
    ])
  })
  it("keeps the grouping when there is no fullscreen control", () => {
    expect(order(false)).toEqual([
      "github-repo-link", "logout-button", "separator", "manual-refresh-button", "diagnostics-open"
    ])
  })
})
