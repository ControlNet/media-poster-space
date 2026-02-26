import { describe, expect, it } from "vitest";

import {
  computeOledHighlightAreaRatio,
  createOledCinematicControllerState,
  evaluateOledRiskState,
  OLED_MICRO_SHIFT_CADENCE_MS,
  OLED_PROFILE_RELAYOUT_INTERVAL_MS,
  OLED_THRESHOLD_GUARDS,
  tickOledCinematicController
} from "../src";

const SAFE_METRICS = {
  focusStaticMs: 0,
  highlightStaticMs: 0,
  highlightAreaRatio: 0
};

describe("oled cinematic drift", () => {
  it("uses profile relayout cadence of 60s showcase and 90s balanced", () => {
    const showcaseInitial = createOledCinematicControllerState({ profile: "showcase", seed: "baseline-1" });
    const showcaseBeforeCadence = tickOledCinematicController(showcaseInitial, {
      nowMs: OLED_PROFILE_RELAYOUT_INTERVAL_MS.showcase - 1,
      metrics: SAFE_METRICS
    });
    expect(showcaseBeforeCadence.relayoutTriggered).toBe(false);

    const showcaseAtCadence = tickOledCinematicController(showcaseBeforeCadence.state, {
      nowMs: OLED_PROFILE_RELAYOUT_INTERVAL_MS.showcase,
      metrics: SAFE_METRICS
    });
    expect(showcaseAtCadence.relayoutTriggered).toBe(true);
    expect(showcaseAtCadence.metrics.relayoutReason).toBe("profile-cycle");

    const balancedInitial = createOledCinematicControllerState({ profile: "balanced", seed: "baseline-1" });
    const balancedBeforeCadence = tickOledCinematicController(balancedInitial, {
      nowMs: OLED_PROFILE_RELAYOUT_INTERVAL_MS.balanced - 1,
      metrics: SAFE_METRICS
    });
    expect(balancedBeforeCadence.relayoutTriggered).toBe(false);

    const balancedAtCadence = tickOledCinematicController(balancedBeforeCadence.state, {
      nowMs: OLED_PROFILE_RELAYOUT_INTERVAL_MS.balanced,
      metrics: SAFE_METRICS
    });
    expect(balancedAtCadence.relayoutTriggered).toBe(true);
    expect(balancedAtCadence.metrics.relayoutReason).toBe("profile-cycle");
  });

  it("advances global micro-shift every 45s cadence", () => {
    const initial = createOledCinematicControllerState({ profile: "balanced", seed: "micro-shift-seed" });

    const beforeCadence = tickOledCinematicController(initial, {
      nowMs: OLED_MICRO_SHIFT_CADENCE_MS - 1,
      metrics: SAFE_METRICS
    });
    expect(beforeCadence.microShiftAdvanced).toBe(false);
    expect(beforeCadence.state.microShiftCount).toBe(0);

    const atCadence = tickOledCinematicController(beforeCadence.state, {
      nowMs: OLED_MICRO_SHIFT_CADENCE_MS,
      metrics: SAFE_METRICS
    });
    expect(atCadence.microShiftAdvanced).toBe(true);
    expect(atCadence.state.microShiftCount).toBe(1);
    expect(atCadence.state.lastMicroShiftAtMs).toBe(OLED_MICRO_SHIFT_CADENCE_MS);
    expect(atCadence.state.microShift).not.toEqual({ x: 0, y: 0 });
  });

  it("triggers early relayout when risk thresholds are breached before profile cadence", () => {
    const initial = createOledCinematicControllerState({ profile: "showcase", seed: "risk-seed" });

    const safeTick = tickOledCinematicController(initial, {
      nowMs: 20_000,
      metrics: SAFE_METRICS
    });
    expect(safeTick.relayoutTriggered).toBe(false);

    const riskTick = tickOledCinematicController(safeTick.state, {
      nowMs: 21_000,
      metrics: {
        focusStaticMs: 12_100,
        highlightStaticMs: 0,
        highlightAreaRatio: 0.02
      }
    });
    expect(riskTick.relayoutTriggered).toBe(true);
    expect(riskTick.metrics.relayoutReason).toBe("risk-trigger");
    expect(riskTick.metrics.relayoutCount).toBe(1);

    const repeatedRiskTick = tickOledCinematicController(riskTick.state, {
      nowMs: 22_000,
      metrics: {
        focusStaticMs: 12_800,
        highlightStaticMs: 0,
        highlightAreaRatio: 0.02
      }
    });
    expect(repeatedRiskTick.relayoutTriggered).toBe(false);
  });

  it("exports threshold metrics including highlight area ratio and relayout counters", () => {
    const areaRatio = computeOledHighlightAreaRatio({
      highlightRadiusPx: 36,
      widthPx: 320,
      heightPx: 180
    });
    expect(areaRatio).toBeCloseTo((Math.PI * 36 * 36) / (320 * 180), 6);

    const riskState = evaluateOledRiskState({
      focusStaticMs: 12_001,
      highlightStaticMs: 15_001,
      highlightAreaRatio: 0.121
    });
    expect(riskState.atRisk).toBe(true);
    expect(riskState.breaches).toEqual(["focus-static", "highlight-static", "highlight-area"]);

    const snapshot = tickOledCinematicController(
      createOledCinematicControllerState({ profile: "showcase", seed: "threshold-seed" }),
      {
        nowMs: 12_000,
        metrics: {
          focusStaticMs: 12_001,
          highlightStaticMs: 15_001,
          highlightAreaRatio: 0.121
        }
      }
    );

    expect(snapshot.metrics.focusStaticMs).toBe(12_001);
    expect(snapshot.metrics.highlightStaticMs).toBe(15_001);
    expect(snapshot.metrics.highlightAreaRatio).toBe(0.121);
    expect(snapshot.metrics.relayoutReason).toBe("risk-trigger");
    expect(snapshot.metrics.relayoutCount).toBe(1);
    expect(snapshot.metrics.thresholds).toEqual(OLED_THRESHOLD_GUARDS);

    expect(OLED_THRESHOLD_GUARDS.focusStaticMsMax).toBe(12_000);
    expect(OLED_THRESHOLD_GUARDS.highlightStaticMsMax).toBe(15_000);
    expect(OLED_THRESHOLD_GUARDS.highlightAreaRatioMax).toBe(0.12);
  });
});
