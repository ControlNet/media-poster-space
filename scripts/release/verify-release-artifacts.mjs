import { execFile } from "node:child_process"
import { constants } from "node:fs"
import { access, readFile, stat } from "node:fs/promises"
import { promisify } from "node:util"

import {
  RELEASE_CHANNEL,
  getArtifactDefinitions,
  getStableMetadataPath,
  getVersionChangelogPath,
  readWorkspaceVersion,
  resolveFromRepository
} from "./release-manifest.mjs"

const execFileAsync = promisify(execFile)

async function assertFileExistsAndIsNonEmpty(filePath, description) {
  await access(filePath, constants.F_OK)
  const details = await stat(filePath)

  if (!details.isFile()) {
    throw new Error(`${description}: expected file at ${filePath}`)
  }

  if (details.size <= 0) {
    throw new Error(`${description}: file is empty at ${filePath}`)
  }
}

async function runCommandCapture(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    })
    return stdout
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    throw new Error(`${command} ${args.join(" ")} failed: ${failure.message}`)
  }
}

async function listTarEntries(tarPath) {
  const tarListing = await runCommandCapture("tar", ["-tf", tarPath])
  return tarListing
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function normalizeTarEntry(entry) {
  return entry.startsWith("./") ? entry.slice(2) : entry
}

function hasTarEntry(entries, expectedPath) {
  return entries.some((entry) => normalizeTarEntry(entry) === expectedPath)
}

function hasTarEntryPrefix(entries, expectedPrefix) {
  return entries.some(
    (entry) =>
      normalizeTarEntry(entry).startsWith(`${expectedPrefix}/`) ||
      normalizeTarEntry(entry) === expectedPrefix
  )
}

async function readTarTextEntry(tarPath, entries, expectedPath) {
  const entryName = entries.find((entry) => normalizeTarEntry(entry) === expectedPath)

  if (!entryName) {
    throw new Error(`expected tar entry '${expectedPath}' in ${tarPath}`)
  }

  return runCommandCapture("tar", ["-xOf", tarPath, entryName])
}

async function assertWebStaticArtifact({ definition, absolutePath, version }) {
  if (!absolutePath.endsWith("-static.tar")) {
    throw new Error(
      `[artifact:${definition.id}] expected '-static.tar' suffix but found ${absolutePath}`
    )
  }

  const entries = await listTarEntries(absolutePath)
  if (entries.length === 0) {
    throw new Error(`[artifact:${definition.id}] tar archive has no entries at ${absolutePath}`)
  }

  const releaseManifestCandidates = entries
    .map((entry) => normalizeTarEntry(entry))
    .filter((entry) => entry === "release-manifest.json" || entry.endsWith("/release-manifest.json"))
  if (releaseManifestCandidates.length !== 1) {
    throw new Error(
      `[artifact:${definition.id}] expected exactly one release-manifest.json entry in ${absolutePath}`
    )
  }

  const releaseManifestPath = releaseManifestCandidates[0]
  const webRootPrefix = releaseManifestPath.slice(
    0,
    releaseManifestPath.length - "release-manifest.json".length
  )
  if (webRootPrefix !== "web-static/") {
    throw new Error(
      `[artifact:${definition.id}] expected web payload root 'web-static/' but got '${webRootPrefix || "<root>"}'`
    )
  }

  if (!hasTarEntry(entries, `${webRootPrefix}index.html`)) {
    throw new Error(`[artifact:${definition.id}] missing ${webRootPrefix}index.html in ${absolutePath}`)
  }

  if (!hasTarEntryPrefix(entries, `${webRootPrefix}assets`)) {
    throw new Error(`[artifact:${definition.id}] missing ${webRootPrefix}assets/ payload in ${absolutePath}`)
  }

  const releaseManifestRaw = await readTarTextEntry(
    absolutePath,
    entries,
    releaseManifestPath
  )

  let releaseManifest
  try {
    releaseManifest = JSON.parse(releaseManifestRaw)
  } catch (error) {
    throw new Error(
      `[artifact:${definition.id}] release-manifest.json is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  const expectedManifest = {
    channel: RELEASE_CHANNEL,
    version,
    artifactId: definition.id,
    artifactPath: definition.relativePath
  }
  for (const [key, expectedValue] of Object.entries(expectedManifest)) {
    if (releaseManifest[key] !== expectedValue) {
      throw new Error(
        `[artifact:${definition.id}] release-manifest ${key} expected '${expectedValue}' but got '${String(releaseManifest[key])}'`
      )
    }
  }
}

function assertStableMetadata({ metadata, definitions, version, failures }) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    failures.push("[artifact:stable-metadata] expected JSON object")
    return
  }

  const expectedReleaseDirectory = `release/${RELEASE_CHANNEL}/v${version}`
  const expectedFields = {
    schemaVersion: 1,
    channel: RELEASE_CHANNEL,
    version,
    generatedFrom: "pnpm -w build:release",
    releaseDirectory: expectedReleaseDirectory,
    changelogPath: `${expectedReleaseDirectory}/CHANGELOG.md`
  }
  for (const [key, expectedValue] of Object.entries(expectedFields)) {
    if (metadata[key] !== expectedValue) {
      failures.push(
        `[artifact:stable-metadata] expected ${key} '${String(expectedValue)}' but got '${String(metadata[key])}'`
      )
    }
  }

  if (typeof metadata.sourceCommit !== "string" || !/^[0-9a-f]{7,40}$/.test(metadata.sourceCommit)) {
    failures.push(
      `[artifact:stable-metadata] expected sourceCommit to be a git commit hash but got '${String(metadata.sourceCommit)}'`
    )
  }

  if (!Array.isArray(metadata.artifacts)) {
    failures.push("[artifact:stable-metadata] expected artifacts to be an array")
    return
  }

  if (metadata.artifacts.length !== definitions.length) {
    failures.push(
      `[artifact:stable-metadata] expected ${definitions.length} artifacts but found ${metadata.artifacts.length}`
    )
    return
  }

  for (const [index, definition] of definitions.entries()) {
    const expected = {
      id: definition.id,
      platform: definition.platform,
      kind: definition.kind,
      path: definition.relativePath
    }
    const actual = metadata.artifacts[index]
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
      failures.push(`[artifact:stable-metadata] artifact entry at index ${index} must be an object`)
      continue
    }

    for (const [key, expectedValue] of Object.entries(expected)) {
      if (actual[key] !== expectedValue) {
        failures.push(
          `[artifact:stable-metadata] artifact[${index}].${key} expected '${expectedValue}' but got '${String(
            actual[key]
          )}'`
        )
      }
    }
  }
}

