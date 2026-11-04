// Throwaway: size/time of exporting the diagnostics log at ~6 days of 1 Hz samples.
import { createDiagnosticsLogStore } from "../../../../packages/core/src/runtime/diagnostics.ts";
const START = Date.UTC(2026, 10, 1);
let nowMs = START;
const store = createDiagnosticsLogStore({ now: () => nowMs });
for (let second = 1; second <= 518_400; second += 1) {
  nowMs = START + second * 1000;
  store.append({
    timestamp: new Date(nowMs).toISOString(),
    level: "info",
    event: "diagnostics.sample",
    details: { fps: 60, memoryMb: 123.4, reconnectAttempt: 0, reconnectNextDelayMs: null }
  });
}
const t0 = performance.now();
const logs = store.snapshot();
const json = JSON.stringify({ logs }, null, 2);
console.log(`entries=${logs.length} prettyJsonChars=${(json.length / 1e6).toFixed(1)}M snapshot+stringifyMs=${(performance.now() - t0).toFixed(0)}`);
