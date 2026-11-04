// Throwaway: measure in-memory growth of the diagnostics log store when fed
// one "diagnostics.sample" entry per second (as onboarding-shared.ts does).
import { createDiagnosticsLogStore } from "../../../../packages/core/src/runtime/diagnostics.ts";

const START = Date.UTC(2026, 10, 1);
let nowMs = START;
const store = createDiagnosticsLogStore({ now: () => nowMs });

globalThis.gc?.();
const baseHeap = process.memoryUsage().heapUsed;
const t0 = performance.now();
const checkpoints = new Set([3600, 86_400, 3 * 86_400, 6 * 86_400, 7 * 86_400]);
for (let second = 1; second <= 7 * 86_400; second += 1) {
  nowMs = START + second * 1000;
  store.append({
    timestamp: new Date(nowMs).toISOString(),
    level: "info",
    event: "diagnostics.sample",
    details: { fps: 60, memoryMb: 123.4, reconnectAttempt: 0, reconnectNextDelayMs: null }
  });
  if (checkpoints.has(second)) {
    globalThis.gc?.();
    const snap = store.getRetentionSnapshot();
    const heapMb = (process.memoryUsage().heapUsed - baseHeap) / 1048576;
    console.log(
      `t=${(second / 3600).toFixed(1)}h entries=${snap.count} accountedBytes=${(snap.byteSize / 1048576).toFixed(1)}MB heapDelta=${heapMb.toFixed(1)}MB elapsed=${((performance.now() - t0) / 1000).toFixed(1)}s`
    );
  }
}
