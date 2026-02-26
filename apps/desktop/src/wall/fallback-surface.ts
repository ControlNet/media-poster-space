interface CreateElementOptions {
  className?: string
  textContent?: string
  testId?: string
}

type CreateElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: CreateElementOptions
) => HTMLElementTagNameMap[K]

export function renderWallFallbackSurface(options: {
  container: HTMLElement
  createElement: CreateElement
  title: string
  body: string
  onBack: () => void
}): void {
  const { container, createElement, title, body, onBack } = options

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

  const titleElement = createElement("h1", { textContent: title })
  titleElement.style.margin = "0"
  titleElement.style.fontFamily = "var(--mps-font-display)"
  titleElement.style.lineHeight = "1.15"

  const bodyElement = createElement("p", { textContent: body })
  bodyElement.style.margin = "0"

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
  backButton.addEventListener("click", onBack)

  fallbackCard.append(titleElement, bodyElement, backButton)
  fallback.append(fallbackCard)
  container.append(fallback)
}
