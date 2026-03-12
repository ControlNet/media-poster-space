import type { MediaLibrary } from "../provider"
import type { OnboardingElementFactory } from "./onboarding-shared"

export interface OnboardingFormViewState {
  serverUrl: string
  rememberServer: boolean
  preflightPending: boolean
  preflightError: string | null
  username: string
  password: string
  rememberUsername: boolean
  rememberPasswordRequested: boolean
  loginPending: boolean
  authError: string | null
  libraries: readonly MediaLibrary[]
  selectedLibraryIds: ReadonlySet<string>
  density: "cinematic" | "compact"
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
  toLibraryCheckboxTestId: (libraryId: string) => string
  onServerInput: (value: string) => void
  onRememberServerChange: (remember: boolean) => void
  onPreflight: () => void
  onUsernameInput: (value: string) => void
  onPasswordInput: (value: string) => void
  onRememberUsernameChange: (remember: boolean) => void
  onRememberPasswordChange: (remember: boolean) => void
  onLogin: () => void
  onBack: () => void
  onLibrarySelectionChange: (libraryId: string, selected: boolean) => void
  onDensityChange: (density: "cinematic" | "compact") => void
  onFinish: () => void
  renderLibraryExtras?: () => readonly HTMLElement[]
  renderCardFooter?: () => HTMLElement | null
}

function appendCheckboxLabelText(createElement: OnboardingElementFactory, label: HTMLLabelElement, text: string): void {
  const copy = createElement("span", { textContent: text })
  label.append(copy)
}

