import type { MediaItem } from "@mps/core"

import type { ElementFactory } from "./element-factory"
import type { WallHandoff } from "./state-model"

export function createWallHeadingSection(
  createElement: ElementFactory,
  handoff: WallHandoff
): {
  heading: HTMLHeadingElement
  libraries: HTMLParagraphElement
  preferences: HTMLParagraphElement
} {
  const heading = createElement("h1", { textContent: "Poster Wall" })
  heading.style.margin = "0"
  heading.style.fontFamily = "var(--mps-font-display)"
  heading.style.gridColumn = "1"
  heading.style.position = "relative"
  heading.style.zIndex = "1"
  heading.style.fontSize = "clamp(1.26rem, 2.4vw, 1.8rem)"
  heading.style.lineHeight = "1.1"
  heading.style.letterSpacing = "0.03em"
  heading.style.textTransform = "uppercase"
  heading.style.color = "var(--mps-color-foreground-emphasis)"
  heading.style.textShadow = "0 0 16px color-mix(in srgb, var(--mps-color-orbit-glow) 52%, transparent)"

  const libraries = createElement("p", {
    textContent: `Libraries selected: ${handoff.selectedLibraryIds.join(", ") || "none"}`,
    testId: "wall-selected-libraries"
  })
  libraries.style.margin = "0"
  libraries.style.gridColumn = "1"
  libraries.style.position = "relative"
  libraries.style.zIndex = "1"
  libraries.style.padding = "0.68rem 0.72rem"
  libraries.style.borderRadius = "0.62rem"
  libraries.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 76%, var(--mps-color-orbit-glow-halo))"
  libraries.style.background = "linear-gradient(140deg, color-mix(in srgb, var(--mps-color-surface-raised) 78%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 84%, black) 100%)"
  libraries.style.fontSize = "0.83rem"
  libraries.style.lineHeight = "1.35"
  libraries.style.color = "var(--mps-color-foreground-support)"
  libraries.style.boxShadow = "inset 0 0 0 1px rgba(122, 217, 255, 0.1)"

  const preferences = createElement("p", {
    textContent: `Density: ${handoff.preferences.density}; remember server: ${handoff.preferences.rememberServer ? "yes" : "no"}; remember username: ${handoff.preferences.rememberUsername ? "yes" : "no"}.`
  })
  preferences.style.margin = "0"
  preferences.style.gridColumn = "1"
  preferences.style.position = "relative"
  preferences.style.zIndex = "1"
  preferences.style.padding = "0.64rem 0.72rem"
  preferences.style.borderRadius = "0.62rem"
  preferences.style.border = "1px dashed color-mix(in srgb, var(--mps-color-border) 74%, var(--mps-color-telemetry-muted))"
  preferences.style.background = "color-mix(in srgb, var(--mps-overlay-depth-near) 72%, transparent)"
  preferences.style.color = "var(--mps-color-foreground-muted)"
  preferences.style.fontSize = "0.79rem"
  preferences.style.lineHeight = "1.35"

  return {
    heading,
    libraries,
    preferences
  }
}

export function createWallIngestionSummarySection(
  createElement: ElementFactory,
  options: {
    ingestionItemCount: number
    ingestionStatus: "idle" | "refreshing" | "ready" | "error"
    ingestionTrigger: string | null
    ingestionFetchedAt: string | null
  }
): HTMLParagraphElement {
  const ingestionSummary = createElement("p", {
    textContent:
      `Ingested posters: ${options.ingestionItemCount}; `
      + `status: ${options.ingestionStatus}; `
      + `trigger: ${options.ingestionTrigger ?? "n/a"}; `
      + `last refresh: ${options.ingestionFetchedAt ?? "pending"}.`,
    testId: "wall-ingestion-summary"
  })
  ingestionSummary.style.margin = "0"
  ingestionSummary.style.gridColumn = "1"
  ingestionSummary.style.position = "relative"
  ingestionSummary.style.zIndex = "1"
  ingestionSummary.style.padding = "0.62rem 0.78rem"
  ingestionSummary.style.borderRadius = "0.6rem"
  ingestionSummary.style.border = "1px solid color-mix(in srgb, var(--mps-color-telemetry-muted) 45%, var(--mps-color-border))"
  ingestionSummary.style.background = "linear-gradient(90deg, color-mix(in srgb, var(--mps-overlay-depth-near) 78%, black) 0%, color-mix(in srgb, var(--mps-overlay-depth-far) 72%, black) 70%)"
  ingestionSummary.style.color = "var(--mps-color-foreground-support)"
  ingestionSummary.style.fontFamily = "var(--mps-font-mono)"
  ingestionSummary.style.fontSize = "0.74rem"
  ingestionSummary.style.letterSpacing = "0.015em"
  ingestionSummary.style.boxShadow = "inset 0 0 0 1px rgba(122, 217, 255, 0.08)"

  return ingestionSummary
}

