export const POSTER_CACHE_MAX_TOTAL_SIZE_BYTES = 1_073_741_824;
export const POSTER_CACHE_MAX_ITEMS = 1_200;
export const POSTER_CACHE_DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

const DEFAULT_HOTNESS_WEIGHT_MS = 6 * 60 * 1_000;
const DEFAULT_PREHEAT_BOOST_MS = 3 * 60 * 60 * 1_000;

export interface PosterCacheEntrySnapshot<Value> {
  key: string;
  value: Value;
  sizeBytes: number;
  createdAtMs: number;
  lastAccessedAtMs: number;
  expiresAtMs: number;
  accessCount: number;
  preheated: boolean;
}

export interface PosterCacheSnapshot<Value> {
  version: 1;
  entries: PosterCacheEntrySnapshot<Value>[];
}

export interface PosterCacheItem<Value> {
  key: string;
  value: Value;
  sizeBytes: number;
  createdAt: string;
  lastAccessedAt: string;
  expiresAt: string;
  accessCount: number;
  preheated: boolean;
}

export interface PosterCacheStats {
  itemCount: number;
  totalSizeBytes: number;
  maxItems: number;
  maxTotalSizeBytes: number;
  ttlMs: number;
}

export interface PosterCacheOptions<Value> {
  maxTotalSizeBytes?: number;
  maxItems?: number;
  ttlMs?: number;
  now?: () => number;
  sizeOf?: (value: Value) => number;
  hotnessWeightMs?: number;
  preheatBoostMs?: number;
}

export interface PosterCacheWriteOptions {
  ttlMs?: number;
  preheated?: boolean;
}

interface PosterCacheStoredEntry<Value> {
  key: string;
  value: Value;
  sizeBytes: number;
  createdAtMs: number;
  lastAccessedAtMs: number;
  expiresAtMs: number;
  accessCount: number;
  preheated: boolean;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeSizeBytes(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

function estimateSerializedSizeBytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") {
      return 1;
    }

    return new TextEncoder().encode(serialized).byteLength;
  } catch {
    return 1;
  }
}

function normalizeKey(key: string): string {
  return key.trim();
}

function isExpired(nowMs: number, expiresAtMs: number): boolean {
  return expiresAtMs <= nowMs;
}

function createItem<Value>(entry: PosterCacheStoredEntry<Value>): PosterCacheItem<Value> {
  return {
    key: entry.key,
    value: entry.value,
    sizeBytes: entry.sizeBytes,
    createdAt: new Date(entry.createdAtMs).toISOString(),
    lastAccessedAt: new Date(entry.lastAccessedAtMs).toISOString(),
    expiresAt: new Date(entry.expiresAtMs).toISOString(),
    accessCount: entry.accessCount,
    preheated: entry.preheated
  };
}

export interface PosterCache<Value> {
  getStats: () => PosterCacheStats;
  get: (key: string, options?: { touch?: boolean }) => Value | null;
  set: (key: string, value: Value, options?: PosterCacheWriteOptions) => void;
  setMany: (entries: readonly { key: string; value: Value }[], options?: PosterCacheWriteOptions) => void;
  markPreheated: (keys: readonly string[]) => void;
  delete: (key: string) => void;
  clear: () => void;
  pruneExpired: () => string[];
  enforceLimits: () => string[];
  list: (options?: { touch?: boolean; sortByScore?: boolean }) => PosterCacheItem<Value>[];
  toSnapshot: () => PosterCacheSnapshot<Value>;
  hydrate: (snapshot: PosterCacheSnapshot<Value> | null | undefined) => void;
}

