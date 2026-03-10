import type { MediaItem } from "../types"

export const RUNTIME_POSTER_QUEUE_LOW_WATERMARK = 10
export const RUNTIME_POSTER_QUEUE_REFILL_TARGET = 40

export interface RuntimePosterQueuePolicy {
  lowWatermark: number
  refillTarget: number
}

export const DEFAULT_RUNTIME_POSTER_QUEUE_POLICY = {
  lowWatermark: RUNTIME_POSTER_QUEUE_LOW_WATERMARK,
  refillTarget: RUNTIME_POSTER_QUEUE_REFILL_TARGET
} as const satisfies RuntimePosterQueuePolicy

export type RuntimePosterQueueRefillReason = "bootstrap" | "low-watermark"

export interface RuntimePosterQueueState {
  items: readonly MediaItem[]
  bootstrapPending: boolean
}

export interface RuntimePosterQueueRefillIntent {
  shouldRefill: boolean
  reason: RuntimePosterQueueRefillReason | null
  requestedCount: number
  currentSize: number
  lowWatermark: number
  targetSize: number
}

export interface CreateRuntimePosterQueueStateOptions {
  items?: readonly MediaItem[]
  policy?: RuntimePosterQueuePolicy
}

export interface RuntimePosterQueueEnqueueOptions {
  state: RuntimePosterQueueState
  items: readonly MediaItem[]
  policy?: RuntimePosterQueuePolicy
}

export interface RuntimePosterQueueEnqueueResult {
  nextState: RuntimePosterQueueState
  acceptedItems: MediaItem[]
  acceptedCount: number
  duplicateCount: number
  refillIntent: RuntimePosterQueueRefillIntent
}

export interface RuntimePosterQueueConsumeOptions {
  state: RuntimePosterQueueState
  policy?: RuntimePosterQueuePolicy
}

export interface RuntimePosterQueueConsumeResult {
  nextState: RuntimePosterQueueState
  consumedItem: MediaItem | null
  refillIntent: RuntimePosterQueueRefillIntent
}

export type RuntimePosterQueueRefillStarvation = "none" | "partial" | "empty"

export interface RuntimePosterQueueRefillOptions {
  state: RuntimePosterQueueState
  fetchItems: (requestedCount: number) => Promise<readonly MediaItem[]>
  policy?: RuntimePosterQueuePolicy
}

export interface RuntimePosterQueueRefillResult {
  nextState: RuntimePosterQueueState
  requestedCount: number
  reason: RuntimePosterQueueRefillReason | null
  fetchedCount: number
  acceptedItems: MediaItem[]
  acceptedCount: number
  duplicateCount: number
  starvation: RuntimePosterQueueRefillStarvation
  skipped: boolean
  refillIntent: RuntimePosterQueueRefillIntent
}

export interface RuntimePosterQueueRefillRuntime {
  refillIfNeeded: (options: RuntimePosterQueueRefillOptions) => Promise<RuntimePosterQueueRefillResult>
  hasInFlightRefill: () => boolean
}

