import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  RELEASE_CHANNEL,
  getArtifactDefinitions,
  getReleaseVersionDirectory,
  getRepositoryRoot,
  getStableMetadataPath,
  getVersionChangelogPath,
  readGitOutput,
  readWorkspaceVersion
} from "./release-manifest.mjs"

const CHANGELOG_COMMIT_LIMIT = 20

function normalizeCommitLines(rawLog) {
  return rawLog
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function buildChangelogMarkdown({ version, commitRef, commitDate, commitLines }) {
  return [
    "# Changelog",
    "",
    `## v${version} (${commitDate})`,
    "",
    `- Stable release metadata generated from commit \`${commitRef}\`.`,
    "",
    "### Included commits",
    "",
    commitLines.map((line) => `- ${line}`).join("\n"),
    ""
  ].join("\n")
}

// Writes release notes and metadata under the gitignored release/ output only; tracked files are
// never touched. Git failures (no repository, shallow history without HEAD, missing git) are fatal.
export async function writeStableReleaseDocs() {
  const version = await readWorkspaceVersion()
  const releaseVersionDirectory = getReleaseVersionDirectory(version)

  await mkdir(releaseVersionDirectory, { recursive: true })

  const commitRef = readGitOutput(["rev-parse", "--short", "HEAD"])
  const commitDate = readGitOutput(["log", "-1", "--pretty=format:%cI"])
  const commitLines = normalizeCommitLines(
    readGitOutput(["log", `-${CHANGELOG_COMMIT_LIMIT}`, "--pretty=format:%h %s"])
  )
  if (commitLines.length === 0) {
    throw new Error(`git log returned no commits for HEAD ${commitRef}`)
  }

  const changelog = buildChangelogMarkdown({
    version,
    commitRef,
    commitDate,
    commitLines
  })

  const metadata = {
    schemaVersion: 1,
    channel: RELEASE_CHANNEL,
    version,
    generatedFrom: "pnpm -w build:release",
    sourceCommit: commitRef,
    releaseDirectory: `release/${RELEASE_CHANNEL}/v${version}`,
    changelogPath: `release/${RELEASE_CHANNEL}/v${version}/CHANGELOG.md`,
    artifacts: getArtifactDefinitions(version).map((definition) => ({
      id: definition.id,
      platform: definition.platform,
      kind: definition.kind,
      path: definition.relativePath
    }))
  }

  await writeFile(getVersionChangelogPath(version), changelog, "utf8")
  await writeFile(getStableMetadataPath(), `${JSON.stringify(metadata, null, 2)}\n`, "utf8")

  console.log(
    `[release-docs] wrote ${path.relative(getRepositoryRoot(), getVersionChangelogPath(version))} and ${path.relative(getRepositoryRoot(), getStableMetadataPath())}`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeStableReleaseDocs().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[release-docs] ${message}`)
    process.exitCode = 1
  })
}
