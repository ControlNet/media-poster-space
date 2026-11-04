export const DIAGNOSTICS_SAMPLING_INTERVAL_MS = 1_000
export const DIAGNOSTICS_RETENTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000
export const DIAGNOSTICS_RETENTION_MAX_BYTES = 100 * 1024 * 1024
export const DIAGNOSTICS_RETENTION_MAX_ENTRIES = 20_000

export interface DiagnosticsReconnectMetrics {
  attempt: number
  nextDelayMs: number | null
}

export interface DiagnosticsSample {
  sampledAt: string
  fps: number
  memoryMb: number | null
  reconnectAttempt: number
  reconnectNextDelayMs: number | null
}

export interface DiagnosticsLogEntry {
  timestamp: string
  level: "info" | "warn" | "error"
  event: string
  details?: unknown
}

interface DiagnosticsLogEntryInternal {
  timestamp: string
  timestampMs: number
  level: "info" | "warn" | "error"
  event: string
  details?: unknown
  byteSize: number
}

export interface DiagnosticsLogRetentionSnapshot {
  count: number
  byteSize: number
  maxAgeMs: number
  maxByteSize: number
  maxEntries: number
}

export interface DiagnosticsLogStore {
  append: (entry: DiagnosticsLogEntry) => DiagnosticsLogRetentionSnapshot
  snapshot: () => DiagnosticsLogEntry[]
  getRetentionSnapshot: () => DiagnosticsLogRetentionSnapshot
  clear: () => void
}

export interface DiagnosticsSampler {
  start: () => void
  dispose: () => void
}

function estimateByteSize(value: unknown): number {
  const serialized = JSON.stringify(value)
  if (!serialized) {
    return 2
  }

  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(serialized).byteLength
  }

  return serialized.length * 2
}

function toFiniteNumber(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value) || value < 0) {
    return null
  }

  return value
}

// A late or coalesced interval tick covers more than one sampling window, so the raw
// frame count has to be scaled by the time that actually elapsed.
function toFramesPerSecond(frameCount: number, elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return frameCount
  }

  return Math.round((frameCount * 1_000) / elapsedMs)
}

function resolveHeapUsageMb(): number | null {
  const maybePerformance = globalThis.performance as Performance & {
    memory?: {
      usedJSHeapSize?: number
    }
  }

  const heapSize = maybePerformance.memory?.usedJSHeapSize
  const normalized = toFiniteNumber(heapSize)
  if (normalized === null) {
    return null
  }

  return Math.round((normalized / (1024 * 1024)) * 10) / 10
}

function cloneLogEntry(entry: DiagnosticsLogEntryInternal): DiagnosticsLogEntry {
  const baseEntry = {
    timestamp: entry.timestamp,
    level: entry.level,
    event: entry.event
  }

  if (entry.details === undefined) {
    return baseEntry
  }

  return {
    ...baseEntry,
    details: entry.details
  }
}

export function createDiagnosticsLogStore(options: {
  now?: () => number
  maxAgeMs?: number
  maxByteSize?: number
  maxEntries?: number
} = {}): DiagnosticsLogStore {
  const now = options.now ?? Date.now
  const maxAgeMs = options.maxAgeMs ?? DIAGNOSTICS_RETENTION_MAX_AGE_MS
  const maxByteSize = options.maxByteSize ?? DIAGNOSTICS_RETENTION_MAX_BYTES
  const maxEntries = Math.max(1, Math.trunc(options.maxEntries ?? DIAGNOSTICS_RETENTION_MAX_ENTRIES))

  // Entries before `head` are already pruned. Advancing an index instead of calling
  // `shift()` keeps appends O(1) once the store is at capacity.
  let entries: DiagnosticsLogEntryInternal[] = []
  let head = 0
  let totalByteSize = 0

  const liveCount = (): number => entries.length - head

  const toSnapshot = (): DiagnosticsLogRetentionSnapshot => ({
    count: liveCount(),
    byteSize: totalByteSize,
    maxAgeMs,
    maxByteSize,
    maxEntries
  })

  const dropOldest = (): void => {
    const oldest = entries[head]
    if (!oldest) {
      return
    }

    head += 1
    totalByteSize -= oldest.byteSize
  }

  const compact = (): void => {
    if (head > 1_024 && head * 2 > entries.length) {
      entries = entries.slice(head)
      head = 0
    }
  }

  const prune = (): void => {
    const cutoffMs = now() - maxAgeMs

    while (liveCount() > 0) {
      const oldest = entries[head]
      if (!oldest || oldest.timestampMs >= cutoffMs) {
        break
      }

      dropOldest()
    }

    while (liveCount() > 0 && (totalByteSize > maxByteSize || liveCount() > maxEntries)) {
      dropOldest()
    }

    totalByteSize = Math.max(0, totalByteSize)
    compact()
  }

  return {
    append: (entry) => {
      const timestampMs = Number.parseInt(String(Date.parse(entry.timestamp)), 10)
      const normalizedTimestampMs = Number.isFinite(timestampMs) ? timestampMs : now()

      const nextEntryBase = {
        timestamp: Number.isFinite(timestampMs) ? entry.timestamp : new Date(normalizedTimestampMs).toISOString(),
        timestampMs: normalizedTimestampMs,
        level: entry.level,
        event: entry.event
      }

      const nextEntry = entry.details === undefined
        ? {
            ...nextEntryBase,
            byteSize: estimateByteSize(nextEntryBase)
          }
        : {
            ...nextEntryBase,
            details: entry.details,
            byteSize: estimateByteSize({
              ...nextEntryBase,
              details: entry.details
            })
          }

      entries.push(nextEntry)
      totalByteSize += nextEntry.byteSize
      prune()
      return toSnapshot()
    },
    snapshot: () => entries.slice(head).map(cloneLogEntry),
    getRetentionSnapshot: () => toSnapshot(),
    clear: () => {
      entries = []
      head = 0
      totalByteSize = 0
    }
  }
}

