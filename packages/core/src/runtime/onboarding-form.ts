import type { MediaLibrary } from "../provider"
import type { OnboardingElementFactory } from "./onboarding-shared"

export type OnboardingProviderId = "jellyfin" | "emby" | "plex"

interface OnboardingProviderPresentation {
  readonly label: string
  readonly accentColor: string
  readonly accentGlow: string
  readonly accentHalo: string
  readonly placeholder: string
  readonly authenticateLabel: string
  readonly iconSvg: string
}

const ONBOARDING_PROVIDER_PRESENTATIONS: Record<OnboardingProviderId, OnboardingProviderPresentation> = {
  jellyfin: {
    label: "Jellyfin",
    accentColor: "#aa5cc3",
    accentGlow: "rgba(170, 92, 195, 0.35)",
    accentHalo: "rgba(170, 92, 195, 0.16)",
    placeholder: "https://jellyfin.yourdomain.com",
    authenticateLabel: "Authenticate Jellyfin",
    iconSvg: "<svg viewBox=\"0 0 24 24\" width=\"32\" height=\"32\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"currentColor\" d=\"M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.682 0C25.384 18.573 15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189.518 1.04 7.348 1.027 7.86 0 .511-1.027-2.874-7.19-3.93-7.19z\"/></svg>"
  },
  emby: {
    label: "Emby",
    accentColor: "#52b54b",
    accentGlow: "rgba(82, 181, 75, 0.32)",
    accentHalo: "rgba(82, 181, 75, 0.14)",
    placeholder: "https://emby.yourdomain.com",
    authenticateLabel: "Authenticate Emby",
    iconSvg: "<svg viewBox=\"0 0 24 24\" width=\"32\" height=\"32\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"currentColor\" d=\"M11.041 0c-.007 0-1.456 1.43-3.219 3.176L4.615 6.352l.512.513.512.512-2.819 2.791L0 12.961l1.83 1.848c1.006 1.016 2.438 2.46 3.182 3.209l1.351 1.359.508-.496c.28-.273.515-.498.524-.498.008 0 1.266 1.264 2.794 2.808L12.97 24l.187-.182c.23-.225 5.007-4.95 5.717-5.656l.52-.516-.502-.513c-.276-.282-.5-.52-.496-.53.003-.009 1.264-1.26 2.802-2.783 1.538-1.522 2.8-2.776 2.803-2.785.005-.012-3.617-3.684-6.107-6.193L17.65 4.6l-.505.505c-.279.278-.517.501-.53.497-.013-.005-1.27-1.267-2.793-2.805A449.655 449.655 0 0011.041 0zM9.223 7.367c.091.038 7.951 4.608 7.957 4.627.003.013-1.781 1.056-3.965 2.32a999.898 999.898 0 01-3.996 2.307c-.019.006-.026-1.266-.026-4.629 0-3.7.007-4.634.03-4.625Z\"/></svg>"
  },
  plex: {
    label: "Plex",
    accentColor: "#e5a00d",
    accentGlow: "rgba(229, 160, 13, 0.32)",
    accentHalo: "rgba(229, 160, 13, 0.14)",
    placeholder: "https://plex.yourdomain.com",
    authenticateLabel: "Authenticate Plex",
    iconSvg: "<svg viewBox=\"0 0 24 24\" width=\"32\" height=\"32\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"currentColor\" d=\"M3.987 8.409c-.96 0-1.587.28-2.12.933v-.72H0v8.88s.038.018.127.037c.138.03.821.187 1.331-.249.441-.377.542-.814.542-1.318v-1.283c.533.573 1.147.813 2 .813 1.84 0 3.253-1.493 3.253-3.48 0-2.12-1.36-3.613-3.266-3.613Zm16.748 5.595.406.591c.391.614.894.906 1.492.908.621-.012 1.064-.562 1.226-.755 0 0-.307-.27-.686-.72-.517-.614-1.214-1.755-1.24-1.803l-1.198 1.779Zm-3.205-1.955c0-2.08-1.52-3.64-3.52-3.64s-3.467 1.587-3.467 3.573a3.48 3.48 0 0 0 3.507 3.52c1.413 0 2.626-.84 3.253-2.293h-2.04l-.093.093c-.427.4-.72.533-1.227.533-.787 0-1.373-.506-1.453-1.266h4.986c.04-.214.054-.307.054-.52Zm-7.671-.219c0 .769.11 1.701.868 2.722l.056.069c-.306.526-.742.88-1.248.88-.399 0-.814-.211-1.138-.579a2.177 2.177 0 0 1-.538-1.441V6.409H9.86l-.001 5.421Zm9.283 3.46h-2.39l2.247-3.332-2.247-3.335h2.39l2.248 3.335-2.248 3.332Zm1.593-1.286Zm-17.162-.342c-.933 0-1.68-.773-1.68-1.72s.76-1.666 1.68-1.666c.92 0 1.68.733 1.68 1.68 0 .946-.733 1.706-1.68 1.706Zm18.361-1.974L24 8.622h-2.391l-.87 1.293 1.195 1.773Zm-9.404-.466c.16-.706.72-1.133 1.493-1.133.773 0 1.373.467 1.507 1.133h-3Z\"/></svg>"
  }
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
  descriptionText: string
  rememberPasswordLabel: string
  rememberPasswordDisabled?: boolean
  showRememberPasswordToggle?: boolean
  authenticationAvailable: boolean
  providerSelectionMessage?: string | null
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
  const trimmedServerUrl = state.serverUrl.trim()
  const isCurrentServerChecked = state.preflightCheckedServerUrl === trimmedServerUrl

  if (!options.authenticationAvailable) {
    return options.providerSelectionMessage
      ?? `${providerPresentation.label} support is coming soon`
  }

  if (trimmedServerUrl.length === 0) {
    return `Enter your ${providerPresentation.label} server address. Status checks run automatically when you leave this field.`
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

  return "Server status will refresh automatically after you leave this field."
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

  element.textContent = formatServerStatusText(state, options)

  switch (tone) {
    case "checking":
      element.style.borderColor = providerPresentation.accentColor
      element.style.background = `linear-gradient(140deg, ${providerPresentation.accentHalo} 0%, rgba(12, 18, 30, 0.72) 100%)`
      element.style.color = "#f7f2ff"
      break
    case "ok":
      element.style.borderColor = "rgba(82, 181, 75, 0.28)"
      element.style.background = "linear-gradient(140deg, rgba(82, 181, 75, 0.14) 0%, rgba(16, 30, 20, 0.72) 100%)"
      element.style.color = "#aeeab1"
      break
    case "error":
      element.style.borderColor = "rgba(255, 130, 130, 0.34)"
      element.style.background = "linear-gradient(140deg, rgba(120, 28, 28, 0.22) 0%, rgba(34, 16, 16, 0.76) 100%)"
      element.style.color = "#ffd8d8"
      break
    case "notice":
      element.style.borderColor = `color-mix(in srgb, ${providerPresentation.accentColor} 45%, rgba(255, 255, 255, 0.12))`
      element.style.background = `linear-gradient(140deg, ${providerPresentation.accentHalo} 0%, rgba(16, 22, 34, 0.74) 100%)`
      element.style.color = "rgba(255, 255, 255, 0.82)"
      break
    default:
      element.style.borderColor = "rgba(255, 255, 255, 0.08)"
      element.style.background = "rgba(255, 255, 255, 0.03)"
      element.style.color = "rgba(255, 255, 255, 0.68)"
      break
  }
}

function applyTextFieldBaseStyle(
  input: HTMLInputElement,
  providerPresentation: OnboardingProviderPresentation,
  disabled: boolean
): void {
  input.style.width = "100%"
  input.style.padding = "0.9rem 1rem"
  input.style.border = "1px solid rgba(255, 255, 255, 0.08)"
  input.style.borderRadius = "0.8rem"
  input.style.background = disabled ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.4)"
  input.style.color = disabled ? "rgba(255, 255, 255, 0.45)" : "#ffffff"
  input.style.fontFamily = "inherit"
  input.style.fontSize = "0.95rem"
  input.style.boxSizing = "border-box"
  input.style.transition = "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, transform 0.2s ease"
  input.style.outline = "none"
  input.style.boxShadow = disabled
    ? "none"
    : "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
  input.style.cursor = disabled ? "not-allowed" : "text"

  if (disabled) {
    return
  }

  input.addEventListener("focus", () => {
    input.style.background = "rgba(0, 0, 0, 0.6)"
    input.style.borderColor = providerPresentation.accentColor
    input.style.boxShadow = `0 0 0 3px ${providerPresentation.accentHalo}`
  })
  input.addEventListener("blur", () => {
    input.style.background = "rgba(0, 0, 0, 0.4)"
    input.style.borderColor = "rgba(255, 255, 255, 0.08)"
    input.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
  })
}

