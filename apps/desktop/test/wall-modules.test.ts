import { webcrypto } from "node:crypto"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createPlatformBackedPasswordVault,
  LEGACY_DESKTOP_PASSWORD_STORE_STORAGE_KEY
} from "../src/features/platform/password-vault-adapter"
import {
  initializeDesktopWallPlatform,
  persistDesktopAutostartEnabled,
  persistDesktopDisplaySelection
} from "../src/features/platform/wall-platform-adapter"
import type { DesktopDisplayOption, DesktopPlatformBridge } from "../src/features/platform/tauri-bridge"
import { createWallInteractionController } from "@mps/core"

function createMousePointerEvent(type: string, init: {
  bubbles?: boolean
  button?: number
} = {}): Event {
  const event = new Event(type, { bubbles: init.bubbles ?? true })
  Object.defineProperty(event, "pointerType", {
    value: "mouse"
  })
  Object.defineProperty(event, "button", {
    value: init.button ?? 0
  })
  return event
}

function createPlatformBridgeMock(overrides: Partial<DesktopPlatformBridge> = {}): DesktopPlatformBridge {
  return {
    getCapabilities: async () => ({
      isDesktop: true,
      isLinux: true,
      isPortable: false,
      secureCredentialStorage: true,
      linuxSecretServiceAvailable: true
    }),
    listDisplays: async () => [
      {
        id: "display-primary",
        label: "Primary display",
        isPrimary: true
      }
    ],
    getDisplaySelection: async () => "display-primary",
    setDisplaySelection: async () => undefined,
    getAutostartEnabled: async () => false,
    setAutostartEnabled: async () => undefined,
    getFullscreenEnabled: async () => false,
    setFullscreenEnabled: async () => undefined,
    readCredential: async () => null,
    writeCredential: async () => ({
      storageKind: "secure-service",
      warning: null
    }),
    clearCredential: async () => undefined,
    clearAllCredentials: async () => undefined,
    ...overrides
  }
}

beforeEach(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      configurable: true
    })
  }

  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

describe("desktop wall interaction controller", () => {
  it("reveals controls on pointer activity and idle-hides after 8 seconds", async () => {
    vi.useFakeTimers()

    let controlsHidden = true
    let renderCount = 0

    const controller = createWallInteractionController({
      idleHideMs: 8_000,
      isWallRouteActive: () => true,
      onIdleHide: () => {
        if (controlsHidden) {
          return false
        }

        controlsHidden = true
        return true
      },
      onRevealControls: () => {
        if (!controlsHidden) {
          return false
        }

        controlsHidden = false
        return true
      },
      onRenderRequest: () => {
        renderCount += 1
      }
    })

    controller.attach()
    window.dispatchEvent(createMousePointerEvent("pointermove"))

    expect(controller.isIdleHideScheduled()).toBe(true)
    expect(renderCount).toBe(1)

    await vi.advanceTimersByTimeAsync(8_000)

    expect(controlsHidden).toBe(true)
    expect(renderCount).toBe(2)

    controller.detach()
    expect(controller.isIdleHideScheduled()).toBe(false)
  })

  it("ignores keyboard events and preserves route guards for idle scheduling", async () => {
    vi.useFakeTimers()

    let routeActive = true
    let idleHideCalls = 0
    let renderCount = 0

    const controller = createWallInteractionController({
      idleHideMs: 8_000,
      isWallRouteActive: () => routeActive,
      onIdleHide: () => {
        idleHideCalls += 1
        return true
      },
      onRevealControls: () => false,
      onRenderRequest: () => {
        renderCount += 1
      }
    })

    controller.attach()
    document.body.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))

    expect(renderCount).toBe(0)
    expect(controller.isIdleHideScheduled()).toBe(false)

    routeActive = false
    await vi.advanceTimersByTimeAsync(8_000)

    expect(idleHideCalls).toBe(0)
    expect(renderCount).toBe(0)

    controller.detach()
  })
})