function assertStableChangelog({ versionChangelog, version, sourceCommit, failures }) {
  if (!versionChangelog.startsWith("# Changelog\n")) {
    failures.push("[artifact:release-changelog] missing '# Changelog' heading")
  }

  if (!/^## v\S+ \(\d{4}-\d{2}-\d{2}T[^)]+\)$/m.test(versionChangelog) || !versionChangelog.includes(`## v${version} (`)) {
    failures.push(`[artifact:release-changelog] missing dated release heading for v${version}`)
  }

  if (typeof sourceCommit === "string" && !versionChangelog.includes(`generated from commit \`${sourceCommit}\``)) {
    failures.push(`[artifact:release-changelog] changelog does not reference source commit ${sourceCommit}`)
  }

  const sectionIndex = versionChangelog.indexOf("### Included commits\n")
  if (sectionIndex === -1) {
    failures.push("[artifact:release-changelog] missing 'Included commits' section heading")
    return
  }

  const commitLines = versionChangelog
    .slice(sectionIndex)
    .split("\n")
    .filter((line) => line.startsWith("- "))
  if (commitLines.length === 0 || !commitLines.every((line) => /^- [0-9a-f]{7,40} \S/.test(line))) {
    failures.push("[artifact:release-changelog] 'Included commits' must list '<hash> <subject>' entries")
  }
}

async function verifyReleaseArtifacts() {
  const version = await readWorkspaceVersion()
  const definitions = getArtifactDefinitions(version)
  const metadataPath = getStableMetadataPath()
  const versionChangelogPath = getVersionChangelogPath(version)

  const failures = []

  for (const definition of definitions) {
    const absolutePath = resolveFromRepository(definition.relativePath)
    try {
      await assertFileExistsAndIsNonEmpty(absolutePath, `[artifact:${definition.id}]`)
      if (definition.id === "web-static-distribution") {
        await assertWebStaticArtifact({ definition, absolutePath, version })
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }

  let metadata
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8"))
  } catch (error) {
    failures.push(
      `[artifact:stable-metadata] unable to read metadata file ${metadataPath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  if (metadata) {
    assertStableMetadata({ metadata, definitions, version, failures })
  }

  try {
    await assertFileExistsAndIsNonEmpty(versionChangelogPath, "[artifact:release-changelog]")
    const versionChangelog = await readFile(versionChangelogPath, "utf8")
    assertStableChangelog({
      versionChangelog,
      version,
      sourceCommit: metadata?.sourceCommit,
      failures
    })
  } catch (error) {
    failures.push(
      `[artifact:release-changelog] unable to read ${versionChangelogPath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  if (failures.length > 0) {
    throw new Error(`Release artifact verification failed:\n- ${failures.join("\n- ")}`)
  }

  const listedArtifacts = definitions.map((definition) => definition.relativePath).join("\n")
  console.log(`[release:verify] PASS stable v${version}`)
  console.log(`[release:verify] verified artifacts:\n${listedArtifacts}`)
}

verifyReleaseArtifacts().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
