export type OledSceneProfile = "balanced" | "showcase";
export type OledRelayoutReason = "profile-cycle" | "risk-trigger";
export type OledRiskBreach = "focus-static" | "highlight-static" | "highlight-area";

export interface OledRiskMetricsInput {
  focusStaticMs: number;
  highlightStaticMs: number;
  highlightAreaRatio: number;
}

export interface OledThresholdGuards {
  focusStaticMsMax: number;
  highlightStaticMsMax: number;
  highlightAreaRatioMax: number;
}

export interface OledRiskState {
  atRisk: boolean;
  breaches: OledRiskBreach[];
  metrics: OledRiskMetricsInput;
  thresholds: OledThresholdGuards;
}

export interface OledMicroShiftVector {
  x: number;
  y: number;
}

export interface OledCinematicControllerState {
  profile: OledSceneProfile;
  seed: string;
  layoutEpoch: number;
  lastRelayoutAtMs: number;
  relayoutCount: number;
  relayoutCountByReason: Record<OledRelayoutReason, number>;
  lastRelayoutReason: OledRelayoutReason | "none";
  lastMicroShiftAtMs: number;
  microShiftCount: number;
  microShift: OledMicroShiftVector;
  riskLatchActive: boolean;
}

export interface OledMetricExport {
  focusStaticMs: number;
  highlightStaticMs: number;
  highlightAreaRatio: number;
  relayoutReason: OledRelayoutReason | "none";
  relayoutCount: number;
  relayoutCountByReason: Record<OledRelayoutReason, number>;
  thresholds: OledThresholdGuards;
}

export interface OledCinematicControllerSnapshot {
  state: OledCinematicControllerState;
  risk: OledRiskState;
  metrics: OledMetricExport;
  relayoutTriggered: boolean;
  microShiftAdvanced: boolean;
}

export interface OledLayerMotionInput {
  elapsedMs: number;
  widthPx: number;
  heightPx: number;
  layer: "back" | "front";
  state: OledCinematicControllerState;
}

export interface OledLayerMotion {
  offsetX: number;
  offsetY: number;
  parallaxFactor: number;
}

export const OLED_PROFILE_RELAYOUT_INTERVAL_MS: Record<OledSceneProfile, number> = Object.freeze({
  balanced: 90_000,
  showcase: 60_000
});

export const OLED_MICRO_SHIFT_CADENCE_MS = 45_000;

export const OLED_THRESHOLD_GUARDS: OledThresholdGuards = Object.freeze({
  focusStaticMsMax: 12_000,
  highlightStaticMsMax: 15_000,
  highlightAreaRatioMax: 0.12
});

const UINT32_MODULUS = 0x1_0000_0000;
const TWO_PI = Math.PI * 2;
const HORIZONTAL_DRIFT_PERIOD_MS = 72_000;

function normalizeTimelineMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeMetricMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function normalizeRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return Math.round(value * 1_000_000) / 1_000_000;
}

function hashToUnitInterval(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / UINT32_MODULUS;
}

function createMicroShiftVector(seed: string, microShiftCount: number): OledMicroShiftVector {
  const xUnit = hashToUnitInterval(`${seed}:micro:${microShiftCount}:x`) * 2 - 1;
  const yUnit = hashToUnitInterval(`${seed}:micro:${microShiftCount}:y`) * 2 - 1;

  return {
    x: Math.round(xUnit * 8 * 1000) / 1000,
    y: Math.round(yUnit * 5 * 1000) / 1000
  };
}

function normalizeProfile(profile: OledSceneProfile | undefined): OledSceneProfile {
  return profile === "showcase" ? "showcase" : "balanced";
}

function normalizeSeed(seed: string | undefined): string {
  const normalized = (seed ?? "baseline-1").trim();
  return normalized.length > 0 ? normalized : "baseline-1";
}

function normalizeRiskMetrics(input: OledRiskMetricsInput): OledRiskMetricsInput {
  return {
    focusStaticMs: normalizeMetricMs(input.focusStaticMs),
    highlightStaticMs: normalizeMetricMs(input.highlightStaticMs),
    highlightAreaRatio: normalizeRatio(input.highlightAreaRatio)
  };
}

export function resolveOledRelayoutIntervalMs(profile: OledSceneProfile): number {
  return OLED_PROFILE_RELAYOUT_INTERVAL_MS[normalizeProfile(profile)];
}

export function computeOledHighlightAreaRatio(options: {
  highlightRadiusPx: number;
  widthPx: number;
  heightPx: number;
}): number {
  const radius = Number.isFinite(options.highlightRadiusPx) ? Math.max(0, options.highlightRadiusPx) : 0;
  const width = Number.isFinite(options.widthPx) ? Math.max(0, options.widthPx) : 0;
  const height = Number.isFinite(options.heightPx) ? Math.max(0, options.heightPx) : 0;
  const totalArea = width * height;

  if (radius === 0 || totalArea <= 0) {
    return 0;
  }

  return normalizeRatio((Math.PI * radius * radius) / totalArea);
}

export function evaluateOledRiskState(
  input: OledRiskMetricsInput,
  thresholds: OledThresholdGuards = OLED_THRESHOLD_GUARDS
): OledRiskState {
  const metrics = normalizeRiskMetrics(input);
  const breaches: OledRiskBreach[] = [];

  if (metrics.focusStaticMs > thresholds.focusStaticMsMax) {
    breaches.push("focus-static");
  }

  if (metrics.highlightStaticMs > thresholds.highlightStaticMsMax) {
    breaches.push("highlight-static");
  }

  if (metrics.highlightAreaRatio > thresholds.highlightAreaRatioMax) {
    breaches.push("highlight-area");
  }

  return {
    atRisk: breaches.length > 0,
    breaches,
    metrics,
    thresholds
  };
}

