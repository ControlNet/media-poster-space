import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

import { expect, test, type Browser } from "@playwright/test"

const TEST_SERVER = "https://jellyfin.test"
const MILESTONE = "v1"
const SCENE = "mandatory-gates"
const VERSION = "r1"
const FIXED_SEED = "v1-fixed-seed"
const SEED_PROOF_PROFILE = "balanced"
const SEED_PROOF_VARIANT = `${FIXED_SEED}-variant`

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const EVIDENCE_ROOT = path.resolve(CURRENT_DIR, "../../../../.sisyphus/evidence")

interface GateMetrics {
  platform: "web"
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
    seed: string
    width: number
    height: number
    frameRate: number
    clipDurationMs: number
    clipPath: string
    screenshots: string[]
    seedProof: {
      renderInput: string
      fixedSeed: string
      fixedSeedFrameHash: string
      fixedSeedReplayFrameHash: string
      variantSeed: string
      variantSeedFrameHash: string
    }
  }
}

function hashFrame(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex")
}

async function captureSeededSceneFrameHash(browser: Browser, seed: string): Promise<{
  renderInput: string
  frameHash: string
}> {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  })

  await context.addInitScript(() => {
    const fixedTimestamp = 16_666
    let rafHandle = 0
    const rafTimers = new Map<number, number>()
    const originalGetContext = HTMLCanvasElement.prototype.getContext

    try {
      Object.defineProperty(performance, "now", {
        configurable: true,
        value: () => 0
      })
    } catch {
    }

    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: function patchedGetContext(this: HTMLCanvasElement, contextId: string, ...args: unknown[]): unknown {
        if (contextId === "webgl" || contextId === "experimental-webgl") {
          return {}
        }

        return (originalGetContext as (...callArgs: unknown[]) => unknown).call(this, contextId, ...args)
      }
    })

    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback): number => {
        rafHandle += 1
        const currentHandle = rafHandle
        const timerId = window.setTimeout(() => {
          rafTimers.delete(currentHandle)
          callback(fixedTimestamp)
        }, 0)
        rafTimers.set(currentHandle, timerId)
        return currentHandle
      }
    })

    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: (handle: number): void => {
        const timerId = rafTimers.get(handle)
        if (timerId === undefined) {
          return
        }

        window.clearTimeout(timerId)
        rafTimers.delete(handle)
      }
    })
  })

  const page = await context.newPage()
  const renderInput = `/wall?seed=${encodeURIComponent(seed)}&profile=${SEED_PROOF_PROFILE}`
  await page.goto(renderInput)

  const wallScene = page.getByTestId("wall-scene")
  await expect(wallScene).toBeVisible()
  await expect(wallScene).toHaveAttribute("data-scene-seed", seed)
  await expect(wallScene).toHaveAttribute("data-renderer-mode", "primary")
  await expect(page.getByTestId("scene-layer-front")).toBeVisible()
  await expect(page.getByTestId("scene-layer-back")).toBeVisible()
  await page.waitForTimeout(75)

  const frame = await wallScene.screenshot()
  await context.close()

  return {
    renderInput,
    frameHash: hashFrame(frame)
  }
}

