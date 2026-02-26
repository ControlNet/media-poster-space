import { readFile, stat } from "node:fs/promises"
import path from "node:path"

const REQUIRED_SEED = "v1-fixed-seed"
const REQUIRED_WIDTH = 1920
const REQUIRED_HEIGHT = 1080
const REQUIRED_FRAME_RATE = 60
const REQUIRED_CLIP_DURATION_MS = 30_000

const THRESHOLD_LIMITS_MS = {
  "login-flow-ms": 45_000,
  "offline-cached-first-paint-ms": 5_000,
  "token-revoked-recovery-ms": 60_000,
  "logout-cleanup-ms": 1_000
}

const FORCE_FAIL_MESSAGES = {
  "login-flow": "[GATE:login-flow<=45s] forced failure for regression evidence.",
  "offline-cached-first-paint": "[GATE:offline-cached-first-paint<=5s] forced failure for regression evidence.",
  "token-revoked-recovery": "[GATE:token-revoked-recovery<=60s] forced failure for regression evidence.",
  "logout-cleanup": "[GATE:logout-cleanup<=1s] forced failure for regression evidence.",
  "visual-baseline": "[GATE:visual-baseline] forced failure for regression evidence."
}

function parseArgs(argv) {
  const args = {
    platform: "",
    metricsPath: ""
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === "--platform") {
      args.platform = argv[index + 1] ?? ""
      index += 1
      continue
    }

    if (token === "--metrics") {
      args.metricsPath = argv[index + 1] ?? ""
      index += 1
    }
  }

  if (!args.platform || !args.metricsPath) {
    throw new Error(
      "Usage: node scripts/verify-thresholds.mjs --platform <web|desktop> --metrics <path-to-metrics-json>"
    )
  }

  return args
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function isSha256Hex(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)
}

async function assertFileExistsAndNonEmpty(filePath, gateLabel) {
  let fileStats

  try {
    fileStats = await stat(filePath)
  } catch {
    throw new Error(`[GATE:${gateLabel}] missing evidence artifact: ${filePath}`)
  }

  assertCondition(fileStats.isFile(), `[GATE:${gateLabel}] expected file artifact: ${filePath}`)
  assertCondition(fileStats.size > 0, `[GATE:${gateLabel}] empty artifact file: ${filePath}`)
}

function toGateLabel(metricKey) {
  if (metricKey === "login-flow-ms") {
    return "login-flow<=45s"
  }

  if (metricKey === "offline-cached-first-paint-ms") {
    return "offline-cached-first-paint<=5s"
  }

  if (metricKey === "token-revoked-recovery-ms") {
    return "token-revoked-recovery<=60s"
  }

  return "logout-cleanup<=1s"
}

