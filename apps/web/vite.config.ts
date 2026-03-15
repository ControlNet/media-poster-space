import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const webDirectory = path.dirname(fileURLToPath(import.meta.url));

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "/";
  }

  const withoutEdgeSlashes = trimmed.replace(/^\/+|\/+$/g, "");
  return `/${withoutEdgeSlashes}/`;
}

export default defineConfig({
  base: normalizeBasePath(process.env.MPS_WEB_BASE_PATH ?? "/"),
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: path.resolve(webDirectory, "index.html"),
        notFound: path.resolve(webDirectory, "404.html")
      }
    }
  }
});
