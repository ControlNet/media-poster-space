import type { MediaItem } from "../types/media";

export const POSTER_REAPPEARANCE_SUPPRESSION_WINDOW_MS = 45 * 60 * 1000;
export const POSTER_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SCHEDULER_REAPPEARANCE_WINDOW_MS = POSTER_REAPPEARANCE_SUPPRESSION_WINDOW_MS;
export const SCHEDULER_CACHE_TTL_MS = POSTER_CACHE_TTL_MS;

export interface PosterPrefetchPolicy {
  level: "low" | "medium" | "high";
  maxItems: number;
}

export const POSTER_PREFETCH_POLICY_MEDIUM: PosterPrefetchPolicy = Object.freeze({
  level: "medium",
  maxItems: 6
});
export const SCHEDULER_PREFETCH_POLICY_MEDIUM = POSTER_PREFETCH_POLICY_MEDIUM;

export interface PosterSchedulerAntiClusterRules {
  series: boolean;
  actor: boolean;
  year: boolean;
}

export interface PosterSchedulerConfig {
  reappearanceSuppressionWindowMs: number;
  antiClusterLookback: number;
  antiClusterRules: PosterSchedulerAntiClusterRules;
  prefetchPolicy: PosterPrefetchPolicy;
  cacheTtlMs: number;
}

export interface PosterSchedulerConfigInput {
  reappearanceSuppressionWindowMs?: number;
  antiClusterLookback?: number;
  antiClusterRules?: Partial<PosterSchedulerAntiClusterRules>;
  prefetchPolicy?: PosterPrefetchPolicy;
  cacheTtlMs?: number;
}

export interface PosterScheduleHistoryEntry {
  mediaId: string;
  shownAt: string;
}

export interface PosterSchedulerState {
  randomState: number | null;
  draws: number;
}

export type PosterSelectionPool = "strict" | "anti-cluster-relaxed" | "reappearance-relaxed";

export interface PosterPrefetchPlan {
  policy: PosterPrefetchPolicy;
  mediaIds: string[];
}

export interface PosterCacheHint {
  ttlMs: number;
  expiresAt: string;
  mediaIds: string[];
}

export interface PosterSchedulerDiagnostics {
  pool: PosterSelectionPool;
  blockedByReappearanceMediaIds: string[];
  blockedByAntiClusterMediaIds: string[];
}

export interface SchedulePosterOptions {
  items: readonly MediaItem[];
  history: readonly PosterScheduleHistoryEntry[];
  now: Date | string | number;
  seed?: string | number;
  state?: PosterSchedulerState;
  config?: PosterSchedulerConfigInput;
}

export interface SchedulePosterResult {
  item: MediaItem;
  nextHistory: PosterScheduleHistoryEntry[];
  state: PosterSchedulerState;
  prefetch: PosterPrefetchPlan;
  cache: PosterCacheHint;
  diagnostics: PosterSchedulerDiagnostics;
}

interface ParsedHistoryEntry {
  mediaId: string;
  shownAtMs: number;
}

interface ItemClusterSignature {
  series: Set<string>;
  actors: Set<string>;
  year: string | null;
}

const DEFAULT_ANTI_CLUSTER_RULES: PosterSchedulerAntiClusterRules = {
  series: true,
  actor: true,
  year: true
};

const UINT32_MODULUS = 0x1_0000_0000;
const MIN_RANDOM_STATE = 0x6d2b79f5;

function normalizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}

function normalizeNonNegativeInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.floor(value);
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeRandomState(input: number): number {
  const state = Math.floor(input) >>> 0;
  return state === 0 ? MIN_RANDOM_STATE : state;
}

function seedToRandomState(seed: string | number): number {
  const normalizedSeed = String(seed);
  let hash = 2166136261;

  for (let index = 0; index < normalizedSeed.length; index += 1) {
    hash ^= normalizedSeed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return normalizeRandomState(hash >>> 0);
}

function nextSeededRandom(previousState: number): { state: number; value: number } {
  let state = previousState >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;

  const normalizedState = normalizeRandomState(state >>> 0);
  return {
    state: normalizedState,
    value: normalizedState / UINT32_MODULUS
  };
}

function parseNow(now: Date | string | number): Date {
  const parsed = now instanceof Date ? new Date(now.getTime()) : new Date(now);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid schedule timestamp provided to scheduler");
  }

  return parsed;
}

