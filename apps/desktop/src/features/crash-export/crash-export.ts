import type { DiagnosticsLogEntry } from "../diagnostics/runtime-diagnostics"

const REDACTED_VALUE = "[REDACTED]"

const SENSITIVE_KEY_PATTERN = /(token|password|passwd|pwd|authorization|raw[-_]?auth|secret|api[-_]?key)/i

const SENSITIVE_STRING_PATTERNS: Array<{
  pattern: RegExp
  replace: string
}> = [
  {
    pattern: /(authorization\s*[:=]\s*)([^\n\r,;]+)/gi,
    replace: `$1${REDACTED_VALUE}`
  },
  {
    pattern: /(x-emby-authorization\s*[:=]\s*)([^\n\r,;]+)/gi,
    replace: `$1${REDACTED_VALUE}`
  },
  {
    pattern: /(x-mediabrowser-token\s*[:=]\s*)([^\n\r,;]+)/gi,
    replace: `$1${REDACTED_VALUE}`
  },
  {
    pattern: /(bearer\s+)([a-z0-9._~+/=-]+)/gi,
    replace: `$1${REDACTED_VALUE}`
  },
  {
    pattern: /((?:access[_-]?token|refresh[_-]?token|token|password|passwd|pwd)\s*[:=]\s*)([^\s,;]+)/gi,
    replace: `$1${REDACTED_VALUE}`
  }
]

export interface CrashReportPackage {
  schemaVersion: 1
  generatedAt: string
  version: string
  configSummary: Record<string, unknown>
  logs: DiagnosticsLogEntry[]
  context?: Record<string, unknown>
}

export interface CrashReportPackageInput {
  version: string
  configSummary: Record<string, unknown>
  logs: readonly DiagnosticsLogEntry[]
  context?: Record<string, unknown>
  generatedAt?: Date
}

function isSensitiveKey(pathSegment: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(pathSegment)
}

function redactString(value: string): string {
  return SENSITIVE_STRING_PATTERNS.reduce(
    (redacted, rule) => redacted.replace(rule.pattern, rule.replace),
    value
  )
}

export function redactCrashExportValue(value: unknown, keyPath: readonly string[] = []): unknown {
  if (keyPath.some((segment) => isSensitiveKey(segment))) {
    return REDACTED_VALUE
  }

  if (typeof value === "string") {
    return redactString(value)
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => redactCrashExportValue(item, [...keyPath, String(index)]))
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const redactedRecord: Record<string, unknown> = {}
  for (const [key, entryValue] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      redactedRecord[key] = REDACTED_VALUE
      continue
    }

    redactedRecord[key] = redactCrashExportValue(entryValue, [...keyPath, key])
  }

  return redactedRecord
}

export function createCrashReportPackage(input: CrashReportPackageInput): CrashReportPackage {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString()

  const basePackage = {
    schemaVersion: 1 as const,
    generatedAt,
    version: redactString(input.version),
    configSummary: redactCrashExportValue(input.configSummary) as Record<string, unknown>,
    logs: input.logs.map((entry) => redactCrashExportValue(entry) as DiagnosticsLogEntry)
  }

  if (input.context === undefined) {
    return basePackage
  }

  return {
    ...basePackage,
    context: redactCrashExportValue(input.context) as Record<string, unknown>
  }
}

export function serializeCrashReportPackage(pkg: CrashReportPackage): string {
  return `${JSON.stringify(pkg, null, 2)}\n`
}

export function exportCrashReportPackageLocally(pkg: CrashReportPackage, fileNamePrefix = "mps-crash-report"): string {
  const fileName = `${fileNamePrefix}-${pkg.generatedAt.replace(/[.:]/g, "-")}.json`

  if (typeof document === "undefined" || typeof Blob === "undefined") {
    return fileName
  }

  if (typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") {
    return fileName
  }

  const blob = new Blob([serializeCrashReportPackage(pkg)], {
    type: "application/json"
  })

  const objectUrl = URL.createObjectURL(blob)
  const downloadLink = document.createElement("a")
  downloadLink.href = objectUrl
  downloadLink.download = fileName
  downloadLink.style.display = "none"
  document.body.append(downloadLink)
  downloadLink.click()
  downloadLink.remove()
  URL.revokeObjectURL(objectUrl)

  return fileName
}
