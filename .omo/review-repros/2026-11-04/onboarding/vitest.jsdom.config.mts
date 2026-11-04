import { fileURLToPath } from "node:url"

export default {
  test: {
    dir: fileURLToPath(new URL(".", import.meta.url)),
    include: ["**/wall-routing.repro.test.ts"],
    environment: "jsdom"
  },
  server: { fs: { strict: false } }
}
