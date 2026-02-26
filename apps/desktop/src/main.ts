import {
  afterglowOrbitLayer,
  cinematicDarkPalette,
  createDynamicAccentTokens,
  elevationScale,
  getBrandFontFamilies,
  radiusScale,
  spacingScale,
  toFontFamilyValue
} from "@mps/core/tokens"

import { createDesktopOnboardingAppRuntime } from "./onboarding/runtime"

function applyCssVariables(variables: Record<`--${string}`, string>, target: HTMLElement): void {
  for (const [name, value] of Object.entries(variables)) {
    target.style.setProperty(name, value)
  }
}

function createDesktopCssVariables(mediaAccent?: string): Record<`--${string}`, string> {
  const accent = createDynamicAccentTokens(mediaAccent)
  const fonts = getBrandFontFamilies({ brandFontLoaded: true })

  return {
    "--mps-color-canvas": cinematicDarkPalette.canvas,
    "--mps-color-surface": cinematicDarkPalette.surfaceBase,
    "--mps-color-surface-raised": cinematicDarkPalette.surfaceRaised,
    "--mps-color-border": cinematicDarkPalette.borderSubtle,
    "--mps-color-foreground": cinematicDarkPalette.textPrimary,
    "--mps-color-foreground-muted": cinematicDarkPalette.textSecondary,
    "--mps-color-foreground-emphasis": afterglowOrbitLayer.contrastEmphasis,
    "--mps-color-foreground-support": afterglowOrbitLayer.contrastSupport,
    "--mps-color-orbit-glow": afterglowOrbitLayer.orbitalGlow,
    "--mps-color-orbit-glow-halo": afterglowOrbitLayer.orbitalGlowHalo,
    "--mps-color-telemetry": afterglowOrbitLayer.telemetryAccent,
    "--mps-color-telemetry-muted": afterglowOrbitLayer.telemetryAccentMuted,
    "--mps-color-telemetry-soft": afterglowOrbitLayer.telemetryAccentSoft,
    "--mps-overlay-depth-near": afterglowOrbitLayer.depthOverlayNear,
    "--mps-overlay-depth-far": afterglowOrbitLayer.depthOverlayFar,
    "--mps-space-md": spacingScale.md,
    "--mps-space-xl": spacingScale.xl,
    "--mps-radius-lg": radiusScale.lg,
    "--mps-elevation-dramatic": elevationScale.dramatic,
    "--mps-elevation-orbit": elevationScale.orbit,
    "--mps-color-accent": accent.accent,
    "--mps-color-accent-muted": accent.accentMuted,
    "--mps-color-accent-soft": accent.accentSoft,
    "--mps-color-accent-foreground": accent.accentForeground,
    "--mps-color-accent-ring": accent.accentRing,
    "--mps-font-display": toFontFamilyValue(fonts.display),
    "--mps-font-body": toFontFamilyValue(fonts.body),
    "--mps-font-mono": toFontFamilyValue(fonts.mono)
  }
}

const rootElement = document.documentElement

applyCssVariables(createDesktopCssVariables(), rootElement)

document.body.replaceChildren()

const desktopRuntime = createDesktopOnboardingAppRuntime(document.body)
desktopRuntime.start()
window.addEventListener("beforeunload", () => desktopRuntime.dispose(), { once: true })