function toParsedHistory(history: readonly PosterScheduleHistoryEntry[]): ParsedHistoryEntry[] {
  const parsed: ParsedHistoryEntry[] = [];

  for (const entry of history) {
    const mediaId = entry.mediaId.trim();
    if (mediaId.length === 0) {
      continue;
    }

    const shownAt = new Date(entry.shownAt);
    if (Number.isNaN(shownAt.getTime())) {
      continue;
    }

    parsed.push({
      mediaId,
      shownAtMs: shownAt.getTime()
    });
  }

  parsed.sort((left, right) => {
    if (left.shownAtMs === right.shownAtMs) {
      return left.mediaId.localeCompare(right.mediaId);
    }

    return left.shownAtMs - right.shownAtMs;
  });

  return parsed;
}

function resolveConfig(config: PosterSchedulerConfigInput | undefined): PosterSchedulerConfig {
  const antiClusterRules: PosterSchedulerAntiClusterRules = {
    ...DEFAULT_ANTI_CLUSTER_RULES,
    ...(config?.antiClusterRules ?? {})
  };

  const prefetchPolicy = config?.prefetchPolicy ?? POSTER_PREFETCH_POLICY_MEDIUM;

  return {
    reappearanceSuppressionWindowMs: normalizePositiveInteger(
      config?.reappearanceSuppressionWindowMs ?? POSTER_REAPPEARANCE_SUPPRESSION_WINDOW_MS,
      POSTER_REAPPEARANCE_SUPPRESSION_WINDOW_MS
    ),
    antiClusterLookback: normalizePositiveInteger(config?.antiClusterLookback ?? 1, 1),
    antiClusterRules,
    prefetchPolicy: {
      level: prefetchPolicy.level,
      maxItems: normalizeNonNegativeInteger(prefetchPolicy.maxItems, POSTER_PREFETCH_POLICY_MEDIUM.maxItems)
    },
    cacheTtlMs: normalizePositiveInteger(config?.cacheTtlMs ?? POSTER_CACHE_TTL_MS, POSTER_CACHE_TTL_MS)
  };
}

function normalizeItems(items: readonly MediaItem[]): MediaItem[] {
  const deduped = new Map<string, MediaItem>();

  for (const item of items) {
    const id = item.id.trim();
    if (id.length === 0 || deduped.has(id)) {
      continue;
    }

    deduped.set(id, item);
  }

  return [...deduped.values()];
}

function getItemClusterSignature(item: MediaItem): ItemClusterSignature {
  const series = new Set<string>();

  if (item.kind === "series" || item.kind === "season" || item.kind === "episode") {
    const inferredSeriesTitle = normalizeToken(item.sortTitle ?? item.originalTitle ?? item.title);
    if (inferredSeriesTitle.length > 0) {
      series.add(inferredSeriesTitle);
    }
  }

  for (const tag of item.tags) {
    const normalizedTag = normalizeToken(tag);

    if (normalizedTag.startsWith("series:")) {
      const seriesKey = normalizeToken(normalizedTag.slice("series:".length));
      if (seriesKey.length > 0) {
        series.add(seriesKey);
      }
      continue;
    }

    if (normalizedTag.startsWith("series=")) {
      const seriesKey = normalizeToken(normalizedTag.slice("series=".length));
      if (seriesKey.length > 0) {
        series.add(seriesKey);
      }
    }
  }

  const actors = new Set<string>();
  for (const person of item.people) {
    const normalizedPerson = normalizeToken(person);
    if (normalizedPerson.length > 0) {
      actors.add(normalizedPerson);
    }
  }

  const year =
    typeof item.year === "number" && Number.isFinite(item.year)
      ? String(Math.floor(item.year))
      : null;

  return {
    series,
    actors,
    year
  };
}

function hasIntersection(left: Set<string>, right: Set<string>): boolean {
  if (left.size === 0 || right.size === 0) {
    return false;
  }

  for (const key of left) {
    if (right.has(key)) {
      return true;
    }
  }

  return false;
}

function isAntiClusterBlocked(
  item: MediaItem,
  referenceItems: readonly MediaItem[],
  antiClusterRules: PosterSchedulerAntiClusterRules
): boolean {
  if (referenceItems.length === 0) {
    return false;
  }

  const candidate = getItemClusterSignature(item);

  for (const referenceItem of referenceItems) {
    const reference = getItemClusterSignature(referenceItem);

    if (antiClusterRules.series && hasIntersection(candidate.series, reference.series)) {
      return true;
    }

    if (antiClusterRules.actor && hasIntersection(candidate.actors, reference.actors)) {
      return true;
    }

    if (antiClusterRules.year && candidate.year !== null && candidate.year === reference.year) {
      return true;
    }
  }

  return false;
}

