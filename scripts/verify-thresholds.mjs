import { open, readFile, stat } from "node:fs/promises"
import path from "node:path"

const REQUIRED_SEED = "v1-fixed-seed"
// Screenshots are taken at a 1920x1080 viewport; full-page captures may be taller, never narrower.
const REQUIRED_SCREENSHOT_WIDTH = 1920
const MIN_SCREENSHOT_HEIGHT = 1080
const SEGMENT_SCREENSHOT_COUNT = 3

const THRESHOLD_LIMITS_MS = {
  "login-flow-ms": 45_000,
  "offline-cached-first-paint-ms": 5_000,
  "token-revoked-recovery-ms": 60_000,
  "logout-cleanup-ms": 1_000
}

const GATE_LABELS = {
  "login-flow-ms": "login-flow<=45s",
  "offline-cached-first-paint-ms": "offline-cached-first-paint<=5s",
  "token-revoked-recovery-ms": "token-revoked-recovery<=60s",
  "logout-cleanup-ms": "logout-cleanup<=1s"
}

const FORCE_FAIL_MESSAGES = {
  "login-flow": "[GATE:login-flow<=45s] forced failure for regression evidence.",
  "offline-cached-first-paint": "[GATE:offline-cached-first-paint<=5s] forced failure for regression evidence.",
  "token-revoked-recovery": "[GATE:token-revoked-recovery<=60s] forced failure for regression evidence.",
  "logout-cleanup": "[GATE:logout-cleanup<=1s] forced failure for regression evidence.",
  "visual-baseline": "[GATE:visual-baseline] forced failure for regression evidence."
}

// Platform-specific evidence. Only the web gate renders the seeded wall scene and records a session clip;
// the desktop gate runs the runtime in jsdom and can only snapshot its DOM.
const PLATFORM_EVIDENCE = {
  web: { sessionClip: true, seedProof: true },
  desktop: { sessionClip: false, seedProof: false }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3])

const USAGE =
  "Usage: node scripts/verify-thresholds.mjs --platform <web|desktop> --metrics <path-to-metrics-json> --since <ISO-8601 run start>"

function parseArgs(argv) {
  const args = {
    platform: "",
    metricsPath: "",
    since: process.env.MPS_GATE_RUN_STARTED_AT ?? ""
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
      continue
    }

    if (token === "--since") {
      args.since = argv[index + 1] ?? ""
      index += 1
      continue
    }

    throw new Error(`Unknown argument '${token}'. ${USAGE}`)
  }

  if (!args.platform || !args.metricsPath || !args.since) {
    throw new Error(USAGE)
  }

  if (!(args.platform in PLATFORM_EVIDENCE)) {
    throw new Error(`Unsupported platform '${args.platform}'. ${USAGE}`)
  }

  const sinceMs = Date.parse(args.since)
  if (!Number.isFinite(sinceMs)) {
    throw new Error(`[GATE:metrics] --since must be an ISO-8601 timestamp but got '${args.since}'.`)
  }

  return { ...args, sinceMs }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function isSha256Hex(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)
}

async function readFileHeader(filePath, byteLength, gateLabel) {
  let fileStats
  try {
    fileStats = await stat(filePath)
  } catch (error) {
    throw new Error(
      `[GATE:${gateLabel}] missing evidence artifact: ${filePath} (${error instanceof Error ? error.message : String(error)})`
    )
  }

  assertCondition(fileStats.isFile(), `[GATE:${gateLabel}] expected file artifact: ${filePath}`)
  assertCondition(fileStats.size > 0, `[GATE:${gateLabel}] empty artifact file: ${filePath}`)

  const handle = await open(filePath, "r")
  try {
    const buffer = Buffer.alloc(byteLength)
    const { bytesRead } = await handle.read(buffer, 0, byteLength, 0)
    return { header: buffer.subarray(0, bytesRead), mtimeMs: fileStats.mtimeMs }
  } finally {
    await handle.close()
  }
}

