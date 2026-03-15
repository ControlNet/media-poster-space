import { cp, mkdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  createDeterministicTar,
  ensureReleaseDirectories,
  getArtifactDefinitions,
  getRepositoryRoot,
  readWorkspaceVersion,
  resolveFromRepository,
  withTemporaryDirectory
} from "./release-manifest.mjs"

async function assertDirectoryExists(directoryPath) {
  const details = await stat(directoryPath)
  if (!details.isDirectory()) {
    throw new Error(`Expected directory at ${directoryPath}`)
  }
}

async function packageWebRelease() {
  const version = await readWorkspaceVersion()
  const repositoryRoot = getRepositoryRoot()
  const webDistDirectory = path.join(repositoryRoot, "apps", "web", "dist")

  await assertDirectoryExists(webDistDirectory)
  await ensureReleaseDirectories(version)

  const webArtifact = getArtifactDefinitions(version).find(
    (definition) => definition.id === "web-static-distribution"
  )

  if (!webArtifact) {
    throw new Error("Missing web artifact definition for stable release packaging")
  }

  const webArtifactPath = resolveFromRepository(webArtifact.relativePath)
  await mkdir(path.dirname(webArtifactPath), { recursive: true })

  await withTemporaryDirectory("mps-web-release-", async (tempDirectory) => {
    const stagedDirectory = path.join(tempDirectory, "web-static")

    await cp(webDistDirectory, stagedDirectory, { recursive: true })
    await writeFile(
      path.join(stagedDirectory, "release-manifest.json"),
      `${
        JSON.stringify(
          {
            channel: "stable",
            version,
            artifactId: webArtifact.id,
            artifactPath: webArtifact.relativePath
          },
          null,
          2
        )
      }\n`,
      "utf8"
    )

    createDeterministicTar(tempDirectory, webArtifactPath)
  })

  console.log(`[release:web] wrote ${webArtifact.relativePath}`)
}

packageWebRelease().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[release:web] ${message}`)
  process.exitCode = 1
})
