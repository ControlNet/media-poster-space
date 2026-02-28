import { access, readFile } from "node:fs/promises"
import path from "node:path"

function parseArgs(argv) {
  return {
    strict: argv.includes("--strict")
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function readText(filePath) {
  return readFile(filePath, "utf8")
}

async function assertFileExists(filePath) {
  try {
    await access(filePath)
  } catch {
    throw new Error(`[docs-parity] required file is missing: ${filePath}`)
  }
}

function normalizeCell(value) {
  return value.trim().toLowerCase()
}

function parseCapabilityRows(markdown) {
  const lines = markdown.split("\n")
  const rows = new Map()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("|")) {
      continue
    }

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim())

    if (cells.length < 4) {
      continue
    }

    if (cells[0] === "Capability" || cells[0] === "---") {
      continue
    }

    rows.set(cells[0], {
      desktop: cells[1],
      web: cells[2],
      source: cells[3]
    })
  }

  return rows
}

function assertIncludes(haystack, needle, context) {
  assertCondition(haystack.includes(needle), `[docs-parity] missing required text in ${context}: ${needle}`)
}

function assertNotIncludes(haystack, needle, context) {
  assertCondition(!haystack.includes(needle), `[docs-parity] unsupported claim in ${context}: ${needle}`)
}

function inferRepositoryTruth(repositorySignals) {
  return {
    "Password persistence": {
      desktop: (
        repositorySignals.desktopRuntime.includes('testId: "remember-password-checkbox"')
        || (
          repositorySignals.desktopRuntime.includes("createOnboardingFormView({")
          && repositorySignals.coreOnboardingForm.includes('testId: "remember-password-checkbox"')
        )
      )
        ? "Yes (encrypted storage)"
        : "No",
      web: repositorySignals.webRuntime.includes("canPersistPassword: false") ? "No" : "Yes"
    },
    "Display selection": {
      desktop: repositorySignals.desktopRuntime.includes('testId: "display-selection-select"')
        && repositorySignals.desktopBridge.includes("platform_set_display_selection")
        ? "Yes"
        : "No",
      web: "No"
    },
    Autostart: {
      desktop: repositorySignals.desktopRuntime.includes('testId: "autostart-toggle-checkbox"')
        && repositorySignals.desktopBridge.includes("platform_set_autostart")
        ? "Yes (disabled in portable mode)"
        : "No",
      web: "No"
    },
    "Fullscreen control": {
      desktop: "No (managed by windowing system)",
      web: repositorySignals.webRuntime.includes('testId: "wall-fullscreen-button"')
        || repositorySignals.webControlsSection.includes('testId: "wall-fullscreen-button"')
        ? "Yes (browser Fullscreen API)"
        : "No"
    },
    "Offline cached startup": {
      desktop: repositorySignals.desktopRuntime.includes("createOnboardingIngestionController({")
        && repositorySignals.coreOnboardingIngestion.includes("hydratePosterCache(runtimeKey)")
        ? "Yes"
        : "No",
      web: repositorySignals.webRuntime.includes("createOnboardingIngestionController({")
        && repositorySignals.coreOnboardingIngestion.includes("hydratePosterCache(runtimeKey)")
        ? "Yes"
        : "No"
    },
    "PWA install": {
      desktop: "No",
      web: repositorySignals.webHasPwaAssets ? "Yes" : "No"
    },
    "Playback controls": {
      desktop: "No",
      web: "No"
    },
    "Provider coverage": {
      desktop: repositorySignals.desktopRuntime.includes("createJellyfinMediaProvider()") ? "Jellyfin only" : "Unknown",
      web: repositorySignals.webRuntime.includes("createJellyfinMediaProvider()") ? "Jellyfin only" : "Unknown"
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const repositoryRoot = process.cwd()

  const requiredDocs = {
    readme: path.join(repositoryRoot, "README.md"),
    capabilityMatrix: path.join(repositoryRoot, "docs/capability-matrix.md"),
    qualityGates: path.join(repositoryRoot, "docs/quality-gates.md"),
    feedbackWorkflow: path.join(repositoryRoot, "docs/feedback-workflow.md"),
    evidenceProtocol: path.join(repositoryRoot, "docs/evidence-protocol.md")
  }

  for (const requiredFile of Object.values(requiredDocs)) {
    await assertFileExists(requiredFile)
  }

  const [
    readme,
    capabilityMatrix,
    qualityGates,
    feedbackWorkflow,
    evidenceProtocol,
    webRuntime,
    webControlsSection,
    desktopRuntime,
    coreOnboardingForm,
    coreOnboardingIngestion,
    desktopBridge,
    webPackage
  ] = await Promise.all([
    readText(requiredDocs.readme),
    readText(requiredDocs.capabilityMatrix),
    readText(requiredDocs.qualityGates),
    readText(requiredDocs.feedbackWorkflow),
    readText(requiredDocs.evidenceProtocol),
    readText(path.join(repositoryRoot, "apps/web/src/onboarding/runtime.ts")),
    readText(path.join(repositoryRoot, "packages/core/src/wall/ui/controls-section.ts")),
    readText(path.join(repositoryRoot, "apps/desktop/src/onboarding/runtime.ts")),
    readText(path.join(repositoryRoot, "packages/core/src/runtime/onboarding-form.ts")),
    readText(path.join(repositoryRoot, "packages/core/src/runtime/onboarding-ingestion.ts")),
    readText(path.join(repositoryRoot, "apps/desktop/src/features/platform/tauri-bridge.ts")),
    readText(path.join(repositoryRoot, "apps/web/package.json"))
  ])

  const repositorySignals = {
    webRuntime,
    webControlsSection,
    desktopRuntime,
    coreOnboardingForm,
    coreOnboardingIngestion,
    desktopBridge,
    webHasPwaAssets:
      webPackage.includes("manifest.webmanifest")
      || webPackage.includes("vite-plugin-pwa")
      || webRuntime.includes("navigator.serviceWorker")
  }

  const truth = inferRepositoryTruth(repositorySignals)
  const matrixRows = parseCapabilityRows(capabilityMatrix)

  for (const [capability, expected] of Object.entries(truth)) {
    const row = matrixRows.get(capability)
    assertCondition(Boolean(row), `[docs-parity] capability row missing in docs/capability-matrix.md: ${capability}`)

    assertCondition(
      normalizeCell(row.desktop) === normalizeCell(expected.desktop),
      `[docs-parity] desktop mismatch for '${capability}'. docs='${row.desktop}' repo='${expected.desktop}'`
    )
    assertCondition(
      normalizeCell(row.web) === normalizeCell(expected.web),
      `[docs-parity] web mismatch for '${capability}'. docs='${row.web}' repo='${expected.web}'`
    )
  }

  assertIncludes(readme, "AGPL-3.0-only", "README.md")
  assertIncludes(readme, "pnpm -w verify:docs-parity", "README.md")
  assertIncludes(feedbackWorkflow, "Issues-only feedback policy", "docs/feedback-workflow.md")
  assertIncludes(feedbackWorkflow, "GitHub Issues only", "docs/feedback-workflow.md")
  assertIncludes(qualityGates, "pnpm -w turbo run e2e:web e2e:desktop", "docs/quality-gates.md")
  assertIncludes(qualityGates, "v1-fixed-seed", "docs/quality-gates.md")
  assertIncludes(qualityGates, ".sisyphus/evidence/task-16-web-gates.metrics.json", "docs/quality-gates.md")
  assertIncludes(qualityGates, ".sisyphus/evidence/task-16-desktop-gates.metrics.json", "docs/quality-gates.md")
  assertIncludes(evidenceProtocol, "v1-mandatory-gates-r1-web-1080p60-30s.webm", "docs/evidence-protocol.md")

  assertNotIncludes(capabilityMatrix, "PWA install | No | Yes", "docs/capability-matrix.md")
  assertNotIncludes(capabilityMatrix, "Playback controls | Yes", "docs/capability-matrix.md")

  if (args.strict) {
    const unsupportedStrictPatterns = [
      /supports\s+plex/i,
      /supports\s+emby/i,
      /playback controls\s*\|\s*yes/i,
      /pwa install\s*\|\s*(yes|supported)/i,
      /remember password\s*\|\s*yes\s*\|\s*yes/i
    ]

    for (const [capability, row] of matrixRows.entries()) {
      if (!(capability in truth)) {
        const desktopNormalized = normalizeCell(row.desktop)
        const webNormalized = normalizeCell(row.web)
        if (desktopNormalized.startsWith("yes") || webNormalized.startsWith("yes")) {
          throw new Error(
            `[docs-parity:strict] unknown capability claims support without repo mapping: '${capability}'`
          )
        }
      }
    }

    const strictCorpus = `${readme}\n${capabilityMatrix}\n${qualityGates}\n${feedbackWorkflow}`
    for (const pattern of unsupportedStrictPatterns) {
      assertCondition(
        !pattern.test(strictCorpus),
        `[docs-parity:strict] unsupported claim matched pattern: ${pattern.toString()}`
      )
    }
  }

  console.log(`[docs-parity] PASS (${args.strict ? "strict" : "default"})`)
  console.log("[docs-parity] capability matrix, quality gates, AGPL scope, and issues-only workflow are aligned")
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
