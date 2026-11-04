import { defineConfig } from "vitest/config"

// Mandatory V1 desktop gate suite, run by `pnpm --filter @mps/desktop e2e:desktop`. Kept out of the
// unit config because it launches Chromium to capture evidence screenshots. Gates never retry: a
// retry would turn a budget miss into a pass.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/gates/**/*.test.ts"],
    retry: 0
  }
})
