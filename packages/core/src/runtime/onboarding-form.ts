import type { MediaLibrary } from "../provider"
import { cinematicDarkPalette, connectMotion, connectSurfaceLayer } from "../tokens"
import type { OnboardingElementFactory } from "./onboarding-shared"

export type OnboardingProviderId = "jellyfin" | "emby" | "plex"

const ONBOARDING_PROVIDER_ORDER: readonly OnboardingProviderId[] = ["jellyfin", "emby", "plex"]

/** The button sits under the platform's own name, so it does not repeat it. */
const ONBOARDING_LOGIN_LABEL = "Login"

/**
 * Fills the status row before there is anything to report, so the reserved
 * height does not read as a gap. Keep it to one line at the card width -
 * wrapping here is what pushes the credentials down when preflight answers.
 */
const ONBOARDING_IDLE_STATUS_TEXT = "Reachability is checked when you leave this field."

interface OnboardingProviderPresentation {
  readonly label: string
  readonly accentColor: string
  readonly placeholder: string
  readonly iconSvg: string
}

const ONBOARDING_PROVIDER_PRESENTATIONS: Record<OnboardingProviderId, OnboardingProviderPresentation> = {
  jellyfin: {
    label: "Jellyfin",
    accentColor: "#aa5cc3",
    placeholder: "https://jellyfin.yourdomain.com",
    iconSvg: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"currentColor\" d=\"M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.682 0C25.384 18.573 15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189.518 1.04 7.348 1.027 7.86 0 .511-1.027-2.874-7.19-3.93-7.19z\"/></svg>"
  },
  emby: {
    label: "Emby",
    accentColor: "#52b54b",
    placeholder: "https://emby.yourdomain.com",
    iconSvg: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"currentColor\" d=\"M11.041 0c-.007 0-1.456 1.43-3.219 3.176L4.615 6.352l.512.513.512.512-2.819 2.791L0 12.961l1.83 1.848c1.006 1.016 2.438 2.46 3.182 3.209l1.351 1.359.508-.496c.28-.273.515-.498.524-.498.008 0 1.266 1.264 2.794 2.808L12.97 24l.187-.182c.23-.225 5.007-4.95 5.717-5.656l.52-.516-.502-.513c-.276-.282-.5-.52-.496-.53.003-.009 1.264-1.26 2.802-2.783 1.538-1.522 2.8-2.776 2.803-2.785.005-.012-3.617-3.684-6.107-6.193L17.65 4.6l-.505.505c-.279.278-.517.501-.53.497-.013-.005-1.27-1.267-2.793-2.805A449.655 449.655 0 0011.041 0zM9.223 7.367c.091.038 7.951 4.608 7.957 4.627.003.013-1.781 1.056-3.965 2.32a999.898 999.898 0 01-3.996 2.307c-.019.006-.026-1.266-.026-4.629 0-3.7.007-4.634.03-4.625Z\"/></svg>"
  },
  plex: {
    label: "Plex",
    accentColor: "#e5a00d",
    placeholder: "https://plex.yourdomain.com",
    iconSvg: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"currentColor\" d=\"M3.987 8.409c-.96 0-1.587.28-2.12.933v-.72H0v8.88s.038.018.127.037c.138.03.821.187 1.331-.249.441-.377.542-.814.542-1.318v-1.283c.533.573 1.147.813 2 .813 1.84 0 3.253-1.493 3.253-3.48 0-2.12-1.36-3.613-3.266-3.613Zm16.748 5.595.406.591c.391.614.894.906 1.492.908.621-.012 1.064-.562 1.226-.755 0 0-.307-.27-.686-.72-.517-.614-1.214-1.755-1.24-1.803l-1.198 1.779Zm-3.205-1.955c0-2.08-1.52-3.64-3.52-3.64s-3.467 1.587-3.467 3.573a3.48 3.48 0 0 0 3.507 3.52c1.413 0 2.626-.84 3.253-2.293h-2.04l-.093.093c-.427.4-.72.533-1.227.533-.787 0-1.373-.506-1.453-1.266h4.986c.04-.214.054-.307.054-.52Zm-7.671-.219c0 .769.11 1.701.868 2.722l.056.069c-.306.526-.742.88-1.248.88-.399 0-.814-.211-1.138-.579a2.177 2.177 0 0 1-.538-1.441V6.409H9.86l-.001 5.421Zm9.283 3.46h-2.39l2.247-3.332-2.247-3.335h2.39l2.248 3.335-2.248 3.332Zm1.593-1.286Zm-17.162-.342c-.933 0-1.68-.773-1.68-1.72s.76-1.666 1.68-1.666c.92 0 1.68.733 1.68 1.68 0 .946-.733 1.706-1.68 1.706Zm18.361-1.974L24 8.622h-2.391l-.87 1.293 1.195 1.773Zm-9.404-.466c.16-.706.72-1.133 1.493-1.133.773 0 1.373.467 1.507 1.133h-3Z\"/></svg>"
  }
}

const CONNECT_STYLE_ELEMENT_ID = "mps-connect-style"

/**
 * The connect screen is rebuilt from scratch on every render, so the
 * platform-switch motion cannot ride on CSS transitions - it has to be keyframes
 * that replay on mount. Each keyframe reads its starting value from a custom
 * property the view sets per element, which is how a resize or a tint knows
 * where it is coming from.
 */
