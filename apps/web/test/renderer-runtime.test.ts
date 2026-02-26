import { describe, expect, it, vi } from "vitest";

import { createRendererFoundation } from "@mps/core";

import {
  createProbeWebGLContextGetter,
  resolveWallSceneRoute,
  setVisibilityForMode,
  shouldRenderWallScene
} from "../src/scene";

interface RafHarness {
  readonly requestFrame: (callback: FrameRequestCallback) => number;
  readonly cancelFrame: (requestId: number) => void;
  readonly requestIds: number[];
  readonly cancelledIds: number[];
  runFrame: (requestId: number, timestamp: number) => void;
}

function createRafHarness(): RafHarness {
  let frameId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const requestIds: number[] = [];
  const cancelledIds: number[] = [];

  return {
    requestFrame: (callback) => {
      frameId += 1;
      requestIds.push(frameId);
      callbacks.set(frameId, callback);

      return frameId;
    },
    cancelFrame: (requestId) => {
      cancelledIds.push(requestId);
      callbacks.delete(requestId);
    },
    requestIds,
    cancelledIds,
    runFrame: (requestId, timestamp) => {
      callbacks.get(requestId)?.(timestamp);
    }
  };
}

function createMockCanvas(getContextResult: WebGLRenderingContext | null): HTMLCanvasElement {
  return {
    getContext: vi.fn(() => getContextResult)
  } as unknown as HTMLCanvasElement;
}

