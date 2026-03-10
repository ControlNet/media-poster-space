import {
  computeOledHighlightAreaRatio,
  computeOledLayerMotion,
  createOledCinematicControllerState,
  createRendererFoundation,
  OLED_THRESHOLD_GUARDS,
  tickOledCinematicController,
  type OledCinematicControllerSnapshot,
  type OledCinematicControllerState,
  type OledMetricExport,
  type OledRiskMetricsInput,
  type OledSceneProfile,
  type RendererFoundation,
  type RendererFrameInfo,
  type RendererMode
} from "@mps/core";
import { resolveWallSceneRoute } from "./route";

type ProbeCanvasElement = Pick<HTMLCanvasElement, "getContext">;

interface MotionSample {
  x: number;
  y: number;
  radius?: number;
}

interface StaticMotionTracker {
  previous: MotionSample | null;
  lastChangedAtMs: number;
}

interface WallSceneLayerFocus {
  focusX: number;
  focusY: number;
}

interface WallSceneLayerHighlight {
  centerX: number;
  centerY: number;
  radius: number;
}

export interface WallSceneOledController {
  readonly profile: OledSceneProfile;
  readonly seed: string;
  getState: () => OledCinematicControllerState;
  tick: (options: { nowMs: number; metrics: OledRiskMetricsInput }) => OledCinematicControllerSnapshot;
}