function applyToggleLabelStyle(label: HTMLLabelElement, disabled: boolean): void {
  label.style.display = "inline-flex"
  label.style.gap = "0.55rem"
  label.style.alignItems = "center"
  label.style.fontSize = "0.85rem"
  label.style.color = disabled ? "rgba(255, 255, 255, 0.35)" : "rgba(255, 255, 255, 0.62)"
  label.style.cursor = disabled ? "not-allowed" : "pointer"
}

function createProviderOption(
  createElement: OnboardingElementFactory,
  providerId: OnboardingProviderId,
  selectedProviderId: OnboardingProviderId,
  onSelect: (providerId: OnboardingProviderId) => void
): HTMLButtonElement {
  const providerPresentation = getSelectedProviderPresentation(providerId)
  const isActive = providerId === selectedProviderId
  const option = createElement("button", {
    testId: `provider-option-${providerId}`
  }) as HTMLButtonElement
  option.type = "button"
  option.dataset.provider = providerId
  option.style.position = "relative"
  option.style.cursor = "pointer"
  option.style.padding = "1.15rem 0.95rem"
  option.style.borderRadius = "1rem"
  option.style.background = isActive
    ? `linear-gradient(160deg, ${providerPresentation.accentHalo} 0%, rgba(255, 255, 255, 0.04) 100%)`
    : "rgba(255, 255, 255, 0.03)"
  option.style.border = isActive
    ? `1px solid ${providerPresentation.accentColor}`
    : "1px solid rgba(255, 255, 255, 0.06)"
  option.style.display = "flex"
  option.style.flexDirection = "column"
  option.style.alignItems = "center"
  option.style.justifyContent = "center"
  option.style.gap = "0.75rem"
  option.style.boxShadow = isActive ? `0 0 24px ${providerPresentation.accentGlow}` : "none"
  option.style.transition = "transform 0.2s ease, border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease"
  option.style.color = isActive ? "#ffffff" : "rgba(255, 255, 255, 0.78)"
  option.style.font = "inherit"
  option.style.minHeight = "7.25rem"

  const icon = createElement("div")
  icon.setAttribute("aria-hidden", "true")
  icon.innerHTML = providerPresentation.iconSvg
  icon.style.width = "2rem"
  icon.style.height = "2rem"
  icon.style.display = "grid"
  icon.style.placeItems = "center"
  icon.style.color = providerPresentation.accentColor
  icon.style.filter = isActive ? "none" : "grayscale(0.12) brightness(0.92)"
  icon.style.transform = isActive ? "scale(1.08)" : "scale(1)"

  const label = createElement("span", { textContent: providerPresentation.label })
  label.style.fontSize = "0.84rem"
  label.style.fontWeight = "600"
  label.style.letterSpacing = "0.08em"
  label.style.textTransform = "uppercase"
  label.style.color = isActive ? "#ffffff" : "rgba(255, 255, 255, 0.54)"

  option.addEventListener("mouseenter", () => {
    option.style.transform = "translateY(-2px)"
    if (!isActive) {
      option.style.borderColor = "rgba(255, 255, 255, 0.15)"
      option.style.background = "rgba(255, 255, 255, 0.06)"
    }
  })
  option.addEventListener("mouseleave", () => {
    option.style.transform = "translateY(0)"
    option.style.borderColor = isActive ? providerPresentation.accentColor : "rgba(255, 255, 255, 0.06)"
    option.style.background = isActive
      ? `linear-gradient(160deg, ${providerPresentation.accentHalo} 0%, rgba(255, 255, 255, 0.04) 100%)`
      : "rgba(255, 255, 255, 0.03)"
  })
  option.addEventListener("click", () => {
    onSelect(providerId)
  })

  option.append(icon, label)
  return option
}