function ensureConnectStyles(): void {
  if (typeof document === "undefined") {
    return
  }

  if (document.getElementById(CONNECT_STYLE_ELEMENT_ID)) {
    return
  }

  const style = document.createElement("style")
  style.id = CONNECT_STYLE_ELEMENT_ID
  style.textContent = [
    "@keyframes mps-connect-panel-resize {",
    `from { width: var(--mps-connect-panel-from, ${connectSurfaceLayer.railWidth}); }`,
    "}",
    "@keyframes mps-connect-tint {",
    "from { background-color: var(--mps-connect-tint-from); border-color: var(--mps-connect-tint-from); }",
    "}",
    "@keyframes mps-connect-rise {",
    "from { opacity: 0; transform: translateY(12px); }",
    "}",
    "@keyframes mps-connect-fade {",
    "from { opacity: 0; }",
    "}",
    ".mps-connect-glyph svg { width: 100%; height: 100%; display: block; }",
    ".mps-connect-provider-button { appearance: none; -webkit-appearance: none; background: none; border: 0; padding: 0; color: inherit; font: inherit; }",
    ".mps-connect-provider-button:focus-visible { outline: 2px solid var(--mps-connect-accent); outline-offset: -4px; }",
    ".mps-connect-rail-glyph { transition: filter " + connectMotion.railFadeMs + "ms ease, transform " + connectMotion.railFadeMs + "ms ease; }",
    // Hover feedback is deliberately paint-only. Changing a rail's width here
    // overflowed the flex row (nothing gives the space back) and shifted the
    // whole selected panel sideways by the difference.
    `.mps-connect-panel[data-selected="false"] { transition: background-color ${connectMotion.railFadeMs}ms ease; }`,
    `.mps-connect-panel[data-selected="false"]:hover, .mps-connect-panel[data-selected="false"]:focus-within { background-color: ${connectSurfaceLayer.railHover} !important; }`,
    `.mps-connect-rail-wash { position: absolute; inset: 0; opacity: 0; transform: translateY(14%); pointer-events: none; transition: opacity ${connectMotion.railWashMs}ms ease, transform ${connectMotion.railWashMs}ms ease; }`,
    `.mps-connect-panel[data-selected="false"]:hover .mps-connect-rail-wash, .mps-connect-panel[data-selected="false"]:focus-within .mps-connect-rail-wash { opacity: ${connectSurfaceLayer.railWashOpacity}; transform: none; }`,
    `.mps-connect-edge { transition: opacity ${connectMotion.railFadeMs}ms ease; }`,
    // The rail edge carries its resting opacity inline, so this has to outrank it.
    ".mps-connect-panel[data-selected=\"false\"]:hover .mps-connect-edge, .mps-connect-panel[data-selected=\"false\"]:focus-within .mps-connect-edge { opacity: 1 !important; }",
    ".mps-connect-panel[data-selected=\"false\"]:hover .mps-connect-rail-glyph, .mps-connect-panel[data-selected=\"false\"]:focus-within .mps-connect-rail-glyph { filter: none; transform: scale(1.06); }",
    `.mps-connect-rise > * { animation: mps-connect-rise ${connectMotion.contentRiseMs}ms ${connectMotion.panelResizeEasing} both; }`,
    `.mps-connect-rise > *:nth-child(1) { animation-delay: ${connectMotion.contentStaggerMs}ms; }`,
    `.mps-connect-rise > *:nth-child(2) { animation-delay: ${connectMotion.contentStaggerMs * 2}ms; }`,
    `.mps-connect-rise > *:nth-child(3) { animation-delay: ${connectMotion.contentStaggerMs * 3}ms; }`,
    `.mps-connect-rise > *:nth-child(4) { animation-delay: ${connectMotion.contentStaggerMs * 4}ms; }`,
    `.mps-connect-rise > *:nth-child(n + 5) { animation-delay: ${connectMotion.contentStaggerMs * 5}ms; }`,
    `.mps-connect-fade { animation: mps-connect-fade ${connectMotion.railFadeMs}ms ease both; }`,
    "@media (prefers-reduced-motion: reduce) {",
    ".mps-connect-panel, .mps-connect-rail-glyph, .mps-connect-rail-wash, .mps-connect-edge, .mps-connect-primary { animation: none !important; transition: none !important; }",
    ".mps-connect-rise > *, .mps-connect-fade { animation: none !important; }",
    "}"
  ].join("\n")
  document.head.append(style)
}

/**
 * Where the panels actually are on screen right now.
 *
 * The connect screen is torn down and rebuilt on every state change, so a resize
 * that started on one render is destroyed by the next one - which is what made
 * the switch animation vanish whenever a filled server address kicked off a
 * preflight a few milliseconds later. Measuring first lets the new panels pick
 * the motion up from wherever the old ones had got to.
 */
export interface ConnectPanelLayoutSnapshot {
  shellWidth: number
  panelWidths: Partial<Record<OnboardingProviderId, number>>
}

export function measureConnectPanelLayout(root: ParentNode): ConnectPanelLayoutSnapshot | null {
  const selector = root.querySelector<HTMLElement>("[data-testid=\"provider-selector\"]")
  if (!selector) {
    return null
  }

  const shellWidth = selector.getBoundingClientRect().width
  if (shellWidth <= 0) {
    return null
  }

  const panelWidths: Partial<Record<OnboardingProviderId, number>> = {}
  for (const panel of root.querySelectorAll<HTMLElement>(".mps-connect-panel")) {
    const providerId = panel.dataset.provider as OnboardingProviderId | undefined
    if (providerId) {
      panelWidths[providerId] = panel.getBoundingClientRect().width
    }
  }

  return { shellWidth, panelWidths }
}

export interface OnboardingFormViewState {
  selectedProviderId: OnboardingProviderId
  serverUrl: string
  rememberServer: boolean
  preflightPending: boolean
  preflightCheckedServerUrl: string | null
  preflightServerVersion: string | null
  preflightLatencyMs: number | null
  preflightError: string | null
  username: string
  password: string
  rememberUsername: boolean
  rememberPasswordRequested: boolean
  loginPending: boolean
  authError: string | null
  libraries: readonly MediaLibrary[]
  selectedLibraryIds: ReadonlySet<string>
  finishPending: boolean
  libraryError: string | null
}

