import type { MediaPage, MediaProvider, MediaQuery } from "../provider/media-provider";
import type { ProviderSession } from "../types/auth";
import type { MediaItem } from "../types/media";
import type { ProviderError } from "../types/provider";

export const MEDIA_INGESTION_REFRESH_INTERVAL_MS = 300_000;

export type MediaIngestionRefreshTrigger = "initial" | "scheduled" | "manual";

export type MediaIngestionStatus = "idle" | "refreshing" | "ready" | "error";

export interface MediaIngestionState {
  status: MediaIngestionStatus;
  trigger: MediaIngestionRefreshTrigger | null;
  items: MediaItem[];
  fetchedAt: string | null;
  nextCursor: string | null;
  error: ProviderError | null;
}

export interface MediaIngestionResult {
  items: MediaItem[];
  fetchedAt: string;
  nextCursor?: string;
}

export interface MediaIngestionRuntime {
  readonly refreshIntervalMs: number;
  readonly selectedLibraryIds: readonly string[];
  readonly status: MediaIngestionStatus;
  getState: () => MediaIngestionState;
  start: () => void;
  stop: () => void;
  refreshNow: () => Promise<MediaIngestionState>;
  dispose: () => void;
}

interface MediaIngestionProvider {
  listMedia: MediaProvider["listMedia"];
}

export interface IngestSelectedMediaOptions {
  provider: MediaIngestionProvider;
  session: ProviderSession;
  selectedLibraryIds: readonly string[];
  cursor?: string;
  limit?: number;
  updatedSince?: string;
}

export interface CreateMediaIngestionRuntimeOptions {
  provider: MediaIngestionProvider;
  session: ProviderSession;
  selectedLibraryIds: readonly string[];
  refreshIntervalMs?: number;
  now?: () => Date;
  onStateChange?: (state: MediaIngestionState) => void;
}

function normalizeSelectedLibraryIds(libraryIds: readonly string[]): string[] {
  const uniqueLibraryIds = new Set<string>();

  for (const libraryId of libraryIds) {
    const trimmedLibraryId = libraryId.trim();
    if (trimmedLibraryId.length > 0) {
      uniqueLibraryIds.add(trimmedLibraryId);
    }
  }

  return [...uniqueLibraryIds];
}

function hasPosterArtwork(item: MediaItem): boolean {
  return item.poster.url.trim().length > 0;
}

function mapUnknownErrorToProviderError(error: unknown): ProviderError {
  if (
    typeof error === "object"
    && error !== null
    && "providerError" in error
    && typeof error.providerError === "object"
    && error.providerError !== null
    && "category" in error.providerError
    && typeof error.providerError.category === "string"
    && "message" in error.providerError
    && typeof error.providerError.message === "string"
  ) {
    const providerError = error.providerError as ProviderError;
    return {
      category: providerError.category,
      message: providerError.message,
      ...(typeof providerError.statusCode === "number"
        ? { statusCode: providerError.statusCode }
        : {}),
      ...(typeof providerError.retriable === "boolean"
        ? { retriable: providerError.retriable }
        : {})
    };
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return {
      category: "unknown",
      message: error.message,
      retriable: false
    };
  }

  return {
    category: "unknown",
    message: "Media ingestion refresh failed",
    retriable: false
  };
}

function cloneState(state: MediaIngestionState): MediaIngestionState {
  return {
    ...state,
    items: [...state.items]
  };
}

function createEmptyMediaPage(now: () => Date): MediaPage {
  return {
    items: [],
    fetchedAt: now().toISOString()
  };
}

export async function ingestSelectedMedia(options: IngestSelectedMediaOptions): Promise<MediaIngestionResult> {
  const selectedLibraryIds = normalizeSelectedLibraryIds(options.selectedLibraryIds);

  const query: MediaQuery = {
    libraryIds: selectedLibraryIds,
    ...(options.cursor ? { cursor: options.cursor } : {}),
    ...(typeof options.limit === "number" ? { limit: options.limit } : {}),
    ...(options.updatedSince ? { updatedSince: options.updatedSince } : {})
  };

  const page = await options.provider.listMedia(options.session, query);
  const selectedLibraryIdSet = new Set(selectedLibraryIds);

  const items = page.items.filter((item) => {
    return selectedLibraryIdSet.has(item.libraryId) && hasPosterArtwork(item);
  });

  return {
    items,
    fetchedAt: page.fetchedAt,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {})
  };
}

export function createMediaIngestionRuntime(
  options: CreateMediaIngestionRuntimeOptions
): MediaIngestionRuntime {
  const now = options.now ?? (() => new Date());
  const selectedLibraryIds = normalizeSelectedLibraryIds(options.selectedLibraryIds);
  const refreshIntervalMs = options.refreshIntervalMs ?? MEDIA_INGESTION_REFRESH_INTERVAL_MS;

  let disposed = false;
  let running = false;
  let refreshPromise: Promise<MediaIngestionState> | null = null;
  let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

  let state: MediaIngestionState = {
    status: "idle",
    trigger: null,
    items: [],
    fetchedAt: null,
    nextCursor: null,
    error: null
  };

  function publishState(): void {
    options.onStateChange?.(cloneState(state));
  }

  async function performRefresh(trigger: MediaIngestionRefreshTrigger): Promise<MediaIngestionState> {
    if (disposed) {
      return cloneState(state);
    }

    state = {
      ...state,
      status: "refreshing",
      trigger,
      error: null
    };
    publishState();

    try {
      const page =
        selectedLibraryIds.length === 0
          ? createEmptyMediaPage(now)
          : await ingestSelectedMedia({
              provider: options.provider,
              session: options.session,
              selectedLibraryIds
            });

      state = {
        status: "ready",
        trigger,
        items: page.items,
        fetchedAt: page.fetchedAt,
        nextCursor: page.nextCursor ?? null,
        error: null
      };
      publishState();

      return cloneState(state);
    } catch (error) {
      state = {
        ...state,
        status: "error",
        trigger,
        error: mapUnknownErrorToProviderError(error)
      };
      publishState();

      return cloneState(state);
    }
  }

  async function refresh(trigger: MediaIngestionRefreshTrigger): Promise<MediaIngestionState> {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = performRefresh(trigger).finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  }

  return {
    get refreshIntervalMs() {
      return refreshIntervalMs;
    },
    get selectedLibraryIds() {
      return selectedLibraryIds;
    },
    get status() {
      return state.status;
    },
    getState: () => cloneState(state),
    start: () => {
      if (disposed || running) {
        return;
      }

      running = true;

      void refresh("initial");
      refreshIntervalId = setInterval(() => {
        if (!running || disposed) {
          return;
        }

        void refresh("scheduled");
      }, refreshIntervalMs);
    },
    stop: () => {
      if (!running) {
        return;
      }

      running = false;
      if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
        refreshIntervalId = null;
      }
    },
    refreshNow: () => {
      if (disposed) {
        return Promise.resolve(cloneState(state));
      }

      return refresh("manual");
    },
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      running = false;
      if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
        refreshIntervalId = null;
      }
    }
  };
}