export function createOledCinematicControllerState(options: {
  profile?: OledSceneProfile;
  seed?: string;
  nowMs?: number;
}): OledCinematicControllerState {
  const profile = normalizeProfile(options.profile);
  const seed = normalizeSeed(options.seed);
  const nowMs = normalizeTimelineMs(options.nowMs ?? 0);

  return {
    profile,
    seed,
    layoutEpoch: 0,
    lastRelayoutAtMs: nowMs,
    relayoutCount: 0,
    relayoutCountByReason: {
      "profile-cycle": 0,
      "risk-trigger": 0
    },
    lastRelayoutReason: "none",
    lastMicroShiftAtMs: nowMs,
    microShiftCount: 0,
    microShift: {
      x: 0,
      y: 0
    },
    riskLatchActive: false
  };
}

export function tickOledCinematicController(
  state: OledCinematicControllerState,
  options: {
    nowMs: number;
    metrics: OledRiskMetricsInput;
  }
): OledCinematicControllerSnapshot {
  const nowMs = normalizeTimelineMs(options.nowMs);
  const risk = evaluateOledRiskState(options.metrics);
  const relayoutIntervalMs = resolveOledRelayoutIntervalMs(state.profile);

  const elapsedSinceRelayoutMs = Math.max(0, nowMs - state.lastRelayoutAtMs);
  const profileRelayoutDue = elapsedSinceRelayoutMs >= relayoutIntervalMs;
  const riskRelayoutDue = risk.atRisk && !state.riskLatchActive;

  let relayoutReason: OledRelayoutReason | "none" = "none";
  if (riskRelayoutDue) {
    relayoutReason = "risk-trigger";
  } else if (profileRelayoutDue) {
    relayoutReason = "profile-cycle";
  }

  const relayoutTriggered = relayoutReason !== "none";
  const nextRelayoutCountByReason: Record<OledRelayoutReason, number> = {
    "profile-cycle": state.relayoutCountByReason["profile-cycle"],
    "risk-trigger": state.relayoutCountByReason["risk-trigger"]
  };

  if (relayoutReason === "risk-trigger") {
    nextRelayoutCountByReason["risk-trigger"] += 1;
  }

  if (relayoutReason === "profile-cycle") {
    nextRelayoutCountByReason["profile-cycle"] += 1;
  }

  let microShiftCount = state.microShiftCount;
  let lastMicroShiftAtMs = state.lastMicroShiftAtMs;
  let microShift = state.microShift;
  let microShiftAdvanced = false;

  const elapsedSinceMicroShiftMs = Math.max(0, nowMs - state.lastMicroShiftAtMs);
  if (elapsedSinceMicroShiftMs >= OLED_MICRO_SHIFT_CADENCE_MS) {
    const cadenceSteps = Math.floor(elapsedSinceMicroShiftMs / OLED_MICRO_SHIFT_CADENCE_MS);
    microShiftCount += cadenceSteps;
    lastMicroShiftAtMs = state.lastMicroShiftAtMs + cadenceSteps * OLED_MICRO_SHIFT_CADENCE_MS;
    microShift = createMicroShiftVector(state.seed, microShiftCount);
    microShiftAdvanced = cadenceSteps > 0;
  }

  const nextState: OledCinematicControllerState = {
    profile: state.profile,
    seed: state.seed,
    layoutEpoch: state.layoutEpoch + (relayoutTriggered ? 1 : 0),
    lastRelayoutAtMs: relayoutTriggered ? nowMs : state.lastRelayoutAtMs,
    relayoutCount: state.relayoutCount + (relayoutTriggered ? 1 : 0),
    relayoutCountByReason: nextRelayoutCountByReason,
    lastRelayoutReason: relayoutReason,
    lastMicroShiftAtMs,
    microShiftCount,
    microShift,
    riskLatchActive: risk.atRisk
  };

  const metrics: OledMetricExport = {
    focusStaticMs: risk.metrics.focusStaticMs,
    highlightStaticMs: risk.metrics.highlightStaticMs,
    highlightAreaRatio: risk.metrics.highlightAreaRatio,
    relayoutReason,
    relayoutCount: nextState.relayoutCount,
    relayoutCountByReason: {
      "profile-cycle": nextState.relayoutCountByReason["profile-cycle"],
      "risk-trigger": nextState.relayoutCountByReason["risk-trigger"]
    },
    thresholds: OLED_THRESHOLD_GUARDS
  };

  return {
    state: nextState,
    risk,
    metrics,
    relayoutTriggered,
    microShiftAdvanced
  };
}

export function computeOledLayerMotion(input: OledLayerMotionInput): OledLayerMotion {
  const elapsedMs = normalizeTimelineMs(input.elapsedMs);
  const width = Math.max(1, Math.round(input.widthPx));
  const height = Math.max(1, Math.round(input.heightPx));

  const parallaxFactor = input.layer === "front" ? 1.5 : 0.75;
  const horizontalAmplitude = width * (input.layer === "front" ? 0.052 : 0.027);
  const verticalAmplitude = height * (input.layer === "front" ? 0.016 : 0.009);

  const phaseSeed = hashToUnitInterval(`${input.state.seed}:${input.state.layoutEpoch}:${input.layer}:phase`) * TWO_PI;
  const driftPhase = (elapsedMs / HORIZONTAL_DRIFT_PERIOD_MS) * TWO_PI;
  const driftX = Math.sin(driftPhase + phaseSeed) * horizontalAmplitude;
  const driftY = Math.cos(driftPhase * 0.6 + phaseSeed) * verticalAmplitude;

  return {
    offsetX: driftX + input.state.microShift.x * parallaxFactor,
    offsetY: driftY + input.state.microShift.y * parallaxFactor,
    parallaxFactor
  };
}
