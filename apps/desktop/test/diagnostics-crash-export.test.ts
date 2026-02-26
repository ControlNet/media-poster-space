import { describe, expect, it } from "vitest"

import {
  DIAGNOSTICS_SAMPLING_INTERVAL_MS,
  createDiagnosticsLogStore,
  createDiagnosticsSampler
} from "../src/features/diagnostics/runtime-diagnostics"
import {
  createCrashReportPackage,
  serializeCrashReportPackage
} from "../src/features/crash-export/crash-export"

describe("desktop diagnostics sampling and crash export", () => {
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
        attempt: 4,
        nextDelayMs: 4_000
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
        return 33 as unknown as ReturnType<typeof setInterval>
      }) as unknown as typeof setInterval,
      clearIntervalFn: ((id: ReturnType<typeof setInterval>) => {
        clearedIntervalId = Number(id)
      }) as typeof clearInterval,
      requestAnimationFrameFn: (callback) => {
        rafCallback = callback
        return 44
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

    nowMs += DIAGNOSTICS_SAMPLING_INTERVAL_MS
    intervalCallback()

    expect(samples).toHaveLength(1)
    expect(samples[0]).toEqual({
      fps: 2,
      reconnectAttempt: 4,
      reconnectNextDelayMs: 4_000
    })

    sampler.dispose()
    expect(clearedIntervalId).toBe(33)
    expect(canceledRafId).toBe(44)
  })

  it("enforces retention with 7-day/100MB policy knobs", () => {
    let nowMs = 75_000
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
})
