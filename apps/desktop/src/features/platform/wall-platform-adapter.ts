import type {
  DesktopDisplayOption,
  DesktopPlatformBridge
} from "./tauri-bridge"

const DEFAULT_DISPLAY_OPTIONS: DesktopDisplayOption[] = [
  {
    id: "display-primary",
    label: "Primary display",
    isPrimary: true
  }
]

export interface DesktopWallPlatformState {
  platformReady: boolean
  platformPortable: boolean
  platformDisplays: DesktopDisplayOption[]
  selectedDisplayId: string | null
  autostartEnabled: boolean
  platformWarning: string | null
}

function selectDefaultDisplayId(displays: readonly DesktopDisplayOption[]): string | null {
  if (displays.length === 0) {
    return null
  }

  return displays.find((display) => display.isPrimary)?.id ?? displays[0]?.id ?? null
}

function toErrorDetail(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error)
}

function toFallbackPlatformState(existingWarning: string | null, error: unknown): DesktopWallPlatformState {
  return {
    platformReady: true,
    platformPortable: false,
    platformDisplays: [...DEFAULT_DISPLAY_OPTIONS],
    selectedDisplayId: DEFAULT_DISPLAY_OPTIONS[0]?.id ?? null,
    autostartEnabled: false,
    platformWarning: existingWarning
      ?? `Desktop platform bridge is unavailable (${toErrorDetail(error)}). Using local defaults.`
  }
}

export async function initializeDesktopWallPlatform(options: {
  platformBridge: DesktopPlatformBridge
  existingWarning: string | null
}): Promise<DesktopWallPlatformState> {
  const { platformBridge, existingWarning } = options

  try {
    const capabilities = await platformBridge.getCapabilities()
    const [displays, storedDisplayId, autostartEnabled] = await Promise.all([
      platformBridge.listDisplays(),
      platformBridge.getDisplaySelection(),
      platformBridge.getAutostartEnabled()
    ])

    const normalizedDisplays = displays.length > 0 ? displays : [...DEFAULT_DISPLAY_OPTIONS]
    const defaultDisplayId = selectDefaultDisplayId(normalizedDisplays)
    const selectedDisplayId = storedDisplayId
      && normalizedDisplays.some((display) => display.id === storedDisplayId)
      ? storedDisplayId
      : defaultDisplayId

    // Selecting a display moves the window there, so only rewrite a stored choice whose
    // display is gone; a first launch keeps the window where the OS opened it.
    if (storedDisplayId !== null && displays.length > 0 && selectedDisplayId !== storedDisplayId) {
      await platformBridge.setDisplaySelection(selectedDisplayId)
    }

    if (capabilities.isPortable && autostartEnabled) {
      await platformBridge.setAutostartEnabled(false)
    }

    return {
      platformReady: true,
      platformPortable: capabilities.isPortable,
      platformDisplays: normalizedDisplays,
      selectedDisplayId,
      autostartEnabled: capabilities.isPortable ? false : autostartEnabled,
      platformWarning: existingWarning
    }
  } catch (error) {
    return toFallbackPlatformState(existingWarning, error)
  }
}

export async function persistDesktopDisplaySelection(options: {
  platformBridge: DesktopPlatformBridge
  displayId: string | null
}): Promise<string | null> {
  try {
    await options.platformBridge.setDisplaySelection(options.displayId)
    return null
  } catch (error) {
    return `Unable to apply display selection: ${toErrorDetail(error)}`
  }
}

export async function persistDesktopAutostartEnabled(options: {
  platformBridge: DesktopPlatformBridge
  enabled: boolean
}): Promise<string | null> {
  try {
    await options.platformBridge.setAutostartEnabled(options.enabled)
    return null
  } catch (error) {
    return `Unable to change autostart: ${toErrorDetail(error)}`
  }
}
