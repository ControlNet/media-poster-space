import {
  afterglowOrbitLayer,
  brandTypography,
  cinematicDarkPalette,
  createDynamicAccentTokens,
  elevationScale,
  getBrandFontFamilies,
  radiusScale,
  spacingScale,
  toFontFamilyValue
} from "@mps/core/tokens";

export type CssTokenVariables = Record<`--${string}`, string>;

export function createDynamicAccentCssVariables(mediaAccent?: string): CssTokenVariables {
  const accent = createDynamicAccentTokens(mediaAccent);

  return {
    "--mps-color-accent": accent.accent,
    "--mps-color-accent-muted": accent.accentMuted,
    "--mps-color-accent-soft": accent.accentSoft,
    "--mps-color-accent-foreground": accent.accentForeground,
    "--mps-color-accent-ring": accent.accentRing
  };
}

export function createTypographyCssVariables(brandFontLoaded = true): CssTokenVariables {
  const fontFamilies = getBrandFontFamilies({ brandFontLoaded });

  return {
    "--mps-font-display": toFontFamilyValue(fontFamilies.display),
    "--mps-font-body": toFontFamilyValue(fontFamilies.body),
    "--mps-font-mono": toFontFamilyValue(fontFamilies.mono)
  };
}

export function createCinematicBaseCssVariables(mediaAccent?: string): CssTokenVariables {
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
    ...createDynamicAccentCssVariables(mediaAccent),
    ...createTypographyCssVariables(true)
  };
}

export const cinematicTokenScales = {
  spacing: spacingScale,
  radius: radiusScale,
  elevation: elevationScale
} as const;

export const brandFontMetadata = {
  displayFamily: brandTypography.displayFamily,
  bodyFamily: brandTypography.bodyFamily,
  fallbackBodyFamily: toFontFamilyValue(getBrandFontFamilies({ brandFontLoaded: false }).body)
} as const;
