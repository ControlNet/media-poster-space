import {
  resolveWallDetailCardPlacement,
  type MediaItem
} from "@mps/core"

function formatRuntimeMinutes(runtimeMs: number | undefined): string | null {
  if (typeof runtimeMs !== "number" || runtimeMs <= 0) {
    return null
  }

  const minutes = Math.max(1, Math.round(runtimeMs / 60_000))
  return `${minutes} min`
}

export function formatDetailMeta(item: MediaItem): string {
  const segments: string[] = []

  if (typeof item.year === "number") {
    segments.push(String(item.year))
  }

  segments.push(item.kind)

  const runtimeLabel = formatRuntimeMinutes(item.runtimeMs)
  if (runtimeLabel) {
    segments.push(runtimeLabel)
  }

  if (item.genres.length > 0) {
    segments.push(item.genres.slice(0, 2).join(", "))
  }

  return segments.join(" • ")
}

export function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function resolveDetailCardPlacement(activeIndex: number, totalItems: number): {
  left: string
  top: string
} {
  return resolveWallDetailCardPlacement(activeIndex, totalItems)
}