function toPositiveInteger(value: number, fieldName: keyof RuntimePosterQueuePolicy): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${fieldName} must be a positive integer`)
  }

  return value
}

export function createRuntimePosterQueuePolicy(
  overrides: Partial<RuntimePosterQueuePolicy> = {}
): RuntimePosterQueuePolicy {
  const lowWatermark = toPositiveInteger(
    overrides.lowWatermark ?? DEFAULT_RUNTIME_POSTER_QUEUE_POLICY.lowWatermark,
    "lowWatermark"
  )
  const refillTarget = toPositiveInteger(
    overrides.refillTarget ?? DEFAULT_RUNTIME_POSTER_QUEUE_POLICY.refillTarget,
    "refillTarget"
  )

  if (refillTarget < lowWatermark) {
    throw new Error("refillTarget must be greater than or equal to lowWatermark")
  }

  return {
    lowWatermark,
    refillTarget
  }
}

function resolvePolicy(policy: RuntimePosterQueuePolicy | undefined): RuntimePosterQueuePolicy {
  if (!policy) {
    return createRuntimePosterQueuePolicy()
  }

  return createRuntimePosterQueuePolicy(policy)
}

function resolveBootstrapPending(
  bootstrapPending: boolean,
  itemCount: number,
  refillTarget: number
): boolean {
  return bootstrapPending && itemCount < refillTarget
}

export function toRuntimePosterQueueMediaIdentity(item: Pick<MediaItem, "providerId" | "id">): string {
  const normalizedProviderId = item.providerId.trim()
  const normalizedItemId = item.id.trim()
  return `${normalizedProviderId}::${normalizedItemId}`
}

export function dedupeRuntimePosterQueueItems(items: readonly MediaItem[]): MediaItem[] {
  const identities = new Set<string>()
  const dedupedItems: MediaItem[] = []

  for (const item of items) {
    const mediaIdentity = toRuntimePosterQueueMediaIdentity(item)
    if (identities.has(mediaIdentity)) {
      continue
    }

    identities.add(mediaIdentity)
    dedupedItems.push(item)
  }

  return dedupedItems
}

function createQueueState(options: {
  items: readonly MediaItem[]
  bootstrapPending: boolean
  refillTarget: number
}): RuntimePosterQueueState {
  const nextItems = [...options.items]

  return {
    items: nextItems,
    bootstrapPending: resolveBootstrapPending(
      options.bootstrapPending,
      nextItems.length,
      options.refillTarget
    )
  }
}

export function createRuntimePosterQueueState(
  options: CreateRuntimePosterQueueStateOptions = {}
): RuntimePosterQueueState {
  const policy = resolvePolicy(options.policy)
  const dedupedItems = dedupeRuntimePosterQueueItems(options.items ?? [])

  return createQueueState({
    items: dedupedItems,
    bootstrapPending: true,
    refillTarget: policy.refillTarget
  })
}

export function getRuntimePosterQueueRefillIntent(options: {
  state: RuntimePosterQueueState
  policy?: RuntimePosterQueuePolicy
}): RuntimePosterQueueRefillIntent {
  const policy = resolvePolicy(options.policy)
  const currentSize = options.state.items.length
  const bootstrapPending = resolveBootstrapPending(
    options.state.bootstrapPending,
    currentSize,
    policy.refillTarget
  )

  const requestedCountForTarget = Math.max(policy.refillTarget - currentSize, 0)

  if (bootstrapPending) {
    return {
      shouldRefill: requestedCountForTarget > 0,
      reason: requestedCountForTarget > 0 ? "bootstrap" : null,
      requestedCount: requestedCountForTarget,
      currentSize,
      lowWatermark: policy.lowWatermark,
      targetSize: policy.refillTarget
    }
  }

  if (currentSize < policy.lowWatermark) {
    return {
      shouldRefill: requestedCountForTarget > 0,
      reason: requestedCountForTarget > 0 ? "low-watermark" : null,
      requestedCount: requestedCountForTarget,
      currentSize,
      lowWatermark: policy.lowWatermark,
      targetSize: policy.refillTarget
    }
  }

  return {
    shouldRefill: false,
    reason: null,
    requestedCount: 0,
    currentSize,
    lowWatermark: policy.lowWatermark,
    targetSize: policy.refillTarget
  }
}

export function enqueueRuntimePosterQueueItems(
  options: RuntimePosterQueueEnqueueOptions
): RuntimePosterQueueEnqueueResult {
  const policy = resolvePolicy(options.policy)
  const nextItems = [...options.state.items]
  const queuedIdentities = new Set(nextItems.map((item) => toRuntimePosterQueueMediaIdentity(item)))
  const acceptedItems: MediaItem[] = []
  let duplicateCount = 0

  for (const item of options.items) {
    const mediaIdentity = toRuntimePosterQueueMediaIdentity(item)
    if (queuedIdentities.has(mediaIdentity)) {
      duplicateCount += 1
      continue
    }

    queuedIdentities.add(mediaIdentity)
    nextItems.push(item)
    acceptedItems.push(item)
  }

  const nextState = createQueueState({
    items: nextItems,
    bootstrapPending: options.state.bootstrapPending,
    refillTarget: policy.refillTarget
  })

  return {
    nextState,
    acceptedItems,
    acceptedCount: acceptedItems.length,
    duplicateCount,
    refillIntent: getRuntimePosterQueueRefillIntent({
      state: nextState,
      policy
    })
  }
}

export function consumeRuntimePosterQueueItem(
  options: RuntimePosterQueueConsumeOptions
): RuntimePosterQueueConsumeResult {
  const policy = resolvePolicy(options.policy)
  const remainingItems = [...options.state.items]
  const consumedItem = remainingItems.shift() ?? null

  const nextState = createQueueState({
    items: remainingItems,
    bootstrapPending: options.state.bootstrapPending,
    refillTarget: policy.refillTarget
  })

  return {
    nextState,
    consumedItem,
    refillIntent: getRuntimePosterQueueRefillIntent({
      state: nextState,
      policy
    })
  }
}

async function performRuntimePosterQueueRefill(
  options: RuntimePosterQueueRefillOptions
): Promise<RuntimePosterQueueRefillResult> {
  const policy = resolvePolicy(options.policy)
  const currentState = createQueueState({
    items: options.state.items,
    bootstrapPending: options.state.bootstrapPending,
    refillTarget: policy.refillTarget
  })
  const refillIntent = getRuntimePosterQueueRefillIntent({
    state: currentState,
    policy
  })

  if (!refillIntent.shouldRefill || refillIntent.requestedCount === 0 || refillIntent.reason === null) {
    return {
      nextState: currentState,
      requestedCount: refillIntent.requestedCount,
      reason: refillIntent.reason,
      fetchedCount: 0,
      acceptedItems: [],
      acceptedCount: 0,
      duplicateCount: 0,
      starvation: "none",
      skipped: true,
      refillIntent
    }
  }

  const fetchedItems = [...await options.fetchItems(refillIntent.requestedCount)]
  const enqueueResult = enqueueRuntimePosterQueueItems({
    state: currentState,
    items: fetchedItems,
    policy
  })

  let starvation: RuntimePosterQueueRefillStarvation = "none"
  if (fetchedItems.length === 0) {
    starvation = "empty"
  } else if (enqueueResult.acceptedCount < refillIntent.requestedCount) {
    starvation = "partial"
  }

  return {
    nextState: enqueueResult.nextState,
    requestedCount: refillIntent.requestedCount,
    reason: refillIntent.reason,
    fetchedCount: fetchedItems.length,
    acceptedItems: enqueueResult.acceptedItems,
    acceptedCount: enqueueResult.acceptedCount,
    duplicateCount: enqueueResult.duplicateCount,
    starvation,
    skipped: false,
    refillIntent: enqueueResult.refillIntent
  }
}

export function createRuntimePosterQueueRefillRuntime(): RuntimePosterQueueRefillRuntime {
  let inFlightRefillPromise: Promise<RuntimePosterQueueRefillResult> | null = null

  return {
    refillIfNeeded: (options) => {
      if (inFlightRefillPromise) {
        return inFlightRefillPromise
      }

      inFlightRefillPromise = performRuntimePosterQueueRefill(options).finally(() => {
        inFlightRefillPromise = null
      })

      return inFlightRefillPromise
    },
    hasInFlightRefill: () => inFlightRefillPromise !== null
  }
}
