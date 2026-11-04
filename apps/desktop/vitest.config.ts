import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    // The mandatory V1 gate launches Chromium; `e2e:desktop` runs it through vitest.gates.config.ts.
    exclude: [...configDefaults.exclude, "test/gates/**"]
  }
})
