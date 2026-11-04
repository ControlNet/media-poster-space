// Throwaway probe: does clicking an <a download href="blob:..."> (the crash-export
// mechanism in packages/core/src/runtime/crash-export.ts) fire `beforeunload`?
// apps/web/src/main.ts disposes the whole runtime on the first beforeunload.
import { createRequire } from "node:module"

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url))
const { chromium, firefox } = require("@playwright/test")

const html = `<!doctype html><html><body><button id="go">export</button><script>
window.__beforeunloadCount = 0;
window.addEventListener("beforeunload", () => { window.__beforeunloadCount += 1; document.body.dataset.disposed = "yes"; }, { once: true });
document.getElementById("go").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ a: 1 })], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "report.json"; a.style.display = "none";
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});
</script></body></html>`

for (const [name, browserType] of [["chromium", chromium], ["firefox", firefox]]) {
  let browser
  try {
    browser = await browserType.launch()
    const context = await browser.newContext({ acceptDownloads: true })
    const page = await context.newPage()
    await page.setContent(html)
    const downloadPromise = page.waitForEvent("download", { timeout: 4000 }).then((d) => d.suggestedFilename()).catch((e) => `no-download (${e.message.split("\n")[0]})`)
    await page.click("#go")
    const download = await downloadPromise
    await page.waitForTimeout(500)
    const count = await page.evaluate(() => window.__beforeunloadCount)
    console.log(`[${name}] download=${download} beforeunloadCount=${count}`)
  } catch (error) {
    console.log(`[${name}] probe failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`)
  } finally {
    await browser?.close()
  }
}
