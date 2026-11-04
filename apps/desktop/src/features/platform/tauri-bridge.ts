import { invoke, isTauri } from "@tauri-apps/api/core"

import type {
  DesktopCredentialIdentity,
  DesktopCredentialWriteRequest,
  DesktopCredentialWriteResult,
  DesktopDisplayOption,
  DesktopPlatformBridge,
  DesktopPlatformCapabilities
} from "./types"

const DISPLAY_SELECTION_STORAGE_KEY = "mps.desktop.platform.display-selection"
const AUTOSTART_STORAGE_KEY = "mps.desktop.platform.autostart"

interface TauriCore {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
}

interface TauriCapabilitiesPayload {
  isDesktop: boolean
  isLinux: boolean
  isPortable: boolean
  secureCredentialStorage: boolean
  linuxSecretServiceAvailable: boolean
}

interface TauriDisplayPayload {
  id: string
  label: string
  isPrimary: boolean
}

interface TauriCredentialWritePayload {
  storageKind: DesktopCredentialWriteResult["storageKind"]
  warning: string | null
}

// `withGlobalTauri` is off, so no `window.__TAURI__` is exposed to page scripts; the IPC
// entry point comes from the official module and only exists inside the Tauri webview.
const TAURI_CORE: TauriCore = {
  invoke: <T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args)
}

function getTauriCore(): TauriCore | null {
  return isTauri() ? TAURI_CORE : null
}

function normalizeCapabilities(payload: TauriCapabilitiesPayload): DesktopPlatformCapabilities {
  return {
    isDesktop: Boolean(payload.isDesktop),
    isLinux: Boolean(payload.isLinux),
    isPortable: Boolean(payload.isPortable),
    secureCredentialStorage: Boolean(payload.secureCredentialStorage),
    linuxSecretServiceAvailable: Boolean(payload.linuxSecretServiceAvailable)
  }
}

function browserCapabilities(): DesktopPlatformCapabilities {
  const userAgent = globalThis.navigator?.userAgent?.toLowerCase() ?? ""
  const isLinux = userAgent.includes("linux")

  return {
    isDesktop: false,
    isLinux,
    isPortable: false,
    secureCredentialStorage: false,
    linuxSecretServiceAvailable: !isLinux
  }
}

function defaultDisplayOptions(): DesktopDisplayOption[] {
  return [
    {
      id: "display-primary",
      label: "Primary display",
      isPrimary: true
    }
  ]
}

// Browser-preview fallbacks only (no Tauri runtime). Storage errors (quota, disabled
// storage) are reported to the caller, which shows its own "unable to persist" warning.
function getLocalStorageValue(storage: Storage | null, key: string): string | null {
  return storage?.getItem(key) ?? null
}

function setLocalStorageValue(storage: Storage | null, key: string, value: string | null): void {
  if (!storage) {
    return
  }

  if (value === null) {
    storage.removeItem(key)
    return
  }

  storage.setItem(key, value)
}

const BROWSER_PREVIEW_CREDENTIAL_WARNING =
  "Passwords can only be remembered in the desktop app (system keychain)."

export function createDesktopPlatformBridge(localStorageRef: Storage | null): DesktopPlatformBridge {
  return {
    getCapabilities: async () => {
      const tauriCore = getTauriCore()
      if (!tauriCore) {
        return browserCapabilities()
      }

      const invoke = tauriCore.invoke
      const payload = await invoke<TauriCapabilitiesPayload>("platform_get_capabilities")
      return normalizeCapabilities(payload)
    },
    listDisplays: async () => {
      const tauriCore = getTauriCore()
      if (!tauriCore) {
        return defaultDisplayOptions()
      }

      const invoke = tauriCore.invoke
      const payload = await invoke<TauriDisplayPayload[]>("platform_list_displays")
      if (payload.length === 0) {
        return defaultDisplayOptions()
      }

      return payload.map((display) => ({
        id: display.id,
        label: display.label,
        isPrimary: display.isPrimary
      }))
    },
    getDisplaySelection: async () => {
      const tauriCore = getTauriCore()
      if (!tauriCore) {
        return getLocalStorageValue(localStorageRef, DISPLAY_SELECTION_STORAGE_KEY)
      }

      const invoke = tauriCore.invoke
      return invoke<string | null>("platform_get_display_selection")
    },
    setDisplaySelection: async (displayId) => {
      const tauriCore = getTauriCore()
      if (!tauriCore) {
        setLocalStorageValue(localStorageRef, DISPLAY_SELECTION_STORAGE_KEY, displayId)
        return
      }

      const invoke = tauriCore.invoke
      await invoke("platform_set_display_selection", { displayId })
    },
    getAutostartEnabled: async () => {
      const tauriCore = getTauriCore()
      if (!tauriCore) {
        return getLocalStorageValue(localStorageRef, AUTOSTART_STORAGE_KEY) === "1"
      }

      const invoke = tauriCore.invoke
      return invoke<boolean>("platform_get_autostart")
    },
    setAutostartEnabled: async (enabled) => {
      const tauriCore = getTauriCore()
      if (!tauriCore) {
        setLocalStorageValue(localStorageRef, AUTOSTART_STORAGE_KEY, enabled ? "1" : "0")
        return
      }

      const invoke = tauriCore.invoke
      await invoke("platform_set_autostart", { enabled })
    },
    getFullscreenEnabled: async () => {
      const tauriCore = getTauriCore()
      if (!tauriCore) {
        return document.fullscreenElement !== null
      }

      const invoke = tauriCore.invoke
      return invoke<boolean>("platform_get_fullscreen")
    },
    setFullscreenEnabled: async (enabled) => {
      const tauriCore = getTauriCore()
      if (!tauriCore) {
        return
      }

      const invoke = tauriCore.invoke
      await invoke("platform_set_fullscreen", { enabled })
    },
    readCredential: async (identity) => {
      const tauriCore = getTauriCore()
      if (!tauriCore) {
        // Nothing can have been stored without a keychain.
        return null
      }

      const invoke = tauriCore.invoke
      return invoke<string | null>("platform_read_credential", {
        serverUrl: identity.serverUrl,
        username: identity.username
      })
    },
    writeCredential: async (request) => {
      const tauriCore = getTauriCore()
      if (!tauriCore) {
        return {
          storageKind: "not-stored",
          warning: BROWSER_PREVIEW_CREDENTIAL_WARNING
        }
      }

      const invoke = tauriCore.invoke
      const payload = await invoke<TauriCredentialWritePayload>("platform_write_credential", {
        serverUrl: request.serverUrl,
        username: request.username,
        password: request.password
      })

      return {
        storageKind: payload.storageKind,
        warning: payload.warning
      }
    },
    clearCredential: async (identity) => {
      const tauriCore = getTauriCore()
      if (!tauriCore) {
        return
      }

      const invoke = tauriCore.invoke
      await invoke("platform_clear_credential", {
        serverUrl: identity.serverUrl,
        username: identity.username
      })
    },
    clearAllCredentials: async () => {
      const tauriCore = getTauriCore()
      if (!tauriCore) {
        return
      }

      const invoke = tauriCore.invoke
      await invoke("platform_clear_all_credentials")
    }
  }
}

export type {
  DesktopCredentialIdentity,
  DesktopCredentialWriteRequest,
  DesktopCredentialWriteResult,
  DesktopDisplayOption,
  DesktopPlatformBridge,
  DesktopPlatformCapabilities
}
