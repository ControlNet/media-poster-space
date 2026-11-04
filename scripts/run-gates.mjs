import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url))
const verifierPath = path.join(scriptsDirectory, "verify-thresholds.mjs")

const USAGE =
  "Usage: node scripts/run-gates.mjs --platform <web|desktop> --metrics <path-to-metrics-json> -- <gate command> [args...]"

function parseArgs(argv) {
  const separatorIndex = argv.indexOf("--")
  if (separatorIndex === -1) {
    throw new Error(USAGE)
  }

  const ownArgs = argv.slice(0, separatorIndex)
  const command = argv.slice(separatorIndex + 1)
  let platform = ""
  let metricsPath = ""

  for (let index = 0; index < ownArgs.length; index += 1) {
    const token = ownArgs[index]
    if (token === "--platform") {
      platform = ownArgs[index + 1] ?? ""
      index += 1
      continue
    }

    if (token === "--metrics") {
      metricsPath = ownArgs[index + 1] ?? ""
      index += 1
      continue
    }

    throw new Error(`Unknown argument '${token}'. ${USAGE}`)
  }

  if (!platform || !metricsPath || command.length === 0) {
    throw new Error(USAGE)
  }

  return { platform, metricsPath, command }
}

function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
      // Package-manager shims on Windows are .cmd files that need a shell.
      shell: process.platform === "win32"
    })

    child.on("error", (error) => {
      reject(new Error(`failed to start '${command}': ${error.message}`))
    })

    child.on("exit", (code, signal) => {
      if (signal) {
        resolve({ code: 1, description: `terminated by signal ${signal}` })
        return
      }

      resolve({ code: code ?? 1, description: `exited with code ${String(code)}` })
    })
  })
}

async function main() {
  const { platform, metricsPath, command } = parseArgs(process.argv.slice(2))
  // Captured before the gate suite starts; the verifier rejects metrics generated earlier.
  const runStartedAt = new Date().toISOString()
  const env = {
    ...process.env,
    MPS_GATE_RUN_STARTED_AT: runStartedAt
  }

  const [gateCommand, ...gateArgs] = command
  const gateResult = await runCommand(gateCommand, gateArgs, env)
  if (gateResult.code !== 0) {
    throw new Error(`[gates:${platform}] gate suite ${gateResult.description}; threshold verification skipped.`)
  }

  const verifyResult = await runCommand(
    process.execPath,
    [verifierPath, "--platform", platform, "--metrics", metricsPath, "--since", runStartedAt],
    env
  )
  if (verifyResult.code !== 0) {
    throw new Error(`[gates:${platform}] threshold verification ${verifyResult.description}.`)
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
