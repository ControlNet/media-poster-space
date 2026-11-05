import { readFile } from "node:fs/promises"
import path from "node:path"

import { getRepositoryRoot } from "./release-manifest.mjs"

const USAGE = "Usage: node scripts/release/verify-versions.mjs [--tag <vX.Y.Z>]"

const PACKAGE_JSON_SOURCES = [
  "package.json",
  "apps/web/package.json",
  "apps/desktop/package.json",
  "packages/core/package.json"
]
const TAURI_CONFIG_SOURCE = "apps/desktop/src-tauri/tauri.conf.json"
const CARGO_TOML_SOURCE = "apps/desktop/src-tauri/Cargo.toml"
// App versions baked into crash packages; they must follow the manifests.
const SOURCE_CONSTANTS = [
  { source: "apps/web/src/onboarding/runtime.ts", name: "WEB_APP_VERSION" },
  { source: "apps/desktop/src/onboarding/runtime.ts", name: "DESKTOP_APP_VERSION" }
]

function parseArgs(argv) {
  let tag = null
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === "--tag") {
      tag = argv[index + 1] ?? ""
      index += 1
      if (!tag) {
        throw new Error(USAGE)
      }
      continue
    }

    throw new Error(`Unknown argument '${token}'. ${USAGE}`)
  }

  return { tag }
}

async function readText(relativePath) {
  return readFile(path.join(getRepositoryRoot(), relativePath), "utf8")
}

async function readJsonVersion(relativePath) {
  const parsed = JSON.parse(await readText(relativePath))
  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error(`${relativePath} has no "version" string`)
  }

  return parsed.version
}

// Reads `version` from the [package] table only; other tables (dependencies, profiles) may also
// contain `version` keys.
function readCargoPackageVersion(cargoToml, sourceLabel) {
  let inPackageTable = false
  for (const rawLine of cargoToml.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim()
    if (line.length === 0) {
      continue
    }

    const tableMatch = line.match(/^\[\s*([^\]]+?)\s*\]$/)
    if (tableMatch) {
      inPackageTable = tableMatch[1] === "package"
      continue
    }

    if (!inPackageTable) {
      continue
    }

    const versionMatch = line.match(/^version\s*=\s*"([^"]+)"$/)
    if (versionMatch?.[1]) {
      return versionMatch[1]
    }

    if (/^version\s*\./.test(line) || /^version\s*=\s*\{/.test(line)) {
      throw new Error(`${sourceLabel} [package] version uses workspace inheritance or a table; expected a literal string`)
    }
  }

  throw new Error(`${sourceLabel} has no [package] version`)
}

function readSourceConstant(sourceText, { source, name }) {
  const match = sourceText.match(new RegExp(`^const ${name} = "([^"]+)"$`, "m"))
  if (!match?.[1]) {
    throw new Error(`${source} has no \`const ${name} = "<version>"\` line`)
  }

  return match[1]
}

async function collectVersions() {
  const versions = []
  for (const source of PACKAGE_JSON_SOURCES) {
    versions.push({ source, version: await readJsonVersion(source) })
  }

  versions.push({ source: TAURI_CONFIG_SOURCE, version: await readJsonVersion(TAURI_CONFIG_SOURCE) })
  versions.push({
    source: `${CARGO_TOML_SOURCE} [package]`,
    version: readCargoPackageVersion(await readText(CARGO_TOML_SOURCE), CARGO_TOML_SOURCE)
  })
  for (const constant of SOURCE_CONSTANTS) {
    versions.push({
      source: `${constant.source} ${constant.name}`,
      version: readSourceConstant(await readText(constant.source), constant)
    })
  }

  return versions
}

async function main() {
  const { tag } = parseArgs(process.argv.slice(2))
  const versions = await collectVersions()
  const expected = versions[0].version
  const report = versions.map(({ source, version }) => `  ${source}: ${version}`).join("\n")

  const mismatched = versions.filter(({ version }) => version !== expected)
  if (mismatched.length > 0) {
    throw new Error(
      `[versions] version mismatch; every manifest must declare the same version.\n${report}`
    )
  }

  if (tag !== null && tag !== `v${expected}`) {
    throw new Error(
      `[versions] tag '${tag}' does not match manifest version 'v${expected}'.\n${report}`
    )
  }

  console.log(`[versions] PASS ${expected}${tag !== null ? ` matches tag ${tag}` : ""}\n${report}`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
