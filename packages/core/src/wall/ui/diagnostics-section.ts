import type { ElementFactory } from "./element-factory"
import type { WallDiagnosticsSample, WallHandoff } from "./types"

export function createWallDiagnosticsSection(
  createElement: ElementFactory,
  options: {
    diagnosticsOpen: boolean
    handoff: WallHandoff
    ingestionStatus: "idle" | "refreshing" | "ready" | "error"
    ingestionItemCount: number
    ingestionTrigger: string | null
    ingestionFetchedAt: string | null
    ingestionError: string | null
    reconnectAttempt: number
    reconnectNextDelayMs: number | null
    detailProfile: "balanced" | "showcase"
    diagnosticsLatestSample: WallDiagnosticsSample | null
    diagnosticsRetentionSnapshot: {
      count: number
      byteSize: number
    }
    diagnosticsLastExportAt: string | null
    diagnosticsExportError: string | null
    samplingIntervalMs: number
    retentionMaxAgeMs: number
    retentionMaxBytes: number
    onToggleDetailProfile: () => void
    onExportCrashReport: () => void
  }
): HTMLElement | null {
  if (!options.diagnosticsOpen) {
    return null
  }

  const diagnosticsPanel = createElement("section", { testId: "wall-diagnostics-panel" })
  const lastSample = options.diagnosticsLatestSample
  const memoryLabel = typeof lastSample?.memoryMb === "number"
    ? `${lastSample.memoryMb.toFixed(1)} MB`
    : "n/a"

  diagnosticsPanel.style.display = "grid"
  diagnosticsPanel.style.gap = "0.68rem"
  diagnosticsPanel.style.padding = "0.86rem"
  diagnosticsPanel.style.borderRadius = "0.76rem"
  diagnosticsPanel.style.border = "1px solid color-mix(in srgb, var(--mps-color-orbit-glow-halo) 68%, var(--mps-color-border))"
  diagnosticsPanel.style.background = [
    "linear-gradient(154deg, color-mix(in srgb, var(--mps-overlay-depth-near) 82%, black) 0%, color-mix(in srgb, var(--mps-overlay-depth-far) 78%, black) 100%)",
    "radial-gradient(circle at 96% -8%, color-mix(in srgb, var(--mps-color-orbit-glow-halo) 52%, transparent) 0%, transparent 48%)"
  ].join(",")
  diagnosticsPanel.style.boxShadow = "0 14px 28px rgba(3, 8, 18, 0.26), inset 0 0 0 1px rgba(122, 217, 255, 0.1)"
  diagnosticsPanel.style.backdropFilter = "blur(6px)"

  function applyTelemetryChipStyle(chip: HTMLElement, variant: "neutral" | "emphasis"): void {
    chip.style.margin = "0"
    chip.style.padding = "0.52rem 0.58rem"
    chip.style.borderRadius = "0.54rem"
    chip.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 68%, var(--mps-color-telemetry-muted))"
    chip.style.background = "color-mix(in srgb, var(--mps-overlay-depth-near) 76%, black)"

    if (variant === "emphasis") {
      chip.style.color = "var(--mps-color-foreground-support)"
      return
    }

    chip.style.color = "var(--mps-color-foreground-muted)"
  }

  const diagnosticsLibraries = createElement("p", {
    textContent: `Selected libraries: ${options.handoff.selectedLibraryIds.join(", ") || "none"}`,
    testId: "wall-diagnostics-selected-libraries"
  })
  applyTelemetryChipStyle(diagnosticsLibraries, "emphasis")
  diagnosticsLibraries.style.fontSize = "0.78rem"
  diagnosticsLibraries.style.lineHeight = "1.35"

  const diagnosticsIngestion = createElement("p", {
    textContent:
      `Ingestion state: status=${options.ingestionStatus}; count=${options.ingestionItemCount}; `
      + `trigger=${options.ingestionTrigger ?? "n/a"}; fetchedAt=${options.ingestionFetchedAt ?? "pending"}; `
      + `error=${options.ingestionError ?? "none"}; reconnectAttempts=${options.reconnectAttempt}; `
      + `nextRetryMs=${options.reconnectNextDelayMs ?? "n/a"}.`,
    testId: "wall-diagnostics-ingestion-state"
  })
  applyTelemetryChipStyle(diagnosticsIngestion, "neutral")
  diagnosticsIngestion.style.fontFamily = "var(--mps-font-mono)"
  diagnosticsIngestion.style.fontSize = "0.69rem"
  diagnosticsIngestion.style.lineHeight = "1.45"

  const diagnosticsSamplingInterval = createElement("p", {
    textContent: `Sampling interval: ${options.samplingIntervalMs}ms`,
    testId: "wall-diagnostics-sampling-interval"
  })
  applyTelemetryChipStyle(diagnosticsSamplingInterval, "neutral")
  diagnosticsSamplingInterval.style.fontFamily = "var(--mps-font-mono)"
  diagnosticsSamplingInterval.style.fontSize = "0.7rem"

  const diagnosticsFps = createElement("p", {
    textContent: `FPS (last 1s): ${lastSample?.fps ?? 0}`,
    testId: "wall-diagnostics-fps"
  })
  applyTelemetryChipStyle(diagnosticsFps, "emphasis")
  diagnosticsFps.style.fontFamily = "var(--mps-font-mono)"
  diagnosticsFps.style.fontSize = "0.71rem"

  const diagnosticsMemory = createElement("p", {
    textContent: `Memory usage: ${memoryLabel}`,
    testId: "wall-diagnostics-memory"
  })
  applyTelemetryChipStyle(diagnosticsMemory, "emphasis")
  diagnosticsMemory.style.fontFamily = "var(--mps-font-mono)"
  diagnosticsMemory.style.fontSize = "0.71rem"

  const diagnosticsReconnect = createElement("p", {
    textContent:
      `Reconnect metrics: attempts=${lastSample?.reconnectAttempt ?? options.reconnectAttempt}; `
      + `nextRetryMs=${lastSample?.reconnectNextDelayMs ?? options.reconnectNextDelayMs ?? "n/a"}.`,
    testId: "wall-diagnostics-reconnect"
  })
  applyTelemetryChipStyle(diagnosticsReconnect, "neutral")
  diagnosticsReconnect.style.fontFamily = "var(--mps-font-mono)"
  diagnosticsReconnect.style.fontSize = "0.69rem"

  const diagnosticsRetention = createElement("p", {
    textContent:
      `Retention policy: ${Math.round(options.retentionMaxAgeMs / (24 * 60 * 60 * 1_000))}d / `
      + `${Math.round(options.retentionMaxBytes / (1024 * 1024))}MB; `
      + `logs=${options.diagnosticsRetentionSnapshot.count}; bytes=${options.diagnosticsRetentionSnapshot.byteSize}.`,
    testId: "wall-diagnostics-retention-policy"
  })
  applyTelemetryChipStyle(diagnosticsRetention, "neutral")
  diagnosticsRetention.style.fontFamily = "var(--mps-font-mono)"
  diagnosticsRetention.style.fontSize = "0.69rem"
  diagnosticsRetention.style.lineHeight = "1.4"

  const diagnosticsProfile = createElement("p", {
    textContent: `Profile: ${options.detailProfile}`,
    testId: "deep-settings-profile-current"
  })
  applyTelemetryChipStyle(diagnosticsProfile, "emphasis")
  diagnosticsProfile.style.fontFamily = "var(--mps-font-mono)"
  diagnosticsProfile.style.fontSize = "0.69rem"
  diagnosticsProfile.style.textTransform = "uppercase"
  diagnosticsProfile.style.letterSpacing = "0.06em"

  const diagnosticsHeading = createElement("h3", {
    textContent: "Runtime diagnostics"
  })
  diagnosticsHeading.style.margin = "0"
  diagnosticsHeading.style.fontFamily = "var(--mps-font-display)"
  diagnosticsHeading.style.fontSize = "1rem"
  diagnosticsHeading.style.lineHeight = "1.2"

  const diagnosticsSubheading = createElement("p", {
    textContent: "Telemetry stream · reconnect state · crash export"
  })
  diagnosticsSubheading.style.margin = "0"
  diagnosticsSubheading.style.fontFamily = "var(--mps-font-mono)"
  diagnosticsSubheading.style.fontSize = "0.66rem"
  diagnosticsSubheading.style.letterSpacing = "0.1em"
  diagnosticsSubheading.style.textTransform = "uppercase"
  diagnosticsSubheading.style.color = "var(--mps-color-foreground-muted)"

  const diagnosticsHeader = createElement("div")
  diagnosticsHeader.style.display = "grid"
  diagnosticsHeader.style.gap = "0.24rem"
  diagnosticsHeader.style.padding = "0.18rem 0.06rem"

  const profileToggle = createElement("button", {
    textContent:
      options.detailProfile === "balanced"
        ? "Switch profile to showcase"
        : "Switch profile to balanced",
    testId: "deep-settings-profile-toggle"
  }) as HTMLButtonElement
  profileToggle.type = "button"
  profileToggle.style.width = "fit-content"
  profileToggle.style.padding = "0.5rem 0.72rem"
  profileToggle.style.borderRadius = "0.52rem"
  profileToggle.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 64%, var(--mps-color-telemetry-muted))"
  profileToggle.style.background = "linear-gradient(135deg, color-mix(in srgb, var(--mps-color-surface-raised) 82%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 86%, black) 100%)"
  profileToggle.style.color = "var(--mps-color-foreground-support)"
  profileToggle.style.textTransform = "uppercase"
  profileToggle.style.fontSize = "0.72rem"
  profileToggle.style.letterSpacing = "0.05em"
  profileToggle.style.boxShadow = "inset 0 0 0 1px rgba(122, 217, 255, 0.08)"
  profileToggle.addEventListener("click", options.onToggleDetailProfile)

  const diagnosticsExportButton = createElement("button", {
    textContent: "Export crash package",
    testId: "diagnostics-export-crash-report"
  }) as HTMLButtonElement
  diagnosticsExportButton.type = "button"
  diagnosticsExportButton.style.width = "fit-content"
  diagnosticsExportButton.style.padding = "0.5rem 0.72rem"
  diagnosticsExportButton.style.borderRadius = "0.52rem"
  diagnosticsExportButton.style.border = "1px solid color-mix(in srgb, var(--mps-color-accent-ring) 66%, var(--mps-color-border))"
  diagnosticsExportButton.style.background = "linear-gradient(135deg, color-mix(in srgb, var(--mps-color-accent-muted) 76%, black) 0%, color-mix(in srgb, var(--mps-color-accent-soft) 65%, black) 100%)"
  diagnosticsExportButton.style.color = "var(--mps-color-foreground-emphasis)"
  diagnosticsExportButton.style.textTransform = "uppercase"
  diagnosticsExportButton.style.fontSize = "0.72rem"
  diagnosticsExportButton.style.letterSpacing = "0.05em"
  diagnosticsExportButton.style.boxShadow = "0 8px 16px rgba(12, 24, 44, 0.24), inset 0 0 0 1px rgba(122, 217, 255, 0.08)"
  diagnosticsExportButton.addEventListener("click", options.onExportCrashReport)

  const diagnosticsExportStatus = createElement("p", {
    textContent: options.diagnosticsExportError
      ? `Crash export failed: ${options.diagnosticsExportError}`
      : options.diagnosticsLastExportAt
        ? `Crash export complete at ${options.diagnosticsLastExportAt}`
        : "Crash export ready.",
    testId: "diagnostics-export-status"
  })
  diagnosticsExportStatus.style.margin = "0"
  diagnosticsExportStatus.style.color = options.diagnosticsExportError
    ? "#ffd8d8"
    : "var(--mps-color-foreground-muted)"
  diagnosticsExportStatus.style.fontFamily = "var(--mps-font-mono)"
  diagnosticsExportStatus.style.fontSize = "0.68rem"

  const diagnosticsTelemetryRail = createElement("div")
  diagnosticsTelemetryRail.style.display = "grid"
  diagnosticsTelemetryRail.style.gridTemplateColumns = "repeat(auto-fit, minmax(11.6rem, 1fr))"
  diagnosticsTelemetryRail.style.gap = "0.46rem"

  const diagnosticsActions = createElement("div")
  diagnosticsActions.style.display = "grid"
  diagnosticsActions.style.gridTemplateColumns = "repeat(auto-fit, minmax(11.6rem, max-content))"
  diagnosticsActions.style.alignItems = "center"
  diagnosticsActions.style.gap = "0.42rem"
  diagnosticsActions.style.paddingTop = "0.1rem"

  diagnosticsHeader.append(diagnosticsHeading, diagnosticsSubheading)
  diagnosticsTelemetryRail.append(
    diagnosticsLibraries,
    diagnosticsIngestion,
    diagnosticsSamplingInterval,
    diagnosticsFps,
    diagnosticsMemory,
    diagnosticsReconnect,
    diagnosticsRetention,
    diagnosticsProfile
  )
  diagnosticsActions.append(profileToggle, diagnosticsExportButton, diagnosticsExportStatus)

  diagnosticsPanel.append(
    diagnosticsHeader,
    diagnosticsTelemetryRail,
    diagnosticsActions
  )

  return diagnosticsPanel
}