export function createDiagnosticsSampler(options: {
  onSample: (sample: DiagnosticsSample) => void
  getReconnectMetrics: () => DiagnosticsReconnectMetrics
  getMemoryUsageMb?: () => number | null
  now?: () => number
  setIntervalFn?: typeof setInterval
  clearIntervalFn?: typeof clearInterval
  requestAnimationFrameFn?: (callback: FrameRequestCallback) => number
  cancelAnimationFrameFn?: (handle: number) => void
}): DiagnosticsSampler {
  const now = options.now ?? Date.now
  const readMemoryUsageMb = options.getMemoryUsageMb ?? resolveHeapUsageMb
  const setIntervalFn = options.setIntervalFn ?? setInterval
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval
  const requestAnimationFrameFn = options.requestAnimationFrameFn
    ?? globalThis.requestAnimationFrame?.bind(globalThis)
    ?? null
  const cancelAnimationFrameFn = options.cancelAnimationFrameFn
    ?? globalThis.cancelAnimationFrame?.bind(globalThis)
    ?? null

  let intervalId: ReturnType<typeof setInterval> | null = null
  let animationFrameId: number | null = null
  let frameCounter = 0
  let lastSampleAtMs = 0
  let started = false

  const queueAnimationFrame = (): void => {
    if (!started || !requestAnimationFrameFn) {
      return
    }

    animationFrameId = requestAnimationFrameFn(() => {
      frameCounter += 1
      queueAnimationFrame()
    })
  }

  const sampleNow = (): void => {
    const reconnectMetrics = options.getReconnectMetrics()
    const sampledAtMs = now()
    const sample: DiagnosticsSample = {
      sampledAt: new Date(sampledAtMs).toISOString(),
      fps: toFramesPerSecond(frameCounter, sampledAtMs - lastSampleAtMs),
      memoryMb: toFiniteNumber(readMemoryUsageMb()),
      reconnectAttempt: Math.max(0, Math.trunc(reconnectMetrics.attempt)),
      reconnectNextDelayMs:
        typeof reconnectMetrics.nextDelayMs === "number"
          ? Math.max(0, Math.trunc(reconnectMetrics.nextDelayMs))
          : null
    }

    frameCounter = 0
    lastSampleAtMs = sampledAtMs
    options.onSample(sample)
  }

  return {
    start: () => {
      if (started) {
        return
      }

      started = true
      frameCounter = 0
      lastSampleAtMs = now()
      queueAnimationFrame()
      intervalId = setIntervalFn(sampleNow, DIAGNOSTICS_SAMPLING_INTERVAL_MS)
    },
    dispose: () => {
      if (!started) {
        return
      }

      started = false

      if (intervalId !== null) {
        clearIntervalFn(intervalId)
        intervalId = null
      }

      if (animationFrameId !== null && cancelAnimationFrameFn) {
        cancelAnimationFrameFn(animationFrameId)
        animationFrameId = null
      }

      frameCounter = 0
    }
  }
}
