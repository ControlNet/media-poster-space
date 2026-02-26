import { readFile } from "node:fs/promises"
import path from "node:path"

const DEFAULT_MANIFEST_PATH = "scripts/contracts/wall-contracts.json"
const REQUIRED_GROUPS = ["selector", "route", "timing", "oled", "evidence"]

function parseArgs(argv) {
  const args = {
    manifestPath: DEFAULT_MANIFEST_PATH
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === "--manifest") {
      args.manifestPath = argv[index + 1] ?? ""
      index += 1
      continue
    }

    throw new Error(`Usage: node scripts/verify-wall-contracts.mjs [--manifest <path-to-contract-manifest-json>]`)
  }

  if (!args.manifestPath) {
    throw new Error(`Usage: node scripts/verify-wall-contracts.mjs [--manifest <path-to-contract-manifest-json>]`)
  }

  return args
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function toSnippet(value) {
  const normalized = String(value)
    .trim()
    .replace(/\s+/g, " ")
  const shortened = normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized
  return JSON.stringify(shortened)
}

async function readTextCached(cache, repositoryRoot, filePath) {
  const normalizedFilePath = String(filePath)

  if (cache.has(normalizedFilePath)) {
    return cache.get(normalizedFilePath)
  }

  const absolutePath = path.resolve(repositoryRoot, normalizedFilePath)
  const text = await readFile(absolutePath, "utf8")
  cache.set(normalizedFilePath, text)
  return text
}

function normalizeCheckGroup(checks, groupName) {
  if (!Array.isArray(checks)) {
    throw new Error(`[wall-contracts:${groupName}] invalid manifest format: 'checks' must be an array.`)
  }

  return checks
}

function normalizeSelectorContracts(contracts) {
  if (!Array.isArray(contracts)) {
    throw new Error(`[wall-contracts:selector] invalid manifest format: 'contracts' must be an array.`)
  }

  return contracts
}

async function evaluateLiteralCheck(check, groupName, context) {
  const id = String(check?.id ?? "")
  const file = String(check?.file ?? "")
  const contains = String(check?.contains ?? "")
  const normalizedId = id || `${groupName}:${file}`

  if (!file || !contains) {
    return `[${groupName}] invalid check entry: expected non-empty id/file/contains`
  }

  let fileText
  try {
    fileText = await readTextCached(context.fileCache, context.repositoryRoot, file)
  } catch (error) {
    return `[${groupName}] ${normalizedId}: unable to read '${file}': ${error instanceof Error ? error.message : String(error)}`
  }

  if (!fileText.includes(contains)) {
    return `[${groupName}] ${normalizedId}: missing literal ${toSnippet(contains)} in ${file}`
  }

  return null
}

async function evaluateSimpleGroup(groupName, group, context) {
  const checks = normalizeCheckGroup(group?.checks, groupName)
  const failures = []

  for (const check of checks) {
    const failure = await evaluateLiteralCheck(check, groupName, context)
    if (failure) {
      failures.push(failure)
    }
  }

  return failures
}

async function evaluateSelectorGroup(group, context) {
  const contracts = normalizeSelectorContracts(group?.contracts)
  const failures = []

  for (const contract of contracts) {
    const contractId = String(contract?.id ?? "")
    const selector = String(contract?.selector ?? "")
    const producers = Array.isArray(contract?.producers) ? contract.producers : []
    const consumers = Array.isArray(contract?.consumers) ? contract.consumers : []

    if (!contractId || !selector) {
      failures.push("[selector] invalid contract entry: expected non-empty id and selector")
      continue
    }

    if (producers.length === 0) {
      failures.push(`[selector] ${contractId}: selector '${selector}' is missing producer checks`)
      continue
    }

    if (consumers.length === 0) {
      failures.push(`[selector] ${contractId}: selector '${selector}' is missing consumer checks`)
      continue
    }

    for (const producer of producers) {
      const failure = await evaluateLiteralCheck(producer, "selector:producer", context)
      if (failure) {
        failures.push(`[selector] ${contractId} (${selector}) producer failure: ${failure}`)
      }
    }

    for (const consumer of consumers) {
      const failure = await evaluateLiteralCheck(consumer, "selector:consumer", context)
      if (failure) {
        failures.push(`[selector] ${contractId} (${selector}) consumer failure: ${failure}`)
      }
    }
  }

  return failures
}

function maybeFailForcedGroup(manifest) {
  const envVar = String(manifest?.forceFail?.envVar ?? "MPS_CONTRACT_FORCE_FAIL")
  const supportedValues = Array.isArray(manifest?.forceFail?.supportedValues)
    ? manifest.forceFail.supportedValues.map((value) => String(value))
    : REQUIRED_GROUPS

  const forcedValue = String(process.env[envVar] ?? "").trim()
  if (!forcedValue) {
    return
  }

  if (!supportedValues.includes(forcedValue)) {
    throw new Error(
      `[wall-contracts:forced] unsupported ${envVar} value '${forcedValue}'. Supported values: ${supportedValues.join(", ")}`
    )
  }

  throw new Error(`[wall-contracts:${forcedValue}] forced failure via ${envVar}=${forcedValue} for regression evidence.`)
}

function formatFailureReport(failuresByGroup) {
  const lines = [`[wall-contracts] contract verification failed in ${failuresByGroup.size} group(s).`]

  for (const [groupName, groupFailures] of failuresByGroup.entries()) {
    lines.push(`[wall-contracts:${groupName}] ${groupFailures.length} failure(s):`)
    for (const failure of groupFailures) {
      lines.push(`  - ${failure}`)
    }
  }

  return lines.join("\n")
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const repositoryRoot = process.cwd()
  const manifestPath = path.resolve(repositoryRoot, args.manifestPath)

  let manifest
  try {
    const rawManifest = await readFile(manifestPath, "utf8")
    manifest = JSON.parse(rawManifest)
  } catch (error) {
    throw new Error(
      `[wall-contracts:manifest] unable to load manifest at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  assertCondition(manifest && typeof manifest === "object", "[wall-contracts:manifest] manifest payload must be an object")
  assertCondition(manifest.groups && typeof manifest.groups === "object", "[wall-contracts:manifest] missing 'groups' object")

  for (const groupName of REQUIRED_GROUPS) {
    assertCondition(Boolean(manifest.groups[groupName]), `[wall-contracts:manifest] missing required group '${groupName}'`) 
  }

  maybeFailForcedGroup(manifest)

  const context = {
    repositoryRoot,
    fileCache: new Map()
  }

  const failuresByGroup = new Map()

  const selectorFailures = await evaluateSelectorGroup(manifest.groups.selector, context)
  if (selectorFailures.length > 0) {
    failuresByGroup.set("selector", selectorFailures)
  }

  for (const groupName of REQUIRED_GROUPS.filter((name) => name !== "selector")) {
    const groupFailures = await evaluateSimpleGroup(groupName, manifest.groups[groupName], context)
    if (groupFailures.length > 0) {
      failuresByGroup.set(groupName, groupFailures)
    }
  }

  if (failuresByGroup.size > 0) {
    throw new Error(formatFailureReport(failuresByGroup))
  }

  console.log(`[wall-contracts] PASS route=${manifest.groups.route.checks.length} selector=${manifest.groups.selector.contracts.length} timing=${manifest.groups.timing.checks.length} oled=${manifest.groups.oled.checks.length} evidence=${manifest.groups.evidence.checks.length}`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
