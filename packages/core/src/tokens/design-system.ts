export const cinematicDarkPalette = {
  canvas: "#080c14",
  surfaceBase: "#101728",
  surfaceRaised: "#182238",
  surfaceOverlay: "#243149",
  borderSubtle: "#33425e",
  textPrimary: "#f4efe4",
  textSecondary: "#b9b3a6",
  textTertiary: "#8b8f9e",
  success: "#6dc8a4",
  danger: "#d86868",
  accentFallback: "#d2a65a"
} as const;

export const afterglowOrbitLayer = {
  orbitalGlow: "rgba(122, 217, 255, 0.42)",
  orbitalGlowHalo: "rgba(122, 217, 255, 0.2)",
  telemetryAccent: "#7ad9ff",
  telemetryAccentMuted: "#456f87",
  telemetryAccentSoft: "#24394b",
  depthOverlayNear: "rgba(12, 24, 44, 0.72)",
  depthOverlayFar: "rgba(3, 8, 18, 0.9)",
  contrastEmphasis: "#fcf8f0",
  contrastSupport: "#d8deea"
} as const;

export const spacingScale = {
  "2xs": "0.125rem",
  xs: "0.25rem",
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.5rem",
  "2xl": "2rem",
  "3xl": "3rem",
  "4xl": "4rem",
  "5xl": "6rem"
} as const;

export const radiusScale = {
  none: "0px",
  sm: "0.375rem",
  md: "0.625rem",
  lg: "0.875rem",
  xl: "1.125rem",
  "2xl": "1.5rem",
  pill: "999px"
} as const;

export const elevationScale = {
  flat: "none",
  subtle: "0 10px 28px -18px rgba(1, 5, 13, 0.86)",
  medium: "0 20px 44px -20px rgba(1, 5, 13, 0.9)",
  dramatic: "0 24px 68px -18px rgba(0, 0, 0, 0.92)",
  glow: "0 0 0 1px rgba(210, 166, 90, 0.25), 0 0 42px rgba(210, 166, 90, 0.28)",
  orbit: "0 0 0 1px rgba(122, 217, 255, 0.28), 0 0 40px rgba(122, 217, 255, 0.26), 0 0 74px rgba(8, 19, 35, 0.88)"
} as const;

export const brandTypography = {
  displayFamily: '"Soehne Breit"',
  bodyFamily: '"Soehne Buch"',
  fallbackSans: [
    '"Avenir Next"',
    '"Segoe UI"',
    "system-ui",
    "-apple-system",
    '"Helvetica Neue"',
    "sans-serif"
  ],
  fallbackDisplay: ['"Avenir Next Condensed"', '"Segoe UI"', "system-ui", "sans-serif"],
  monoFamily: ['"IBM Plex Mono"', '"SFMono-Regular"', "ui-monospace", "Menlo", "monospace"]
} as const;

export type SpacingToken = keyof typeof spacingScale;
export type RadiusToken = keyof typeof radiusScale;
export type ElevationToken = keyof typeof elevationScale;

export interface DynamicAccentTokens {
  source: "media" | "fallback";
  accent: string;
  accentMuted: string;
  accentSoft: string;
  accentForeground: string;
  accentRing: string;
  contrastRatio: number;
  usedFallback: boolean;
}

function normalizeHexColor(input?: string): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const normalized = input.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  const withHash = normalized.startsWith("#") ? normalized : `#${normalized}`;
  const shortHexMatch = /^#([0-9a-f]{3})$/i.exec(withHash);
  if (shortHexMatch) {
    const [, shortHex] = shortHexMatch;
    if (!shortHex) {
      return null;
    }

    const [r, g, b] = shortHex.split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return /^#[0-9a-f]{6}$/i.test(withHash) ? withHash : null;
}

function hexToRgb(hexColor: string): readonly [number, number, number] {
  const source = hexColor.slice(1);

  return [
    Number.parseInt(source.slice(0, 2), 16),
    Number.parseInt(source.slice(2, 4), 16),
    Number.parseInt(source.slice(4, 6), 16)
  ];
}

function rgbToHex(rgb: readonly [number, number, number]): string {
  return `#${rgb
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHex(baseColor: string, blendColor: string, blendWeight: number): string {
  const weight = Math.max(0, Math.min(1, blendWeight));
  const [baseR, baseG, baseB] = hexToRgb(baseColor);
  const [blendR, blendG, blendB] = hexToRgb(blendColor);

  const mixed: [number, number, number] = [
    baseR * (1 - weight) + blendR * weight,
    baseG * (1 - weight) + blendG * weight,
    baseB * (1 - weight) + blendB * weight
  ];

  return rgbToHex(mixed);
}

function channelToLinear(channel: number): number {
  const scaled = channel / 255;

  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hexColor: string): number {
  const [red, green, blue] = hexToRgb(hexColor);
  const linearRed = channelToLinear(red);
  const linearGreen = channelToLinear(green);
  const linearBlue = channelToLinear(blue);

  return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
}

export function getContrastRatio(foreground: string, background: string): number {
  const light = luminance(foreground);
  const dark = luminance(background);
  const lighter = Math.max(light, dark);
  const darker = Math.min(light, dark);

  return (lighter + 0.05) / (darker + 0.05);
}

function pickAccessibleForeground(accentColor: string): {
  foreground: string;
  contrastRatio: number;
} {
  const onDark = "#ffffff";
  const onLight = "#121620";

  const darkRatio = getContrastRatio(onDark, accentColor);
  const lightRatio = getContrastRatio(onLight, accentColor);

  if (darkRatio >= lightRatio) {
    return {
      foreground: onDark,
      contrastRatio: darkRatio
    };
  }

  return {
    foreground: onLight,
    contrastRatio: lightRatio
  };
}

export function createDynamicAccentTokens(mediaAccent?: string): DynamicAccentTokens {
  const normalizedAccent = normalizeHexColor(mediaAccent);
  const accent = normalizedAccent ?? cinematicDarkPalette.accentFallback;
  const { foreground, contrastRatio } = pickAccessibleForeground(accent);

  return {
    source: normalizedAccent ? "media" : "fallback",
    accent,
    accentMuted: mixHex(accent, cinematicDarkPalette.canvas, 0.64),
    accentSoft: mixHex(accent, cinematicDarkPalette.surfaceRaised, 0.45),
    accentForeground: foreground,
    accentRing: mixHex(accent, "#ffffff", 0.2),
    contrastRatio: Number(contrastRatio.toFixed(2)),
    usedFallback: normalizedAccent === null
  };
}

export function getBrandFontFamilies(options?: {
  brandFontLoaded?: boolean;
  displayFamily?: string;
  bodyFamily?: string;
}): {
  display: readonly string[];
  body: readonly string[];
  mono: readonly string[];
} {
  const hasBrandFont = options?.brandFontLoaded ?? true;
  const display = hasBrandFont
    ? [options?.displayFamily ?? brandTypography.displayFamily, ...brandTypography.fallbackDisplay]
    : [...brandTypography.fallbackDisplay];
  const body = hasBrandFont
    ? [options?.bodyFamily ?? brandTypography.bodyFamily, ...brandTypography.fallbackSans]
    : [...brandTypography.fallbackSans];

  return {
    display,
    body,
    mono: [...brandTypography.monoFamily]
  };
}

export function toFontFamilyValue(stack: readonly string[]): string {
  return stack.join(", ");
}