function createRandomPicker(seed: string | number | undefined, state: PosterSchedulerState | undefined): {
  next: () => number;
  getState: () => PosterSchedulerState;
} {
  let randomState: number | null;
  let draws = state?.draws ?? 0;

  if (typeof state?.randomState === "number") {
    randomState = normalizeRandomState(state.randomState);
  } else if (state?.randomState === null) {
    randomState = null;
  } else if (seed !== undefined) {
    randomState = seedToRandomState(seed);
  } else {
    randomState = null;
  }

  return {
    next: () => {
      draws += 1;

      if (randomState === null) {
        return Math.random();
      }

      const nextRandom = nextSeededRandom(randomState);
      randomState = nextRandom.state;

      return nextRandom.value;
    },
    getState: () => {
      return {
        randomState,
        draws
      };
    }
  };
}

function pickRandomItem(items: readonly MediaItem[], nextRandom: () => number): MediaItem | null {
  if (items.length === 0) {
    return null;
  }

  const index = Math.floor(nextRandom() * items.length);
  return items[Math.min(index, items.length - 1)] ?? null;
}

function pickRandomMediaIds(items: readonly MediaItem[], limit: number, nextRandom: () => number): string[] {
  if (limit <= 0 || items.length === 0) {
    return [];
  }

  const remaining = [...items];
  const pickedMediaIds: string[] = [];
  const maxItems = Math.min(limit, remaining.length);

  while (pickedMediaIds.length < maxItems) {
    const index = Math.floor(nextRandom() * remaining.length);
    const item = remaining[Math.min(index, remaining.length - 1)];

    if (!item) {
      break;
    }

    pickedMediaIds.push(item.id);
    remaining.splice(index, 1);
  }

  return pickedMediaIds;
}

export function schedulePoster(options: SchedulePosterOptions): SchedulePosterResult | null {
  const now = parseNow(options.now);
  const nowMs = now.getTime();
  const config = resolveConfig(options.config);
  const items = normalizeItems(options.items);

  if (items.length === 0) {
    return null;
  }

  const mediaById = new Map(items.map((item) => [item.id, item]));
  const parsedHistory = toParsedHistory(options.history);

  const blockedByReappearance = new Set<string>();
  for (const entry of parsedHistory) {
    if (entry.shownAtMs > nowMs) {
      continue;
    }

    const elapsedMs = nowMs - entry.shownAtMs;
    if (elapsedMs < config.reappearanceSuppressionWindowMs) {
      blockedByReappearance.add(entry.mediaId);
    }
  }

  const antiClusterReferenceEntries = parsedHistory
    .filter((entry) => entry.shownAtMs <= nowMs)
    .slice(-config.antiClusterLookback)
    .map((entry) => mediaById.get(entry.mediaId))
    .filter((item): item is MediaItem => Boolean(item));

  const blockedByAntiCluster = new Set<string>();
  if (antiClusterReferenceEntries.length > 0) {
    for (const item of items) {
      if (isAntiClusterBlocked(item, antiClusterReferenceEntries, config.antiClusterRules)) {
        blockedByAntiCluster.add(item.id);
      }
    }
  }

  const strictPool = items.filter((item) => {
    return !blockedByReappearance.has(item.id) && !blockedByAntiCluster.has(item.id);
  });

  const antiClusterRelaxedPool = items.filter((item) => {
    return !blockedByReappearance.has(item.id);
  });

  let pool = strictPool;
  let poolType: PosterSelectionPool = "strict";

  if (pool.length === 0) {
    pool = antiClusterRelaxedPool;
    poolType = "anti-cluster-relaxed";
  }

  if (pool.length === 0) {
    pool = [...items];
    poolType = "reappearance-relaxed";
  }

  const randomPicker = createRandomPicker(options.seed, options.state);
  const selectedItem = pickRandomItem(pool, randomPicker.next);
  if (!selectedItem) {
    return null;
  }

  const prefetchPool = pool.filter((item) => item.id !== selectedItem.id);
  const prefetchMediaIds = pickRandomMediaIds(prefetchPool, config.prefetchPolicy.maxItems, randomPicker.next);

  const shownAt = now.toISOString();
  const nextHistory: PosterScheduleHistoryEntry[] = [
    ...options.history,
    {
      mediaId: selectedItem.id,
      shownAt
    }
  ];

  const cacheMediaIds = [selectedItem.id, ...prefetchMediaIds];

  return {
    item: selectedItem,
    nextHistory,
    state: randomPicker.getState(),
    prefetch: {
      policy: {
        level: config.prefetchPolicy.level,
        maxItems: config.prefetchPolicy.maxItems
      },
      mediaIds: prefetchMediaIds
    },
    cache: {
      ttlMs: config.cacheTtlMs,
      expiresAt: new Date(nowMs + config.cacheTtlMs).toISOString(),
      mediaIds: cacheMediaIds
    },
    diagnostics: {
      pool: poolType,
      blockedByReappearanceMediaIds: [...blockedByReappearance],
      blockedByAntiClusterMediaIds: [...blockedByAntiCluster]
    }
  };
}
