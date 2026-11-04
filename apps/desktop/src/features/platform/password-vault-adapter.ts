import type {
  DesktopCredentialWriteResult,
  DesktopPlatformBridge
} from "./tauri-bridge"

// Earlier versions kept an AES-GCM copy of the password here, keyed by the device id that
// sits in the same localStorage. That is not protection, so it is no longer written or
// read; the key is only kept so the leftover copy can be deleted.
export const LEGACY_DESKTOP_PASSWORD_STORE_STORAGE_KEY = "mps.desktop.password-vault"

export interface PasswordIdentity {
  serverUrl: string
  username: string
}

export interface PasswordWriteRequest extends PasswordIdentity {
  password: string
}

export interface PasswordVaultWriteOutcome {
  warning: string | null
  storageKind: DesktopCredentialWriteResult["storageKind"]
}

export interface DesktopPasswordVault {
  read: (identity: PasswordIdentity) => Promise<string | null>
  write: (request: PasswordWriteRequest) => Promise<PasswordVaultWriteOutcome>
  clearForIdentity: (identity: PasswordIdentity) => Promise<void>
  clearAll: () => Promise<void>
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error)
}

export function removeLegacyLocalPasswordStore(localStorageRef: Storage | null): void {
  localStorageRef?.removeItem(LEGACY_DESKTOP_PASSWORD_STORE_STORAGE_KEY)
}

/**
 * Remembers passwords in the OS keychain only. When the keychain is unavailable the
 * password is not remembered and `onWarning` says so; nothing is written elsewhere.
 * Clearing errors are propagated so callers can tell the user a password may remain.
 */
export function createPlatformBackedPasswordVault(options: {
  platformBridge: DesktopPlatformBridge
  onWarning: (warning: string) => void
}): DesktopPasswordVault {
  const { platformBridge, onWarning } = options

  return {
    read: async (identity) => {
      try {
        const fromDesktopStore = await platformBridge.readCredential(identity)
        return typeof fromDesktopStore === "string" && fromDesktopStore.length > 0
          ? fromDesktopStore
          : null
      } catch (error) {
        onWarning(`Could not read the remembered password: ${toErrorMessage(error)}`)
        return null
      }
    },
    write: async (request) => {
      try {
        const result = await platformBridge.writeCredential(request)
        if (result.warning) {
          onWarning(result.warning)
        }

        return {
          warning: result.warning,
          storageKind: result.storageKind
        }
      } catch (error) {
        const warning = `Secure credential storage is unavailable (${toErrorMessage(error)}), so the password was not remembered.`
        onWarning(warning)
        return {
          warning,
          storageKind: "not-stored"
        }
      }
    },
    clearForIdentity: async (identity) => {
      await platformBridge.clearCredential(identity)
    },
    clearAll: async () => {
      await platformBridge.clearAllCredentials()
    }
  }
}
