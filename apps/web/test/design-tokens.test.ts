import { describe, expect, it } from "vitest";

import {
  afterglowOrbitLayer,
  cinematicDarkPalette,
  createDynamicAccentTokens,
  getBrandFontFamilies,
  getContrastRatio,
  spacingScale
} from "@mps/core/tokens";

import tailwindConfig from "../tailwind.config";
import {
  brandFontMetadata,
  cinematicTokenScales,
  createDynamicAccentCssVariables,
  createCinematicBaseCssVariables,
  createTypographyCssVariables
} from "../src/styles/design-tokens";

describe("design-tokens", () => {
  it("maps cinematic spacing/radius/elevation scales into web token exports", () => {
    expect(cinematicTokenScales.spacing["2xl"]).toBe(spacingScale["2xl"]);
    expect(cinematicTokenScales.radius.pill).toBe("999px");
    expect(cinematicTokenScales.elevation.dramatic).toContain("rgba");
  });

  it("creates dynamic accent tokens with accessible contrast from media colors", () => {
    const accent = createDynamicAccentTokens("#3f6ad9");

    expect(accent.source).toBe("media");
    expect(accent.usedFallback).toBe(false);
    expect(accent.contrastRatio).toBeGreaterThanOrEqual(4.5);

    const computedRatio = getContrastRatio(accent.accentForeground, accent.accent);
    expect(computedRatio).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back to cinematic default accent when media accent is malformed", () => {
    const accent = createDynamicAccentTokens("definitely-not-a-color");

    expect(accent.usedFallback).toBe(true);
    expect(accent.source).toBe("fallback");
    expect(accent.accent).toBe(cinematicDarkPalette.accentFallback);
    expect(accent.contrastRatio).toBeGreaterThanOrEqual(4.5);
  });

  it("provides automatic system fallback chain when brand fonts fail to load", () => {
    const fallbackStack = getBrandFontFamilies({ brandFontLoaded: false });
    const cssFallbackVariables = createTypographyCssVariables(false);

    expect(fallbackStack.display[0]).toBe('"Avenir Next Condensed"');
    expect(fallbackStack.body[0]).toBe('"Avenir Next"');
    expect(fallbackStack.body).toContain("system-ui");
    expect(cssFallbackVariables["--mps-font-body"]).toContain("system-ui");
    expect(cssFallbackVariables["--mps-font-body"]).not.toContain("Soehne Buch");
    expect(brandFontMetadata.fallbackBodyFamily).toContain("system-ui");
  });

  it("emits tailwind theme extensions bound to cinematic token variables", () => {
    const config = tailwindConfig as {
      theme: {
        extend: {
          colors: Record<string, string>;
          spacing: Record<string, string>;
          borderRadius: Record<string, string>;
          boxShadow: Record<string, string>;
          fontFamily: Record<string, string[]>;
        };
      };
    };

    expect(config.theme.extend.colors.canvas).toBe("var(--mps-color-canvas)");
    expect(config.theme.extend.colors.accent).toBe("var(--mps-color-accent)");
    expect(config.theme.extend.spacing["3xl"]).toBe("3rem");
    expect(config.theme.extend.borderRadius.lg).toBe("0.875rem");
    expect(config.theme.extend.boxShadow.glow).toContain("rgba(210, 166, 90");
    const bodyFontFamily = config.theme.extend.fontFamily.body;
    expect(bodyFontFamily).toBeDefined();
    expect(bodyFontFamily?.[0]).toBe("var(--mps-font-body)");
  });

  it("builds a complete cinematic variable snapshot for app shell consumption", () => {
    const variables = createCinematicBaseCssVariables("#4d8ad1");

    expect(variables["--mps-color-canvas"]).toBe(cinematicDarkPalette.canvas);
    expect(variables["--mps-color-accent"]).toBe("#4d8ad1");
    expect(variables["--mps-font-display"]).toContain("Soehne Breit");
  });

  it("projects afterglow orbit semantic tokens without breaking legacy cinematic keys", () => {
    const variables = createCinematicBaseCssVariables("#4d8ad1");

    expect(variables["--mps-color-canvas"]).toBe(cinematicDarkPalette.canvas);
    expect(variables["--mps-color-orbit-glow"]).toBe(afterglowOrbitLayer.orbitalGlow);
    expect(variables["--mps-color-orbit-glow-halo"]).toBe(afterglowOrbitLayer.orbitalGlowHalo);
    expect(variables["--mps-color-telemetry"]).toBe(afterglowOrbitLayer.telemetryAccent);
    expect(variables["--mps-overlay-depth-near"]).toBe(afterglowOrbitLayer.depthOverlayNear);
    expect(variables["--mps-overlay-depth-far"]).toBe(afterglowOrbitLayer.depthOverlayFar);
  });

  it("keeps dynamic accent css variable contract stable", () => {
    const accentVariables = createDynamicAccentCssVariables("#4d8ad1");

    expect(Object.keys(accentVariables).sort()).toEqual([
      "--mps-color-accent",
      "--mps-color-accent-foreground",
      "--mps-color-accent-muted",
      "--mps-color-accent-ring",
      "--mps-color-accent-soft"
    ]);
  });
});
