import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const RELEASE_CHANNEL = "stable"

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptsDirectory, "../..")

export function getRepositoryRoot() {
  return repositoryRoot
}

export async function readWorkspaceVersion() {
  const packageJsonPath = path.join(repositoryRoot, "package.json")
  const raw = await readFile(packageJsonPath, "utf8")
  const parsed = JSON.parse(raw)

  if (!parsed.version || typeof parsed.version !== "string") {
    throw new Error(`Expected package.json version string at ${packageJsonPath}`)
  }

  return parsed.version
}

export function getReleaseVersionDirectory(version) {
  return path.join(repositoryRoot, "release", RELEASE_CHANNEL, `v${version}`)
}

export function getStableMetadataPath() {
  return path.join(repositoryRoot, "release", RELEASE_CHANNEL, "metadata.json")
}

export function getVersionChangelogPath(version) {
  return path.join(getReleaseVersionDirectory(version), "CHANGELOG.md")
}

// Artifacts produced locally by `pnpm -w build:release`. Native desktop binaries are built per OS by
// the `desktop-native-artifacts` CI matrix (Tauri) and are not part of this local release output.
export function getArtifactDefinitions(version) {
  const releasePrefix = path.posix.join("release", RELEASE_CHANNEL, `v${version}`)

  return [
    {
      id: "web-static-distribution",
      platform: "web",
      kind: "static",
      relativePath: path.posix.join(
        releasePrefix,
        "web",
        `mps-web-v${version}-static.tar`
      )
    }
  ]
}

export function resolveFromRepository(relativePath) {
  return path.join(repositoryRoot, ...relativePath.split("/"))
}

export async function ensureReleaseDirectories(version) {
  await mkdir(path.join(repositoryRoot, "release", RELEASE_CHANNEL), { recursive: true })
  await mkdir(path.join(getReleaseVersionDirectory(version), "web"), { recursive: true })
}

export async function withTemporaryDirectory(prefix, callback) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), prefix))

  try {
    return await callback(temporaryDirectory)
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

export function runCommand(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    ...options
  })
}

export function createDeterministicTar(sourceDirectory, outputPath) {
  runCommand(
    "tar",
    [
      "--sort=name",
      "--mtime=@0",
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "-cf",
      outputPath,
      "-C",
      sourceDirectory,
      "."
    ],
    {
      env: {
        ...process.env,
        TZ: "UTC"
      }
    }
  )
}

export function readGitOutput(args) {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim()
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr).trim() : ""
    const reason = stderr || (error instanceof Error ? error.message : String(error))
    throw new Error(`git ${args.join(" ")} failed: ${reason}`)
  }
}