export interface CreateOnboardingFormViewOptions {
  createElement: OnboardingElementFactory
  state: OnboardingFormViewState
  rememberPasswordLabel: string
  rememberPasswordDisabled?: boolean
  showRememberPasswordToggle?: boolean
  authenticationAvailable: boolean
  providerSelectionMessage?: string | null
  /**
   * Platform the view is switching away from, when this render was caused by a
   * platform change. Drives the resize and tint keyframes; leave unset on every
   * other render so typing or a finished preflight does not replay the motion.
   */
  providerTransitionFrom?: OnboardingProviderId | null
  /** Panel geometry from just before this render, for a continuous resize. */
  previousLayout?: ConnectPanelLayoutSnapshot | null
  toLibraryCheckboxTestId: (libraryId: string) => string
  onProviderChange: (providerId: OnboardingProviderId) => void
  onServerInput: (value: string) => void
  onServerBlur: (value: string) => void
  onRememberServerChange: (remember: boolean) => void
  onUsernameInput: (value: string) => void
  onPasswordInput: (value: string) => void
  onRememberUsernameChange: (remember: boolean) => void
  onRememberPasswordChange: (remember: boolean) => void
  onLogin: () => void
  onBack: () => void
  onLibrarySelectionChange: (libraryId: string, selected: boolean) => void
  onFinish: () => void
  renderLibraryExtras?: () => readonly HTMLElement[]
  renderCardFooter?: () => HTMLElement | null
}

function appendCheckboxLabelText(createElement: OnboardingElementFactory, label: HTMLLabelElement, text: string): void {
  const copy = createElement("span", { textContent: text })
  label.append(copy)
}

function getSelectedProviderPresentation(selectedProviderId: OnboardingProviderId): OnboardingProviderPresentation {
  return ONBOARDING_PROVIDER_PRESENTATIONS[selectedProviderId]
}

function formatServerStatusText(
  state: Pick<
    OnboardingFormViewState,
    "selectedProviderId"
    | "serverUrl"
    | "preflightPending"
    | "preflightCheckedServerUrl"
    | "preflightServerVersion"
    | "preflightLatencyMs"
    | "preflightError"
  >,
  options: Pick<CreateOnboardingFormViewOptions, "authenticationAvailable" | "providerSelectionMessage">
): string {
  const providerPresentation = getSelectedProviderPresentation(state.selectedProviderId)
  const isCurrentServerChecked = state.preflightCheckedServerUrl === state.serverUrl.trim()

  if (!options.authenticationAvailable) {
    return options.providerSelectionMessage
      ?? `${providerPresentation.label} support is coming soon`
  }

  if (state.preflightPending) {
    return `Checking ${providerPresentation.label} server reachability…`
  }

  if (isCurrentServerChecked && state.preflightError) {
    return `Server unavailable — ${state.preflightError}`
  }

  if (isCurrentServerChecked && state.preflightServerVersion) {
    const latencySuffix = typeof state.preflightLatencyMs === "number"
      ? ` · ${Math.max(0, Math.round(state.preflightLatencyMs))}ms`
      : ""

    return `Server reachable · ${providerPresentation.label} ${state.preflightServerVersion}${latencySuffix}`
  }

  return ONBOARDING_IDLE_STATUS_TEXT
}

function resolveServerStatusTone(
  state: Pick<
    OnboardingFormViewState,
    "serverUrl" | "preflightPending" | "preflightCheckedServerUrl" | "preflightServerVersion" | "preflightError"
  >,
  options: Pick<CreateOnboardingFormViewOptions, "authenticationAvailable">
): "idle" | "checking" | "ok" | "error" | "notice" {
  const trimmedServerUrl = state.serverUrl.trim()
  const isCurrentServerChecked = state.preflightCheckedServerUrl === trimmedServerUrl

  if (!options.authenticationAvailable) {
    return "notice"
  }

  if (trimmedServerUrl.length === 0) {
    return "idle"
  }

  if (state.preflightPending) {
    return "checking"
  }

  if (isCurrentServerChecked && state.preflightError) {
    return "error"
  }

  if (isCurrentServerChecked && state.preflightServerVersion) {
    return "ok"
  }

  return "idle"
}

function resolveServerStatusAccent(
  tone: "idle" | "checking" | "ok" | "error" | "notice",
  providerPresentation: OnboardingProviderPresentation
): { bar: string; text: string } {
  switch (tone) {
    case "checking":
      return { bar: providerPresentation.accentColor, text: connectSurfaceLayer.textPrimary }
    case "ok":
      return { bar: cinematicDarkPalette.success, text: cinematicDarkPalette.success }
    case "error":
      return { bar: cinematicDarkPalette.danger, text: cinematicDarkPalette.danger }
    case "notice":
      return { bar: providerPresentation.accentColor, text: "rgba(242, 244, 246, 0.78)" }
    default:
      return { bar: "rgba(242, 244, 246, 0.3)", text: connectSurfaceLayer.textMuted }
  }
}

function applyServerStatusPresentation(
  element: HTMLElement,
  state: Pick<
    OnboardingFormViewState,
    "selectedProviderId"
    | "serverUrl"
    | "preflightPending"
    | "preflightCheckedServerUrl"
    | "preflightServerVersion"
    | "preflightLatencyMs"
    | "preflightError"
  >,
  options: Pick<CreateOnboardingFormViewOptions, "authenticationAvailable" | "providerSelectionMessage">
): void {
  const tone = resolveServerStatusTone(state, options)
  const providerPresentation = getSelectedProviderPresentation(state.selectedProviderId)
  const accent = resolveServerStatusAccent(tone, providerPresentation)

  element.textContent = formatServerStatusText(state, options)
  element.dataset.tone = tone

  element.style.borderLeftColor = accent.bar
  element.style.color = accent.text
}

function applyTextFieldBaseStyle(
  input: HTMLInputElement,
  providerPresentation: OnboardingProviderPresentation,
  disabled: boolean
): void {
  input.style.width = "100%"
  input.style.padding = "0.78rem 0.9rem"
  input.style.border = `1px solid ${connectSurfaceLayer.hairline}`
  input.style.borderRadius = connectSurfaceLayer.radius
  input.style.background = disabled ? "rgba(255, 255, 255, 0.03)" : connectSurfaceLayer.canvas
  input.style.color = disabled ? connectSurfaceLayer.textDim : connectSurfaceLayer.textPrimary
  input.style.fontFamily = "inherit"
  input.style.fontSize = "0.95rem"
  input.style.boxSizing = "border-box"
  input.style.transition = "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease"
  input.style.outline = "none"
  input.style.cursor = disabled ? "not-allowed" : "text"

  if (disabled) {
    return
  }

  input.addEventListener("focus", () => {
    input.style.borderColor = providerPresentation.accentColor
    input.style.boxShadow = `inset 0 -2px 0 0 ${providerPresentation.accentColor}`
  })
  input.addEventListener("blur", () => {
    input.style.borderColor = connectSurfaceLayer.hairline
    input.style.boxShadow = "none"
  })
}

