import type { Page } from "@playwright/test"

export const FIXTURE_SERVER_ORIGIN = "https://jellyfin.test"

// Test fixture: a real 2x3 RGB PNG (solid #334155) served for every poster image request so the
// wall can load artwork without touching the network.
const FIXTURE_POSTER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEUlEQVR42mMwdgw1dgxlQKEAMMAEt256MMYAAAAASUVORK5CYII=",
  "base64"
)

/**
 * Keeps every request to the fixture media server inside the test.
 *
 * Must be registered before the test's own `page.route` handlers: Playwright consults the most
 * recently registered matching route first, so specific API stubs still win and only traffic the
 * test did not stub reaches this fallback. Poster images get a fixture PNG; any other unstubbed
 * request is aborted the same way an unreachable server would fail, without a real DNS lookup.
 */
export async function routeUnstubbedFixtureServerTraffic(page: Page): Promise<void> {
  await page.route(`${FIXTURE_SERVER_ORIGIN}/**`, async (route, request) => {
    const { pathname } = new URL(request.url())
    if (request.method() === "GET" && /\/Items\/[^/]+\/Images\//.test(pathname)) {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "image/png",
          "access-control-allow-origin": "*"
        },
        body: FIXTURE_POSTER_PNG
      })
      return
    }

    await route.abort("internetdisconnected")
  })
}
