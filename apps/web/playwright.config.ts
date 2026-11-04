import { defineConfig, devices } from "@playwright/test";

const artifactRoot = "../../.omo/evidence/playwright";
// scripts/run-gates.mjs sets MPS_GATE_RUN_STARTED_AT; keep gate reports apart from the functional
// suite so a gate run does not overwrite the suite's report when both run in one CI job.
const reportSet = process.env.MPS_GATE_RUN_STARTED_AT ? "gates" : "suite";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${artifactRoot}/html-report-${reportSet}`, open: "never" }],
    ["junit", { outputFile: `${artifactRoot}/junit/results-${reportSet}.xml` }]
  ],
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
      testIgnore: "**/gates/**",
      outputDir: `${artifactRoot}/test-results/web-chromium`,
      use: {
        ...devices["Desktop Chrome"]
      }
    },
    {
      // Threshold gates: a retry would turn a budget miss into a pass, so they never retry.
      name: "web-gates",
      testMatch: "gates/**/*.spec.ts",
      retries: 0,
      outputDir: `${artifactRoot}/test-results/web-gates`,
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
