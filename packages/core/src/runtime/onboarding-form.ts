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
  toLibraryCheckboxTestId: (libraryId: string) => string
  onServerInput: (value: string) => void
  onRememberServerChange: (remember: boolean) => void
  onPreflight: () => void
  onUsernameInput: (value: string) => void
  onPasswordInput: (value: string) => void
  onRememberUsernameChange: (remember: boolean) => void
  onRememberPasswordChange: (remember: boolean) => void
  onLogin: () => void
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
  shell.style.padding = "clamp(1rem, 3vw, 2rem)"
  shell.style.background = "var(--mps-color-canvas)"
  shell.style.color = "var(--mps-color-foreground)"
  shell.style.fontFamily = "var(--mps-font-body)"

  const card = createElement("section")
  card.style.width = "min(40rem, 100%)"
  card.style.display = "grid"
  card.style.gap = "1rem"
  card.style.padding = "clamp(1rem, 3vw, 1.5rem)"
  card.style.border = "1px solid var(--mps-color-border)"
  card.style.borderRadius = "var(--mps-radius-lg)"
  card.style.background = "color-mix(in srgb, var(--mps-color-surface) 86%, black)"
  card.style.boxShadow = "var(--mps-elevation-dramatic)"

  const heading = createElement("h1", { textContent: "Connect Jellyfin", testId: "onboarding-title" })
  heading.style.margin = "0"
  heading.style.fontFamily = "var(--mps-font-display)"
  heading.style.fontSize = "clamp(1.75rem, 4vw, 2.3rem)"

  const description = createElement("p", {
    textContent: options.descriptionText
  })
  description.style.margin = "0"
  description.style.color = "var(--mps-color-foreground-muted)"

  const serverLabel = createElement("label", { textContent: "Jellyfin server URL" })
  serverLabel.style.display = "grid"
  serverLabel.style.gap = "0.5rem"

  const serverInput = createElement("input", { testId: "server-url-input" }) as HTMLInputElement
  serverInput.type = "url"
  serverInput.placeholder = "https://jellyfin.example"
  serverInput.value = state.serverUrl
  serverInput.style.padding = "0.65rem 0.75rem"
  serverInput.style.border = "1px solid var(--mps-color-border)"
  serverInput.style.borderRadius = "0.6rem"
  serverInput.style.background = "var(--mps-color-canvas)"
  serverInput.style.color = "var(--mps-color-foreground)"
  serverInput.addEventListener("input", () => {
    options.onServerInput(serverInput.value)
  })
  serverLabel.append(serverInput)

  const rememberServerLabel = createElement("label")
  rememberServerLabel.style.display = "inline-flex"
  rememberServerLabel.style.gap = "0.45rem"
  rememberServerLabel.style.alignItems = "center"
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
  preflightButton.style.padding = "0.7rem 0.95rem"
  preflightButton.style.borderRadius = "0.6rem"
  preflightButton.style.border = "1px solid var(--mps-color-accent-ring)"
  preflightButton.style.background = "var(--mps-color-accent)"
  preflightButton.style.color = "var(--mps-color-accent-foreground)"
  preflightButton.style.fontWeight = "600"
  preflightButton.addEventListener("click", options.onPreflight)

  if (state.preflightError) {
    const preflightError = createElement("p", { textContent: state.preflightError })
    preflightError.style.margin = "0"
    preflightError.style.color = "#ffb4b4"
    card.append(preflightError)
  }

  const loginFields = createElement("div")
  loginFields.style.display = "grid"
  loginFields.style.gap = "0.75rem"
  loginFields.style.paddingTop = "0.25rem"
  loginFields.style.borderTop = "1px solid color-mix(in srgb, var(--mps-color-border) 55%, transparent)"

  const usernameLabel = createElement("label", { textContent: "Username" })
  usernameLabel.style.display = "grid"
  usernameLabel.style.gap = "0.4rem"
  const usernameInput = createElement("input", { testId: "username-input" }) as HTMLInputElement
  usernameInput.type = "text"
  usernameInput.autocomplete = "username"
  usernameInput.value = state.username
  usernameInput.style.padding = "0.65rem 0.75rem"
  usernameInput.style.border = "1px solid var(--mps-color-border)"
  usernameInput.style.borderRadius = "0.6rem"
  usernameInput.style.background = "var(--mps-color-canvas)"
  usernameInput.style.color = "var(--mps-color-foreground)"
  usernameInput.addEventListener("input", () => {
    options.onUsernameInput(usernameInput.value)
  })
  usernameLabel.append(usernameInput)

  const passwordLabel = createElement("label", { textContent: "Password" })
  passwordLabel.style.display = "grid"
  passwordLabel.style.gap = "0.4rem"
  const passwordInput = createElement("input", { testId: "password-input" }) as HTMLInputElement
  passwordInput.type = "password"
  passwordInput.autocomplete = "current-password"
  passwordInput.value = state.password
  passwordInput.style.padding = "0.65rem 0.75rem"
  passwordInput.style.border = "1px solid var(--mps-color-border)"
  passwordInput.style.borderRadius = "0.6rem"
  passwordInput.style.background = "var(--mps-color-canvas)"
  passwordInput.style.color = "var(--mps-color-foreground)"
  passwordInput.addEventListener("input", () => {
    options.onPasswordInput(passwordInput.value)
  })
  passwordLabel.append(passwordInput)

  const rememberRow = createElement("div")
  rememberRow.style.display = "grid"
  rememberRow.style.gap = "0.35rem"

  const rememberUsernameLabel = createElement("label")
  rememberUsernameLabel.style.display = "inline-flex"
  rememberUsernameLabel.style.gap = "0.45rem"
  rememberUsernameLabel.style.alignItems = "center"
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
  rememberPasswordLabel.style.color = "var(--mps-color-foreground-muted)"
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

  rememberRow.append(rememberUsernameLabel, rememberPasswordLabel)

  const loginButton = createElement("button", {
    textContent: state.loginPending ? "Signing in…" : "Sign in",
    testId: "login-submit"
  }) as HTMLButtonElement
  loginButton.type = "button"
  loginButton.disabled = state.loginPending
  loginButton.style.padding = "0.7rem 0.95rem"
  loginButton.style.borderRadius = "0.6rem"
  loginButton.style.border = "1px solid var(--mps-color-accent-ring)"
  loginButton.style.background = "var(--mps-color-accent)"
  loginButton.style.color = "var(--mps-color-accent-foreground)"
  loginButton.style.fontWeight = "600"
  loginButton.addEventListener("click", options.onLogin)

  loginFields.append(usernameLabel, passwordLabel, rememberRow, loginButton)

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
    loginFields.append(authError)
  }

  const librarySection = createElement("section")
  librarySection.style.display = "grid"
  librarySection.style.gap = "0.7rem"
  librarySection.style.paddingTop = "0.25rem"
  librarySection.style.borderTop = "1px solid color-mix(in srgb, var(--mps-color-border) 55%, transparent)"

  const libraryHeading = createElement("h2", { textContent: "Library selection" })
  libraryHeading.style.margin = "0"
  libraryHeading.style.fontFamily = "var(--mps-font-display)"
  libraryHeading.style.fontSize = "1.2rem"
  librarySection.append(libraryHeading)

  if (state.libraries.length === 0) {
    const emptyLibraryState = createElement("p", {
      textContent: "Sign in first to fetch your libraries and wall preferences."
    })
    emptyLibraryState.style.margin = "0"
    emptyLibraryState.style.color = "var(--mps-color-foreground-muted)"
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

      const libraryCheckbox = createElement("input", {
        testId: options.toLibraryCheckboxTestId(library.id)
      }) as HTMLInputElement
      libraryCheckbox.type = "checkbox"
      libraryCheckbox.checked = state.selectedLibraryIds.has(library.id)
      libraryCheckbox.addEventListener("change", () => {
        options.onLibrarySelectionChange(library.id, libraryCheckbox.checked)
      })

      const descriptor = `${library.name} (${library.kind})`
      libraryLabel.append(libraryCheckbox)
      appendCheckboxLabelText(createElement, libraryLabel, descriptor)
      libraryList.append(libraryLabel)
    }

    const preferenceLabel = createElement("label", { textContent: "Wall density" })
    preferenceLabel.style.display = "grid"
    preferenceLabel.style.gap = "0.4rem"
    const densitySelect = createElement("select", { testId: "wall-density-select" }) as HTMLSelectElement
    densitySelect.innerHTML = [
      '<option value="cinematic">Cinematic (default)</option>',
      '<option value="compact">Compact</option>'
    ].join("")
    densitySelect.value = state.density
    densitySelect.style.padding = "0.65rem 0.75rem"
    densitySelect.style.border = "1px solid var(--mps-color-border)"
    densitySelect.style.borderRadius = "0.6rem"
    densitySelect.style.background = "var(--mps-color-canvas)"
    densitySelect.style.color = "var(--mps-color-foreground)"
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
    finishButton.style.padding = "0.7rem 0.95rem"
    finishButton.style.borderRadius = "0.6rem"
    finishButton.style.border = "1px solid var(--mps-color-accent-ring)"
    finishButton.style.background = "var(--mps-color-accent)"
    finishButton.style.color = "var(--mps-color-accent-foreground)"
    finishButton.style.fontWeight = "600"
    finishButton.addEventListener("click", options.onFinish)

    const libraryExtras = options.renderLibraryExtras?.() ?? []
    librarySection.append(libraryList, preferenceLabel)
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

  card.append(heading, description, serverLabel, rememberServerLabel, preflightButton, loginFields, librarySection)
  const footer = options.renderCardFooter?.()
  if (footer) {
    card.append(footer)
  }

  shell.append(card)
  return shell
}