function maybeFailForcedGate() {
  const forced = (process.env.MPS_GATE_FORCE_FAIL ?? "").trim()
  if (!forced) {
    return
  }

  const message = FORCE_FAIL_MESSAGES[forced]
  if (message) {
    throw new Error(message)
  }

  throw new Error(
    `[GATE:forced] unsupported MPS_GATE_FORCE_FAIL value: ${forced}. Supported values: ${Object.keys(FORCE_FAIL_MESSAGES).join(", ")}`
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const metricsPath = path.resolve(args.metricsPath)

  maybeFailForcedGate()

  let metrics
  try {
    const raw = await readFile(metricsPath, "utf8")
    metrics = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `[GATE:metrics] unable to load metrics JSON at ${metricsPath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  assertCondition(metrics && typeof metrics === "object", "[GATE:metrics] metrics payload is not an object")
  assertCondition(metrics.platform === args.platform, `[GATE:metrics] expected platform '${args.platform}' but got '${String(metrics.platform)}'`)

  const gates = metrics.gates
  assertCondition(gates && typeof gates === "object", "[GATE:metrics] missing 'gates' object")

  for (const [metricKey, thresholdMs] of Object.entries(THRESHOLD_LIMITS_MS)) {
    const elapsedMs = gates[metricKey]
    const gateLabel = toGateLabel(metricKey)

    assertCondition(
      typeof elapsedMs === "number" && Number.isFinite(elapsedMs),
      `[GATE:${gateLabel}] missing or non-numeric metric '${metricKey}'.`
    )

    if (elapsedMs > thresholdMs) {
      throw new Error(
        `[GATE:${gateLabel}] threshold exceeded: ${elapsedMs}ms > ${thresholdMs}ms.`
      )
    }
  }

  const visualBaseline = metrics.visualBaseline
  assertCondition(
    visualBaseline && typeof visualBaseline === "object",
    "[GATE:visual-baseline] missing 'visualBaseline' object"
  )

  const milestone = String(visualBaseline.milestone ?? "").trim()
  const scene = String(visualBaseline.scene ?? "").trim()
  const version = String(visualBaseline.version ?? "").trim()
  const namingPrefix = `${milestone}-${scene}-${version}`

  assertCondition(milestone.length > 0 && scene.length > 0 && version.length > 0, "[GATE:visual-baseline] milestone, scene, and version are required")
  assertCondition(
    visualBaseline.seed === REQUIRED_SEED,
    `[GATE:visual-baseline] expected fixed seed '${REQUIRED_SEED}' but got '${String(visualBaseline.seed)}'.`
  )
  assertCondition(
    visualBaseline.width === REQUIRED_WIDTH && visualBaseline.height === REQUIRED_HEIGHT,
    `[GATE:visual-baseline] expected 1080p dimensions ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}.`
  )
  assertCondition(
    visualBaseline.frameRate === REQUIRED_FRAME_RATE,
    `[GATE:visual-baseline] expected frameRate=${REQUIRED_FRAME_RATE}.`
  )
  assertCondition(
    typeof visualBaseline.clipDurationMs === "number" && visualBaseline.clipDurationMs >= REQUIRED_CLIP_DURATION_MS,
    `[GATE:visual-baseline] clip duration must be >= ${REQUIRED_CLIP_DURATION_MS}ms.`
  )

  const clipPath = String(visualBaseline.clipPath ?? "")
  const expectedClipName = `${namingPrefix}-${args.platform}-1080p60-30s.webm`
  assertCondition(path.basename(clipPath) === expectedClipName, `[GATE:visual-baseline] clip naming mismatch. Expected ${expectedClipName}.`)

  const screenshotPaths = visualBaseline.screenshots
  assertCondition(
    Array.isArray(screenshotPaths) && screenshotPaths.length === 3,
    "[GATE:visual-baseline] expected exactly 3 segment screenshots."
  )

  for (let index = 0; index < screenshotPaths.length; index += 1) {
    const screenshotPath = String(screenshotPaths[index])
    const expectedScreenshotName = `${namingPrefix}-${args.platform}-segment-${index + 1}.png`
    assertCondition(
      path.basename(screenshotPath) === expectedScreenshotName,
      `[GATE:visual-baseline] screenshot naming mismatch at segment ${index + 1}. Expected ${expectedScreenshotName}.`
    )
  }

  const seedProof = visualBaseline.seedProof
  assertCondition(
    seedProof && typeof seedProof === "object",
    "[GATE:visual-baseline-seed-proof] missing 'seedProof' object."
  )

  const renderInput = String(seedProof.renderInput ?? "").trim()
  assertCondition(
    renderInput.length > 0,
    "[GATE:visual-baseline-seed-proof] missing render input descriptor."
  )

  const expectedRenderInput =
    args.platform === "web"
      ? `/wall?seed=${encodeURIComponent(REQUIRED_SEED)}&profile=balanced`
      : `desktop-seeded-evidence-frame?seed=${encodeURIComponent(REQUIRED_SEED)}`
  assertCondition(
    renderInput === expectedRenderInput,
    `[GATE:visual-baseline-seed-proof] expected render input '${expectedRenderInput}' but got '${renderInput}'.`
  )

  const fixedSeed = String(seedProof.fixedSeed ?? "").trim()
  assertCondition(
    fixedSeed === REQUIRED_SEED,
    `[GATE:visual-baseline-seed-proof] expected fixedSeed '${REQUIRED_SEED}' but got '${fixedSeed}'.`
  )

  const fixedSeedFrameHash = String(seedProof.fixedSeedFrameHash ?? "").trim()
  const fixedSeedReplayFrameHash = String(seedProof.fixedSeedReplayFrameHash ?? "").trim()
  const variantSeed = String(seedProof.variantSeed ?? "").trim()
  const variantSeedFrameHash = String(seedProof.variantSeedFrameHash ?? "").trim()

  assertCondition(
    isSha256Hex(fixedSeedFrameHash),
    "[GATE:visual-baseline-seed-proof] fixedSeedFrameHash must be a 64-char sha256 hex digest."
  )
  assertCondition(
    isSha256Hex(fixedSeedReplayFrameHash),
    "[GATE:visual-baseline-seed-proof] fixedSeedReplayFrameHash must be a 64-char sha256 hex digest."
  )
  assertCondition(
    isSha256Hex(variantSeedFrameHash),
    "[GATE:visual-baseline-seed-proof] variantSeedFrameHash must be a 64-char sha256 hex digest."
  )
  assertCondition(
    variantSeed.length > 0 && variantSeed !== REQUIRED_SEED,
    "[GATE:visual-baseline-seed-proof] variantSeed must be non-empty and different from the fixed seed."
  )
  assertCondition(
    fixedSeedFrameHash === fixedSeedReplayFrameHash,
    "[GATE:visual-baseline-seed-proof] fixed-seed replay hash mismatch; seeded render is not deterministic."
  )
  assertCondition(
    fixedSeedFrameHash !== variantSeedFrameHash,
    "[GATE:visual-baseline-seed-proof] variant seed produced the same frame hash as the fixed seed."
  )

  await assertFileExistsAndNonEmpty(clipPath, "visual-baseline")
  for (const screenshotPath of screenshotPaths) {
    await assertFileExistsAndNonEmpty(String(screenshotPath), "visual-baseline")
  }

  console.log(
    `[gates:${args.platform}] PASS login=${gates["login-flow-ms"]}ms offline=${gates["offline-cached-first-paint-ms"]}ms tokenRevoked=${gates["token-revoked-recovery-ms"]}ms logout=${gates["logout-cleanup-ms"]}ms`
  )
  console.log(`[gates:${args.platform}] visual baseline verified via ${path.resolve(clipPath)}`)
  console.log(`[gates:${args.platform}] seed proof verified via ${renderInput}`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
