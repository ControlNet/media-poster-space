import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { access, readFile, stat } from "node:fs/promises"
import path from "node:path"
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

async function sha256File(filePath) {
  const payload = await readFile(filePath)
  return createHash("sha256").update(payload).digest("hex")
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

async function assertPortableDesktopArtifact({ definition, absolutePath, version }) {
  if (!absolutePath.endsWith("-portable.tar")) {
    throw new Error(
      `[artifact:${definition.id}] expected '-portable.tar' suffix but found ${absolutePath}`
    )
  }

  const entries = await listTarEntries(absolutePath)
  if (entries.length === 0) {
    throw new Error(`[artifact:${definition.id}] tar archive has no entries at ${absolutePath}`)
  }

  const portableManifestCandidates = entries
    .map((entry) => normalizeTarEntry(entry))
    .filter((entry) => entry === "portable-manifest.json" || entry.endsWith("/portable-manifest.json"))
  if (portableManifestCandidates.length !== 1) {
    throw new Error(
      `[artifact:${definition.id}] expected exactly one portable-manifest.json entry in ${absolutePath}`
    )
  }

  const portableManifestPath = portableManifestCandidates[0]
  const portableRootPrefix = portableManifestPath.slice(
    0,
    portableManifestPath.length - "portable-manifest.json".length
  )
  if (portableRootPrefix !== "desktop-portable/") {
    throw new Error(
      `[artifact:${definition.id}] expected portable payload root 'desktop-portable/' but got '${portableRootPrefix || "<root>"}'`
    )
  }

  if (!hasTarEntry(entries, portableManifestPath)) {
    throw new Error(`[artifact:${definition.id}] missing ${portableManifestPath} in ${absolutePath}`)
  }

  if (!hasTarEntryPrefix(entries, `${portableRootPrefix}ui`)) {
    throw new Error(
      `[artifact:${definition.id}] missing ${portableRootPrefix}ui/ payload in ${absolutePath}`
    )
  }

  if (!hasTarEntry(entries, `${portableRootPrefix}src-tauri/tauri.conf.json`)) {
    throw new Error(
      `[artifact:${definition.id}] missing ${portableRootPrefix}src-tauri/tauri.conf.json in ${absolutePath}`
    )
  }

  if (!hasTarEntry(entries, `${portableRootPrefix}src-tauri/Cargo.toml`)) {
    throw new Error(
      `[artifact:${definition.id}] missing ${portableRootPrefix}src-tauri/Cargo.toml in ${absolutePath}`
    )
  }

  const portableManifestRaw = await readTarTextEntry(
    absolutePath,
    entries,
    portableManifestPath
  )

  let portableManifest
  try {
    portableManifest = JSON.parse(portableManifestRaw)
  } catch (error) {
    throw new Error(
      `[artifact:${definition.id}] portable-manifest.json is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  if (portableManifest.channel !== RELEASE_CHANNEL) {
    throw new Error(
      `[artifact:${definition.id}] portable-manifest channel expected '${RELEASE_CHANNEL}' but got '${String(
        portableManifest.channel
      )}'`
    )
  }

  if (portableManifest.version !== version) {
    throw new Error(
      `[artifact:${definition.id}] portable-manifest version expected '${version}' but got '${String(portableManifest.version)}'`
    )
  }

  if (portableManifest.platform !== definition.platform) {
    throw new Error(
      `[artifact:${definition.id}] portable-manifest platform expected '${definition.platform}' but got '${String(
        portableManifest.platform
      )}'`
    )
  }

  if (portableManifest.packaging !== "portable") {
    throw new Error(
      `[artifact:${definition.id}] portable-manifest packaging expected 'portable' but got '${String(
        portableManifest.packaging
      )}'`
    )
  }

  if (portableManifest.tauriSigning !== "disabled-in-v1") {
    throw new Error(
      `[artifact:${definition.id}] portable-manifest tauriSigning expected 'disabled-in-v1' but got '${String(
        portableManifest.tauriSigning
      )}'`
    )
  }
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

  if (releaseManifest.channel !== RELEASE_CHANNEL) {
    throw new Error(
      `[artifact:${definition.id}] release-manifest channel expected '${RELEASE_CHANNEL}' but got '${String(
        releaseManifest.channel
      )}'`
    )
  }

  if (releaseManifest.version !== version) {
    throw new Error(
      `[artifact:${definition.id}] release-manifest version expected '${version}' but got '${String(
        releaseManifest.version
      )}'`
    )
  }

  if (releaseManifest.artifactId !== definition.id) {
    throw new Error(
      `[artifact:${definition.id}] release-manifest artifactId expected '${definition.id}' but got '${String(
        releaseManifest.artifactId
      )}'`
    )
  }

  if (releaseManifest.artifactPath !== definition.relativePath) {
    throw new Error(
      `[artifact:${definition.id}] release-manifest artifactPath expected '${definition.relativePath}' but got '${String(
        releaseManifest.artifactPath
      )}'`
    )
  }
}