describe("renderer-runtime", () => {
  it("selects primary mode when WebGL is available and cancels raf on stop/dispose", () => {
    const raf = createRafHarness();
    const frameSpy = vi.fn();
    const lifecycleSpy = {
      start: vi.fn(),
      stop: vi.fn(),
      dispose: vi.fn()
    };

    const renderer = createRendererFoundation({
      canvas: createMockCanvas({} as WebGLRenderingContext),
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
      now: () => 0,
      onFrame: frameSpy,
      onStart: lifecycleSpy.start,
      onStop: lifecycleSpy.stop,
      onDispose: lifecycleSpy.dispose
    });

    expect(renderer.mode).toBe("primary");
    expect(renderer.status).toBe("idle");

    renderer.start();

    expect(renderer.status).toBe("running");
    expect(raf.requestIds).toEqual([1]);
    expect(lifecycleSpy.start).toHaveBeenCalledWith("primary");

    raf.runFrame(1, 16);
    expect(frameSpy).toHaveBeenCalledWith({
      timestamp: 16,
      deltaMs: 0,
      elapsedMs: 16
    });
    expect(raf.requestIds).toEqual([1, 2]);

    renderer.stop();
    expect(renderer.status).toBe("stopped");
    expect(raf.cancelledIds).toEqual([2]);
    expect(lifecycleSpy.stop).toHaveBeenCalledWith("primary");

    renderer.dispose();
    expect(renderer.status).toBe("disposed");
    expect(lifecycleSpy.dispose).toHaveBeenCalledWith("primary");

    renderer.start();
    expect(renderer.status).toBe("disposed");
    expect(raf.requestIds).toEqual([1, 2]);
  });

  it("selects fallback mode when WebGL is unavailable and does not schedule raf", () => {
    const raf = createRafHarness();
    const modeSpy = vi.fn();

    const renderer = createRendererFoundation({
      canvas: createMockCanvas(null),
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
      modePreference: "auto",
      onModeResolved: modeSpy
    });

    expect(renderer.mode).toBe("fallback");
    expect(modeSpy).toHaveBeenCalledWith("fallback");

    renderer.start();
    expect(renderer.status).toBe("running");
    expect(raf.requestIds).toHaveLength(0);

    renderer.stop();
    expect(renderer.status).toBe("stopped");
    expect(raf.cancelledIds).toHaveLength(0);
  });

  it("keeps primary mode detection valid when render canvas already has 2d context", () => {
    const renderGetContext = vi.fn(() => {
      throw new Error("render canvas should not be used for WebGL probe");
    });

    const renderCanvas = {
      getContext: renderGetContext
    } as unknown as HTMLCanvasElement;

    const probeGetContext = vi.fn((contextId: string) => {
      if (contextId === "webgl") {
        return {} as WebGLRenderingContext;
      }

      return null;
    });

    const renderer = createRendererFoundation({
      canvas: renderCanvas,
      requestFrame: () => 1,
      cancelFrame: () => undefined,
      now: () => 0,
      getWebGLContext: createProbeWebGLContextGetter(
        () => ({ getContext: probeGetContext }) as unknown as HTMLCanvasElement
      )
    });

    expect(renderer.mode).toBe("primary");
    expect(renderGetContext).not.toHaveBeenCalled();
    expect(probeGetContext).toHaveBeenCalledWith("webgl");
  });

  it("applies deterministic fallback-only visibility for scene layers", () => {
    const frontLayer = {
      hidden: false,
      style: { display: "block" }
    } as unknown as HTMLCanvasElement;
    const backLayer = {
      hidden: false,
      style: { display: "block" }
    } as unknown as HTMLCanvasElement;
    const fallbackLayer = {
      hidden: false,
      style: { display: "grid" }
    } as unknown as HTMLElement;
    const rootLayer = {
      dataset: {}
    } as unknown as HTMLElement;

    setVisibilityForMode("fallback", {
      front: frontLayer,
      back: backLayer,
      fallback: fallbackLayer,
      root: rootLayer
    });

    expect(backLayer.hidden).toBe(true);
    expect(frontLayer.hidden).toBe(true);
    expect(fallbackLayer.hidden).toBe(false);
    expect(backLayer.style.display).toBe("none");
    expect(frontLayer.style.display).toBe("none");
    expect(fallbackLayer.style.display).toBe("grid");
    expect(rootLayer.dataset.rendererMode).toBe("fallback");
  });

  it("applies deterministic primary visibility for scene layers", () => {
    const frontLayer = {
      hidden: true,
      style: { display: "none" }
    } as unknown as HTMLCanvasElement;
    const backLayer = {
      hidden: true,
      style: { display: "none" }
    } as unknown as HTMLCanvasElement;
    const fallbackLayer = {
      hidden: false,
      style: { display: "grid" }
    } as unknown as HTMLElement;
    const rootLayer = {
      dataset: {}
    } as unknown as HTMLElement;

    setVisibilityForMode("primary", {
      front: frontLayer,
      back: backLayer,
      fallback: fallbackLayer,
      root: rootLayer
    });

    expect(backLayer.hidden).toBe(false);
    expect(frontLayer.hidden).toBe(false);
    expect(fallbackLayer.hidden).toBe(true);
    expect(backLayer.style.display).toBe("block");
    expect(frontLayer.style.display).toBe("block");
    expect(fallbackLayer.style.display).toBe("none");
    expect(rootLayer.dataset.rendererMode).toBe("primary");
  });

  it("handles /wall?mode=test query routing deterministically", () => {
    expect(shouldRenderWallScene(new URL("https://mps.local/wall?mode=test"))).toBe(true);
    expect(shouldRenderWallScene(new URL("https://mps.local/wall?seed=baseline-1&profile=showcase"))).toBe(true);
    expect(shouldRenderWallScene(new URL("https://mps.local/wall?seed=baseline-1&profile=balanced"))).toBe(true);
    expect(shouldRenderWallScene(new URL("https://mps.local/wall?mode=demo"))).toBe(false);
    expect(shouldRenderWallScene(new URL("https://mps.local/wall?seed=baseline-1"))).toBe(false);
    expect(shouldRenderWallScene(new URL("https://mps.local/?mode=test"))).toBe(false);

    const routeMatch = resolveWallSceneRoute(new URL("https://mps.local/wall?seed=baseline-1&profile=showcase"));
    expect(routeMatch).toEqual({
      mode: "cinematic",
      seed: "baseline-1",
      profile: "showcase"
    });
  });

  it("keeps mode precedence and strict seed/profile parsing contracts", () => {
    expect(
      resolveWallSceneRoute(new URL("https://mps.local/wall?mode=test&seed=baseline-1&profile=showcase"))
    ).toEqual({
      mode: "test",
      seed: "mode-test",
      profile: "balanced"
    });

    expect(resolveWallSceneRoute(new URL("https://mps.local/wall?seed=%20%20&profile=showcase"))).toBeNull();
    expect(resolveWallSceneRoute(new URL("https://mps.local/wall?seed=baseline-1&profile=experimental"))).toBeNull();
    expect(resolveWallSceneRoute(new URL("https://mps.local/wall?seed=baseline-1&profile=SHOWCASE"))).toBeNull();
  });
});