export interface WallSceneRuntime {
  readonly mode: RendererMode;
  readonly rootElement: HTMLElement;
  readonly renderer: RendererFoundation;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

function createLayerCanvas(testId: "scene-layer-front" | "scene-layer-back", zIndex: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.dataset.testid = testId;
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.zIndex = String(zIndex);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.pointerEvents = "none";

  return canvas;
}

export function createProbeWebGLContextGetter(
  createProbeCanvas: () => ProbeCanvasElement = () => document.createElement("canvas")
): (canvas: HTMLCanvasElement) => WebGLRenderingContext | null {
  return () => {
    try {
      const probeCanvas = createProbeCanvas();
      const context = probeCanvas.getContext("webgl") ?? probeCanvas.getContext("experimental-webgl");

      return context as WebGLRenderingContext | null;
    } catch {
      return null;
    }
  };
}

function resolveWallSceneRuntimeMode(): {
  mode: "test" | "cinematic";
  profile: OledSceneProfile;
  seed: string;
} {
  const fallback = {
    mode: "test" as const,
    profile: "balanced" as const,
    seed: "mode-test"
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  const routeMatch = resolveWallSceneRoute(new URL(window.location.href));
  if (!routeMatch) {
    return fallback;
  }

  return routeMatch;
}

export function createWallSceneOledController(options: {
  profile: OledSceneProfile;
  seed: string;
  nowMs?: number;
}): WallSceneOledController {
  let state = createOledCinematicControllerState(options);

  return {
    profile: state.profile,
    seed: state.seed,
    getState: () => state,
    tick: (input) => {
      const snapshot = tickOledCinematicController(state, input);
      state = snapshot.state;
      return snapshot;
    }
  };
}

function resizeCanvasToContainer(canvas: HTMLCanvasElement, container: HTMLElement): {
  width: number;
  height: number;
} {
  const targetWidth = Math.max(1, Math.round(container.clientWidth || window.innerWidth || 1280));
  const targetHeight = Math.max(1, Math.round(container.clientHeight || window.innerHeight || 720));

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  return {
    width: targetWidth,
    height: targetHeight
  };
}

export function resolveBackLayerHighlightRadius(dimensions: { width: number; height: number }): number {
  const width = Math.max(1, Math.round(dimensions.width));
  const height = Math.max(1, Math.round(dimensions.height));
  const preferredRadius = Math.max(width, height) * 0.3;
  const thresholdSafeRadius =
    Math.sqrt((width * height * OLED_THRESHOLD_GUARDS.highlightAreaRatioMax) / Math.PI) * 0.98;

  return Math.max(1, Math.min(preferredRadius, thresholdSafeRadius));
}

function renderBackLayer(
  context: CanvasRenderingContext2D,
  dimensions: { width: number; height: number },
  frame: RendererFrameInfo,
  motion: { offsetX: number; offsetY: number }
): WallSceneLayerHighlight {
  const { width, height } = dimensions;
  const progress = frame.elapsedMs / 1000;

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#020202");
  gradient.addColorStop(0.5, "#070d19");
  gradient.addColorStop(1, "#0f1c2f");

  context.clearRect(0, 0, width, height);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const duskMesh = context.createRadialGradient(
    width * (0.18 + Math.sin(progress * 0.11) * 0.03),
    height * 0.22,
    0,
    width * 0.18,
    height * 0.22,
    Math.max(width, height) * 0.7
  );
  duskMesh.addColorStop(0, "rgba(122, 217, 255, 0.16)");
  duskMesh.addColorStop(0.5, "rgba(71, 136, 176, 0.1)");
  duskMesh.addColorStop(1, "rgba(12, 23, 42, 0)");
  context.fillStyle = duskMesh;
  context.fillRect(0, 0, width, height);

  const depthMesh = context.createRadialGradient(
    width * 0.84,
    height * (0.86 + Math.cos(progress * 0.09) * 0.02),
    0,
    width * 0.84,
    height * 0.86,
    Math.max(width, height) * 0.74
  );
  depthMesh.addColorStop(0, "rgba(210, 166, 90, 0.12)");
  depthMesh.addColorStop(0.55, "rgba(59, 47, 31, 0.1)");
  depthMesh.addColorStop(1, "rgba(6, 10, 18, 0)");
  context.fillStyle = depthMesh;
  context.fillRect(0, 0, width, height);

  context.save();
  for (let index = 0; index < 26; index += 1) {
    const seed = index * 19.137;
    const sparkleX = ((Math.sin(seed + progress * 0.16) * 0.5 + 0.5) * width + motion.offsetX * 0.12) % width;
    const sparkleY = ((Math.cos(seed * 0.7 + progress * 0.14) * 0.5 + 0.5) * height + motion.offsetY * 0.12) % height;
    const alpha = 0.08 + (Math.sin(progress * 1.3 + index * 0.8) * 0.5 + 0.5) * 0.2;
    const size = 1 + (index % 3) * 0.6;
    context.fillStyle = `rgba(122, 217, 255, ${alpha.toFixed(3)})`;
    context.fillRect(sparkleX, sparkleY, size, size);
  }
  context.restore();

  context.save();
  context.globalAlpha = 0.14;
  context.strokeStyle = "rgba(122, 217, 255, 0.22)";
  context.lineWidth = 1;
  const telemetryStep = Math.max(36, Math.min(width, height) * 0.075);
  const telemetryOffset = (progress * 24 + motion.offsetX * 0.1) % telemetryStep;
  for (let x = -telemetryStep; x < width + telemetryStep; x += telemetryStep) {
    context.beginPath();
    context.moveTo(x + telemetryOffset, 0);
    context.lineTo(x + telemetryOffset, height);
    context.stroke();
  }
  context.globalAlpha = 0.08;
  for (let y = -telemetryStep; y < height + telemetryStep; y += telemetryStep) {
    context.beginPath();
    context.moveTo(0, y + telemetryOffset * 0.35);
    context.lineTo(width, y + telemetryOffset * 0.35);
    context.stroke();
  }
  context.restore();

  const pulseX = width * (0.5 + Math.sin(progress * 0.31) * 0.16) + motion.offsetX;
  const pulseY = height * (0.5 + Math.cos(progress * 0.43) * 0.12) + motion.offsetY;
  const radius = resolveBackLayerHighlightRadius(dimensions);

  const pulse = context.createRadialGradient(pulseX, pulseY, 0, pulseX, pulseY, radius);
  pulse.addColorStop(0, "rgba(122, 217, 255, 0.42)");
  pulse.addColorStop(0.4, "rgba(122, 217, 255, 0.2)");
  pulse.addColorStop(1, "rgba(122, 217, 255, 0)");
  context.fillStyle = pulse;
  context.fillRect(0, 0, width, height);

  const accent = context.createRadialGradient(
    pulseX + Math.cos(progress * 0.6) * radius * 0.16,
    pulseY + Math.sin(progress * 0.55) * radius * 0.1,
    0,
    pulseX,
    pulseY,
    radius * 0.75
  );
  accent.addColorStop(0, "rgba(210, 166, 90, 0.28)");
  accent.addColorStop(1, "rgba(210, 166, 90, 0)");
  context.fillStyle = accent;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(122, 217, 255, 0.24)";
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.0018);
  context.setLineDash([Math.max(8, radius * 0.05), Math.max(10, radius * 0.08)]);
  for (let ring = 0; ring < 3; ring += 1) {
    const ringRadius = radius * (0.52 + ring * 0.22 + Math.sin(progress * 0.65 + ring) * 0.02);
    context.beginPath();
    context.arc(pulseX, pulseY, ringRadius, 0, Math.PI * 2);
    context.stroke();
  }
  context.setLineDash([]);
  context.restore();

  return {
    centerX: pulseX,
    centerY: pulseY,
    radius
  };
}

function renderFrontLayer(
  context: CanvasRenderingContext2D,
  dimensions: { width: number; height: number },
  frame: RendererFrameInfo,
  motion: { offsetX: number; offsetY: number; parallaxFactor: number }
): WallSceneLayerFocus {
  const { width, height } = dimensions;
  const progress = frame.elapsedMs / 1000;

  context.clearRect(0, 0, width, height);
  const markerRadius = Math.max(8, Math.min(width, height) * 0.018 * motion.parallaxFactor);
  const markerX = width * (0.52 + Math.sin(progress * 0.9) * 0.2) + motion.offsetX;
  const markerY = height * (0.5 + Math.cos(progress * 0.65) * 0.14) + motion.offsetY;

  context.save();
  context.strokeStyle = "rgba(122, 217, 255, 0.2)";
  context.lineWidth = 1;
  for (let index = 0; index < 6; index += 1) {
    const sweep = (index + 1) / 7;
    const crest = Math.sin(progress * 0.85 + index * 0.7) * height * 0.065 + motion.offsetY * 0.24;
    const startY = height * sweep;
    context.beginPath();
    context.moveTo(0, startY + crest);
    context.quadraticCurveTo(width * 0.5, startY - crest * 0.55, width, startY + crest * 0.42);
    context.stroke();
  }
  context.restore();

  context.save();
  context.strokeStyle = "rgba(210, 166, 90, 0.2)";
  context.lineWidth = 1;
  const bandSpacing = Math.max(24, Math.min(width, height) * 0.06);
  for (let offset = -height; offset < width + height; offset += bandSpacing) {
    context.beginPath();
    context.moveTo(offset + (progress * 16 + motion.offsetX * 0.2), height);
    context.lineTo(offset + bandSpacing * 0.85 + (progress * 16 + motion.offsetX * 0.2), 0);
    context.stroke();
  }
  context.restore();

  const glow = context.createRadialGradient(markerX, markerY, 0, markerX, markerY, markerRadius * 7.6);
  glow.addColorStop(0, "rgba(122, 217, 255, 0.28)");
  glow.addColorStop(0.55, "rgba(122, 217, 255, 0.08)");
  glow.addColorStop(1, "rgba(122, 217, 255, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(122, 217, 255, 0.48)";
  context.lineWidth = Math.max(1, markerRadius * 0.1);
  context.beginPath();
  context.arc(markerX, markerY, markerRadius * 2.25, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = "rgba(210, 166, 90, 0.42)";
  context.lineWidth = Math.max(1, markerRadius * 0.09);
  context.beginPath();
  context.arc(markerX, markerY, markerRadius * 1.35, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = "rgba(244, 239, 228, 0.28)";
  context.lineWidth = Math.max(1, markerRadius * 0.08);
  context.beginPath();
  context.moveTo(markerX - markerRadius * 3.3, markerY);
  context.lineTo(markerX + markerRadius * 3.3, markerY);
  context.moveTo(markerX, markerY - markerRadius * 3.3);
  context.lineTo(markerX, markerY + markerRadius * 3.3);
  context.stroke();

  context.fillStyle = "rgba(244, 239, 228, 0.76)";
  context.beginPath();
  context.arc(markerX, markerY, markerRadius, 0, Math.PI * 2);
  context.fill();

  return {
    focusX: markerX,
    focusY: markerY
  };
}

function updateStaticMotionDuration(
  tracker: StaticMotionTracker,
  sample: MotionSample,
  nowMs: number,
  movementThresholdPx: number
): number {
  const normalizedNowMs = Math.max(0, Math.round(nowMs));

  if (!tracker.previous) {
    tracker.previous = sample;
    tracker.lastChangedAtMs = normalizedNowMs;
    return 0;
  }

  const previous = tracker.previous;
  const movementDelta = Math.hypot(sample.x - previous.x, sample.y - previous.y);
  const radiusDelta = Math.abs((sample.radius ?? 0) - (previous.radius ?? 0));

  if (movementDelta + radiusDelta > movementThresholdPx) {
    tracker.lastChangedAtMs = normalizedNowMs;
  }

  tracker.previous = sample;
  return Math.max(0, normalizedNowMs - tracker.lastChangedAtMs);
}

function applyOledMetricsDataset(target: HTMLElement, metricsElement: HTMLElement, metrics: OledMetricExport): void {
  const serializedRatio = metrics.highlightAreaRatio.toFixed(6);

  target.dataset.oledFocusStaticMs = String(metrics.focusStaticMs);
  target.dataset.oledHighlightStaticMs = String(metrics.highlightStaticMs);
  target.dataset.oledHighlightAreaRatio = serializedRatio;
  target.dataset.oledRelayoutReason = metrics.relayoutReason;
  target.dataset.oledRelayoutCount = String(metrics.relayoutCount);
  target.dataset.oledRelayoutCountProfileCycle = String(metrics.relayoutCountByReason["profile-cycle"]);
  target.dataset.oledRelayoutCountRiskTrigger = String(metrics.relayoutCountByReason["risk-trigger"]);

  metricsElement.dataset.focusStaticMs = String(metrics.focusStaticMs);
  metricsElement.dataset.highlightStaticMs = String(metrics.highlightStaticMs);
  metricsElement.dataset.highlightAreaRatio = serializedRatio;
  metricsElement.dataset.relayoutReason = metrics.relayoutReason;
  metricsElement.dataset.relayoutCount = String(metrics.relayoutCount);
  metricsElement.dataset.relayoutCountProfileCycle = String(metrics.relayoutCountByReason["profile-cycle"]);
  metricsElement.dataset.relayoutCountRiskTrigger = String(metrics.relayoutCountByReason["risk-trigger"]);
  metricsElement.dataset.thresholdFocusMaxMs = String(metrics.thresholds.focusStaticMsMax);
  metricsElement.dataset.thresholdHighlightMaxMs = String(metrics.thresholds.highlightStaticMsMax);
  metricsElement.dataset.thresholdHighlightAreaMax = String(metrics.thresholds.highlightAreaRatioMax);
  metricsElement.textContent = JSON.stringify({
    focusStaticMs: metrics.focusStaticMs,
    highlightStaticMs: metrics.highlightStaticMs,
    highlightAreaRatio: serializedRatio,
    relayoutReason: metrics.relayoutReason,
    relayoutCount: metrics.relayoutCount
  });
}

export function setVisibilityForMode(mode: RendererMode, layers: {
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  fallback: HTMLElement;
  root: HTMLElement;
}): void {
  const isPrimary = mode === "primary";

  layers.back.hidden = !isPrimary;
  layers.front.hidden = !isPrimary;
  layers.fallback.hidden = isPrimary;
  layers.back.style.display = isPrimary ? "block" : "none";
  layers.front.style.display = isPrimary ? "block" : "none";
  layers.fallback.style.display = isPrimary ? "none" : "grid";
  layers.root.dataset.rendererMode = mode;
}

export function createWallSceneRuntime(target: HTMLElement): WallSceneRuntime {
  const runtimeRoute = resolveWallSceneRuntimeMode();
  const oledController = createWallSceneOledController({
    profile: runtimeRoute.profile,
    seed: runtimeRoute.seed
  });

  const focusTracker: StaticMotionTracker = {
    previous: null,
    lastChangedAtMs: 0
  };
  const highlightTracker: StaticMotionTracker = {
    previous: null,
    lastChangedAtMs: 0
  };

  const rootElement = document.createElement("section");
  rootElement.dataset.testid = "wall-scene";
  rootElement.dataset.sceneMode = runtimeRoute.mode;
  rootElement.dataset.sceneProfile = runtimeRoute.profile;
  rootElement.dataset.sceneSeed = runtimeRoute.seed;
  rootElement.style.position = "relative";
  rootElement.style.minHeight = "100vh";
  rootElement.style.overflow = "hidden";
  rootElement.style.perspective = "2000px";
  rootElement.style.background = [
    "radial-gradient(circle at 22% 74%, rgba(122, 217, 255, 0.18) 0%, transparent 48%)",
    "radial-gradient(circle at 82% 8%, rgba(69, 111, 135, 0.22) 0%, transparent 56%)",
    "linear-gradient(145deg, #020202 0%, #070d19 52%, #0f1c2f 100%)"
  ].join(", ");

  const backLayer = createLayerCanvas("scene-layer-back", 1);
  const frontLayer = createLayerCanvas("scene-layer-front", 3);
  const fallbackLayer = document.createElement("article");
  fallbackLayer.dataset.testid = "scene-fallback-css";
  fallbackLayer.style.position = "relative";
  fallbackLayer.style.zIndex = "2";
  fallbackLayer.style.minHeight = "100vh";
  fallbackLayer.style.display = "grid";
  fallbackLayer.style.placeItems = "center";
  fallbackLayer.style.padding = "clamp(1.5rem, 4vw, 3rem)";
  fallbackLayer.style.color = "var(--mps-color-foreground)";
  fallbackLayer.style.fontFamily = "var(--mps-font-body)";
  fallbackLayer.style.background =
    "radial-gradient(circle at 22% 76%, rgba(122, 217, 255, 0.22), transparent 48%), radial-gradient(circle at 82% 6%, rgba(69, 111, 135, 0.18), transparent 52%), linear-gradient(145deg, #020202 0%, #070d19 52%, #0f1c2f 100%)";
  fallbackLayer.innerHTML = [
    "<div style=\"display:grid;gap:0.75rem;max-width:42ch;padding:1.5rem;border:1px solid color-mix(in srgb, var(--mps-color-orbit-glow-halo) 72%, var(--mps-color-border));background:linear-gradient(156deg, rgba(4,9,19,0.82) 0%, rgba(12,27,48,0.72) 100%);box-shadow:var(--mps-elevation-orbit);backdrop-filter:blur(10px);\">",
    "<p style=\"margin:0;font-size:0.72rem;letter-spacing:0.22em;text-transform:uppercase;color:var(--mps-color-telemetry);font-family:var(--mps-font-mono);\">Afterglow Orbit</p>",
    "<h1 style=\"margin:0;font-size:clamp(1.5rem,4vw,2.5rem);font-family:var(--mps-font-display);text-shadow:0 0 16px color-mix(in srgb, var(--mps-color-orbit-glow) 52%, transparent);\">CSS fallback scene</h1>",
    "<p style=\"margin:0;color:var(--mps-color-foreground-muted);\">",
    "WebGL is unavailable in this runtime, so the wall scene remains readable with layered CSS-only Afterglow Orbit visuals.",
    "</p>",
    "</div>"
  ].join("");

  const oledMetrics = document.createElement("output");
  oledMetrics.dataset.testid = "scene-oled-metrics";
  oledMetrics.hidden = true;

  rootElement.append(backLayer, fallbackLayer, frontLayer, oledMetrics);
  target.append(rootElement);

  applyOledMetricsDataset(rootElement, oledMetrics, {
    focusStaticMs: 0,
    highlightStaticMs: 0,
    highlightAreaRatio: 0,
    relayoutReason: "none",
    relayoutCount: 0,
    relayoutCountByReason: {
      "profile-cycle": 0,
      "risk-trigger": 0
    },
    thresholds: OLED_THRESHOLD_GUARDS
  });

  const backContext = backLayer.getContext("2d");
  const frontContext = frontLayer.getContext("2d");

  const renderer = createRendererFoundation({
    canvas: backLayer,
    getWebGLContext: createProbeWebGLContextGetter(),
    onModeResolved: (mode) => {
      setVisibilityForMode(mode, {
        root: rootElement,
        front: frontLayer,
        back: backLayer,
        fallback: fallbackLayer
      });
    },
    onFrame: (frame) => {
      if (!backContext || !frontContext) {
        return;
      }

      const backDimensions = resizeCanvasToContainer(backLayer, rootElement);
      const frontDimensions = resizeCanvasToContainer(frontLayer, rootElement);

      const controllerState = oledController.getState();
      const backMotion = computeOledLayerMotion({
        elapsedMs: frame.elapsedMs,
        widthPx: backDimensions.width,
        heightPx: backDimensions.height,
        layer: "back",
        state: controllerState
      });
      const frontMotion = computeOledLayerMotion({
        elapsedMs: frame.elapsedMs,
        widthPx: frontDimensions.width,
        heightPx: frontDimensions.height,
        layer: "front",
        state: controllerState
      });

      const backHighlight = renderBackLayer(backContext, backDimensions, frame, backMotion);
      const frontFocus = renderFrontLayer(frontContext, frontDimensions, frame, frontMotion);

      const nowMs = Math.max(0, Math.round(frame.elapsedMs));
      const focusStaticMs = updateStaticMotionDuration(
        focusTracker,
        {
          x: frontFocus.focusX,
          y: frontFocus.focusY
        },
        nowMs,
        1.35
      );
      const highlightStaticMs = updateStaticMotionDuration(
        highlightTracker,
        {
          x: backHighlight.centerX,
          y: backHighlight.centerY,
          radius: backHighlight.radius
        },
        nowMs,
        1.35
      );
      const highlightAreaRatio = computeOledHighlightAreaRatio({
        highlightRadiusPx: backHighlight.radius,
        widthPx: backDimensions.width,
        heightPx: backDimensions.height
      });

      const snapshot = oledController.tick({
        nowMs,
        metrics: {
          focusStaticMs,
          highlightStaticMs,
          highlightAreaRatio
        }
      });

      applyOledMetricsDataset(rootElement, oledMetrics, snapshot.metrics);

    },
    onStop: () => {
      if (!backContext || !frontContext) {
        return;
      }

      backContext.clearRect(0, 0, backLayer.width, backLayer.height);
      frontContext.clearRect(0, 0, frontLayer.width, frontLayer.height);
      focusTracker.previous = null;
      focusTracker.lastChangedAtMs = 0;
      highlightTracker.previous = null;
      highlightTracker.lastChangedAtMs = 0;
    }
  });

  return {
    get mode() {
      return renderer.mode;
    },
    rootElement,
    renderer,
    start: () => {
      renderer.start();
    },
    stop: () => {
      renderer.stop();
    },
    dispose: () => {
      renderer.dispose();
      rootElement.remove();
    }
  };
}