async function measurePngDimensions(filePath, gateLabel) {
  // PNG layout: 8-byte signature, then the IHDR chunk (length, "IHDR", width u32be, height u32be).
  const { header, mtimeMs } = await readFileHeader(filePath, 24, gateLabel)
  assertCondition(
    header.length === 24 && header.subarray(0, 8).equals(PNG_SIGNATURE) && header.toString("latin1", 12, 16) === "IHDR",
    `[GATE:${gateLabel}] not a PNG file: ${filePath}`
  )

  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
    mtimeMs
  }
}

async function assertWebmContainer(filePath, gateLabel) {
  const { header, mtimeMs } = await readFileHeader(filePath, 64, gateLabel)
  assertCondition(
    header.subarray(0, 4).equals(EBML_MAGIC) && header.includes(Buffer.from("webm", "latin1")),
    `[GATE:${gateLabel}] not a WebM (EBML) file: ${filePath}`
  )

  return { mtimeMs }
}

function assertFreshArtifact(mtimeMs, sinceMs, filePath, gateLabel) {
  assertCondition(
    mtimeMs >= sinceMs,
    `[GATE:${gateLabel}] stale evidence artifact ${filePath}: modified ${new Date(mtimeMs).toISOString()} before run start ${new Date(sinceMs).toISOString()}.`
  )
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

function verifyGeneratedAt(metrics, sinceMs) {
  const generatedAt = metrics.generatedAt
  assertCondition(
    typeof generatedAt === "string" && generatedAt.length > 0,
    "[GATE:metrics] missing 'generatedAt' timestamp; refusing to trust metrics of unknown age."
  )

  const generatedAtMs = Date.parse(generatedAt)
  assertCondition(Number.isFinite(generatedAtMs), `[GATE:metrics] 'generatedAt' is not a valid timestamp: '${generatedAt}'.`)
  assertCondition(
    generatedAtMs >= sinceMs,
    `[GATE:metrics] stale metrics: generatedAt ${generatedAt} is older than run start ${new Date(sinceMs).toISOString()}.`
  )
  assertCondition(
    generatedAtMs <= Date.now(),
    `[GATE:metrics] 'generatedAt' ${generatedAt} lies in the future.`
  )
}

function verifyTimingGates(gates) {
  assertCondition(gates && typeof gates === "object", "[GATE:metrics] missing 'gates' object")

  for (const [metricKey, thresholdMs] of Object.entries(THRESHOLD_LIMITS_MS)) {
    const elapsedMs = gates[metricKey]
    const gateLabel = GATE_LABELS[metricKey]

    assertCondition(
      typeof elapsedMs === "number" && Number.isFinite(elapsedMs),
      `[GATE:${gateLabel}] missing or non-finite metric '${metricKey}'.`
    )
    assertCondition(elapsedMs >= 0, `[GATE:${gateLabel}] negative elapsed time for '${metricKey}': ${elapsedMs}ms.`)

    if (elapsedMs > thresholdMs) {
      throw new Error(`[GATE:${gateLabel}] threshold exceeded: ${elapsedMs}ms > ${thresholdMs}ms.`)
    }
  }
}

function verifySeedProof(seedProof) {
  assertCondition(
    seedProof && typeof seedProof === "object",
    "[GATE:visual-baseline-seed-proof] missing 'seedProof' object."
  )

  const renderInput = String(seedProof.renderInput ?? "").trim()
  const expectedRenderInput = `/wall?seed=${encodeURIComponent(REQUIRED_SEED)}&profile=balanced`
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

  for (const [name, value] of [
    ["fixedSeedFrameHash", fixedSeedFrameHash],
    ["fixedSeedReplayFrameHash", fixedSeedReplayFrameHash],
    ["variantSeedFrameHash", variantSeedFrameHash]
  ]) {
    assertCondition(
      isSha256Hex(value),
      `[GATE:visual-baseline-seed-proof] ${name} must be a 64-char sha256 hex digest.`
    )
  }

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

  return renderInput
}

async function verifyVisualEvidence(visualBaseline, platform, sinceMs) {
  assertCondition(
    visualBaseline && typeof visualBaseline === "object",
    "[GATE:visual-baseline] missing 'visualBaseline' object"
  )

  const milestone = String(visualBaseline.milestone ?? "").trim()
  const scene = String(visualBaseline.scene ?? "").trim()
  const version = String(visualBaseline.version ?? "").trim()
  assertCondition(
    milestone.length > 0 && scene.length > 0 && version.length > 0,
    "[GATE:visual-baseline] milestone, scene, and version are required"
  )
  const namingPrefix = `${milestone}-${scene}-${version}`

  const screenshotPaths = visualBaseline.screenshots
  assertCondition(
    Array.isArray(screenshotPaths) && screenshotPaths.length === SEGMENT_SCREENSHOT_COUNT,
    `[GATE:visual-baseline] expected exactly ${SEGMENT_SCREENSHOT_COUNT} segment screenshots.`
  )

  const measuredScreenshots = []
  for (let index = 0; index < screenshotPaths.length; index += 1) {
    const screenshotPath = String(screenshotPaths[index])
    const expectedScreenshotName = `${namingPrefix}-${platform}-segment-${index + 1}.png`
    assertCondition(
      path.basename(screenshotPath) === expectedScreenshotName,
      `[GATE:visual-baseline] screenshot naming mismatch at segment ${index + 1}. Expected ${expectedScreenshotName}.`
    )

    const dimensions = await measurePngDimensions(screenshotPath, "visual-baseline")
    assertFreshArtifact(dimensions.mtimeMs, sinceMs, screenshotPath, "visual-baseline")
    assertCondition(
      dimensions.width === REQUIRED_SCREENSHOT_WIDTH && dimensions.height >= MIN_SCREENSHOT_HEIGHT,
      `[GATE:visual-baseline] ${screenshotPath} measures ${dimensions.width}x${dimensions.height}; expected width ${REQUIRED_SCREENSHOT_WIDTH} and height >= ${MIN_SCREENSHOT_HEIGHT}.`
    )
    measuredScreenshots.push(`${dimensions.width}x${dimensions.height}`)
  }

  const evidence = PLATFORM_EVIDENCE[platform]
  let clipPath = null
  if (evidence.sessionClip) {
    clipPath = String(visualBaseline.clipPath ?? "")
    const expectedClipName = `${namingPrefix}-${platform}-session.webm`
    assertCondition(
      path.basename(clipPath) === expectedClipName,
      `[GATE:visual-baseline] clip naming mismatch. Expected ${expectedClipName}.`
    )
    const clip = await assertWebmContainer(clipPath, "visual-baseline")
    assertFreshArtifact(clip.mtimeMs, sinceMs, clipPath, "visual-baseline")
  } else {
    assertCondition(
      visualBaseline.clipPath === undefined,
      `[GATE:visual-baseline] ${platform} gate does not record a session clip; unexpected 'clipPath'.`
    )
  }

  let seedRenderInput = null
  if (evidence.seedProof) {
    seedRenderInput = verifySeedProof(visualBaseline.seedProof)
  } else {
    assertCondition(
      visualBaseline.seedProof === undefined,
      `[GATE:visual-baseline] ${platform} gate cannot render a seeded scene; unexpected 'seedProof'.`
    )
  }

  return { measuredScreenshots, clipPath, seedRenderInput }
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
  assertCondition(
    metrics.platform === args.platform,
    `[GATE:metrics] expected platform '${args.platform}' but got '${String(metrics.platform)}'`
  )

  verifyGeneratedAt(metrics, args.sinceMs)
  verifyTimingGates(metrics.gates)
  const visual = await verifyVisualEvidence(metrics.visualBaseline, args.platform, args.sinceMs)

  const gates = metrics.gates
  console.log(
    `[gates:${args.platform}] PASS login=${gates["login-flow-ms"]}ms offline=${gates["offline-cached-first-paint-ms"]}ms tokenRevoked=${gates["token-revoked-recovery-ms"]}ms logout=${gates["logout-cleanup-ms"]}ms (generatedAt ${metrics.generatedAt})`
  )
  console.log(`[gates:${args.platform}] segment screenshots measured ${visual.measuredScreenshots.join(", ")}`)
  if (visual.clipPath) {
    console.log(`[gates:${args.platform}] session clip present at ${path.resolve(visual.clipPath)}`)
  }
  if (visual.seedRenderInput) {
    console.log(`[gates:${args.platform}] seed proof verified via ${visual.seedRenderInput}`)
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