async function assertLinuxAppImageArtifact({ definition, absolutePath, definitions, version }) {
  if (!absolutePath.endsWith(".AppImage")) {
    throw new Error(`[artifact:${definition.id}] expected '.AppImage' suffix but found ${absolutePath}`)
  }

  const appImageStats = await stat(absolutePath)
  if ((appImageStats.mode & 0o111) === 0) {
    throw new Error(`[artifact:${definition.id}] file exists but is not executable: ${absolutePath}`)
  }

  const appImageContent = await readFile(absolutePath, "utf8")
  const appImageLines = appImageContent.split("\n")
  if (appImageLines[0] !== "#!/usr/bin/env bash") {
    throw new Error(
      `[artifact:${definition.id}] expected bash shebang in first line but found '${String(appImageLines[0])}'`
    )
  }

  const expectedLauncherLine = `echo \"Media Poster Space v${version} stable Linux AppImage launcher\"`
  if (!appImageLines.includes(expectedLauncherLine)) {
    throw new Error(`[artifact:${definition.id}] missing expected stable launcher marker line`)
  }

  const linuxPortableDefinition = definitions.find(
    (candidate) => candidate.id === "desktop-linux-portable"
  )
  if (!linuxPortableDefinition) {
    throw new Error(`[artifact:${definition.id}] missing desktop-linux-portable definition`)
  }

  const expectedPortableArchiveName = path.posix.basename(linuxPortableDefinition.relativePath)
  const expectedCompanionLine = `echo \"Companion portable archive: ${expectedPortableArchiveName}\"`
  if (!appImageLines.includes(expectedCompanionLine)) {
    throw new Error(
      `[artifact:${definition.id}] missing companion archive line for ${expectedPortableArchiveName}`
    )
  }

  const checksumLine = appImageLines.find((line) => line.startsWith("echo \"Companion SHA256: "))
  if (!checksumLine) {
    throw new Error(`[artifact:${definition.id}] missing companion SHA256 line`)
  }

  const checksumMatch = checksumLine.match(/^echo \"Companion SHA256: ([a-f0-9]{64})\"$/)
  if (!checksumMatch) {
    throw new Error(
      `[artifact:${definition.id}] companion SHA256 line must contain 64 lowercase hex characters`
    )
  }

  const expectedPortableChecksum = await sha256File(resolveFromRepository(linuxPortableDefinition.relativePath))
  if (checksumMatch[1] !== expectedPortableChecksum) {
    throw new Error(
      `[artifact:${definition.id}] companion SHA256 mismatch; expected ${expectedPortableChecksum} but got ${checksumMatch[1]}`
    )
  }
}

function normalizeString(value) {
  return typeof value === "string" ? value : ""
}

function assertStableMetadata({ metadata, definitions, version, failures }) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    failures.push("[artifact:stable-metadata] expected JSON object")
    return
  }

  if (metadata.schemaVersion !== 1) {
    failures.push(
      `[artifact:stable-metadata] expected schemaVersion '1' but got '${String(metadata.schemaVersion)}'`
    )
  }

  if (metadata.channel !== RELEASE_CHANNEL) {
    failures.push(
      `[artifact:stable-metadata] expected channel '${RELEASE_CHANNEL}' but got '${String(metadata.channel)}'`
    )
  }

  if (metadata.version !== version) {
    failures.push(
      `[artifact:stable-metadata] expected version '${version}' but got '${String(metadata.version)}'`
    )
  }

  if (metadata.generatedFrom !== "pnpm -w turbo run build:release") {
    failures.push(
      `[artifact:stable-metadata] expected generatedFrom 'pnpm -w turbo run build:release' but got '${String(metadata.generatedFrom)}'`
    )
  }

  const expectedReleaseDirectory = `release/${RELEASE_CHANNEL}/v${version}`
  if (metadata.releaseDirectory !== expectedReleaseDirectory) {
    failures.push(
      `[artifact:stable-metadata] expected releaseDirectory '${expectedReleaseDirectory}' but got '${String(metadata.releaseDirectory)}'`
    )
  }

  const expectedChangelogPath = `${expectedReleaseDirectory}/CHANGELOG.md`
  if (metadata.changelogPath !== expectedChangelogPath) {
    failures.push(
      `[artifact:stable-metadata] expected changelogPath '${expectedChangelogPath}' but got '${String(metadata.changelogPath)}'`
    )
  }

  if (normalizeString(metadata.sourceCommit).length === 0) {
    failures.push("[artifact:stable-metadata] expected non-empty sourceCommit string")
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

function assertStableChangelog({ rootChangelog, versionChangelog, version, failures }) {
  if (rootChangelog !== versionChangelog) {
    failures.push("[artifact:root-changelog] expected root and release changelog contents to match")
  }

  if (!versionChangelog.startsWith("# Changelog\n")) {
    failures.push("[artifact:release-changelog] missing '# Changelog' heading")
  }

  if (!versionChangelog.includes(`## v${version} (`)) {
    failures.push(`[artifact:release-changelog] missing release heading for v${version}`)
  }

  if (!versionChangelog.includes("- Stable release metadata generated from commit `")) {
    failures.push("[artifact:release-changelog] missing stable metadata commit line")
  }

  if (!versionChangelog.includes("### Included commits")) {
    failures.push("[artifact:release-changelog] missing 'Included commits' section heading")
  }
}

async function verifyReleaseArtifacts() {
  const version = await readWorkspaceVersion()
  const definitions = getArtifactDefinitions(version)
  const metadataPath = getStableMetadataPath()
  const versionChangelogPath = getVersionChangelogPath(version)
  const rootChangelogPath = resolveFromRepository("CHANGELOG.md")

  const failures = []

  for (const definition of definitions) {
    const absolutePath = resolveFromRepository(definition.relativePath)
    try {
      await assertFileExistsAndIsNonEmpty(absolutePath, `[artifact:${definition.id}]`)
      if (definition.kind === "portable" && definition.platform !== "web") {
        await assertPortableDesktopArtifact({ definition, absolutePath, version })
      }

      if (definition.id === "web-static-distribution") {
        await assertWebStaticArtifact({ definition, absolutePath, version })
      }

      if (definition.id === "desktop-linux-appimage") {
        await assertLinuxAppImageArtifact({ definition, absolutePath, definitions, version })
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }

  try {
    await assertFileExistsAndIsNonEmpty(versionChangelogPath, "[artifact:release-changelog]")
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error))
  }

  let versionChangelog
  let rootChangelog
  try {
    versionChangelog = await readFile(versionChangelogPath, "utf8")
    rootChangelog = await readFile(rootChangelogPath, "utf8")
    assertStableChangelog({
      rootChangelog,
      versionChangelog,
      version,
      failures
    })
  } catch (error) {
    failures.push(
      error instanceof Error
        ? `[artifact:release-changelog] unable to read changelog contents: ${error.message}`
        : String(error)
    )
  }

  try {
    await assertFileExistsAndIsNonEmpty(rootChangelogPath, "[artifact:root-changelog]")
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error))
  }

  let metadata
  try {
    const rawMetadata = await readFile(metadataPath, "utf8")
    metadata = JSON.parse(rawMetadata)
  } catch (error) {
    failures.push(
      error instanceof Error
        ? `[artifact:stable-metadata] unable to read metadata file ${metadataPath}: ${error.message}`
        : String(error)
    )
  }

  if (metadata) {
    assertStableMetadata({
      metadata,
      definitions,
      version,
      failures
    })
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
