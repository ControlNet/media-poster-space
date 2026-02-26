import {
  afterglowOrbitLayer,
  cinematicDarkPalette,
  createDynamicAccentTokens,
  elevationScale,
  radiusScale,
  spacingScale
} from "@mps/core/tokens";

const defaultAccent = createDynamicAccentTokens();

const tailwindConfig = {
  darkMode: ["class", '[data-theme="cinematic-dark"]'],
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--mps-color-canvas)",
        surface: "var(--mps-color-surface)",
        "surface-raised": "var(--mps-color-surface-raised)",
        border: "var(--mps-color-border)",
        foreground: "var(--mps-color-foreground)",
        "foreground-muted": "var(--mps-color-foreground-muted)",
        "foreground-emphasis": "var(--mps-color-foreground-emphasis)",
        "foreground-support": "var(--mps-color-foreground-support)",
        accent: "var(--mps-color-accent)",
        "accent-muted": "var(--mps-color-accent-muted)",
        "accent-soft": "var(--mps-color-accent-soft)",
        "accent-foreground": "var(--mps-color-accent-foreground)",
        telemetry: "var(--mps-color-telemetry)",
        "telemetry-muted": "var(--mps-color-telemetry-muted)",
        "telemetry-soft": "var(--mps-color-telemetry-soft)",
        "orbit-glow": "var(--mps-color-orbit-glow)",
        success: cinematicDarkPalette.success,
        danger: cinematicDarkPalette.danger
      },
      spacing: spacingScale,
      borderRadius: radiusScale,
      boxShadow: {
        ...elevationScale,
        orbit: "var(--mps-elevation-orbit)"
      },
      backgroundImage: {
        "depth-orbit":
          "linear-gradient(180deg, var(--mps-overlay-depth-near) 0%, var(--mps-overlay-depth-far) 100%), radial-gradient(circle at 50% 20%, var(--mps-color-orbit-glow-halo) 0%, transparent 66%)"
      },
      outlineColor: {
        telemetry: "var(--mps-color-telemetry)",
        orbit: afterglowOrbitLayer.orbitalGlow
      },
      ringColor: {
        accent: defaultAccent.accentRing
      },
      fontFamily: {
        display: ["var(--mps-font-display)"],
        body: ["var(--mps-font-body)"],
        mono: ["var(--mps-font-mono)"]
      }
    }
  }
};

export default tailwindConfig;
