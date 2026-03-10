import { describe, expect, it, vi } from "vitest"

import {
  DIAGNOSTICS_SAMPLING_INTERVAL_MS,
  createOnboardingDiagnosticsController,
  createDiagnosticsLogStore,
  createDiagnosticsSampler
} from "../src/features/diagnostics/runtime-diagnostics"
import {
  createCrashReportPackage,
  serializeCrashReportPackage
} from "../src/features/crash-export/crash-export"

describe("web diagnostics sampling and crash export", () => {
  it("samples on an exact 1000ms interval", () => {
    let nowMs = 1_700_000_000_000
    let scheduledIntervalMs: number | null = null
    let intervalCallback: () => void = () => undefined
    let rafCallback: (timestamp: number) => void = () => undefined
    let clearedIntervalId: number | null = null
    let canceledRafId: number | null = null

    const samples: Array<{ fps: number; reconnectAttempt: number; reconnectNextDelayMs: number | null }> = []

    const sampler = createDiagnosticsSampler({
      now: () => nowMs,
      getReconnectMetrics: () => ({
        attempt: 3,
        nextDelayMs: 2_000
      }),
      onSample: (sample) => {
        samples.push({
          fps: sample.fps,
          reconnectAttempt: sample.reconnectAttempt,
          reconnectNextDelayMs: sample.reconnectNextDelayMs
        })
      },
      setIntervalFn: ((callback: TimerHandler, interval?: number) => {
        scheduledIntervalMs = Number(interval)
        intervalCallback = callback as () => void
        return 11 as unknown as ReturnType<typeof setInterval>
      }) as unknown as typeof setInterval,
      clearIntervalFn: ((id: ReturnType<typeof setInterval>) => {
        clearedIntervalId = Number(id)
      }) as typeof clearInterval,
      requestAnimationFrameFn: (callback) => {
        rafCallback = callback
        return 22
      },
      cancelAnimationFrameFn: (id) => {
        canceledRafId = id
      }
    })

    sampler.start()

    expect(scheduledIntervalMs).toBe(DIAGNOSTICS_SAMPLING_INTERVAL_MS)
    expect(intervalCallback).toBeTypeOf("function")
    expect(rafCallback).toBeTypeOf("function")

    rafCallback(nowMs)
    rafCallback(nowMs + 16)
    rafCallback(nowMs + 33)

    nowMs += DIAGNOSTICS_SAMPLING_INTERVAL_MS
    intervalCallback()

    expect(samples).toHaveLength(1)
    expect(samples[0]).toEqual({
      fps: 3,
      reconnectAttempt: 3,
      reconnectNextDelayMs: 2_000
    })

    sampler.dispose()
    expect(clearedIntervalId).toBe(11)
    expect(canceledRafId).toBe(22)
  })

  it("routes diagnostics ticks to diagnostics-only render requests", () => {
    vi.useFakeTimers()

    const diagnosticsRenderRequests: Array<{
      reconnectAttempt: number
      reconnectNextDelayMs: number | null
    }> = []
    const appendedEvents: string[] = []
    let wallRouteActive = true

    const controller = createOnboardingDiagnosticsController({
      state: {
        reconnectAttempt: 7,
        reconnectNextDelayMs: 1_000
      },
      logStore: {
        append: (entry) => {
          appendedEvents.push(entry.event)
        }
      },
      isWallRouteActive: () => wallRouteActive,
      onDiagnosticsRenderRequest: (sample) => {
        diagnosticsRenderRequests.push({
          reconnectAttempt: sample.reconnectAttempt,
          reconnectNextDelayMs: sample.reconnectNextDelayMs
        })
      },
      samplingIntervalMs: DIAGNOSTICS_SAMPLING_INTERVAL_MS
    })

    try {
      controller.startSampling()
      vi.advanceTimersByTime(DIAGNOSTICS_SAMPLING_INTERVAL_MS)

      expect(controller.getLatestSample()).not.toBeNull()
      expect(diagnosticsRenderRequests).toHaveLength(1)
      expect(diagnosticsRenderRequests[0]).toEqual({
        reconnectAttempt: 7,
        reconnectNextDelayMs: 1_000
      })
      expect(appendedEvents).toContain("diagnostics.sample")

      wallRouteActive = false
      vi.advanceTimersByTime(DIAGNOSTICS_SAMPLING_INTERVAL_MS)

      expect(controller.getLatestSample()).not.toBeNull()
      expect(diagnosticsRenderRequests).toHaveLength(1)
    } finally {
      controller.stopSampling()
      vi.useRealTimers()
    }
  })

  it("normalizes reconnect and memory diagnostics sample values", () => {
    let intervalCallback: () => void = () => undefined
    let cleared = false
    const samples: Array<{
      memoryMb: number | null
      reconnectAttempt: number
      reconnectNextDelayMs: number | null
    }> = []

    const sampler = createDiagnosticsSampler({
      now: () => 1_700_000_000_000,
      getReconnectMetrics: () => ({
        attempt: -3,
        nextDelayMs: -250
      }),
      getMemoryUsageMb: () => Number.NaN,
      onSample: (sample) => {
        samples.push({
          memoryMb: sample.memoryMb,
          reconnectAttempt: sample.reconnectAttempt,
          reconnectNextDelayMs: sample.reconnectNextDelayMs
        })
      },
      setIntervalFn: ((callback: TimerHandler) => {
        intervalCallback = callback as () => void
        return 17 as unknown as ReturnType<typeof setInterval>
      }) as unknown as typeof setInterval,
      clearIntervalFn: (() => {
        cleared = true
      }) as typeof clearInterval,
      requestAnimationFrameFn: () => 88,
      cancelAnimationFrameFn: () => undefined
    })

    sampler.start()
    intervalCallback()
    sampler.dispose()

    expect(samples).toEqual([
      {
        memoryMb: null,
        reconnectAttempt: 0,
        reconnectNextDelayMs: 0
      }
    ])
    expect(cleared).toBe(true)
  })

  it("enforces retention with 7-day/100MB policy knobs", () => {
    let nowMs = 50_000
    const store = createDiagnosticsLogStore({
      now: () => nowMs,
      maxAgeMs: 2_000,
      maxByteSize: 10_000
    })

    store.append({
      timestamp: new Date(nowMs - 4_000).toISOString(),
      level: "info",
      event: "old-event",
      details: {
        note: "expired"
      }
    })

    store.append({
      timestamp: new Date(nowMs).toISOString(),
      level: "info",
      event: "active-event",
      details: {
        payload: "x".repeat(20)
      }
    })

    const snapshot = store.snapshot()
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0]?.event).toBe("active-event")
    expect(store.getRetentionSnapshot().maxAgeMs).toBe(2_000)
    expect(store.getRetentionSnapshot().maxByteSize).toBe(10_000)
    expect(store.getRetentionSnapshot().byteSize).toBeGreaterThan(0)

    nowMs += 5_000
    store.append({
      timestamp: new Date(nowMs).toISOString(),
      level: "info",
      event: "fresh-event"
    })

    const postPruneSnapshot = store.snapshot()
    expect(postPruneSnapshot).toHaveLength(1)
    expect(postPruneSnapshot[0]?.event).toBe("fresh-event")
  })

  it("builds crash export with required fields and strict redaction", () => {
    const crashPackage = createCrashReportPackage({
      version: "0.1.0",
      configSummary: {
        env: "release",
        password: "plaintext-password",
        auth: {
          token: "abc123",
          rawAuthHeaders: {
            Authorization: "Bearer leaked-token"
          }
        }
      },
      logs: [
        {
          timestamp: "2026-02-25T00:00:00.000Z",
          level: "error",
          event: "runtime.failure",
          details: {
            token: "secret-token",
            password: "secret-password",
            headers: {
              authorization: "Bearer very-secret"
            },
            message: "authorization: Bearer still-secret"
          }
        }
      ]
    })

    expect(crashPackage.logs.length).toBe(1)
    expect(crashPackage.version).toBe("0.1.0")
    expect(crashPackage.configSummary).toBeTruthy()

    const serialized = serializeCrashReportPackage(crashPackage)
    expect(serialized).toContain("\"logs\"")
    expect(serialized).toContain("\"version\"")
    expect(serialized).toContain("\"configSummary\"")

    const forbiddenPatterns = [
      /secret-token/i,
      /secret-password/i,
      /plaintext-password/i,
      /very-secret/i,
      /leaked-token/i,
      /still-secret/i,
      /authorization\s*:\s*bearer\s+[a-z0-9._~+/=-]+/i,
      /token\s*[:=]\s*[a-z0-9._~+/=-]+/i,
      /password\s*[:=]\s*[^\s,;]+/i
    ]

    for (const pattern of forbiddenPatterns) {
      expect(serialized).not.toMatch(pattern)
    }

    expect(serialized).toContain("[REDACTED]")
  })

  it("redacts sensitive context payloads while preserving schema metadata", () => {
    const crashPackage = createCrashReportPackage({
      version: "0.1.0",
      configSummary: {
        env: "release"
      },
      logs: [],
      context: {
        apiKey: "context-secret",
        nested: {
          authorization: "Bearer context-token"
        },
        list: [
          "token=context-secret",
          "password=context-password"
        ]
      }
    })

    const serialized = serializeCrashReportPackage(crashPackage)

    expect(crashPackage.schemaVersion).toBe(1)
    expect(serialized).toContain("\"schemaVersion\"")
    expect(serialized).toContain("[REDACTED]")
    expect(serialized).not.toMatch(/context-secret/i)
    expect(serialized).not.toMatch(/context-token/i)
    expect(serialized).not.toMatch(/context-password/i)
  })
})