describe("desktop wall platform adapter", () => {
  it("falls back to primary display and disables autostart in portable mode", async () => {
    const displays: DesktopDisplayOption[] = [
      {
        id: "display-primary",
        label: "Primary display",
        isPrimary: true
      },
      {
        id: "display-secondary",
        label: "Display 2",
        isPrimary: false
      }
    ]

    const setDisplaySelection = vi.fn(async () => undefined)
    const setAutostartEnabled = vi.fn(async () => undefined)
    const bridge = createPlatformBridgeMock({
      getCapabilities: async () => ({
        isDesktop: true,
        isLinux: true,
        isPortable: true,
        secureCredentialStorage: true,
        linuxSecretServiceAvailable: true
      }),
      listDisplays: async () => displays,
      getDisplaySelection: async () => "unknown-display",
      getAutostartEnabled: async () => true,
      setDisplaySelection,
      setAutostartEnabled
    })

    const state = await initializeDesktopWallPlatform({
      platformBridge: bridge,
      existingWarning: null
    })

    expect(state.platformDisplays).toEqual(displays)
    expect(state.selectedDisplayId).toBe("display-primary")
    expect(state.platformPortable).toBe(true)
    expect(state.autostartEnabled).toBe(false)
    expect(setDisplaySelection).toHaveBeenCalledWith("display-primary")
    expect(setAutostartEnabled).toHaveBeenCalledWith(false)
  })

  it("returns explicit persistence warnings when display/autostart writes fail", async () => {
    const bridge = createPlatformBridgeMock({
      setDisplaySelection: async () => {
        throw new Error("display-write-failed")
      },
      setAutostartEnabled: async () => {
        throw new Error("autostart-write-failed")
      }
    })

    const displayWarning = await persistDesktopDisplaySelection({
      platformBridge: bridge,
      displayId: "display-secondary"
    })
    const autostartWarning = await persistDesktopAutostartEnabled({
      platformBridge: bridge,
      enabled: true
    })

    expect(displayWarning).toBe("Unable to apply display selection: display-write-failed")
    expect(autostartWarning).toBe("Unable to change autostart: autostart-write-failed")
  })
})

describe("desktop password vault adapter", () => {
  it("does not remember the password anywhere when the keychain write fails", async () => {
    const bridge = createPlatformBridgeMock({
      writeCredential: async () => {
        throw new Error("bridge-unavailable")
      },
      readCredential: async () => null
    })
    const warnings: string[] = []

    const vault = createPlatformBackedPasswordVault({
      platformBridge: bridge,
      onWarning: (warning) => {
        warnings.push(warning)
      }
    })

    const writeResult = await vault.write({
      serverUrl: "https://jellyfin.test",
      username: "demo-user",
      password: "super-secret"
    })

    const expectedWarning = "Secure credential storage is unavailable (bridge-unavailable), so the password was not remembered."
    expect(writeResult).toEqual({ storageKind: "not-stored", warning: expectedWarning })
    expect(warnings).toEqual([expectedWarning])
    expect(window.localStorage.getItem(LEGACY_DESKTOP_PASSWORD_STORE_STORAGE_KEY)).toBeNull()
    expect(JSON.stringify({ ...window.localStorage })).not.toContain("super-secret")

    await expect(vault.read({
      serverUrl: "https://jellyfin.test",
      username: "demo-user"
    })).resolves.toBeNull()
  })

  it("propagates the keychain-unavailable warning from the platform write", async () => {
    const warning = "No system keychain (Secret Service) is available, so the password was not remembered."
    const bridge = createPlatformBridgeMock({
      writeCredential: async () => ({
        storageKind: "not-stored",
        warning
      })
    })
    const onWarning = vi.fn()

    const vault = createPlatformBackedPasswordVault({
      platformBridge: bridge,
      onWarning
    })

    const result = await vault.write({
      serverUrl: "https://jellyfin.test",
      username: "demo-user",
      password: "super-secret"
    })

    expect(result).toEqual({ storageKind: "not-stored", warning })
    expect(onWarning).toHaveBeenCalledWith(warning)
  })

  it("reports keychain read failures instead of hiding them", async () => {
    const onWarning = vi.fn()
    const vault = createPlatformBackedPasswordVault({
      platformBridge: createPlatformBridgeMock({
        readCredential: async () => {
          throw new Error("keychain locked")
        }
      }),
      onWarning
    })

    await expect(vault.read({ serverUrl: "https://jellyfin.test", username: "demo-user" })).resolves.toBeNull()
    expect(onWarning).toHaveBeenCalledWith("Could not read the remembered password: keychain locked")
  })

  it("propagates clear failures so the caller can warn that a password may remain", async () => {
    const vault = createPlatformBackedPasswordVault({
      platformBridge: createPlatformBridgeMock({
        clearCredential: async () => {
          throw new Error("delete denied")
        },
        clearAllCredentials: async () => {
          throw new Error("delete denied")
        }
      }),
      onWarning: vi.fn()
    })

    await expect(vault.clearForIdentity({ serverUrl: "https://jellyfin.test", username: "demo-user" }))
      .rejects.toThrow("delete denied")
    await expect(vault.clearAll()).rejects.toThrow("delete denied")
  })
})
