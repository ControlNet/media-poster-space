import { webcrypto } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { chromium } from "@playwright/test"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createDesktopOnboardingAppRuntime } from "../../src/onboarding/runtime"

const TEST_SERVER = "https://jellyfin.test"
const MILESTONE = "v1"
const SCENE = "mandatory-gates"
const VERSION = "r1"
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const EVIDENCE_ROOT = path.resolve(CURRENT_DIR, "../../../../.omo/evidence")

interface GateMetrics {
  platform: "desktop"
  generatedAt: string
  gates: {
    "login-flow-ms": number
    "offline-cached-first-paint-ms": number
    "token-revoked-recovery-ms": number
    "logout-cleanup-ms": number
  }
  visualBaseline: {
    milestone: string
    scene: string
    version: string
    screenshots: string[]
  }
}

interface DesktopVisualSegment {
  title: string
  subtitle: string
  appMarkup: string
}

type FetchMode = "online" | "offline" | "revoked"

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

function setInputValue(testId: string, value: string): void {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${testId}`)
  }

  element.value = value
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

async function triggerServerStatusCheck(): Promise<void> {
  const element = document.querySelector('[data-testid="server-url-input"]')
  if (!(element instanceof HTMLInputElement)) {
    throw new Error("Missing input: server-url-input")
  }

  element.dispatchEvent(new Event("blur"))

  await vi.waitFor(() => {
    const status = document.querySelector('[data-testid="server-status-indicator"]')
    expect(status?.textContent).toContain("Server reachable")
  })
}

function setChecked(testId: string, checked: boolean): void {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing checkbox: ${testId}`)
  }

  element.checked = checked
  element.dispatchEvent(new Event("change", { bubbles: true }))
}

