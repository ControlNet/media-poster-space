import { fileURLToPath } from "node:url"

export default {
  test: {
    dir: fileURLToPath(new URL(".", import.meta.url)),
    include: ["**/stale-ingestion.repro.test.ts", "**/cache-size.repro.test.ts"],
    environment: "node"
  },
  server: { fs: { strict: false } }
}