function applyFieldLabelStyle(label: HTMLElement): void {
  label.style.fontFamily = "var(--mps-font-mono)"
  label.style.fontSize = "0.64rem"
  label.style.fontWeight = "500"
  label.style.letterSpacing = "0.18em"
  label.style.textTransform = "uppercase"
  label.style.color = "rgba(242, 244, 246, 0.45)"
}

function applyToggleLabelStyle(label: HTMLLabelElement, disabled: boolean): void {
  label.style.display = "inline-flex"
  label.style.gap = "0.55rem"
  label.style.alignItems = "center"
  label.style.fontSize = "0.78rem"
  label.style.color = disabled ? connectSurfaceLayer.textDim : connectSurfaceLayer.textMuted
  label.style.cursor = disabled ? "not-allowed" : "pointer"
}

function createProviderGlyph(
  createElement: OnboardingElementFactory,
  providerPresentation: OnboardingProviderPresentation,
  size: string,
  options: { dimmed: boolean; railHover: boolean }
): HTMLElement {
  const glyph = createElement("div", {
    className: options.railHover ? "mps-connect-glyph mps-connect-rail-glyph" : "mps-connect-glyph"
  })
  glyph.setAttribute("aria-hidden", "true")
  glyph.innerHTML = providerPresentation.iconSvg
  glyph.style.width = size
  glyph.style.height = size
  glyph.style.flex = "none"
  // The mark is the logo itself, inked in the platform colour - never a block behind it.
  glyph.style.color = providerPresentation.accentColor
  glyph.style.filter = options.dimmed ? "grayscale(0.12) brightness(0.92)" : "none"
  return glyph
}

function createProviderButton(
  createElement: OnboardingElementFactory,
  providerId: OnboardingProviderId,
  selectedProviderId: OnboardingProviderId,
  onSelect: (providerId: OnboardingProviderId) => void
): HTMLButtonElement {
  const button = createElement("button", {
    className: "mps-connect-provider-button",
    testId: `provider-option-${providerId}`
  }) as HTMLButtonElement
  button.type = "button"
  button.dataset.provider = providerId
  button.setAttribute("aria-pressed", providerId === selectedProviderId ? "true" : "false")
  button.addEventListener("click", () => {
    // Re-selecting would clear the session and password for no reason.
    if (providerId === selectedProviderId) {
      return
    }

    onSelect(providerId)
  })
  return button
}