export function createPosterCache<Value>(options: PosterCacheOptions<Value> = {}): PosterCache<Value> {
  const now = options.now ?? Date.now;
  const sizeOf = options.sizeOf ?? estimateSerializedSizeBytes;
  const maxTotalSizeBytes = normalizePositiveInteger(
    options.maxTotalSizeBytes,
    POSTER_CACHE_MAX_TOTAL_SIZE_BYTES
  );
  const maxItems = normalizePositiveInteger(options.maxItems, POSTER_CACHE_MAX_ITEMS);
  const ttlMs = normalizePositiveInteger(options.ttlMs, POSTER_CACHE_DEFAULT_TTL_MS);
  const hotnessWeightMs = normalizePositiveInteger(options.hotnessWeightMs, DEFAULT_HOTNESS_WEIGHT_MS);
  const preheatBoostMs = normalizePositiveInteger(options.preheatBoostMs, DEFAULT_PREHEAT_BOOST_MS);

  const entries = new Map<string, PosterCacheStoredEntry<Value>>();
  let totalSizeBytes = 0;

  function getEntryScore(entry: PosterCacheStoredEntry<Value>): number {
    const hotness = Math.log2(entry.accessCount + 1) * hotnessWeightMs;
    const preheatBoost = entry.preheated ? preheatBoostMs : 0;
    return entry.lastAccessedAtMs + hotness + preheatBoost;
  }

  function removeEntry(key: string): void {
    const entry = entries.get(key);
    if (!entry) {
      return;
    }

    totalSizeBytes -= entry.sizeBytes;
    entries.delete(key);
  }

  function pruneExpiredInternal(nowMs: number): string[] {
    const removedKeys: string[] = [];

    for (const [key, entry] of entries) {
      if (!isExpired(nowMs, entry.expiresAtMs)) {
        continue;
      }

      removedKeys.push(key);
      removeEntry(key);
    }

    return removedKeys;
  }

  function pickEvictionCandidate(): PosterCacheStoredEntry<Value> | null {
    let selected: PosterCacheStoredEntry<Value> | null = null;

    for (const entry of entries.values()) {
      if (!selected) {
        selected = entry;
        continue;
      }

      const selectedScore = getEntryScore(selected);
      const candidateScore = getEntryScore(entry);

      if (candidateScore < selectedScore) {
        selected = entry;
        continue;
      }

      if (candidateScore === selectedScore) {
        if (entry.lastAccessedAtMs < selected.lastAccessedAtMs) {
          selected = entry;
          continue;
        }

        if (entry.lastAccessedAtMs === selected.lastAccessedAtMs && entry.sizeBytes > selected.sizeBytes) {
          selected = entry;
        }
      }
    }

    return selected;
  }

  function enforceLimitsInternal(nowMs: number): string[] {
    pruneExpiredInternal(nowMs);

    const evictedKeys: string[] = [];
    while (entries.size > maxItems || totalSizeBytes > maxTotalSizeBytes) {
      const candidate = pickEvictionCandidate();
      if (!candidate) {
        break;
      }

      evictedKeys.push(candidate.key);
      removeEntry(candidate.key);
    }

    return evictedKeys;
  }

  function touchEntry(entry: PosterCacheStoredEntry<Value>, nowMs: number): void {
    entry.lastAccessedAtMs = nowMs;
    entry.accessCount += 1;
  }

  function setEntry(key: string, value: Value, writeOptions: PosterCacheWriteOptions | undefined): void {
    const normalizedKey = normalizeKey(key);
    if (normalizedKey.length === 0) {
      return;
    }

    const nowMs = now();
    const effectiveTtlMs = normalizePositiveInteger(writeOptions?.ttlMs, ttlMs);
    const previous = entries.get(normalizedKey);
    const sizeBytes = normalizeSizeBytes(sizeOf(value));
    const next: PosterCacheStoredEntry<Value> = {
      key: normalizedKey,
      value,
      sizeBytes,
      createdAtMs: previous?.createdAtMs ?? nowMs,
      lastAccessedAtMs: nowMs,
      expiresAtMs: nowMs + effectiveTtlMs,
      accessCount: (previous?.accessCount ?? 0) + 1,
      preheated: writeOptions?.preheated ?? previous?.preheated ?? false
    };

    if (previous) {
      totalSizeBytes -= previous.sizeBytes;
    }

    entries.set(normalizedKey, next);
    totalSizeBytes += sizeBytes;
    enforceLimitsInternal(nowMs);
  }

  return {
    getStats: () => ({
      itemCount: entries.size,
      totalSizeBytes,
      maxItems,
      maxTotalSizeBytes,
      ttlMs
    }),
    get: (key, readOptions) => {
      const normalizedKey = normalizeKey(key);
      if (normalizedKey.length === 0) {
        return null;
      }

      const nowMs = now();
      const entry = entries.get(normalizedKey);
      if (!entry) {
        return null;
      }

      if (isExpired(nowMs, entry.expiresAtMs)) {
        removeEntry(normalizedKey);
        return null;
      }

      if (readOptions?.touch ?? true) {
        touchEntry(entry, nowMs);
      }

      return entry.value;
    },
    set: (key, value, writeOptions) => {
      setEntry(key, value, writeOptions);
    },
    setMany: (items, writeOptions) => {
      for (const item of items) {
        setEntry(item.key, item.value, writeOptions);
      }
    },
    markPreheated: (keys) => {
      const nowMs = now();

      for (const key of keys) {
        const normalizedKey = normalizeKey(key);
        if (normalizedKey.length === 0) {
          continue;
        }

        const entry = entries.get(normalizedKey);
        if (!entry) {
          continue;
        }

        entry.preheated = true;
        touchEntry(entry, nowMs);
      }

      enforceLimitsInternal(nowMs);
    },
    delete: (key) => {
      removeEntry(normalizeKey(key));
    },
    clear: () => {
      entries.clear();
      totalSizeBytes = 0;
    },
    pruneExpired: () => {
      return pruneExpiredInternal(now());
    },
    enforceLimits: () => {
      return enforceLimitsInternal(now());
    },
    list: (listOptions) => {
      const nowMs = now();
      pruneExpiredInternal(nowMs);

      const values = [...entries.values()];
      if (listOptions?.sortByScore ?? true) {
        values.sort((left, right) => {
          const scoreDiff = getEntryScore(right) - getEntryScore(left);
          if (scoreDiff !== 0) {
            return scoreDiff;
          }

          return right.lastAccessedAtMs - left.lastAccessedAtMs;
        });
      }

      const touch = listOptions?.touch ?? false;
      return values.map((entry) => {
        if (touch) {
          touchEntry(entry, nowMs);
        }

        return createItem(entry);
      });
    },
    toSnapshot: () => {
      const nowMs = now();
      pruneExpiredInternal(nowMs);

      return {
        version: 1,
        entries: [...entries.values()].map((entry) => ({
          key: entry.key,
          value: entry.value,
          sizeBytes: entry.sizeBytes,
          createdAtMs: entry.createdAtMs,
          lastAccessedAtMs: entry.lastAccessedAtMs,
          expiresAtMs: entry.expiresAtMs,
          accessCount: entry.accessCount,
          preheated: entry.preheated
        }))
      };
    },
    hydrate: (snapshot) => {
      entries.clear();
      totalSizeBytes = 0;

      if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.entries)) {
        return;
      }

      const nowMs = now();
      for (const rawEntry of snapshot.entries) {
        const normalizedKey = normalizeKey(rawEntry.key);
        if (normalizedKey.length === 0) {
          continue;
        }

        const sizeBytes = normalizeSizeBytes(rawEntry.sizeBytes);
        const createdAtMs = normalizePositiveInteger(rawEntry.createdAtMs, nowMs);
        const lastAccessedAtMs = normalizePositiveInteger(rawEntry.lastAccessedAtMs, createdAtMs);
        const expiresAtMs = normalizePositiveInteger(rawEntry.expiresAtMs, nowMs + ttlMs);
        const accessCount = normalizePositiveInteger(rawEntry.accessCount, 1);
        const preheated = rawEntry.preheated === true;

        if (isExpired(nowMs, expiresAtMs)) {
          continue;
        }

        const entry: PosterCacheStoredEntry<Value> = {
          key: normalizedKey,
          value: rawEntry.value,
          sizeBytes,
          createdAtMs,
          lastAccessedAtMs,
          expiresAtMs,
          accessCount,
          preheated
        };

        entries.set(normalizedKey, entry);
        totalSizeBytes += sizeBytes;
      }

      enforceLimitsInternal(nowMs);
    }
  };
}
