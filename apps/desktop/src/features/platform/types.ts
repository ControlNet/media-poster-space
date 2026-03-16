export interface DesktopDisplayOption {
  id: string
  label: string
  isPrimary: boolean
}

export interface DesktopPlatformCapabilities {
  isDesktop: boolean
  isLinux: boolean
  isPortable: boolean
  secureCredentialStorage: boolean
  linuxSecretServiceAvailable: boolean
}

export interface DesktopCredentialIdentity {
  serverUrl: string
  username: string
}

export interface DesktopCredentialWriteRequest extends DesktopCredentialIdentity {
  password: string
}

export type DesktopCredentialStorageKind =
  | "secure-service"
  | "linux-weak-fallback"
  | "local-encrypted-fallback"

export interface DesktopCredentialWriteResult {
  storageKind: DesktopCredentialStorageKind
  warning: string | null
}

export interface DesktopPlatformBridge {
  getCapabilities: () => Promise<DesktopPlatformCapabilities>
  listDisplays: () => Promise<DesktopDisplayOption[]>
  getDisplaySelection: () => Promise<string | null>
  setDisplaySelection: (displayId: string | null) => Promise<void>
  getAutostartEnabled: () => Promise<boolean>
  setAutostartEnabled: (enabled: boolean) => Promise<void>
  getFullscreenEnabled: () => Promise<boolean>
  setFullscreenEnabled: (enabled: boolean) => Promise<void>
  readCredential: (identity: DesktopCredentialIdentity) => Promise<string | null>
  writeCredential: (request: DesktopCredentialWriteRequest) => Promise<DesktopCredentialWriteResult>
  clearCredential: (identity: DesktopCredentialIdentity) => Promise<void>
  clearAllCredentials: () => Promise<void>
}