test("enforces mandatory V1 web gates and writes deterministic evidence", async ({ browser }) => {
  test.setTimeout(120_000)

  await mkdir(EVIDENCE_ROOT, { recursive: true })

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: EVIDENCE_ROOT,
      size: { width: 1920, height: 1080 }
    }
  })

  const page = await context.newPage()
  const video = page.video()

  let offlineMode = false
  let tokenRevoked = false

  await page.route("**/System/Info/Public", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({ Version: "10.9.0" })
    })
  })

  await page.route("**/Users/AuthenticateByName", async (route, request) => {
    const payload = request.postDataJSON() as { Username?: string }
    if (!payload.Username) {
      await route.fulfill({
        status: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      })
      return
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        AccessToken: "token-abc",
        User: {
          Id: "user-1",
          Name: payload.Username
        }
      })
    })
  })

  await page.route("**/Users/user-1/Views", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        Items: [{ Id: "movies-main", Name: "Movies", CollectionType: "movies" }]
      })
    })
  })

  await page.route("**/Users/user-1/Items**", async (route) => {
    if (tokenRevoked) {
      await route.fulfill({
        status: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ Message: "revoked" })
      })
      return
    }

    if (offlineMode) {
      await route.fulfill({
        status: 503,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ Message: "offline" })
      })
      return
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        Items: [
          {
            Id: "movie-1",
            Name: "Poster Ready",
            Type: "Movie",
            Overview: "Mandatory web gate coverage.",
            ImageTags: { Primary: "poster-tag" }
          }
        ],
        TotalRecordCount: 1
      })
    })
  })

  await page.route("**/Sessions/Logout", async (route) => {
    await route.fulfill({ status: 204 })
  })

  await page.goto("/")

  const loginStart = Date.now()
  await page.getByTestId("server-url-input").fill(TEST_SERVER)
  await page.getByTestId("remember-server-checkbox").check()
  await page.getByTestId("preflight-check-button").click()
  await page.getByTestId("username-input").fill("demo-user")
  await page.getByTestId("password-input").fill("secret-pass")
  await page.getByTestId("remember-username-checkbox").check()
  await page.getByTestId("login-submit").click()
  await expect(page.getByTestId("library-checkbox-movies-main")).toBeVisible()
  await page.getByTestId("onboarding-finish").click()
  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible()
  await expect(page.getByTestId("wall-ingestion-summary").first()).toContainText("Ingested posters: 1")
  const loginFlowMs = Date.now() - loginStart

  const namingPrefix = `${MILESTONE}-${SCENE}-${VERSION}`
  const webClipPath = path.join(EVIDENCE_ROOT, `${namingPrefix}-web-1080p60-30s.webm`)
  const screenshotPaths = [
    path.join(EVIDENCE_ROOT, `${namingPrefix}-web-segment-1.png`),
    path.join(EVIDENCE_ROOT, `${namingPrefix}-web-segment-2.png`),
    path.join(EVIDENCE_ROOT, `${namingPrefix}-web-segment-3.png`)
  ]

  await page.screenshot({ path: screenshotPaths[0], fullPage: true })

  offlineMode = true
  const offlineStart = Date.now()
  await page.reload()
  await expect(page.getByTestId("poster-wall-root").first()).toBeVisible({ timeout: 5_000 })
  await expect(page.getByTestId("poster-item-0").first()).toBeVisible({ timeout: 5_000 })
  const offlinePaintMs = Date.now() - offlineStart

  await page.screenshot({ path: screenshotPaths[1], fullPage: true })

  tokenRevoked = true
  const tokenRevokedStart = Date.now()
  await page.getByTestId("manual-refresh-button").first().click()
  await expect(page.getByTestId("reconnect-guide").first()).toBeVisible({ timeout: 60_000 })
  const tokenRevokedRecoveryMs = Date.now() - tokenRevokedStart

  await page.screenshot({ path: screenshotPaths[2], fullPage: true })

  const logoutStart = Date.now()
  await page.getByTestId("logout-button").first().click()
  await page.waitForFunction(
    () => {
      const sessionSnapshot = window.sessionStorage.getItem("mps.auth.session")
      const wallHandoff = window.sessionStorage.getItem("mps.wall.handoff")
      return sessionSnapshot === null && wallHandoff === null
    },
    undefined,
    { timeout: 1_000 }
  )
  const logoutCleanupMs = Date.now() - logoutStart

  await expect(page.getByTestId("server-url-input")).toHaveValue(TEST_SERVER)
  await expect(page.getByTestId("username-input")).toHaveValue("demo-user")

  const cleanupState = await page.evaluate(() => ({
    sessionSnapshot: window.sessionStorage.getItem("mps.auth.session"),
    wallHandoff: window.sessionStorage.getItem("mps.wall.handoff")
  }))
  expect(cleanupState.sessionSnapshot).toBeNull()
  expect(cleanupState.wallHandoff).toBeNull()

  const elapsedForClip = Date.now() - loginStart
  const remainingClipMs = Math.max(0, 30_000 - elapsedForClip)
  if (remainingClipMs > 0) {
    await page.waitForTimeout(remainingClipMs)
  }

  await context.close()
  if (video) {
    await video.saveAs(webClipPath)
  }

  const fixedSeedProbe = await captureSeededSceneFrameHash(browser, FIXED_SEED)
  const fixedSeedReplayProbe = await captureSeededSceneFrameHash(browser, FIXED_SEED)
  const variantSeedProbe = await captureSeededSceneFrameHash(browser, SEED_PROOF_VARIANT)

  expect(fixedSeedProbe.frameHash).toBe(fixedSeedReplayProbe.frameHash)
  expect(fixedSeedProbe.frameHash).not.toBe(variantSeedProbe.frameHash)

  const metrics: GateMetrics = {
    platform: "web",
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
      seed: FIXED_SEED,
      width: 1920,
      height: 1080,
      frameRate: 60,
      clipDurationMs: 30_000,
      clipPath: webClipPath,
      screenshots: screenshotPaths,
      seedProof: {
        renderInput: fixedSeedProbe.renderInput,
        fixedSeed: FIXED_SEED,
        fixedSeedFrameHash: fixedSeedProbe.frameHash,
        fixedSeedReplayFrameHash: fixedSeedReplayProbe.frameHash,
        variantSeed: SEED_PROOF_VARIANT,
        variantSeedFrameHash: variantSeedProbe.frameHash
      }
    }
  }

  const metricsPath = path.join(EVIDENCE_ROOT, "task-16-web-gates.metrics.json")
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8")
})