export function createOnboardingFormView(options: CreateOnboardingFormViewOptions): HTMLElement {
  ensureConnectStyles()

  const { createElement, state } = options
  const providerPresentation = getSelectedProviderPresentation(state.selectedProviderId)
  const controlsDisabled = !options.authenticationAvailable
  const primaryActionLabel = options.authenticationAvailable
    ? ONBOARDING_LOGIN_LABEL
    : `${providerPresentation.label} support coming soon`
  const isStep2 = state.libraries.length > 0

  const transitionFrom = options.providerTransitionFrom ?? null
  const isSwitching = transitionFrom !== null && transitionFrom !== state.selectedProviderId
  const previousAccent = isSwitching && transitionFrom
    ? getSelectedProviderPresentation(transitionFrom).accentColor
    : null
  const selectedPanelWidth = `calc(100% - ${ONBOARDING_PROVIDER_ORDER.length - 1} * ${connectSurfaceLayer.railWidth})`

  const shell = createElement("main", { testId: "app-shell" })
  shell.style.minHeight = "100vh"
  shell.style.display = "flex"
  shell.style.flexDirection = "column"
  shell.style.background = connectSurfaceLayer.canvas
  shell.style.color = connectSurfaceLayer.textPrimary
  shell.style.fontFamily = "var(--mps-font-body)"
  shell.style.overflow = "hidden"
  shell.style.colorScheme = "dark"
  shell.style.boxSizing = "border-box"
  shell.style.setProperty("--mps-connect-accent", providerPresentation.accentColor)

  const providerSelector = createElement("div", { testId: "provider-selector" })
  providerSelector.style.flex = "1"
  providerSelector.style.display = "flex"
  providerSelector.style.minHeight = "0"
  providerSelector.style.alignItems = "stretch"

  // ---------------------------------------------------------------- step content
  const header = createElement("header")
  header.style.display = "grid"
  header.style.gap = "0.55rem"

  const heading = createElement("h1", { testId: "onboarding-title" })
  heading.style.margin = "0"
  heading.style.display = "grid"
  heading.style.gap = "0.45rem"

  const headingKicker = createElement("span", { textContent: "Connect Media Server" })
  headingKicker.style.fontFamily = "var(--mps-font-mono)"
  headingKicker.style.fontSize = "0.68rem"
  headingKicker.style.fontWeight = "500"
  headingKicker.style.letterSpacing = "0.2em"
  headingKicker.style.textTransform = "uppercase"
  headingKicker.style.color = providerPresentation.accentColor

  const headingDisplay = createElement("span", { textContent: providerPresentation.label })
  headingDisplay.style.fontSize = isStep2 ? "1.6rem" : "2.6rem"
  headingDisplay.style.fontWeight = "700"
  headingDisplay.style.lineHeight = "1"
  headingDisplay.style.letterSpacing = "-0.02em"
  headingDisplay.style.textTransform = "uppercase"
  headingDisplay.style.color = connectSurfaceLayer.textPrimary

  // The platform mark sits on the name line; `headingIdentity` is filled in once
  // the panel loop has built the button that owns it.
  const headingIdentity = createElement("div")
  headingIdentity.style.display = "flex"
  headingIdentity.style.alignItems = "center"
  headingIdentity.style.gap = "0.85rem"
  headingIdentity.append(headingDisplay)

  heading.append(headingKicker, headingIdentity)

  header.append(heading)

  const providerSupportBanner = options.providerSelectionMessage
    ? createElement("p", {
        textContent: options.providerSelectionMessage,
        testId: "provider-support-banner"
      })
    : null

  if (providerSupportBanner) {
    providerSupportBanner.style.margin = "0"
    providerSupportBanner.style.maxWidth = "34rem"
    providerSupportBanner.style.padding = "0.65rem 0.8rem"
    providerSupportBanner.style.borderRadius = connectSurfaceLayer.radius
    providerSupportBanner.style.border = `1px solid ${connectSurfaceLayer.hairline}`
    providerSupportBanner.style.borderLeft = `3px solid ${providerPresentation.accentColor}`
    providerSupportBanner.style.background = connectSurfaceLayer.card
    providerSupportBanner.style.color = "rgba(242, 244, 246, 0.78)"
    providerSupportBanner.style.fontSize = "0.82rem"
    providerSupportBanner.style.lineHeight = "1.5"
  }

  const formCard = createElement("section")
  formCard.style.width = "34rem"
  formCard.style.maxWidth = "100%"
  formCard.style.display = "grid"
  formCard.style.gap = "1.15rem"
  formCard.style.padding = "1.85rem"
  formCard.style.borderRadius = connectSurfaceLayer.radius
  formCard.style.border = `1px solid ${connectSurfaceLayer.hairline}`
  formCard.style.background = connectSurfaceLayer.card
  formCard.style.boxSizing = "border-box"

  const serverGroup = createElement("div")
  serverGroup.style.display = "grid"
  serverGroup.style.gap = "0.45rem"

  const serverLabel = createElement("label", { textContent: "Server address" })
  applyFieldLabelStyle(serverLabel)

  const serverInput = createElement("input", { testId: "server-url-input" }) as HTMLInputElement
  serverInput.type = "url"
  serverInput.name = "serverUrl"
  serverInput.placeholder = providerPresentation.placeholder
  serverInput.value = state.serverUrl
  serverInput.disabled = controlsDisabled
  applyTextFieldBaseStyle(serverInput, providerPresentation, controlsDisabled)
  if (!controlsDisabled) {
    serverInput.style.borderBottom = `2px solid ${providerPresentation.accentColor}`
  }

  const serverStatus = createElement("p", { testId: "server-status-indicator" })
  serverStatus.style.margin = "0.15rem 0 0 0"
  serverStatus.style.padding = "0.6rem 0.8rem"
  serverStatus.style.border = `1px solid ${connectSurfaceLayer.hairline}`
  serverStatus.style.borderLeftWidth = "3px"
  serverStatus.style.borderRadius = connectSurfaceLayer.radius
  serverStatus.style.background = connectSurfaceLayer.canvas
  serverStatus.style.fontFamily = "var(--mps-font-mono)"
  serverStatus.style.fontSize = "0.74rem"
  serverStatus.style.lineHeight = "1.5"
  serverStatus.style.minHeight = "2.5rem"
  serverStatus.style.boxSizing = "border-box"
  applyServerStatusPresentation(serverStatus, state, options)

  serverInput.addEventListener("input", () => {
    options.onServerInput(serverInput.value)
    applyServerStatusPresentation(serverStatus, {
      ...state,
      serverUrl: serverInput.value
    }, options)
  })
  serverInput.addEventListener("blur", () => {
    options.onServerBlur(serverInput.value)
  })

  serverGroup.append(serverLabel, serverInput, serverStatus)

  const loginForm = createElement("form") as HTMLFormElement
  loginForm.noValidate = true
  loginForm.method = "post"
  loginForm.autocomplete = "on"
  loginForm.style.display = "grid"
  loginForm.style.gap = "1rem"
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault()
    if (!options.authenticationAvailable) {
      return
    }

    options.onLogin()
  })

  const credentialsRow = createElement("div")
  credentialsRow.style.display = "grid"
  credentialsRow.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))"
  credentialsRow.style.gap = "1rem"

  const usernameLabel = createElement("label", { textContent: "Username" })
  usernameLabel.style.display = "grid"
  usernameLabel.style.gap = "0.45rem"
  applyFieldLabelStyle(usernameLabel)

  const usernameInput = createElement("input", { testId: "username-input" }) as HTMLInputElement
  usernameInput.type = "text"
  usernameInput.name = "username"
  usernameInput.autocomplete = "username"
  usernameInput.autocapitalize = "none"
  usernameInput.spellcheck = false
  usernameInput.value = state.username
  usernameInput.disabled = controlsDisabled
  applyTextFieldBaseStyle(usernameInput, providerPresentation, controlsDisabled)
  usernameInput.addEventListener("input", () => {
    options.onUsernameInput(usernameInput.value)
  })
  usernameLabel.append(usernameInput)

  const passwordLabel = createElement("label", { textContent: "Password" })
  passwordLabel.style.display = "grid"
  passwordLabel.style.gap = "0.45rem"
  applyFieldLabelStyle(passwordLabel)

  const passwordInput = createElement("input", { testId: "password-input" }) as HTMLInputElement
  passwordInput.type = "password"
  passwordInput.name = "password"
  passwordInput.autocomplete = "current-password"
  passwordInput.autocapitalize = "none"
  passwordInput.spellcheck = false
  passwordInput.value = state.password
  passwordInput.disabled = controlsDisabled
  applyTextFieldBaseStyle(passwordInput, providerPresentation, controlsDisabled)
  passwordInput.addEventListener("input", () => {
    options.onPasswordInput(passwordInput.value)
  })
  passwordLabel.append(passwordInput)

  credentialsRow.append(usernameLabel, passwordLabel)

  const rememberRow = createElement("div")
  rememberRow.style.display = "flex"
  rememberRow.style.flexWrap = "wrap"
  rememberRow.style.gap = "0.55rem 1.25rem"

  const rememberServerLabel = createElement("label")
  applyToggleLabelStyle(rememberServerLabel, controlsDisabled)
  const rememberServer = createElement("input", { testId: "remember-server-checkbox" }) as HTMLInputElement
  rememberServer.type = "checkbox"
  rememberServer.checked = state.rememberServer
  rememberServer.disabled = controlsDisabled
  rememberServer.style.accentColor = providerPresentation.accentColor
  rememberServer.addEventListener("change", () => {
    options.onRememberServerChange(rememberServer.checked)
  })
  rememberServerLabel.append(rememberServer)
  appendCheckboxLabelText(createElement, rememberServerLabel, "Remember connection")

  const rememberUsernameLabel = createElement("label")
  applyToggleLabelStyle(rememberUsernameLabel, controlsDisabled)
  const rememberUsername = createElement("input", {
    testId: "remember-username-checkbox"
  }) as HTMLInputElement
  rememberUsername.type = "checkbox"
  rememberUsername.checked = state.rememberUsername
  rememberUsername.disabled = controlsDisabled
  rememberUsername.style.accentColor = providerPresentation.accentColor
  rememberUsername.addEventListener("change", () => {
    options.onRememberUsernameChange(rememberUsername.checked)
  })
  rememberUsernameLabel.append(rememberUsername)
  appendCheckboxLabelText(createElement, rememberUsernameLabel, "Remember username")

  const rememberPasswordLabel = createElement("label")
  applyToggleLabelStyle(rememberPasswordLabel, controlsDisabled || (options.rememberPasswordDisabled ?? false))
  const rememberPassword = createElement("input", {
    testId: "remember-password-checkbox"
  }) as HTMLInputElement
  rememberPassword.type = "checkbox"
  rememberPassword.checked = state.rememberPasswordRequested
  rememberPassword.disabled = controlsDisabled || (options.rememberPasswordDisabled ?? false)
  rememberPassword.style.accentColor = providerPresentation.accentColor
  rememberPassword.addEventListener("change", () => {
    options.onRememberPasswordChange(rememberPassword.checked)
  })
  rememberPasswordLabel.append(rememberPassword)
  appendCheckboxLabelText(createElement, rememberPasswordLabel, options.rememberPasswordLabel)

  rememberRow.append(rememberServerLabel, rememberUsernameLabel)
  if (options.showRememberPasswordToggle ?? true) {
    rememberRow.append(rememberPasswordLabel)
  }

  const loginButton = createElement("button", {
    className: "mps-connect-primary",
    textContent: state.loginPending ? "Signing in…" : primaryActionLabel,
    testId: "login-submit"
  }) as HTMLButtonElement
  loginButton.type = "submit"
  loginButton.disabled = state.loginPending || state.preflightPending || controlsDisabled
  loginButton.style.padding = "0.95rem 1rem"
  loginButton.style.borderRadius = connectSurfaceLayer.radius
  loginButton.style.fontFamily = "inherit"
  loginButton.style.fontWeight = "700"
  loginButton.style.fontSize = "0.95rem"
  loginButton.style.letterSpacing = "0.1em"
  loginButton.style.textTransform = "uppercase"
  loginButton.style.cursor = loginButton.disabled ? "not-allowed" : "pointer"
  loginButton.style.transition = "filter 0.2s ease"

  if (loginButton.disabled) {
    loginButton.style.border = `1px solid rgba(242, 244, 246, 0.2)`
    loginButton.style.background = "transparent"
    loginButton.style.color = connectSurfaceLayer.textDim
  } else {
    loginButton.style.border = `1px solid ${providerPresentation.accentColor}`
    loginButton.style.background = providerPresentation.accentColor
    // Dark ink beats white on all three platform accents - see getContrastRatio.
    loginButton.style.color = connectSurfaceLayer.onAccent

    if (isSwitching && previousAccent) {
      loginButton.style.setProperty("--mps-connect-tint-from", previousAccent)
      loginButton.style.animation = `mps-connect-tint ${connectMotion.tintMs}ms ease`
    }

    loginButton.addEventListener("mouseenter", () => {
      loginButton.style.filter = "brightness(1.08)"
    })
    loginButton.addEventListener("mouseleave", () => {
      loginButton.style.filter = "brightness(1)"
    })
  }

  loginForm.append(credentialsRow, rememberRow, loginButton)

  if (state.authError) {
    const authError = createElement("p", {
      textContent: state.authError,
      testId: "auth-error-banner"
    })
    authError.style.margin = "0"
    authError.style.padding = "0.62rem 0.8rem"
    authError.style.borderRadius = connectSurfaceLayer.radius
    authError.style.border = `1px solid ${connectSurfaceLayer.hairline}`
    authError.style.borderLeft = `3px solid ${cinematicDarkPalette.danger}`
    authError.style.background = connectSurfaceLayer.canvas
    authError.style.color = cinematicDarkPalette.danger
    authError.style.fontSize = "0.82rem"
    authError.style.lineHeight = "1.5"
    loginForm.append(authError)
  }

  formCard.append(serverGroup, loginForm)

  // ------------------------------------------------------------- library section
  const librarySection = createElement("section")
  librarySection.style.width = "34rem"
  librarySection.style.maxWidth = "100%"
  librarySection.style.display = "grid"
  librarySection.style.gap = "1.15rem"
  librarySection.style.padding = "1.85rem"
  librarySection.style.borderRadius = connectSurfaceLayer.radius
  librarySection.style.border = `1px solid ${connectSurfaceLayer.hairline}`
  librarySection.style.background = connectSurfaceLayer.card
  librarySection.style.boxSizing = "border-box"

  const libraryHeading = createElement("h2", { textContent: "Library selection" })
  libraryHeading.style.margin = "0"
  libraryHeading.style.fontSize = "1.25rem"
  libraryHeading.style.fontWeight = "700"
  libraryHeading.style.letterSpacing = "-0.015em"
  libraryHeading.style.color = connectSurfaceLayer.textPrimary
  librarySection.append(libraryHeading)

  const libraryList = createElement("div")
  libraryList.style.display = "grid"
  libraryList.style.gap = "0.5rem"

  for (const library of state.libraries) {
    const isSelected = state.selectedLibraryIds.has(library.id)
    const libraryLabel = createElement("label")
    libraryLabel.style.display = "flex"
    libraryLabel.style.alignItems = "center"
    libraryLabel.style.gap = "0.65rem"
    libraryLabel.style.padding = "0.7rem 0.85rem"
    libraryLabel.style.borderRadius = connectSurfaceLayer.radius
    libraryLabel.style.background = isSelected ? connectSurfaceLayer.cardRaised : connectSurfaceLayer.canvas
    libraryLabel.style.border = `1px solid ${isSelected ? connectSurfaceLayer.hairlineStrong : connectSurfaceLayer.hairline}`
    libraryLabel.style.fontSize = "0.92rem"
    libraryLabel.style.color = "rgba(242, 244, 246, 0.88)"
    libraryLabel.style.cursor = "pointer"
    libraryLabel.style.boxSizing = "border-box"

    const libraryCheckbox = createElement("input", {
      testId: options.toLibraryCheckboxTestId(library.id)
    }) as HTMLInputElement
    libraryCheckbox.type = "checkbox"
    libraryCheckbox.checked = isSelected
    libraryCheckbox.style.accentColor = providerPresentation.accentColor
    libraryCheckbox.addEventListener("change", () => {
      options.onLibrarySelectionChange(library.id, libraryCheckbox.checked)
    })

    const nameSpan = createElement("span", { textContent: library.name })
    nameSpan.style.flex = "1"

    const kindSpan = createElement("span", { textContent: library.kind })
    kindSpan.style.fontFamily = "var(--mps-font-mono)"
    kindSpan.style.fontSize = "0.66rem"
    kindSpan.style.letterSpacing = "0.12em"
    kindSpan.style.textTransform = "uppercase"
    kindSpan.style.color = "rgba(242, 244, 246, 0.4)"

    libraryLabel.append(libraryCheckbox, nameSpan, kindSpan)
    libraryList.append(libraryLabel)
  }

  const finishButton = createElement("button", {
    className: "mps-connect-primary",
    textContent: state.finishPending ? "Preparing wall…" : "Enter wall",
    testId: "onboarding-finish"
  }) as HTMLButtonElement
  finishButton.type = "button"
  finishButton.disabled = state.finishPending
  finishButton.style.padding = "0.95rem 1rem"
  finishButton.style.borderRadius = connectSurfaceLayer.radius
  finishButton.style.border = `1px solid ${providerPresentation.accentColor}`
  finishButton.style.background = providerPresentation.accentColor
  finishButton.style.color = connectSurfaceLayer.onAccent
  finishButton.style.fontFamily = "inherit"
  finishButton.style.fontWeight = "700"
  finishButton.style.fontSize = "0.95rem"
  finishButton.style.letterSpacing = "0.1em"
  finishButton.style.textTransform = "uppercase"
  finishButton.style.transition = "filter 0.2s ease"
  finishButton.style.cursor = state.finishPending ? "not-allowed" : "pointer"
  finishButton.style.opacity = state.finishPending ? "0.55" : "1"

  if (!state.finishPending) {
    finishButton.addEventListener("mouseenter", () => {
      finishButton.style.filter = "brightness(1.08)"
    })
    finishButton.addEventListener("mouseleave", () => {
      finishButton.style.filter = "brightness(1)"
    })
  }

  finishButton.addEventListener("click", options.onFinish)

  const libraryExtras = options.renderLibraryExtras?.() ?? []
  librarySection.append(libraryList)
  for (const extra of libraryExtras) {
    librarySection.append(extra)
  }
  librarySection.append(finishButton)
  if (state.libraryError) {
    const libraryError = createElement("p", { textContent: state.libraryError })
    libraryError.style.margin = "0"
    libraryError.style.color = cinematicDarkPalette.danger
    libraryError.style.fontSize = "0.9rem"
    librarySection.append(libraryError)
  }

  // ------------------------------------------------------------------- panels
  for (const providerId of ONBOARDING_PROVIDER_ORDER) {
    const panelPresentation = ONBOARDING_PROVIDER_PRESENTATIONS[providerId]
    const isPanelSelected = providerId === state.selectedProviderId
    const panelWidth = isPanelSelected ? selectedPanelWidth : connectSurfaceLayer.railWidth

    const panel = createElement("div", { className: "mps-connect-panel" })
    panel.dataset.provider = providerId
    panel.dataset.selected = isPanelSelected ? "true" : "false"
    panel.style.position = "relative"
    panel.style.flex = "none"
    panel.style.width = panelWidth
    panel.style.overflow = "hidden"
    panel.style.background = isPanelSelected ? connectSurfaceLayer.panelSelected : connectSurfaceLayer.rail
    panel.style.borderLeft = `1px solid ${connectSurfaceLayer.hairline}`
    panel.style.boxSizing = "border-box"

    const measuredWidth = options.previousLayout?.panelWidths[providerId]
    const measuredShellWidth = options.previousLayout?.shellWidth ?? 0
    if (typeof measuredWidth === "number" && measuredShellWidth > 0) {
      const railWidthPx = Number.parseFloat(connectSurfaceLayer.railWidth)
      const targetWidth = isPanelSelected
        ? measuredShellWidth - railWidthPx * (ONBOARDING_PROVIDER_ORDER.length - 1)
        : railWidthPx

      // A render that does not move this panel measures the same width it is
      // about to get, so it animates nothing.
      if (Math.abs(measuredWidth - targetWidth) > 1) {
        panel.style.setProperty("--mps-connect-panel-from", `${measuredWidth}px`)
        // No fill mode on purpose: once it lands the inline width owns the panel again.
        panel.style.animation = `mps-connect-panel-resize ${connectMotion.panelResizeMs}ms ${connectMotion.panelResizeEasing}`
      }
    }

    const edge = createElement("div", { className: "mps-connect-edge" })
    edge.setAttribute("aria-hidden", "true")
    edge.style.position = "absolute"
    edge.style.top = "0"
    edge.style.left = "0"
    edge.style.bottom = "0"
    edge.style.width = "4px"
    edge.style.background = panelPresentation.accentColor
    edge.style.opacity = isPanelSelected ? "1" : "0.3"
    edge.style.zIndex = "2"

    if (isPanelSelected && isSwitching && previousAccent) {
      edge.style.setProperty("--mps-connect-tint-from", previousAccent)
      edge.style.animation = `mps-connect-tint ${connectMotion.tintMs}ms ease`
    }

    panel.append(edge)

    const providerButton = createProviderButton(
      createElement,
      providerId,
      state.selectedProviderId,
      options.onProviderChange
    )

    if (isPanelSelected) {
      const wide = createElement("div")
      wide.style.position = "relative"
      wide.style.height = "100%"
      // Laid out at its final width from the first frame, so the resize slides
      // the panel over finished content instead of reflowing it.
      wide.style.minWidth = `calc(100vw - ${ONBOARDING_PROVIDER_ORDER.length - 1} * ${connectSurfaceLayer.railWidth})`
      wide.style.display = "grid"
      wide.style.alignContent = "center"
      wide.style.gap = "1.5rem"
      wide.style.padding = "clamp(1.75rem, 4vw, 3.5rem)"
      wide.style.boxSizing = "border-box"
      wide.style.overflowY = "auto"
      if (isSwitching) {
        wide.className = "mps-connect-rise"
      }

      const watermark = createElement("div", { className: "mps-connect-glyph" })
      watermark.setAttribute("aria-hidden", "true")
      watermark.innerHTML = panelPresentation.iconSvg
      watermark.style.position = "absolute"
      watermark.style.right = "-3%"
      watermark.style.bottom = "-16%"
      watermark.style.width = "34%"
      watermark.style.height = "auto"
      watermark.style.color = panelPresentation.accentColor
      watermark.style.opacity = "0.07"
      watermark.style.pointerEvents = "none"
      panel.append(watermark)

      const heroRow = createElement("div")
      heroRow.style.display = "flex"
      heroRow.style.alignItems = "center"
      heroRow.style.justifyContent = "space-between"
      heroRow.style.gap = "1.5rem"
      heroRow.style.maxWidth = "38rem"

      providerButton.style.display = "grid"
      providerButton.style.placeItems = "center"
      providerButton.style.cursor = "default"
      providerButton.append(
        createProviderGlyph(createElement, panelPresentation, isStep2 ? "1.75rem" : "2.375rem", {
          dimmed: false,
          railHover: false
        })
      )

      headingIdentity.prepend(providerButton)
      heroRow.append(header)

      if (isStep2) {
        const backButton = createElement("button", {
          textContent: "Change server",
          testId: "change-server-button"
        }) as HTMLButtonElement
        backButton.type = "button"
        backButton.style.padding = "0.5rem 0.85rem"
        backButton.style.borderRadius = connectSurfaceLayer.radius
        backButton.style.border = `1px solid ${connectSurfaceLayer.hairlineStrong}`
        backButton.style.background = connectSurfaceLayer.canvas
        backButton.style.color = "rgba(242, 244, 246, 0.72)"
        backButton.style.fontFamily = "inherit"
        backButton.style.fontSize = "0.78rem"
        backButton.style.cursor = "pointer"
        backButton.style.flex = "none"
        backButton.style.transition = "border-color 0.2s ease, color 0.2s ease"
        backButton.addEventListener("mouseenter", () => {
          backButton.style.borderColor = panelPresentation.accentColor
          backButton.style.color = connectSurfaceLayer.textPrimary
        })
        backButton.addEventListener("mouseleave", () => {
          backButton.style.borderColor = connectSurfaceLayer.hairlineStrong
          backButton.style.color = "rgba(242, 244, 246, 0.72)"
        })
        backButton.addEventListener("click", options.onBack)
        heroRow.append(backButton)
      }

      wide.append(heroRow)

      if (providerSupportBanner) {
        wide.append(providerSupportBanner)
      }

      wide.append(isStep2 ? librarySection : formCard)

      const footer = options.renderCardFooter?.()
      if (footer) {
        wide.append(footer)
      }

      panel.append(wide)
    } else {
      const wash = createElement("div", { className: "mps-connect-rail-wash" })
      wash.setAttribute("aria-hidden", "true")
      wash.style.background = `linear-gradient(to top, ${panelPresentation.accentColor} 0%, transparent 72%)`
      wash.style.zIndex = "0"
      panel.append(wash)

      providerButton.style.position = "absolute"
      providerButton.style.top = "0"
      providerButton.style.left = "0"
      providerButton.style.bottom = "0"
      providerButton.style.width = connectSurfaceLayer.railWidth
      providerButton.style.display = "grid"
      providerButton.style.gridTemplateRows = "auto minmax(0, 1fr)"
      providerButton.style.justifyItems = "center"
      providerButton.style.padding = "2.25rem 0"
      providerButton.style.cursor = "pointer"
      providerButton.style.boxSizing = "border-box"
      providerButton.style.zIndex = "1"
      // Only the panel that just gave up the selection has new rail content.
      // Fading the untouched rail as well made its logo blink on every switch.
      if (isSwitching && providerId === transitionFrom) {
        providerButton.classList.add("mps-connect-fade")
      }

      const railName = createElement("span", { textContent: panelPresentation.label })
      railName.style.alignSelf = "center"
      railName.style.writingMode = "vertical-rl"
      railName.style.transform = "rotate(180deg)"
      railName.style.fontSize = "1rem"
      railName.style.fontWeight = "600"
      railName.style.letterSpacing = "0.24em"
      railName.style.textTransform = "uppercase"
      railName.style.color = "rgba(242, 244, 246, 0.4)"

      providerButton.append(
        createProviderGlyph(createElement, panelPresentation, "1.625rem", { dimmed: true, railHover: true }),
        railName
      )

      panel.append(providerButton)
    }

    providerSelector.append(panel)
  }

  shell.append(providerSelector)
  return shell
}
