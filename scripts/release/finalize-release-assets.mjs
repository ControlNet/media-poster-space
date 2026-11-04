import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"

const CHECKSUM_FILE_NAME = "SHA256SUMS"
const USAGE =
  "Usage: node scripts/release/finalize-release-assets.mjs <assets-directory> <expected-asset-name>..."

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = createReadStream(filePath)
    stream.on("error", (error) => {
      reject(new Error(`unable to read ${filePath}: ${error.message}`))
    })
    stream.on("data", (chunk) => {
      hash.update(chunk)
    })
    stream.on("end", () => {
      resolve(hash.digest("hex"))
    })
  })
}

// Verifies that the release directory holds exactly the expected assets, each a non-empty regular
// file, then writes SHA256SUMS in `sha256sum` format (verifiable with `sha256sum -c SHA256SUMS`).
async function main() {
  const [assetsDirectoryArg, ...expectedNames] = process.argv.slice(2)
  if (!assetsDirectoryArg || expectedNames.length === 0) {
    throw new Error(USAGE)
  }

  const assetsDirectory = path.resolve(assetsDirectoryArg)
  const presentNames = (await readdir(assetsDirectory)).filter((name) => name !== CHECKSUM_FILE_NAME).sort()
  const failures = []

  for (const name of expectedNames) {
    if (!presentNames.includes(name)) {
      failures.push(`missing release asset: ${name}`)
    }
  }

  for (const name of presentNames) {
    if (!expectedNames.includes(name)) {
      failures.push(`unexpected file in release assets: ${name}`)
    }
  }

  const checksumLines = []
  for (const name of [...expectedNames].sort()) {
    if (!presentNames.includes(name)) {
      continue
    }

    const assetPath = path.join(assetsDirectory, name)
    const details = await stat(assetPath)
    if (!details.isFile()) {
      failures.push(`release asset is not a regular file: ${name}`)
      continue
    }

    if (details.size === 0) {
      failures.push(`release asset is empty: ${name}`)
      continue
    }

    checksumLines.push(`${await sha256File(assetPath)}  ${name}`)
    console.log(`[release-assets] ${name} ${details.size} bytes`)
  }

  if (failures.length > 0) {
    throw new Error(`[release-assets] verification failed:\n- ${failures.join("\n- ")}`)
  }

  await writeFile(path.join(assetsDirectory, CHECKSUM_FILE_NAME), `${checksumLines.join("\n")}\n`, "utf8")
  console.log(`[release-assets] wrote ${CHECKSUM_FILE_NAME} for ${checksumLines.length} assets`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
