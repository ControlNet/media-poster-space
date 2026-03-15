import { describe, expect, it } from "vitest";

import { computeOledHighlightAreaRatio, OLED_THRESHOLD_GUARDS } from "@mps/core";

import {
  createWallSceneOledController,
  resolveBackLayerHighlightRadius,
  resolveWallSceneRoute
} from "../src/scene";

describe("oled risk trigger integration", () => {
  it("keeps /wall?mode=test route support while enabling cinematic seed/profile routing", () => {
    const testRoute = resolveWallSceneRoute(new URL("https://mps.local/wall?mode=test"));
    expect(testRoute).toEqual({
      mode: "test",
      seed: "mode-test",
      profile: "balanced"
    });

    const cinematicRoute = resolveWallSceneRoute(
      new URL("https://mps.local/wall?seed=baseline-1&profile=showcase")
    );
    expect(cinematicRoute).toEqual({
      mode: "cinematic",
      seed: "baseline-1",
      profile: "showcase"
    });

    const pagesRoute = resolveWallSceneRoute(
      new URL("https://mps.local/media-poster-space/wall?mode=test"),
      "/media-poster-space/"
    );
    expect(pagesRoute).toEqual({
      mode: "test",
      seed: "mode-test",
      profile: "balanced"
    });
  });

  it("triggers early relayout from risk state before showcase cadence interval", () => {
    const controller = createWallSceneOledController({
      seed: "baseline-1",
      profile: "showcase"
    });

    const safeSnapshot = controller.tick({
      nowMs: 20_000,
      metrics: {
        focusStaticMs: 1_000,
        highlightStaticMs: 1_000,
        highlightAreaRatio: 0.02
      }
    });
    expect(safeSnapshot.relayoutTriggered).toBe(false);

    const riskSnapshot = controller.tick({
      nowMs: 21_000,
      metrics: {
        focusStaticMs: 12_050,
        highlightStaticMs: 1_000,
        highlightAreaRatio: 0.02
      }
    });

    expect(riskSnapshot.relayoutTriggered).toBe(true);
    expect(riskSnapshot.metrics.relayoutReason).toBe("risk-trigger");
    expect(riskSnapshot.metrics.relayoutCount).toBe(1);
    expect(riskSnapshot.state.layoutEpoch).toBe(1);
  });

  it("triggers risk relayout when highlight-static exceeds threshold", () => {
    const controller = createWallSceneOledController({
      seed: "baseline-1",
      profile: "balanced"
    });

    controller.tick({
      nowMs: 5_000,
      metrics: {
        focusStaticMs: 1_200,
        highlightStaticMs: 1_500,
        highlightAreaRatio: 0.03
      }
    });

    const riskSnapshot = controller.tick({
      nowMs: 5_200,
      metrics: {
        focusStaticMs: 1_200,
        highlightStaticMs: 15_001,
        highlightAreaRatio: 0.03
      }
    });

    expect(riskSnapshot.relayoutTriggered).toBe(true);
    expect(riskSnapshot.metrics.relayoutReason).toBe("risk-trigger");
    expect(riskSnapshot.risk.breaches).toContain("highlight-static");
  });

  it("triggers risk relayout when highlight-area exceeds threshold", () => {
    const controller = createWallSceneOledController({
      seed: "baseline-1",
      profile: "showcase"
    });

    const riskSnapshot = controller.tick({
      nowMs: 1_000,
      metrics: {
        focusStaticMs: 500,
        highlightStaticMs: 500,
        highlightAreaRatio: OLED_THRESHOLD_GUARDS.highlightAreaRatioMax + 0.0001
      }
    });

    expect(riskSnapshot.relayoutTriggered).toBe(true);
    expect(riskSnapshot.metrics.relayoutReason).toBe("risk-trigger");
    expect(riskSnapshot.risk.breaches).toContain("highlight-area");
  });

  it("keeps profile-cycle relayout independent from risk-trigger latching", () => {
    const controller = createWallSceneOledController({
      seed: "baseline-1",
      profile: "showcase"
    });

    const profileCycleSnapshot = controller.tick({
      nowMs: 60_001,
      metrics: {
        focusStaticMs: 200,
        highlightStaticMs: 200,
        highlightAreaRatio: 0.01
      }
    });

    expect(profileCycleSnapshot.relayoutTriggered).toBe(true);
    expect(profileCycleSnapshot.metrics.relayoutReason).toBe("profile-cycle");
    expect(profileCycleSnapshot.metrics.relayoutCountByReason["profile-cycle"]).toBe(1);
    expect(profileCycleSnapshot.metrics.relayoutCountByReason["risk-trigger"]).toBe(0);
  });

  it("keeps rendered highlight area ratio within OLED threshold guard", () => {
    const cinematicViewport = { width: 1280, height: 720 };
    const radius = resolveBackLayerHighlightRadius(cinematicViewport);
    const ratio = computeOledHighlightAreaRatio({
      highlightRadiusPx: radius,
      widthPx: cinematicViewport.width,
      heightPx: cinematicViewport.height
    });

    expect(Number(ratio.toFixed(6))).toBeLessThanOrEqual(OLED_THRESHOLD_GUARDS.highlightAreaRatioMax);
    expect(Number(ratio.toFixed(6))).toBeLessThan(0.496372);
  });
});
