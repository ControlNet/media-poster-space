// Review repro config. Runs with root = apps/desktop so jsdom and the app sources
// resolve from the workspace, but only picks up *.repro.test.ts files in this directory.
import { fileURLToPath } from "node:url"

const reproDir = fileURLToPath(new URL(".", import.meta.url))

export default {
  root: fileURLToPath(new URL("../../../../apps/desktop", import.meta.url)),
  test: {
    environment: "jsdom",
    globals: true,
    dir: reproDir,
    include: ["**/*.repro.test.ts"],
    testTimeout: 20000
  }
}
