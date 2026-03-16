import { webcrypto } from "node:crypto"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createEncryptedLocalPasswordVault,
  createPlatformBackedPasswordVault,
  DESKTOP_PASSWORD_STORE_STORAGE_KEY,
  type DesktopPasswordVault
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

    expect(displayWarning).toBe("Unable to persist display selection.")
    expect(autostartWarning).toBe("Unable to persist autostart preference.")
  })
})

describe("desktop password vault adapter", () => {
  it("warns and encrypts locally when secure bridge write is unavailable", async () => {
    const bridge = createPlatformBridgeMock({
      writeCredential: async () => {
        throw new Error("bridge-unavailable")
      },
      readCredential: async () => null
    })
    const fallbackVault = createEncryptedLocalPasswordVault(window.localStorage, "device-test")
    const warnings: string[] = []

    const vault = createPlatformBackedPasswordVault({
      platformBridge: bridge,
      fallbackVault,
      onWarning: (warning) => {
        warnings.push(warning)
      }
    })

    const writeResult = await vault.write({
      serverUrl: "https://jellyfin.test",
      username: "demo-user",
      password: "super-secret"
    })

    expect(writeResult.storageKind).toBe("local-encrypted-fallback")
    expect(writeResult.warning).toBe("Secure desktop credential storage unavailable. Using local encrypted fallback.")
    expect(warnings).toEqual([
      "Secure desktop credential storage unavailable. Using local encrypted fallback."
    ])

    const storedPayload = window.localStorage.getItem(DESKTOP_PASSWORD_STORE_STORAGE_KEY)
    expect(storedPayload).toBeTruthy()
    expect(storedPayload).not.toContain("super-secret")

    const readBack = await vault.read({
      serverUrl: "https://jellyfin.test",
      username: "demo-user"
    })
    expect(readBack).toBe("super-secret")
  })

  it("propagates linux secret-service warning from platform write without hiding it", async () => {
    const fallbackVault: DesktopPasswordVault = {
      read: async () => null,
      write: async () => ({
        warning: null,
        storageKind: "local-encrypted-fallback"
      }),
      clearForIdentity: async () => undefined,
      clearAll: async () => undefined
    }

    const bridge = createPlatformBridgeMock({
      writeCredential: async () => ({
        storageKind: "linux-weak-fallback",
        warning: "Linux secret-service unavailable. Using weak encrypted fallback in local app data."
      })
    })
    const onWarning = vi.fn()

    const vault = createPlatformBackedPasswordVault({
      platformBridge: bridge,
      fallbackVault,
      onWarning
    })

    const result = await vault.write({
      serverUrl: "https://jellyfin.test",
      username: "demo-user",
      password: "super-secret"
    })

    expect(result).toEqual({
      storageKind: "linux-weak-fallback",
      warning: "Linux secret-service unavailable. Using weak encrypted fallback in local app data."
    })
    expect(onWarning).toHaveBeenCalledWith(
      "Linux secret-service unavailable. Using weak encrypted fallback in local app data."
    )
  })
})