export function createOnboardingFormView(options: CreateOnboardingFormViewOptions): HTMLElement {
  const { createElement, state } = options

  const shell = createElement("main", { testId: "app-shell" })
  shell.style.minHeight = "100vh"
  shell.style.display = "grid"
  shell.style.placeItems = "center"
  shell.style.padding = "clamp(1.5rem, 5vw, 3rem)"
  shell.style.background = "radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--mps-color-canvas) 40%, #152033), var(--mps-color-canvas) 80%)"
  shell.style.color = "var(--mps-color-foreground)"
  shell.style.fontFamily = "var(--mps-font-body)"
  shell.style.overflowY = "auto"
  shell.style.boxSizing = "border-box"

  const card = createElement("section")
  card.style.width = "min(40rem, 100%)"
  card.style.display = "grid"
  card.style.gap = "1.25rem"
  card.style.padding = "clamp(1.5rem, 4vw, 2.5rem)"
  card.style.border = "1px solid rgba(255, 255, 255, 0.08)"
  card.style.borderRadius = "var(--mps-radius-lg)"
  card.style.background = "linear-gradient(154deg, rgba(16, 23, 40, 0.45) 0%, rgba(8, 12, 20, 0.65) 100%)"
  card.style.boxShadow = "var(--mps-elevation-dramatic), inset 0 0 0 1px rgba(122, 217, 255, 0.05)"
  card.style.backdropFilter = "blur(24px) saturate(1.2)"

  const heading = createElement("h1", { textContent: "Connect Jellyfin", testId: "onboarding-title" })
  heading.style.margin = "0"
  heading.style.fontFamily = "var(--mps-font-display)"
  heading.style.fontSize = "clamp(1.75rem, 4vw, 2.3rem)"
  heading.style.letterSpacing = "-0.02em"

  const description = createElement("p", {
    textContent: options.descriptionText
  })
  description.style.margin = "0"
  description.style.color = "rgba(255, 255, 255, 0.6)"
  description.style.lineHeight = "1.5"

  const serverLabel = createElement("label", { textContent: "Jellyfin server URL" })
  serverLabel.style.display = "grid"
  serverLabel.style.gap = "0.5rem"
  serverLabel.style.fontSize = "0.9rem"
  serverLabel.style.color = "var(--mps-color-foreground-support)"
  serverLabel.style.letterSpacing = "0.02em"

  const serverInput = createElement("input", { testId: "server-url-input" }) as HTMLInputElement
  serverInput.type = "url"
  serverInput.name = "serverUrl"
  serverInput.placeholder = "https://jellyfin.example"
  serverInput.value = state.serverUrl
  serverInput.style.padding = "0.75rem 0.85rem"
  serverInput.style.border = "1px solid rgba(255, 255, 255, 0.1)"
  serverInput.style.borderRadius = "0.6rem"
  serverInput.style.background = "rgba(0, 0, 0, 0.3)"
  serverInput.style.color = "var(--mps-color-foreground)"
  serverInput.style.transition = "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease"
  serverInput.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
  serverInput.addEventListener("focus", () => {
    serverInput.style.borderColor = "var(--mps-color-orbit-glow-halo)"
    serverInput.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 0 2px rgba(122, 217, 255, 0.1)"
    serverInput.style.background = "rgba(0, 0, 0, 0.5)"
  })
  serverInput.addEventListener("blur", () => {
    serverInput.style.borderColor = "rgba(255, 255, 255, 0.1)"
    serverInput.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
    serverInput.style.background = "rgba(0, 0, 0, 0.3)"
  })
  serverInput.addEventListener("input", () => {
    options.onServerInput(serverInput.value)
  })
  serverLabel.append(serverInput)

  const rememberServerLabel = createElement("label")
  rememberServerLabel.style.display = "inline-flex"
  rememberServerLabel.style.gap = "0.45rem"
  rememberServerLabel.style.alignItems = "center"
  rememberServerLabel.style.fontSize = "0.85rem"
  rememberServerLabel.style.color = "rgba(255, 255, 255, 0.6)"
  const rememberServer = createElement("input", { testId: "remember-server-checkbox" }) as HTMLInputElement
  rememberServer.type = "checkbox"
  rememberServer.checked = state.rememberServer
  rememberServer.addEventListener("change", () => {
    options.onRememberServerChange(rememberServer.checked)
  })
  rememberServerLabel.append(rememberServer)
  appendCheckboxLabelText(createElement, rememberServerLabel, "Remember last server")

  const preflightButton = createElement("button", {
    textContent: state.preflightPending ? "Checking…" : "Preflight server",
    testId: "preflight-check-button"
  }) as HTMLButtonElement
  preflightButton.type = "button"
  preflightButton.disabled = state.preflightPending
  preflightButton.style.padding = "0.75rem 1rem"
  preflightButton.style.borderRadius = "0.6rem"
  preflightButton.style.border = "1px solid color-mix(in srgb, var(--mps-color-accent-ring) 50%, transparent)"
  preflightButton.style.background = "linear-gradient(135deg, color-mix(in srgb, var(--mps-color-accent-muted) 80%, black) 0%, color-mix(in srgb, var(--mps-color-accent-soft) 70%, black) 100%)"
  preflightButton.style.color = "var(--mps-color-foreground-emphasis)"
  preflightButton.style.fontWeight = "500"
  preflightButton.style.letterSpacing = "0.02em"
  preflightButton.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
  preflightButton.style.transition = "transform 0.1s ease, box-shadow 0.2s ease, filter 0.2s ease"
  preflightButton.style.cursor = state.preflightPending ? "default" : "pointer"
  preflightButton.style.opacity = state.preflightPending ? "0.7" : "1"

  if (!state.preflightPending) {
    preflightButton.addEventListener("mouseenter", () => {
      preflightButton.style.transform = "translateY(-1px)"
      preflightButton.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)"
      preflightButton.style.filter = "brightness(1.1)"
    })
    preflightButton.addEventListener("mouseleave", () => {
      preflightButton.style.transform = "translateY(0)"
      preflightButton.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
      preflightButton.style.filter = "brightness(1)"
    })
    preflightButton.addEventListener("mousedown", () => {
      preflightButton.style.transform = "translateY(1px)"
      preflightButton.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
    })
  }

  preflightButton.addEventListener("click", options.onPreflight)

  if (state.preflightError) {
    const preflightError = createElement("p", { textContent: state.preflightError })
    preflightError.style.margin = "0"
    preflightError.style.color = "#ffb4b4"
    preflightError.style.fontSize = "0.85rem"
    card.append(preflightError)
  }

  const loginForm = createElement("form") as HTMLFormElement
  loginForm.noValidate = true
  loginForm.method = "post"
  loginForm.autocomplete = "on"
  loginForm.style.display = "grid"
  loginForm.style.gap = "1rem"
  loginForm.style.paddingTop = "1.5rem"
  loginForm.style.borderTop = "1px solid rgba(255, 255, 255, 0.06)"
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault()
    options.onLogin()
  })

  const usernameLabel = createElement("label", { textContent: "Username" })
  usernameLabel.style.display = "grid"
  usernameLabel.style.gap = "0.5rem"
  usernameLabel.style.fontSize = "0.9rem"
  usernameLabel.style.color = "var(--mps-color-foreground-support)"
  usernameLabel.style.letterSpacing = "0.02em"
  const usernameInput = createElement("input", { testId: "username-input" }) as HTMLInputElement
  usernameInput.type = "text"
  usernameInput.name = "username"
  usernameInput.autocomplete = "username"
  usernameInput.autocapitalize = "none"
  usernameInput.spellcheck = false
  usernameInput.value = state.username
  usernameInput.style.padding = "0.75rem 0.85rem"
  usernameInput.style.border = "1px solid rgba(255, 255, 255, 0.1)"
  usernameInput.style.borderRadius = "0.6rem"
  usernameInput.style.background = "rgba(0, 0, 0, 0.3)"
  usernameInput.style.color = "var(--mps-color-foreground)"
  usernameInput.style.transition = "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease"
  usernameInput.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
  usernameInput.addEventListener("focus", () => {
    usernameInput.style.borderColor = "var(--mps-color-orbit-glow-halo)"
    usernameInput.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 0 2px rgba(122, 217, 255, 0.1)"
    usernameInput.style.background = "rgba(0, 0, 0, 0.5)"
  })
  usernameInput.addEventListener("blur", () => {
    usernameInput.style.borderColor = "rgba(255, 255, 255, 0.1)"
    usernameInput.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
    usernameInput.style.background = "rgba(0, 0, 0, 0.3)"
  })
  usernameInput.addEventListener("input", () => {
    options.onUsernameInput(usernameInput.value)
  })
  usernameLabel.append(usernameInput)

  const passwordLabel = createElement("label", { textContent: "Password" })
  passwordLabel.style.display = "grid"
  passwordLabel.style.gap = "0.5rem"
  passwordLabel.style.fontSize = "0.9rem"
  passwordLabel.style.color = "var(--mps-color-foreground-support)"
  passwordLabel.style.letterSpacing = "0.02em"

  const passwordInput = createElement("input", { testId: "password-input" }) as HTMLInputElement
  passwordInput.type = "password"
  passwordInput.name = "password"
  passwordInput.autocomplete = "current-password"
  passwordInput.autocapitalize = "none"
  passwordInput.spellcheck = false
  passwordInput.value = state.password
  passwordInput.style.padding = "0.75rem 0.85rem"
  passwordInput.style.border = "1px solid rgba(255, 255, 255, 0.1)"
  passwordInput.style.borderRadius = "0.6rem"
  passwordInput.style.background = "rgba(0, 0, 0, 0.3)"
  passwordInput.style.color = "var(--mps-color-foreground)"
  passwordInput.style.transition = "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease"
  passwordInput.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
  passwordInput.addEventListener("focus", () => {
    passwordInput.style.borderColor = "var(--mps-color-orbit-glow-halo)"
    passwordInput.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 0 2px rgba(122, 217, 255, 0.1)"
    passwordInput.style.background = "rgba(0, 0, 0, 0.5)"
  })
  passwordInput.addEventListener("blur", () => {
    passwordInput.style.borderColor = "rgba(255, 255, 255, 0.1)"
    passwordInput.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
    passwordInput.style.background = "rgba(0, 0, 0, 0.3)"
  })
  passwordInput.addEventListener("input", () => {
    options.onPasswordInput(passwordInput.value)
  })
  passwordLabel.append(passwordInput)

  const rememberRow = createElement("div")
  rememberRow.style.display = "grid"
  rememberRow.style.gap = "0.5rem"

  const rememberUsernameLabel = createElement("label")
  rememberUsernameLabel.style.display = "inline-flex"
  rememberUsernameLabel.style.gap = "0.45rem"
  rememberUsernameLabel.style.alignItems = "center"
  rememberUsernameLabel.style.fontSize = "0.85rem"
  rememberUsernameLabel.style.color = "rgba(255, 255, 255, 0.6)"
  const rememberUsername = createElement("input", {
    testId: "remember-username-checkbox"
  }) as HTMLInputElement
  rememberUsername.type = "checkbox"
  rememberUsername.checked = state.rememberUsername
  rememberUsername.addEventListener("change", () => {
    options.onRememberUsernameChange(rememberUsername.checked)
  })
  rememberUsernameLabel.append(rememberUsername)
  appendCheckboxLabelText(createElement, rememberUsernameLabel, "Remember username")

  const rememberPasswordLabel = createElement("label")
  rememberPasswordLabel.style.display = "inline-flex"
  rememberPasswordLabel.style.gap = "0.45rem"
  rememberPasswordLabel.style.alignItems = "center"
  rememberPasswordLabel.style.fontSize = "0.85rem"
  rememberPasswordLabel.style.color = "rgba(255, 255, 255, 0.6)"
  const rememberPassword = createElement("input", {
    testId: "remember-password-checkbox"
  }) as HTMLInputElement
  rememberPassword.type = "checkbox"
  rememberPassword.checked = state.rememberPasswordRequested
  rememberPassword.disabled = options.rememberPasswordDisabled ?? false
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
    textContent: state.loginPending ? "Signing in…" : "Sign in",
    testId: "login-submit"
  }) as HTMLButtonElement
  loginButton.type = "submit"
  loginButton.disabled = state.loginPending
  loginButton.style.padding = "0.75rem 1rem"
  loginButton.style.borderRadius = "0.6rem"
  loginButton.style.border = "1px solid color-mix(in srgb, var(--mps-color-accent-ring) 50%, transparent)"
  loginButton.style.background = "linear-gradient(135deg, color-mix(in srgb, var(--mps-color-accent-muted) 80%, black) 0%, color-mix(in srgb, var(--mps-color-accent-soft) 70%, black) 100%)"
  loginButton.style.color = "var(--mps-color-foreground-emphasis)"
  loginButton.style.fontWeight = "500"
  loginButton.style.letterSpacing = "0.02em"
  loginButton.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
  loginButton.style.transition = "transform 0.1s ease, box-shadow 0.2s ease, filter 0.2s ease"
  loginButton.style.cursor = state.loginPending ? "default" : "pointer"
  loginButton.style.opacity = state.loginPending ? "0.7" : "1"
  loginButton.style.marginTop = "0.5rem"

  if (!state.loginPending) {
    loginButton.addEventListener("mouseenter", () => {
      loginButton.style.transform = "translateY(-1px)"
      loginButton.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)"
      loginButton.style.filter = "brightness(1.1)"
    })
    loginButton.addEventListener("mouseleave", () => {
      loginButton.style.transform = "translateY(0)"
      loginButton.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
      loginButton.style.filter = "brightness(1)"
    })
    loginButton.addEventListener("mousedown", () => {
      loginButton.style.transform = "translateY(1px)"
      loginButton.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
    })
  }

  loginForm.append(usernameLabel, passwordLabel, rememberRow, loginButton)

  if (state.authError) {
    const authError = createElement("p", {
      textContent: state.authError,
      testId: "auth-error-banner"
    })
    authError.style.margin = "0"
    authError.style.padding = "0.6rem 0.75rem"
    authError.style.borderRadius = "0.5rem"
    authError.style.border = "1px solid rgba(255, 130, 130, 0.5)"
    authError.style.background = "rgba(89, 24, 24, 0.45)"
    authError.style.color = "#ffd8d8"
    loginForm.append(authError)
  }

  const librarySection = createElement("section")
  librarySection.style.display = "grid"
  librarySection.style.gap = "0.75rem"
  librarySection.style.paddingTop = "1.5rem"
  librarySection.style.borderTop = "1px solid rgba(255, 255, 255, 0.06)"

  const libraryHeading = createElement("h2", { textContent: "Library selection" })
  libraryHeading.style.margin = "0"
  libraryHeading.style.fontFamily = "var(--mps-font-display)"
  libraryHeading.style.fontSize = "1.3rem"
  libraryHeading.style.letterSpacing = "0.02em"
  librarySection.append(libraryHeading)

  if (state.libraries.length === 0) {
    const emptyLibraryState = createElement("p", {
      textContent: "Sign in first to fetch your libraries and wall preferences."
    })
    emptyLibraryState.style.margin = "0"
    emptyLibraryState.style.color = "rgba(255, 255, 255, 0.5)"
    emptyLibraryState.style.fontSize = "0.9rem"
    librarySection.append(emptyLibraryState)
  } else {
    const libraryList = createElement("div")
    libraryList.style.display = "grid"
    libraryList.style.gap = "0.35rem"

    for (const library of state.libraries) {
      const libraryLabel = createElement("label")
      libraryLabel.style.display = "inline-flex"
      libraryLabel.style.alignItems = "center"
      libraryLabel.style.gap = "0.45rem"
      libraryLabel.style.fontSize = "0.9rem"
      libraryLabel.style.color = "rgba(255, 255, 255, 0.85)"

      const libraryCheckbox = createElement("input", {
        testId: options.toLibraryCheckboxTestId(library.id)
      }) as HTMLInputElement
      libraryCheckbox.type = "checkbox"
      libraryCheckbox.checked = state.selectedLibraryIds.has(library.id)
      libraryCheckbox.addEventListener("change", () => {
        options.onLibrarySelectionChange(library.id, libraryCheckbox.checked)
      })

      const descriptor = `${library.name}  `
      const kindSpan = createElement("span", { textContent: `(${library.kind})` })
      kindSpan.style.color = "rgba(255, 255, 255, 0.4)"
      kindSpan.style.fontSize = "0.8rem"
      libraryLabel.append(libraryCheckbox, descriptor, kindSpan)
      libraryList.append(libraryLabel)
    }

    const preferenceLabel = createElement("label", { textContent: "Wall density" })
    preferenceLabel.style.display = "grid"
    preferenceLabel.style.gap = "0.5rem"
    preferenceLabel.style.fontSize = "0.9rem"
    preferenceLabel.style.color = "var(--mps-color-foreground-support)"
    preferenceLabel.style.letterSpacing = "0.02em"
    preferenceLabel.style.marginTop = "0.5rem"
    const densitySelect = createElement("select", { testId: "wall-density-select" }) as HTMLSelectElement
    densitySelect.innerHTML = [
      '<option value="cinematic">Cinematic (default)</option>',
      '<option value="compact">Compact</option>'
    ].join("")
    densitySelect.value = state.density
    densitySelect.style.padding = "0.75rem 0.85rem"
    densitySelect.style.border = "1px solid rgba(255, 255, 255, 0.1)"
    densitySelect.style.borderRadius = "0.6rem"
    densitySelect.style.background = "rgba(0, 0, 0, 0.3)"
    densitySelect.style.color = "var(--mps-color-foreground)"
    densitySelect.style.transition = "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease"
    densitySelect.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
    densitySelect.addEventListener("focus", () => {
      densitySelect.style.borderColor = "var(--mps-color-orbit-glow-halo)"
      densitySelect.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 0 2px rgba(122, 217, 255, 0.1)"
      densitySelect.style.background = "rgba(0, 0, 0, 0.5)"
    })
    densitySelect.addEventListener("blur", () => {
      densitySelect.style.borderColor = "rgba(255, 255, 255, 0.1)"
      densitySelect.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
      densitySelect.style.background = "rgba(0, 0, 0, 0.3)"
    })
    densitySelect.addEventListener("change", () => {
      options.onDensityChange(densitySelect.value === "compact" ? "compact" : "cinematic")
    })
    preferenceLabel.append(densitySelect)

    const finishButton = createElement("button", {
      textContent: state.finishPending ? "Preparing wall…" : "Enter wall",
      testId: "onboarding-finish"
    }) as HTMLButtonElement
    finishButton.type = "button"
    finishButton.disabled = state.finishPending
    finishButton.style.padding = "0.8rem 1rem"
    finishButton.style.borderRadius = "0.6rem"
    finishButton.style.border = "1px solid color-mix(in srgb, var(--mps-color-orbit-glow) 40%, transparent)"
    finishButton.style.background = "linear-gradient(135deg, color-mix(in srgb, var(--mps-color-telemetry) 60%, black) 0%, color-mix(in srgb, var(--mps-color-telemetry-soft) 80%, black) 100%)"
    finishButton.style.color = "#ffffff"
    finishButton.style.fontWeight = "600"
    finishButton.style.letterSpacing = "0.03em"
    finishButton.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.25), 0 0 20px rgba(122, 217, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)"
    finishButton.style.transition = "transform 0.1s ease, box-shadow 0.2s ease, filter 0.2s ease"
    finishButton.style.cursor = state.finishPending ? "default" : "pointer"
    finishButton.style.opacity = state.finishPending ? "0.7" : "1"

    if (!state.finishPending) {
      finishButton.addEventListener("mouseenter", () => {
        finishButton.style.transform = "translateY(-1px)"
        finishButton.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.35), 0 0 24px rgba(122, 217, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.3)"
        finishButton.style.filter = "brightness(1.1)"
      })
      finishButton.addEventListener("mouseleave", () => {
        finishButton.style.transform = "translateY(0)"
        finishButton.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.25), 0 0 20px rgba(122, 217, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)"
        finishButton.style.filter = "brightness(1)"
      })
      finishButton.addEventListener("mousedown", () => {
        finishButton.style.transform = "translateY(1px)"
        finishButton.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
      })
    }

    finishButton.addEventListener("click", options.onFinish)

    const libraryExtras = options.renderLibraryExtras?.() ?? []
    librarySection.append(libraryList, preferenceLabel)
    for (const extra of libraryExtras) {
      librarySection.append(extra)
    }
    const buttonContainer = createElement("div")
    buttonContainer.style.paddingTop = "0.75rem"
    buttonContainer.style.display = "grid"
    buttonContainer.append(finishButton)
    librarySection.append(buttonContainer)
  }

  if (state.libraryError) {
    const libraryError = createElement("p", { textContent: state.libraryError })
    libraryError.style.margin = "0"
    libraryError.style.color = "#ffb4b4"
    librarySection.append(libraryError)
  }

  const isStep2 = state.libraries.length > 0

  if (!isStep2) {
    // Step 1: Connection & Login
    card.append(heading, description, serverLabel, rememberServerLabel, preflightButton, loginForm)
  } else {
    // Step 2: Library Selection
    const step2Header = createElement("div")
    step2Header.style.display = "flex"
    step2Header.style.justifyContent = "space-between"
    step2Header.style.alignItems = "baseline"

    const backButton = createElement("button", {
      textContent: "Change server",
      testId: "change-server-button"
    }) as HTMLButtonElement
    backButton.type = "button"
    backButton.style.background = "none"
    backButton.style.border = "none"
    backButton.style.color = "var(--mps-color-orbit-glow-halo)"
    backButton.style.fontSize = "0.8rem"
    backButton.style.cursor = "pointer"
    backButton.style.padding = "0.5rem"
    backButton.style.opacity = "0.7"
    backButton.addEventListener("mouseenter", () => backButton.style.opacity = "1")
    backButton.addEventListener("mouseleave", () => backButton.style.opacity = "0.7")
    backButton.addEventListener("click", options.onBack)

    step2Header.append(heading, backButton)
    card.append(step2Header, description, librarySection)
  }

  const footer = options.renderCardFooter?.()
  if (footer) {
    card.append(footer)
  }

  shell.append(card)
  return shell
}
