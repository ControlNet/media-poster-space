import { resolveWallDetailCardPlacement } from "../detail-card-placement"
import type { MediaItem } from "../../types/media"

export interface WallPreferences {
  density: "cinematic" | "compact"
  rememberServer: boolean
  rememberUsername: boolean
  rememberPasswordRequested: boolean
}

export interface WallHandoff {
  selectedLibraryIds: string[]
  preferences: WallPreferences
}

export interface WallDiagnosticsSample {
  fps: number
  memoryMb: number | null
  reconnectAttempt: number
  reconnectNextDelayMs: number | null
}

function formatRuntimeMinutes(runtimeMs: number | undefined): string | null {
  if (typeof runtimeMs !== "number" || runtimeMs <= 0) {
    return null
  }

  const minutes = Math.max(1, Math.round(runtimeMs / 60_000))
  return `${minutes} min`
}

export function formatWallDetailMeta(item: MediaItem): string {
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

export function hasWallText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function resolveWallDetailPlacement(activeIndex: number, totalItems: number): {
  left: string
  top: string
} {
  return resolveWallDetailCardPlacement(activeIndex, totalItems)
}
