import { mkdir, writeFile } from "node:fs/promises"

import {
  RELEASE_CHANNEL,
  getArtifactDefinitions,
  getReleaseVersionDirectory,
  getRepositoryRoot,
  getRootChangelogPath,
  getStableMetadataPath,
  getVersionChangelogPath,
  readGitOutput,
  readWorkspaceVersion
} from "./release-manifest.mjs"

function normalizeCommitLines(rawLog) {
  return rawLog
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function buildChangelogMarkdown({ version, commitRef, commitDate, commitLines }) {
  const headerDate = commitDate || "undated"
  const releaseLine = `- Stable release metadata generated from commit \`${commitRef}\`.`
  const commitSection =
    commitLines.length > 0
      ? commitLines.map((line) => `- ${line}`).join("\n")
      : "- No commit history available in this environment."

  return [
    "# Changelog",
    "",
    `## v${version} (${headerDate})`,
    "",
    releaseLine,
    "",
    "### Included commits",
    "",
    commitSection,
    ""
  ].join("\n")
}

export async function writeStableReleaseDocs() {
  const version = await readWorkspaceVersion()
  const releaseVersionDirectory = getReleaseVersionDirectory(version)

  await mkdir(releaseVersionDirectory, { recursive: true })

  const commitRef = readGitOutput(["rev-parse", "--short", "HEAD"], "unknown")
  const commitDate = readGitOutput(["log", "-1", "--pretty=format:%cI"], "unknown")
  const rawCommitLog = readGitOutput(["log", "-20", "--pretty=format:%h %s"], "")
  const commitLines = normalizeCommitLines(rawCommitLog)
  const changelog = buildChangelogMarkdown({
    version,
    commitRef,
    commitDate,
    commitLines
  })

  const artifactDefinitions = getArtifactDefinitions(version)
  const metadata = {
    schemaVersion: 1,
    channel: RELEASE_CHANNEL,
    version,
    generatedFrom: "pnpm -w turbo run build:release",
    sourceCommit: commitRef,
    releaseDirectory: `release/${RELEASE_CHANNEL}/v${version}`,
    changelogPath: `release/${RELEASE_CHANNEL}/v${version}/CHANGELOG.md`,
    artifacts: artifactDefinitions.map((definition) => ({
      id: definition.id,
      platform: definition.platform,
      kind: definition.kind,
      path: definition.relativePath
    }))
  }

  await writeFile(getVersionChangelogPath(version), changelog, "utf8")
  await writeFile(getRootChangelogPath(), changelog, "utf8")
  await writeFile(getStableMetadataPath(), `${JSON.stringify(metadata, null, 2)}\n`, "utf8")

  const repositoryRoot = getRepositoryRoot()
  console.log(
    `[release-docs] wrote changelog and stable metadata for v${version} at ${repositoryRoot}`
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeStableReleaseDocs().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[release-docs] ${message}`)
    process.exitCode = 1
  })
}
