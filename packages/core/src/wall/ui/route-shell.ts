import type { ElementFactory } from "./element-factory"

const WALL_PARALLAX_STYLE_ID = "mps-wall-parallax-style"

function ensureWallParallaxStyles(): void {
  if (typeof document === "undefined") {
    return
  }

  if (document.getElementById(WALL_PARALLAX_STYLE_ID)) {
    return
  }

  const style = document.createElement("style")
  style.id = WALL_PARALLAX_STYLE_ID
  style.textContent = [
    "@keyframes mps-wall-scene-float {",
    "0% { transform: rotateX(12deg) rotateY(-8deg) translateZ(0); }",
    "100% { transform: rotateX(18deg) rotateY(-12deg) translateZ(100px); }",
    "}",
    "@keyframes mps-wall-row-scroll {",
    "0% { transform: translateX(0); }",
    "100% { transform: translateX(var(--mps-row-shift-end, -50%)); }",
    "}",
    "@keyframes mps-wall-ui-drift {",
    "0% { transform: translateY(0) translateX(0); }",
    "100% { transform: translateY(-10px) translateX(10px); }",
    "}"
  ].join("\n")
  document.head.append(style)
}

export function createWallRouteShell(createElement: ElementFactory): {
  root: HTMLElement
  wallCard: HTMLElement
} {
  ensureWallParallaxStyles()

  const root = createElement("main", { testId: "poster-wall-root" })
  root.style.minHeight = "100vh"
  root.style.display = "grid"
  root.style.placeItems = "center"
  root.style.padding = "0"
  root.style.position = "relative"
  root.style.overflow = "hidden"
  root.style.isolation = "isolate"
  root.style.perspective = "2000px"
  root.style.background = [
    "radial-gradient(circle at 70% 30%, rgba(26, 42, 74, 0.42) 0%, transparent 70%)",
    "linear-gradient(165deg, #020202 0%, #03050c 58%, #020202 100%)"
  ].join(",")
  root.style.color = "var(--mps-color-foreground)"
  root.style.fontFamily = "var(--mps-font-body)"

  const ambientGlow = createElement("div")
  ambientGlow.setAttribute("aria-hidden", "true")
  ambientGlow.style.position = "fixed"
  ambientGlow.style.inset = "0"
  ambientGlow.style.zIndex = "0"
  ambientGlow.style.pointerEvents = "none"
  ambientGlow.style.opacity = "0.15"
  ambientGlow.style.filter = "blur(120px)"
  ambientGlow.style.transition = "background 4s cubic-bezier(0.4, 0, 0.2, 1)"
  ambientGlow.style.background = "radial-gradient(circle at 70% 30%, rgba(26, 42, 74, 1) 0%, transparent 70%)"

  const horizonVignette = createElement("div")
  horizonVignette.setAttribute("aria-hidden", "true")
  horizonVignette.style.position = "fixed"
  horizonVignette.style.inset = "0"
  horizonVignette.style.pointerEvents = "none"
  horizonVignette.style.zIndex = "5"
  horizonVignette.style.background = "radial-gradient(circle at center, transparent 40%, rgba(0, 0, 0, 0.62) 100%)"

  const wallCard = createElement("section")
  wallCard.style.width = "100%"
  wallCard.style.height = "100vh"
  wallCard.style.position = "absolute"
  wallCard.style.inset = "0"
  wallCard.style.display = "flex"
  wallCard.style.alignItems = "center"
  wallCard.style.justifyContent = "center"
  wallCard.style.overflow = "visible"
  wallCard.style.zIndex = "2"

  root.append(ambientGlow, horizonVignette)

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
