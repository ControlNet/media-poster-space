import { ingestSelectedMedia } from "../ingestion"
import type { MediaProvider } from "../provider"
import type { MediaItem, ProviderError, ProviderSession } from "../types"
import { dedupeRuntimePosterQueueItems } from "./poster-queue"

interface RuntimePosterQueueRefillFetchProvider {
  listMedia: MediaProvider["listMedia"]
}

export interface CreateRuntimePosterQueueRefillFetchAdapterOptions {
  provider: RuntimePosterQueueRefillFetchProvider
  session: ProviderSession
  selectedLibraryIds: readonly string[]
  cursor?: string
  updatedSince?: string
}

export interface RuntimePosterQueueRefillFetchAdapterState {
  cursor: string | null
  updatedSince: string | null
}

export interface RuntimePosterQueueRefillFetchAdapter {
  fetchItems: (requestedCount: number) => Promise<readonly MediaItem[]>
  getState: () => RuntimePosterQueueRefillFetchAdapterState
}

export class RuntimePosterQueueRefillAdapterError extends Error {
  readonly providerError: ProviderError

  constructor(providerError: ProviderError) {
    super(providerError.message)
    this.name = "RuntimePosterQueueRefillAdapterError"
    this.providerError = providerError
  }
}

function normalizeSelectedLibraryIds(libraryIds: readonly string[]): string[] {
  const uniqueLibraryIds = new Set<string>()

  for (const libraryId of libraryIds) {
    const trimmedLibraryId = libraryId.trim()
    if (trimmedLibraryId.length > 0) {
      uniqueLibraryIds.add(trimmedLibraryId)
    }
  }

  return [...uniqueLibraryIds]
}

function normalizeOptionalString(value: string | undefined): string | null {
  const normalized = value?.trim() ?? ""
  return normalized.length > 0 ? normalized : null
}

function normalizeRequestedCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  const normalized = Math.trunc(value)
  return normalized > 0 ? normalized : 0
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
    const providerError = error.providerError as ProviderError
    return {
      category: providerError.category,
      message: providerError.message,
      ...(typeof providerError.statusCode === "number"
        ? { statusCode: providerError.statusCode }
        : {}),
      ...(typeof providerError.retriable === "boolean"
        ? { retriable: providerError.retriable }
        : {})
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return {
      category: "unknown",
      message: error.message,
      retriable: false
    }
  }

  return {
    category: "unknown",
    message: "Queue refill fetch failed",
    retriable: false
  }
}

export function createRuntimePosterQueueRefillFetchAdapter(
  options: CreateRuntimePosterQueueRefillFetchAdapterOptions
): RuntimePosterQueueRefillFetchAdapter {
  const selectedLibraryIds = normalizeSelectedLibraryIds(options.selectedLibraryIds)

  let cursor = normalizeOptionalString(options.cursor)
  let updatedSince = normalizeOptionalString(options.updatedSince)

  return {
    fetchItems: async (requestedCount) => {
      const limit = normalizeRequestedCount(requestedCount)

      if (selectedLibraryIds.length === 0 || limit === 0) {
        return []
      }

      try {
        const ingestionResult = await ingestSelectedMedia({
          provider: options.provider,
          session: options.session,
          selectedLibraryIds,
          ...(cursor ? { cursor } : {}),
          limit,
          ...(!cursor && updatedSince ? { updatedSince } : {})
        })

        cursor = normalizeOptionalString(ingestionResult.nextCursor)

        if (cursor === null) {
          const fetchedAt = normalizeOptionalString(ingestionResult.fetchedAt)
          if (fetchedAt) {
            updatedSince = fetchedAt
          }
        }

        return dedupeRuntimePosterQueueItems(ingestionResult.items)
      } catch (error) {
        throw new RuntimePosterQueueRefillAdapterError(mapUnknownErrorToProviderError(error))
      }
    },
    getState: () => ({
      cursor,
      updatedSince
    })
  }
}