export function createWallPosterGridSection(
  createElement: ElementFactory,
  options: {
    items: MediaItem[]
    onPosterSelect: (index: number) => void
  }
): HTMLElement {
  const posterGrid = createElement("section", { testId: "wall-poster-grid" })
  posterGrid.style.display = "grid"
  posterGrid.style.gridColumn = "2"
  posterGrid.style.gridRow = "1 / span 6"
  posterGrid.style.position = "relative"
  posterGrid.style.zIndex = "1"
  posterGrid.style.alignContent = "start"
  posterGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(10.2rem, 1fr))"
  posterGrid.style.gap = "0.82rem"
  posterGrid.style.padding = "0.2rem"
  posterGrid.style.borderRadius = "0.8rem"
  posterGrid.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 62%, var(--mps-color-orbit-glow-halo))"
  posterGrid.style.background = "linear-gradient(168deg, color-mix(in srgb, var(--mps-overlay-depth-near) 78%, black) 0%, color-mix(in srgb, var(--mps-overlay-depth-far) 82%, black) 100%)"
  posterGrid.style.boxShadow = "inset 0 0 0 1px rgba(122, 217, 255, 0.08)"
  posterGrid.style.maxHeight = "min(74vh, 46rem)"
  posterGrid.style.overflow = "auto"

  if (options.items.length === 0) {
    const emptyPosterState = createElement("p", {
      textContent: "No posters ingested yet. Try manual refresh once ingestion is ready."
    })
    emptyPosterState.style.margin = "0"
    emptyPosterState.style.padding = "0.9rem"
    emptyPosterState.style.borderRadius = "0.6rem"
    emptyPosterState.style.border = "1px dashed color-mix(in srgb, var(--mps-color-border) 72%, var(--mps-color-telemetry-muted))"
    emptyPosterState.style.color = "var(--mps-color-foreground-muted)"
    emptyPosterState.style.background = "color-mix(in srgb, var(--mps-color-surface-raised) 75%, black)"
    posterGrid.append(emptyPosterState)
    return posterGrid
  }

  options.items.forEach((item, index) => {
    const tile = createElement("button", {
      testId: `poster-item-${index}`
    }) as HTMLButtonElement
    tile.type = "button"
    tile.style.display = "grid"
    tile.style.gridTemplateRows = "auto min-content"
    tile.style.gap = "0.4rem"
    tile.style.padding = "0.42rem"
    tile.style.borderRadius = "0.72rem"
    tile.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 80%, var(--mps-color-orbit-glow-halo))"
    tile.style.background = "linear-gradient(156deg, color-mix(in srgb, var(--mps-color-surface-raised) 78%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 84%, black) 100%)"
    tile.style.color = "var(--mps-color-foreground)"
    tile.style.textAlign = "left"
    tile.style.cursor = "pointer"
    tile.style.transition = "transform 170ms ease, border-color 170ms ease, box-shadow 170ms ease"
    tile.style.boxShadow = "0 8px 20px rgba(3, 8, 18, 0.35), inset 0 0 0 1px rgba(122, 217, 255, 0.04)"

    const posterThumb = createElement("div")
    posterThumb.style.aspectRatio = "2 / 3"
    posterThumb.style.borderRadius = "0.55rem"
    posterThumb.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 62%, var(--mps-color-orbit-glow-halo))"
    posterThumb.style.backgroundImage = `url(${item.poster.url})`
    posterThumb.style.backgroundSize = "cover"
    posterThumb.style.backgroundPosition = "center"
    posterThumb.style.backgroundColor = "color-mix(in srgb, var(--mps-color-canvas) 84%, black)"
    posterThumb.style.boxShadow = "inset 0 -70px 42px rgba(4, 8, 18, 0.56)"

    const tileTitle = createElement("p", { textContent: item.title })
    tileTitle.style.margin = "0"
    tileTitle.style.fontSize = "0.86rem"
    tileTitle.style.fontWeight = "600"
    tileTitle.style.lineHeight = "1.3"
    tileTitle.style.letterSpacing = "0.01em"

    const tileTelemetry = createElement("p", {
      textContent: [item.kind, typeof item.year === "number" ? String(item.year) : null].filter(Boolean).join(" · ") || "Library asset"
    })
    tileTelemetry.style.margin = "0"
    tileTelemetry.style.fontFamily = "var(--mps-font-mono)"
    tileTelemetry.style.fontSize = "0.68rem"
    tileTelemetry.style.letterSpacing = "0.03em"
    tileTelemetry.style.textTransform = "uppercase"
    tileTelemetry.style.color = "var(--mps-color-foreground-muted)"

    const tileLabel = createElement("div")
    tileLabel.style.display = "grid"
    tileLabel.style.gap = "0.17rem"
    tileLabel.style.padding = "0.08rem 0.08rem 0.1rem"
    tileLabel.append(tileTitle, tileTelemetry)

    tile.append(posterThumb, tileLabel)
    tile.addEventListener("click", () => {
      options.onPosterSelect(index)
    })
    tile.addEventListener("mouseenter", () => {
      tile.style.transform = "translateY(-2px)"
      tile.style.borderColor = "color-mix(in srgb, var(--mps-color-telemetry) 44%, var(--mps-color-border))"
      tile.style.boxShadow = "0 14px 28px rgba(3, 8, 18, 0.46), 0 0 0 1px rgba(122, 217, 255, 0.26)"
    })
    tile.addEventListener("mouseleave", () => {
      tile.style.transform = "translateY(0)"
      tile.style.borderColor = "color-mix(in srgb, var(--mps-color-border) 80%, var(--mps-color-orbit-glow-halo))"
      tile.style.boxShadow = "0 8px 20px rgba(3, 8, 18, 0.35), inset 0 0 0 1px rgba(122, 217, 255, 0.04)"
    })

    posterGrid.append(tile)
  })

  return posterGrid
}
