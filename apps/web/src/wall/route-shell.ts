import type { ElementFactory } from "./element-factory"

export function createWallRouteShell(createElement: ElementFactory): {
  root: HTMLElement
  wallCard: HTMLElement
} {
  const root = createElement("main", { testId: "poster-wall-root" })
  root.style.minHeight = "100vh"
  root.style.display = "flex"
  root.style.justifyContent = "center"
  root.style.alignItems = "center"
  root.style.padding = "clamp(0.9rem, 2vw, 1.5rem)"
  root.style.position = "relative"
  root.style.overflow = "hidden"
  root.style.isolation = "isolate"
  root.style.background = [
    "radial-gradient(circle at 17% 24%, var(--mps-color-orbit-glow-halo) 0%, transparent 43%)",
    "radial-gradient(circle at 84% 8%, color-mix(in srgb, var(--mps-color-telemetry-soft) 72%, transparent) 0%, transparent 56%)",
    "linear-gradient(155deg, var(--mps-overlay-depth-far) 0%, var(--mps-color-canvas) 58%, #05070f 100%)"
  ].join(",")
  root.style.color = "var(--mps-color-foreground)"
  root.style.fontFamily = "var(--mps-font-body)"

  const orbitHaloNear = createElement("div")
  orbitHaloNear.setAttribute("aria-hidden", "true")
  orbitHaloNear.style.position = "absolute"
  orbitHaloNear.style.inset = "auto auto -26vmax -20vmax"
  orbitHaloNear.style.width = "58vmax"
  orbitHaloNear.style.aspectRatio = "1 / 1"
  orbitHaloNear.style.borderRadius = "999px"
  orbitHaloNear.style.pointerEvents = "none"
  orbitHaloNear.style.opacity = "0.85"
  orbitHaloNear.style.filter = "blur(2px)"
  orbitHaloNear.style.background = [
    "radial-gradient(circle at center, var(--mps-color-orbit-glow-halo) 0%, rgba(122, 217, 255, 0.08) 38%, transparent 70%)",
    "conic-gradient(from 200deg, transparent 0deg, rgba(122, 217, 255, 0.16) 120deg, transparent 205deg, rgba(210, 166, 90, 0.22) 290deg, transparent 360deg)"
  ].join(",")

  const orbitHaloFar = createElement("div")
  orbitHaloFar.setAttribute("aria-hidden", "true")
  orbitHaloFar.style.position = "absolute"
  orbitHaloFar.style.inset = "-28vmax -16vmax auto auto"
  orbitHaloFar.style.width = "56vmax"
  orbitHaloFar.style.aspectRatio = "1 / 1"
  orbitHaloFar.style.borderRadius = "999px"
  orbitHaloFar.style.pointerEvents = "none"
  orbitHaloFar.style.opacity = "0.54"
  orbitHaloFar.style.mixBlendMode = "screen"
  orbitHaloFar.style.background = "radial-gradient(circle at 45% 44%, var(--mps-color-orbit-glow) 0%, rgba(122, 217, 255, 0.12) 34%, transparent 74%)"

  const wallCard = createElement("section")
  wallCard.style.width = "min(90rem, 100%)"
  wallCard.style.minHeight = "min(88vh, 52rem)"
  wallCard.style.display = "grid"
  wallCard.style.gridTemplateColumns = "minmax(14rem, 0.72fr) minmax(0, 1.28fr)"
  wallCard.style.gridAutoRows = "min-content"
  wallCard.style.alignContent = "start"
  wallCard.style.columnGap = "clamp(0.8rem, 2vw, 1.2rem)"
  wallCard.style.rowGap = "0.72rem"
  wallCard.style.padding = "clamp(0.9rem, 2vw, 1.2rem)"
  wallCard.style.position = "relative"
  wallCard.style.overflow = "hidden"
  wallCard.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 72%, var(--mps-color-orbit-glow-halo))"
  wallCard.style.borderRadius = "var(--mps-radius-lg)"
  wallCard.style.background = [
    "linear-gradient(152deg, var(--mps-overlay-depth-near) 0%, color-mix(in srgb, var(--mps-color-surface) 78%, black) 34%, color-mix(in srgb, var(--mps-color-surface-raised) 72%, black) 100%)",
    "radial-gradient(circle at 80% 0%, color-mix(in srgb, var(--mps-color-telemetry-soft) 64%, transparent) 0%, transparent 38%)"
  ].join(",")
  wallCard.style.boxShadow = "var(--mps-elevation-orbit), inset 0 1px 0 rgba(255, 255, 255, 0.06)"
  wallCard.style.backdropFilter = "blur(6px)"

  const orbitalMeridian = createElement("div")
  orbitalMeridian.setAttribute("aria-hidden", "true")
  orbitalMeridian.style.position = "absolute"
  orbitalMeridian.style.inset = "0"
  orbitalMeridian.style.pointerEvents = "none"
  orbitalMeridian.style.zIndex = "0"
  orbitalMeridian.style.background = [
    "repeating-radial-gradient(circle at 104% 50%, transparent 0 3.7rem, rgba(122, 217, 255, 0.11) 3.7rem 3.82rem)",
    "linear-gradient(90deg, transparent 0%, rgba(122, 217, 255, 0.08) 30%, rgba(122, 217, 255, 0.14) 45%, transparent 72%)"
  ].join(",")

  const telemetryGrid = createElement("div")
  telemetryGrid.setAttribute("aria-hidden", "true")
  telemetryGrid.style.position = "absolute"
  telemetryGrid.style.inset = "0"
  telemetryGrid.style.pointerEvents = "none"
  telemetryGrid.style.zIndex = "0"
  telemetryGrid.style.opacity = "0.22"
  telemetryGrid.style.backgroundImage = [
    "linear-gradient(to right, rgba(122, 217, 255, 0.14) 1px, transparent 1px)",
    "linear-gradient(to bottom, rgba(122, 217, 255, 0.08) 1px, transparent 1px)"
  ].join(",")
  telemetryGrid.style.backgroundSize = "2.6rem 2.6rem"

  root.append(orbitHaloNear, orbitHaloFar)
  wallCard.append(orbitalMeridian, telemetryGrid)

  return {
    root,
    wallCard
  }
}