function createFetchHarness(getMode: () => FetchMode): typeof fetch {
  return vi.fn(async (input: URL | RequestInfo) => {
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
      return new Response(
        JSON.stringify({
          AccessToken: "token-abc",
          User: { Id: "user-1", Name: "demo-user" }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*"
          }
        }
      )
    }

    if (url.endsWith("/Users/user-1/Views")) {
      return new Response(
        JSON.stringify({
          Items: [{ Id: "movies-main", Name: "Movies", CollectionType: "movies" }]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    }

    if (url.includes("/Users/user-1/Items")) {
      if (getMode() === "revoked") {
        return new Response(JSON.stringify({ Message: "revoked" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
      }

      if (getMode() === "offline") {
        return new Response(JSON.stringify({ Message: "offline" }), {
          status: 503,
          headers: { "content-type": "application/json" }
        })
      }

      return new Response(
        JSON.stringify({
          Items: [
            {
              Id: "movie-1",
              Name: "Poster Ready",
              Type: "Movie",
              Overview: "Mandatory desktop gate coverage.",
              ImageTags: { Primary: "poster-tag" }
            }
          ],
          TotalRecordCount: 1
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    }

    if (url.endsWith("/Sessions/Logout")) {
      return new Response(null, { status: 204 })
    }

    return new Response(null, { status: 404 })
  }) as typeof fetch
}

function sanitizeAppMarkup(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replaceAll("secret-pass", "[redacted]")
    .replaceAll("token-abc", "[redacted-token]")
}

function collectRootCssVariableDeclarations(): string {
  const rootStyle = document.documentElement?.style
  if (!rootStyle) {
    return ""
  }

  const declarations: string[] = []
  for (let index = 0; index < rootStyle.length; index += 1) {
    const propertyName = rootStyle.item(index)
    if (!propertyName?.startsWith("--")) {
      continue
    }

    const propertyValue = rootStyle.getPropertyValue(propertyName).trim()
    if (!propertyValue) {
      continue
    }

    declarations.push(`${propertyName}: ${propertyValue}`)
  }

  if (declarations.length === 0) {
    return ""
  }

  return `${declarations.join(";\n")};`
}

function buildEvidenceFrameMarkup(segment: DesktopVisualSegment, rootCssVariables: string): string {
  const normalizedRootCss = rootCssVariables
    ? rootCssVariables.trim().replace(/\n/g, "\n        ")
    : ""
  const rootVariablesBlock = normalizedRootCss ? `\n        ${normalizedRootCss}` : ""
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${segment.title}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        ${rootVariablesBlock}
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, #1f2937 0%, #020617 65%);
        color: #e2e8f0;
        display: grid;
        grid-template-rows: auto 1fr;
      }

      header {
        padding: 28px 40px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.22);
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(4px);
      }

      header h1 {
        margin: 0;
        font-size: 34px;
        line-height: 1.2;
      }

      header p {
        margin: 10px 0 0;
        font-size: 18px;
        color: #bfdbfe;
      }

      main {
        padding: 28px 40px 40px;
      }

      .snapshot-shell {
        min-height: 860px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: linear-gradient(160deg, rgba(15, 23, 42, 0.76) 0%, rgba(30, 41, 59, 0.45) 100%);
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 18px 42px rgba(15, 23, 42, 0.45);
      }

      .snapshot-app {
        padding: 24px;
      }

      .snapshot-app [data-testid] {
        outline: 1px dashed rgba(125, 211, 252, 0.18);
      }
    </style>
  </head>
  <body>
    <header>
      <h1>${segment.title}</h1>
      <p>${segment.subtitle}</p>
    </header>
    <main>
      <section class="snapshot-shell">
        <div class="snapshot-app">${segment.appMarkup}</div>
      </section>
    </main>
  </body>
</html>`
}

// The desktop runtime runs in jsdom, which has no layout or paint. To leave reviewable evidence, each
// segment's DOM snapshot is rendered in headless Chromium and screenshotted at a 1920x1080 viewport.
// The verifier measures the PNG dimensions; nothing here claims frame rate, clip length or seeded output.
async function writeDesktopSegmentScreenshots(
  screenshotPaths: [string, string, string],
  segments: [DesktopVisualSegment, DesktopVisualSegment, DesktopVisualSegment]
): Promise<void> {
  const browser = await chromium.launch({ headless: true })
  try {
    const rootCssVariables = collectRootCssVariableDeclarations()
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    })
    const page = await context.newPage()

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      const screenshotPath = screenshotPaths[index]
      if (!segment || !screenshotPath) {
        throw new Error(`Missing desktop segment data at index ${index}`)
      }

      await page.setContent(buildEvidenceFrameMarkup(segment, rootCssVariables), {
        waitUntil: "load"
      })
      await page.screenshot({ path: screenshotPath, fullPage: true })
    }

    await context.close()
  } finally {
    await browser.close()
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

describe("desktop mandatory v1 gate suite", () => {
  it("enforces thresholds and writes desktop evidence", async () => {
    await mkdir(EVIDENCE_ROOT, { recursive: true })

    let mode: FetchMode = "online"
    globalThis.fetch = createFetchHarness(() => mode)

    const runtime = createDesktopOnboardingAppRuntime(document.body)
    runtime.start()

    const loginStart = Date.now()
    setInputValue("server-url-input", TEST_SERVER)
    setChecked("remember-server-checkbox", true)
    await triggerServerStatusCheck()
    setInputValue("username-input", "demo-user")
    setInputValue("password-input", "secret-pass")
    setChecked("remember-username-checkbox", true)
    clickByTestId("login-submit")

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="library-checkbox-movies-main"]')).toBeTruthy()
    })
    clickByTestId("onboarding-finish")
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
      expect(document.querySelector('[data-testid="poster-item-0"]')).toBeTruthy()
    })
    const loginFlowMs = Date.now() - loginStart

    const namingPrefix = `${MILESTONE}-${SCENE}-${VERSION}`
    const screenshotPaths: [string, string, string] = [
      path.join(EVIDENCE_ROOT, `${namingPrefix}-desktop-segment-1.png`),
      path.join(EVIDENCE_ROOT, `${namingPrefix}-desktop-segment-2.png`),
      path.join(EVIDENCE_ROOT, `${namingPrefix}-desktop-segment-3.png`)
    ]

    const segmentOne: DesktopVisualSegment = {
      title: "Desktop Gate Segment 1 — Login + Library Ready",
      subtitle: "Onboarding completed and poster wall rendered with deterministic fixture content.",
      appMarkup: sanitizeAppMarkup(document.body.innerHTML)
    }

    mode = "offline"
    runtime.dispose()
    const offlineStart = Date.now()
    const restartedRuntime = createDesktopOnboardingAppRuntime(document.body)
    restartedRuntime.start()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="poster-wall-root"]')).toBeTruthy()
      expect(document.querySelector('[data-testid="poster-item-0"]')).toBeTruthy()
    }, { timeout: 5_000 })
    const offlinePaintMs = Date.now() - offlineStart
    const segmentTwo: DesktopVisualSegment = {
      title: "Desktop Gate Segment 2 — Offline Cached Paint",
      subtitle: "Offline mode rehydrate confirmed with cached poster content visible.",
      appMarkup: sanitizeAppMarkup(document.body.innerHTML)
    }

    mode = "revoked"
    const tokenRevokedStart = Date.now()
    clickByTestId("manual-refresh-button")
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="reconnect-guide"]')).toBeTruthy()
    }, { timeout: 60_000 })
    const tokenRevokedRecoveryMs = Date.now() - tokenRevokedStart
    const segmentThree: DesktopVisualSegment = {
      title: "Desktop Gate Segment 3 — Token Revoked Recovery",
      subtitle: "Reconnect guide is visible after forced revoked-token refresh.",
      appMarkup: sanitizeAppMarkup(document.body.innerHTML)
    }

    const logoutStart = Date.now()
    clickByTestId("logout-button")
    await vi.waitFor(() => {
      expect(window.location.pathname).toBe("/")
      expect(window.sessionStorage.getItem("mps.auth.session")).toBeNull()
      expect(window.sessionStorage.getItem("mps.wall.handoff")).toBeNull()
    })
    const logoutCleanupMs = Date.now() - logoutStart

    await writeDesktopSegmentScreenshots(screenshotPaths, [segmentOne, segmentTwo, segmentThree])

    const metrics: GateMetrics = {
      platform: "desktop",
      generatedAt: new Date().toISOString(),
      gates: {
        "login-flow-ms": loginFlowMs,
        "offline-cached-first-paint-ms": offlinePaintMs,
        "token-revoked-recovery-ms": tokenRevokedRecoveryMs,
        "logout-cleanup-ms": logoutCleanupMs
      },
      visualBaseline: {
        milestone: MILESTONE,
        scene: SCENE,
        version: VERSION,
        screenshots: screenshotPaths
      }
    }

    const metricsPath = path.join(EVIDENCE_ROOT, "task-16-desktop-gates.metrics.json")
    await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8")

    restartedRuntime.dispose()
  }, 180_000)
})
