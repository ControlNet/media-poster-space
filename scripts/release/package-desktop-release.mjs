import { cp, chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"

import {
  createDeterministicTar,
  ensureReleaseDirectories,
  getArtifactDefinitions,
  getRepositoryRoot,
  readWorkspaceVersion,
  resolveFromRepository,
  runCommand,
  withTemporaryDirectory
} from "./release-manifest.mjs"

function artifactById(version, id) {
  const artifact = getArtifactDefinitions(version).find((definition) => definition.id === id)
  if (!artifact) {
    throw new Error(`Missing artifact definition: ${id}`)
  }

  return artifact
}

async function sha256File(filePath) {
  const payload = await readFile(filePath)
  return createHash("sha256").update(payload).digest("hex")
}

async function assertDirectoryExists(directoryPath) {
  const details = await stat(directoryPath)
  if (!details.isDirectory()) {
    throw new Error(`Expected directory at ${directoryPath}`)
  }
}

async function packagePortableTarget({
  artifactRelativePath,
  platform,
  version,
  uiDistDirectory,
  tauriConfigPath,
  cargoTomlPath
}) {
  const outputPath = resolveFromRepository(artifactRelativePath)
  await mkdir(path.dirname(outputPath), { recursive: true })

  await withTemporaryDirectory(`mps-desktop-${platform}-`, async (tempDirectory) => {
    const stagedDirectory = path.join(tempDirectory, "desktop-portable")
    await mkdir(stagedDirectory, { recursive: true })

    const stagedUi = path.join(stagedDirectory, "ui")
    const stagedTauriDirectory = path.join(stagedDirectory, "src-tauri")
    await cp(uiDistDirectory, stagedUi, { recursive: true })
    await mkdir(stagedTauriDirectory, { recursive: true })
    await cp(tauriConfigPath, path.join(stagedTauriDirectory, "tauri.conf.json"))
    await cp(cargoTomlPath, path.join(stagedTauriDirectory, "Cargo.toml"))

    await writeFile(
      path.join(stagedDirectory, "portable-manifest.json"),
      `${
        JSON.stringify(
          {
            channel: "stable",
            version,
            platform,
            packaging: "portable",
            tauriSigning: "disabled-in-v1"
          },
          null,
          2
        )
      }\n`,
      "utf8"
    )

    createDeterministicTar(tempDirectory, outputPath)
  })

  return outputPath
}

async function packageDesktopRelease() {
  const version = await readWorkspaceVersion()
  const repositoryRoot = getRepositoryRoot()
  const desktopDirectory = path.join(repositoryRoot, "apps", "desktop")
  const tauriConfigPath = path.join(desktopDirectory, "src-tauri", "tauri.conf.json")
  const cargoTomlPath = path.join(desktopDirectory, "src-tauri", "Cargo.toml")
  const uiDistDirectory = path.join(desktopDirectory, "dist-release")

  runCommand(
    "pnpm",
    ["--filter", "@mps/desktop", "exec", "vite", "build", "--outDir", "dist-release"],
    { cwd: repositoryRoot }
  )

  await assertDirectoryExists(uiDistDirectory)
  await ensureReleaseDirectories(version)

  const windowsPortable = artifactById(version, "desktop-windows-portable")
  const macosPortable = artifactById(version, "desktop-macos-portable")
  const linuxPortable = artifactById(version, "desktop-linux-portable")
  const appImageArtifact = artifactById(version, "desktop-linux-appimage")

  const linuxPortablePath = await packagePortableTarget({
    artifactRelativePath: linuxPortable.relativePath,
    platform: "linux",
    version,
    uiDistDirectory,
    tauriConfigPath,
    cargoTomlPath
  })

  await packagePortableTarget({
    artifactRelativePath: windowsPortable.relativePath,
    platform: "windows",
    version,
    uiDistDirectory,
    tauriConfigPath,
    cargoTomlPath
  })

  await packagePortableTarget({
    artifactRelativePath: macosPortable.relativePath,
    platform: "macos",
    version,
    uiDistDirectory,
    tauriConfigPath,
    cargoTomlPath
  })

  const linuxPortableChecksum = await sha256File(linuxPortablePath)
  const appImagePath = resolveFromRepository(appImageArtifact.relativePath)
  await mkdir(path.dirname(appImagePath), { recursive: true })
  await writeFile(
    appImagePath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "",
      `echo \"Media Poster Space v${version} stable Linux AppImage launcher\"`,
      `echo \"Companion portable archive: ${path.basename(linuxPortable.relativePath)}\"`,
      `echo \"Companion SHA256: ${linuxPortableChecksum}\"`
    ].join("\n"),
    "utf8"
  )
  await chmod(appImagePath, 0o755)

  console.log(`[release:desktop] wrote ${windowsPortable.relativePath}`)
  console.log(`[release:desktop] wrote ${macosPortable.relativePath}`)
  console.log(`[release:desktop] wrote ${linuxPortable.relativePath}`)
  console.log(`[release:desktop] wrote ${appImageArtifact.relativePath}`)
}

packageDesktopRelease().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[release:desktop] ${message}`)
  process.exitCode = 1
})