export function createOnboardingFormView(options: CreateOnboardingFormViewOptions): HTMLElement {
  const { createElement, state } = options
  const providerPresentation = getSelectedProviderPresentation(state.selectedProviderId)
  const controlsDisabled = !options.authenticationAvailable
  const primaryActionLabel = options.authenticationAvailable
    ? providerPresentation.authenticateLabel
    : `${providerPresentation.label} support coming soon`

  const shell = createElement("main", { testId: "app-shell" })
  shell.style.minHeight = "100vh"
  shell.style.display = "grid"
  shell.style.placeItems = "center"
  shell.style.padding = "clamp(1.5rem, 5vw, 3rem)"
  shell.style.background = `radial-gradient(circle at 50% 0%, color-mix(in srgb, ${providerPresentation.accentColor} 8%, #171c2b) 0%, var(--mps-color-canvas) 72%)`
  shell.style.color = "var(--mps-color-foreground)"
  shell.style.fontFamily = "var(--mps-font-body)"
  shell.style.overflowY = "auto"
  shell.style.boxSizing = "border-box"

  const card = createElement("section")
  card.style.width = "min(42rem, 100%)"
  card.style.display = "grid"
  card.style.gap = "1.5rem"
  card.style.padding = "clamp(2rem, 5vw, 3rem)"
  card.style.border = "1px solid rgba(255, 255, 255, 0.08)"
  card.style.borderRadius = "var(--mps-radius-lg)"
  card.style.background = "linear-gradient(154deg, rgba(20, 28, 48, 0.45) 0%, rgba(10, 15, 25, 0.65) 100%)"
  card.style.boxShadow = `0 24px 68px -18px rgba(0, 0, 0, 0.92), inset 0 0 0 1px rgba(122, 217, 255, 0.03), 0 0 0 1px ${providerPresentation.accentHalo}, 0 0 40px ${providerPresentation.accentGlow}`
  card.style.backdropFilter = "blur(32px) saturate(1.25)"
  card.style.setProperty("-webkit-backdrop-filter", "blur(32px) saturate(1.25)")

  const header = createElement("header")
  header.style.display = "grid"
  header.style.gap = "0.65rem"

  const heading = createElement("h1", { textContent: "Connect Media Server", testId: "onboarding-title" })
  heading.style.margin = "0"
  heading.style.fontFamily = "var(--mps-font-display)"
  heading.style.fontSize = "clamp(2rem, 5vw, 2.6rem)"
  heading.style.letterSpacing = "-0.03em"
  heading.style.background = "linear-gradient(to bottom, #fff, #b9b3a6)"
  heading.style.setProperty("-webkit-background-clip", "text")
  heading.style.setProperty("-webkit-text-fill-color", "transparent")

  const description = createElement("p", {
    textContent: options.descriptionText
  })
  description.style.margin = "0"
  description.style.color = "rgba(255, 255, 255, 0.55)"
  description.style.lineHeight = "1.6"
  description.style.fontSize = "1rem"

  header.append(heading, description)

  const providerSelector = createElement("div", { testId: "provider-selector" })
  providerSelector.style.display = "grid"
  providerSelector.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))"
  providerSelector.style.gap = "1rem"

  providerSelector.append(
    createProviderOption(createElement, "jellyfin", state.selectedProviderId, options.onProviderChange),
    createProviderOption(createElement, "emby", state.selectedProviderId, options.onProviderChange),
    createProviderOption(createElement, "plex", state.selectedProviderId, options.onProviderChange)
  )

  const providerSupportBanner = options.providerSelectionMessage
    ? createElement("p", {
        textContent: options.providerSelectionMessage,
        testId: "provider-support-banner"
      })
    : null

  if (providerSupportBanner) {
    providerSupportBanner.style.margin = "0"
    providerSupportBanner.style.padding = "0.72rem 0.9rem"
    providerSupportBanner.style.borderRadius = "0.8rem"
    providerSupportBanner.style.border = `1px solid color-mix(in srgb, ${providerPresentation.accentColor} 50%, rgba(255, 255, 255, 0.08))`
    providerSupportBanner.style.background = `linear-gradient(145deg, ${providerPresentation.accentHalo} 0%, rgba(18, 24, 34, 0.7) 100%)`
    providerSupportBanner.style.color = "rgba(255, 255, 255, 0.86)"
    providerSupportBanner.style.fontSize = "0.84rem"
    providerSupportBanner.style.lineHeight = "1.45"
  }

  const formSection = createElement("section")
  formSection.style.display = "grid"
  formSection.style.gap = "1.25rem"

  const serverGroup = createElement("div")
  serverGroup.style.display = "grid"
  serverGroup.style.gap = "0.6rem"

  const serverLabel = createElement("label", { textContent: "Server address" })
  serverLabel.style.fontSize = "0.85rem"
  serverLabel.style.fontWeight = "500"
  serverLabel.style.color = "var(--mps-color-foreground-support)"
  serverLabel.style.letterSpacing = "0.03em"
  serverLabel.style.textTransform = "uppercase"

  const serverInput = createElement("input", { testId: "server-url-input" }) as HTMLInputElement
  serverInput.type = "url"
  serverInput.name = "serverUrl"
  serverInput.placeholder = providerPresentation.placeholder
  serverInput.value = state.serverUrl
  serverInput.disabled = controlsDisabled
  applyTextFieldBaseStyle(serverInput, providerPresentation, controlsDisabled)
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

  const serverStatus = createElement("p", { testId: "server-status-indicator" })
  serverStatus.style.margin = "0"
  serverStatus.style.padding = "0.72rem 0.9rem"
  serverStatus.style.border = "1px solid rgba(255, 255, 255, 0.08)"
  serverStatus.style.borderRadius = "0.7rem"
  serverStatus.style.fontSize = "0.82rem"
  serverStatus.style.lineHeight = "1.45"
  serverStatus.style.letterSpacing = "0.01em"
  serverStatus.style.backdropFilter = "blur(8px)"
  applyServerStatusPresentation(serverStatus, state, options)

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

  serverGroup.append(serverLabel, serverInput, serverStatus, rememberServerLabel)

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

  const usernameLabel = createElement("label", { textContent: "Username" })
  usernameLabel.style.display = "grid"
  usernameLabel.style.gap = "0.6rem"
  usernameLabel.style.fontSize = "0.85rem"
  usernameLabel.style.fontWeight = "500"
  usernameLabel.style.color = "var(--mps-color-foreground-support)"
  usernameLabel.style.letterSpacing = "0.03em"
  usernameLabel.style.textTransform = "uppercase"

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
  passwordLabel.style.gap = "0.6rem"
  passwordLabel.style.fontSize = "0.85rem"
  passwordLabel.style.fontWeight = "500"
  passwordLabel.style.color = "var(--mps-color-foreground-support)"
  passwordLabel.style.letterSpacing = "0.03em"
  passwordLabel.style.textTransform = "uppercase"

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

  const rememberRow = createElement("div")
  rememberRow.style.display = "flex"
  rememberRow.style.flexWrap = "wrap"
  rememberRow.style.justifyContent = "space-between"
  rememberRow.style.gap = "0.75rem 1rem"
  rememberRow.style.marginTop = "0.25rem"

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

  rememberRow.append(rememberUsernameLabel)
  if (options.showRememberPasswordToggle ?? true) {
    rememberRow.append(rememberPasswordLabel)
  }

  const loginButton = createElement("button", {
    textContent: state.loginPending ? "Signing in…" : primaryActionLabel,
    testId: "login-submit"
  }) as HTMLButtonElement
  loginButton.type = "submit"
  loginButton.disabled = state.loginPending || state.preflightPending || controlsDisabled
  loginButton.style.marginTop = "0.6rem"
  loginButton.style.padding = "1rem"
  loginButton.style.borderRadius = "0.78rem"
  loginButton.style.fontWeight = "600"
  loginButton.style.fontSize = "1rem"
  loginButton.style.letterSpacing = "0.02em"
  loginButton.style.cursor = loginButton.disabled ? "not-allowed" : "pointer"
  loginButton.style.border = "1px solid rgba(255, 255, 255, 0.1)"
  loginButton.style.background = `linear-gradient(135deg, ${providerPresentation.accentColor} 0%, color-mix(in srgb, ${providerPresentation.accentColor} 60%, black) 100%)`
  loginButton.style.color = "#fff"
  loginButton.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)"
  loginButton.style.transition = "transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease"
  loginButton.style.opacity = loginButton.disabled ? "0.55" : "1"

  if (!loginButton.disabled) {
    loginButton.addEventListener("mouseenter", () => {
      loginButton.style.transform = "translateY(-2px)"
      loginButton.style.filter = "brightness(1.08)"
      loginButton.style.boxShadow = `0 12px 32px rgba(0, 0, 0, 0.4), 0 0 22px ${providerPresentation.accentGlow}, inset 0 1px 0 rgba(255, 255, 255, 0.3)`
    })
    loginButton.addEventListener("mouseleave", () => {
      loginButton.style.transform = "translateY(0)"
      loginButton.style.filter = "brightness(1)"
      loginButton.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)"
    })
    loginButton.addEventListener("mousedown", () => {
      loginButton.style.transform = "translateY(1px)"
    })
  }

  loginForm.append(usernameLabel, passwordLabel, rememberRow, loginButton)

  if (state.authError) {
    const authError = createElement("p", {
      textContent: state.authError,
      testId: "auth-error-banner"
    })
    authError.style.margin = "0"
    authError.style.padding = "0.68rem 0.84rem"
    authError.style.borderRadius = "0.8rem"
    authError.style.border = "1px solid rgba(255, 130, 130, 0.4)"
    authError.style.background = "linear-gradient(140deg, rgba(120, 26, 26, 0.22) 0%, rgba(31, 14, 14, 0.78) 100%)"
    authError.style.color = "#ffd8d8"
    authError.style.fontSize = "0.84rem"
    authError.style.lineHeight = "1.45"
    loginForm.append(authError)
  }

  formSection.append(serverGroup, loginForm)

  const librarySection = createElement("section")
  librarySection.style.display = "grid"
  librarySection.style.gap = "0.9rem"
  librarySection.style.paddingTop = "0.5rem"

  const libraryHeading = createElement("h2", { textContent: "Library selection" })
  libraryHeading.style.margin = "0"
  libraryHeading.style.fontFamily = "var(--mps-font-display)"
  libraryHeading.style.fontSize = "1.45rem"
  libraryHeading.style.letterSpacing = "-0.02em"
  librarySection.append(libraryHeading)

  if (state.libraries.length === 0) {
    const emptyLibraryState = createElement("p", {
      textContent: "Sign in first to fetch your libraries."
    })
    emptyLibraryState.style.margin = "0"
    emptyLibraryState.style.color = "rgba(255, 255, 255, 0.55)"
    emptyLibraryState.style.fontSize = "0.92rem"
    librarySection.append(emptyLibraryState)
  } else {
    const libraryList = createElement("div")
    libraryList.style.display = "grid"
    libraryList.style.gap = "0.55rem"

    for (const library of state.libraries) {
      const libraryLabel = createElement("label")
      libraryLabel.style.display = "inline-flex"
      libraryLabel.style.alignItems = "center"
      libraryLabel.style.gap = "0.55rem"
      libraryLabel.style.padding = "0.75rem 0.85rem"
      libraryLabel.style.borderRadius = "0.85rem"
      libraryLabel.style.background = "rgba(255, 255, 255, 0.04)"
      libraryLabel.style.border = "1px solid rgba(255, 255, 255, 0.06)"
      libraryLabel.style.fontSize = "0.92rem"
      libraryLabel.style.color = "rgba(255, 255, 255, 0.88)"

      const libraryCheckbox = createElement("input", {
        testId: options.toLibraryCheckboxTestId(library.id)
      }) as HTMLInputElement
      libraryCheckbox.type = "checkbox"
      libraryCheckbox.checked = state.selectedLibraryIds.has(library.id)
      libraryCheckbox.style.accentColor = providerPresentation.accentColor
      libraryCheckbox.addEventListener("change", () => {
        options.onLibrarySelectionChange(library.id, libraryCheckbox.checked)
      })

      const descriptor = `${library.name} `
      const kindSpan = createElement("span", { textContent: `(${library.kind})` })
      kindSpan.style.color = "rgba(255, 255, 255, 0.46)"
      kindSpan.style.fontSize = "0.82rem"
      libraryLabel.append(libraryCheckbox, descriptor, kindSpan)
      libraryList.append(libraryLabel)
    }

    const finishButton = createElement("button", {
      textContent: state.finishPending ? "Preparing wall…" : "Enter wall",
      testId: "onboarding-finish"
    }) as HTMLButtonElement
    finishButton.type = "button"
    finishButton.disabled = state.finishPending
    finishButton.style.padding = "0.95rem 1rem"
    finishButton.style.borderRadius = "0.78rem"
    finishButton.style.border = `1px solid color-mix(in srgb, ${providerPresentation.accentColor} 45%, transparent)`
    finishButton.style.background = `linear-gradient(135deg, color-mix(in srgb, ${providerPresentation.accentColor} 70%, #0c1420) 0%, color-mix(in srgb, ${providerPresentation.accentColor} 40%, #05080e) 100%)`
    finishButton.style.color = "#ffffff"
    finishButton.style.fontWeight = "600"
    finishButton.style.letterSpacing = "0.03em"
    finishButton.style.boxShadow = `0 8px 20px rgba(0, 0, 0, 0.3), 0 0 18px ${providerPresentation.accentGlow}`
    finishButton.style.transition = "transform 0.2s ease, filter 0.2s ease"
    finishButton.style.cursor = state.finishPending ? "not-allowed" : "pointer"
    finishButton.style.opacity = state.finishPending ? "0.6" : "1"

    if (!state.finishPending) {
      finishButton.addEventListener("mouseenter", () => {
        finishButton.style.transform = "translateY(-2px)"
        finishButton.style.filter = "brightness(1.08)"
      })
      finishButton.addEventListener("mouseleave", () => {
        finishButton.style.transform = "translateY(0)"
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
  }

  if (state.libraryError) {
    const libraryError = createElement("p", { textContent: state.libraryError })
    libraryError.style.margin = "0"
    libraryError.style.color = "#ffb4b4"
    librarySection.append(libraryError)
  }

  const isStep2 = state.libraries.length > 0

  if (!isStep2) {
    card.append(header, providerSelector)
    if (providerSupportBanner) {
      card.append(providerSupportBanner)
    }
    card.append(formSection)
  } else {
    const step2Header = createElement("div")
    step2Header.style.display = "flex"
    step2Header.style.justifyContent = "space-between"
    step2Header.style.alignItems = "center"
    step2Header.style.gap = "1rem"

    const backButton = createElement("button", {
      textContent: "Change server",
      testId: "change-server-button"
    }) as HTMLButtonElement
    backButton.type = "button"
    backButton.style.padding = "0.6rem 0.9rem"
    backButton.style.borderRadius = "999px"
    backButton.style.border = `1px solid color-mix(in srgb, ${providerPresentation.accentColor} 45%, rgba(255, 255, 255, 0.08))`
    backButton.style.background = `linear-gradient(145deg, ${providerPresentation.accentHalo} 0%, rgba(16, 22, 32, 0.8) 100%)`
    backButton.style.color = "rgba(255, 255, 255, 0.82)"
    backButton.style.cursor = "pointer"
    backButton.style.transition = "transform 0.2s ease, filter 0.2s ease"
    backButton.addEventListener("mouseenter", () => {
      backButton.style.transform = "translateY(-1px)"
      backButton.style.filter = "brightness(1.08)"
    })
    backButton.addEventListener("mouseleave", () => {
      backButton.style.transform = "translateY(0)"
      backButton.style.filter = "brightness(1)"
    })
    backButton.addEventListener("click", options.onBack)

    step2Header.append(header, backButton)
    card.append(step2Header, librarySection)
  }

  const footer = options.renderCardFooter?.()
  if (footer) {
    card.append(footer)
  }

  shell.append(card)
  return shell
}
