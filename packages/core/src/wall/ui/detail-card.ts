import {
  WALL_DETAIL_CARD_MAX_WIDTH,
  WALL_DETAIL_CARD_MIN_WIDTH,
  WALL_DETAIL_CARD_WIDTH
} from "../constants"
import type { MediaItem } from "../../types/media"

import type { ElementFactory } from "./element-factory"
import {
  formatWallDetailMeta,
  hasWallText
} from "./types"

export function createWallDetailCard(
  createElement: ElementFactory,
  options: {
    selectedPoster: MediaItem | null
    detailCardVisible: boolean
    detailCardTransitionMs: number
    placement: {
      left: string
      top: string
    } | null
    onClose: () => void
  }
): HTMLElement {
  const selectedPoster = options.selectedPoster

  const detailCard = createElement("aside", { testId: "detail-card" })
  detailCard.style.display = "grid"
  detailCard.style.gap = "0.58rem"
  detailCard.style.padding = "0.86rem"
  detailCard.style.borderRadius = "0.78rem"
  detailCard.style.position = "absolute"
  detailCard.style.zIndex = "4"
  detailCard.style.width = WALL_DETAIL_CARD_WIDTH
  detailCard.style.minWidth = WALL_DETAIL_CARD_MIN_WIDTH
  detailCard.style.maxWidth = WALL_DETAIL_CARD_MAX_WIDTH
  detailCard.style.border = "1px solid color-mix(in srgb, var(--mps-color-orbit-glow) 32%, var(--mps-color-border))"
  detailCard.style.background = [
    "linear-gradient(155deg, color-mix(in srgb, var(--mps-overlay-depth-near) 74%, black) 0%, color-mix(in srgb, var(--mps-overlay-depth-far) 78%, black) 100%)",
    "radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--mps-color-orbit-glow-halo) 72%, transparent) 0%, transparent 40%)"
  ].join(",")
  detailCard.style.boxShadow = "var(--mps-elevation-orbit), inset 0 0 0 1px rgba(122, 217, 255, 0.08)"
  detailCard.style.backdropFilter = "blur(7px)"
  detailCard.style.transitionProperty = "opacity, transform"
  detailCard.style.transitionDuration = `${options.detailCardTransitionMs}ms`
  detailCard.style.transitionTimingFunction = "cubic-bezier(0.2, 0.8, 0.2, 1)"

  if (options.placement) {
    detailCard.style.left = options.placement.left
    detailCard.style.top = options.placement.top
    detailCard.dataset.placement = `${options.placement.left}-${options.placement.top}`
  } else {
    detailCard.style.left = "64%"
    detailCard.style.top = "56%"
    detailCard.dataset.placement = "default"
  }

  detailCard.style.opacity = options.detailCardVisible ? "1" : "0"
  detailCard.style.transform = options.detailCardVisible ? "translateY(0) scale(1)" : "translateY(0.95rem) scale(0.985)"
  detailCard.style.visibility = options.detailCardVisible ? "visible" : "hidden"
  detailCard.style.pointerEvents = options.detailCardVisible ? "auto" : "none"

  const detailOverlay = createElement("div")
  detailOverlay.setAttribute("aria-hidden", "true")
  detailOverlay.style.position = "absolute"
  detailOverlay.style.inset = "0"
  detailOverlay.style.pointerEvents = "none"
  detailOverlay.style.borderRadius = "inherit"
  detailOverlay.style.opacity = "0.3"
  detailOverlay.style.backgroundImage = "linear-gradient(115deg, transparent 0%, rgba(122, 217, 255, 0.24) 46%, transparent 72%)"
  detailCard.append(detailOverlay)

  const detailBody = createElement("div")
  detailBody.style.position = "relative"
  detailBody.style.zIndex = "1"
  detailBody.style.display = "grid"
  detailBody.style.gap = "0.5rem"

  const accentRail = createElement("p", {
    textContent: "Selected transmission"
  })
  accentRail.style.margin = "0"
  accentRail.style.fontFamily = "var(--mps-font-mono)"
  accentRail.style.fontSize = "0.66rem"
  accentRail.style.letterSpacing = "0.11em"
  accentRail.style.textTransform = "uppercase"
  accentRail.style.color = "var(--mps-color-foreground-muted)"

  const detailTitle = createElement("h2", {
    textContent: selectedPoster?.title ?? ""
  })
  detailTitle.style.margin = "0"
  detailTitle.style.fontSize = "1.08rem"
  detailTitle.style.lineHeight = "1.22"
  detailTitle.style.fontFamily = "var(--mps-font-display)"
  detailTitle.style.color = "var(--mps-color-foreground-emphasis)"

  const detailPosterChip = selectedPoster
    ? createElement("div")
    : null
  if (detailPosterChip && selectedPoster) {
    detailPosterChip.style.aspectRatio = "16 / 9"
    detailPosterChip.style.borderRadius = "0.55rem"
    detailPosterChip.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 62%, var(--mps-color-orbit-glow-halo))"
    detailPosterChip.style.backgroundImage = `linear-gradient(180deg, rgba(5, 8, 18, 0.1) 0%, rgba(5, 8, 18, 0.68) 100%), url(${selectedPoster.poster.url})`
    detailPosterChip.style.backgroundPosition = "center"
    detailPosterChip.style.backgroundSize = "cover"
    detailPosterChip.style.boxShadow = "inset 0 -24px 40px rgba(5, 8, 18, 0.55)"
  }

  const detailMetaText = selectedPoster ? formatWallDetailMeta(selectedPoster) : ""
  const detailMeta = hasWallText(detailMetaText)
    ? createElement("p", { textContent: detailMetaText, testId: "detail-card-meta" })
    : null
  if (detailMeta) {
    detailMeta.style.margin = "0"
    detailMeta.style.color = "var(--mps-color-foreground-support)"
    detailMeta.style.fontFamily = "var(--mps-font-mono)"
    detailMeta.style.fontSize = "0.72rem"
    detailMeta.style.letterSpacing = "0.03em"
    detailMeta.style.textTransform = "uppercase"
  }

  const detailOverview = selectedPoster && hasWallText(selectedPoster.overview)
    ? createElement("p", { textContent: selectedPoster.overview, testId: "detail-card-overview" })
    : null
  if (detailOverview) {
    detailOverview.style.margin = "0"
    detailOverview.style.lineHeight = "1.45"
    detailOverview.style.color = "var(--mps-color-foreground)"
    detailOverview.style.fontSize = "0.84rem"
  }

  const exitHotspot = createElement("button", {
    textContent: "Close detail",
    testId: "exit-hotspot"
  }) as HTMLButtonElement
  exitHotspot.type = "button"
  exitHotspot.style.width = "fit-content"
  exitHotspot.style.padding = "0.47rem 0.68rem"
  exitHotspot.style.borderRadius = "0.5rem"
  exitHotspot.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 62%, var(--mps-color-telemetry-muted))"
  exitHotspot.style.background = "linear-gradient(134deg, color-mix(in srgb, var(--mps-color-surface-raised) 82%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 86%, black) 100%)"
  exitHotspot.style.color = "var(--mps-color-foreground-emphasis)"
  exitHotspot.style.fontSize = "0.75rem"
  exitHotspot.style.textTransform = "uppercase"
  exitHotspot.style.letterSpacing = "0.04em"
  exitHotspot.addEventListener("click", options.onClose)

  detailBody.append(accentRail)
  detailBody.append(detailTitle)
  if (detailPosterChip) {
    detailBody.append(detailPosterChip)
  }
  if (detailMeta) {
    detailBody.append(detailMeta)
  }
  if (detailOverview) {
    detailBody.append(detailOverview)
  }
  detailBody.append(exitHotspot)
  detailCard.append(detailBody)

  return detailCard
}