export function createWallFallbackShell(
  createElement: ElementFactory,
  options: {
    title: string
    body: string
    onBack: () => void
  }
): HTMLElement {
  const fallback = createElement("main", { testId: "poster-wall-root" })
  fallback.style.minHeight = "100vh"
  fallback.style.display = "flex"
  fallback.style.justifyContent = "center"
  fallback.style.alignItems = "center"
  fallback.style.padding = "1.5rem"
  fallback.style.background = [
    "radial-gradient(circle at 80% 10%, color-mix(in srgb, var(--mps-color-telemetry-soft) 60%, transparent) 0%, transparent 42%)",
    "linear-gradient(165deg, var(--mps-overlay-depth-far) 0%, var(--mps-color-canvas) 72%)"
  ].join(",")
  fallback.style.color = "var(--mps-color-foreground)"
  fallback.style.fontFamily = "var(--mps-font-body)"

  const fallbackCard = createElement("section")
  fallbackCard.style.maxWidth = "42ch"
  fallbackCard.style.display = "grid"
  fallbackCard.style.gap = "0.8rem"
  fallbackCard.style.padding = "1.35rem"
  fallbackCard.style.borderRadius = "0.75rem"
  fallbackCard.style.border = "1px solid color-mix(in srgb, var(--mps-color-border) 70%, var(--mps-color-orbit-glow-halo))"
  fallbackCard.style.background = "linear-gradient(155deg, color-mix(in srgb, var(--mps-color-surface) 88%, black) 0%, color-mix(in srgb, var(--mps-color-surface-raised) 82%, black) 100%)"
  fallbackCard.style.boxShadow = "var(--mps-elevation-orbit)"

  const title = createElement("h1", { textContent: options.title })
  title.style.margin = "0"
  title.style.fontFamily = "var(--mps-font-display)"
  title.style.lineHeight = "1.15"

  const body = createElement("p", { textContent: options.body })
  body.style.margin = "0"

  const backButton = createElement("button", {
    textContent: "Back to onboarding"
  }) as HTMLButtonElement
  backButton.type = "button"
  backButton.style.width = "fit-content"
  backButton.style.padding = "0.6rem 0.8rem"
  backButton.style.borderRadius = "0.55rem"
  backButton.style.border = "1px solid color-mix(in srgb, var(--mps-color-telemetry) 42%, var(--mps-color-border))"
  backButton.style.background = "linear-gradient(130deg, color-mix(in srgb, var(--mps-color-surface-raised) 92%, black) 0%, color-mix(in srgb, var(--mps-color-surface) 88%, black) 100%)"
  backButton.style.color = "var(--mps-color-foreground-emphasis)"
  backButton.style.fontWeight = "600"
  backButton.addEventListener("click", options.onBack)

  fallbackCard.append(title, body, backButton)
  fallback.append(fallbackCard)

  return fallback
}
