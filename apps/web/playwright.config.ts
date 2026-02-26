import { defineConfig, devices } from "@playwright/test";

const artifactRoot = "../../.sisyphus/evidence/playwright";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${artifactRoot}/html-report`, open: "never" }],
    ["junit", { outputFile: `${artifactRoot}/junit/results.xml` }]
  ],
  outputDir: `${artifactRoot}/test-results`,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/wall?mode=test",
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  },
  projects: [
    {
      name: "web-chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
