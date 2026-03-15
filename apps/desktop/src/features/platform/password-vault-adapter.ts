import type {
  DesktopCredentialWriteResult,
  DesktopPlatformBridge
} from "./tauri-bridge"

export const DESKTOP_PASSWORD_STORE_STORAGE_KEY = "mps.desktop.password-vault"

export interface PasswordIdentity {
  serverUrl: string
  username: string
}

export interface PasswordWriteRequest extends PasswordIdentity {
  password: string
}

export interface PasswordVaultWriteOutcome {
  warning: string | null
  storageKind: DesktopCredentialWriteResult["storageKind"] | "local-encrypted-fallback"
}

export interface DesktopPasswordVault {
  read: (identity: PasswordIdentity) => Promise<string | null>
  write: (request: PasswordWriteRequest) => Promise<PasswordVaultWriteOutcome>
  clearForIdentity: (identity: PasswordIdentity) => Promise<void>
  clearAll: () => Promise<void>
}

interface EncryptedPasswordEntry {
  cipherText: string
  iv: string
  salt: string
  updatedAt: string
}

interface EncryptedPasswordPayload {
  version: 1
  entries: Record<string, EncryptedPasswordEntry>
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function toPasswordIdentityKey(identity: PasswordIdentity): string {
  const server = identity.serverUrl.trim().toLowerCase()
  const username = identity.username.trim().toLowerCase()
  return `${server}::${username}`
}

function getSubtleCrypto(): SubtleCrypto | null {
  if (!globalThis.crypto?.subtle) {
    return null
  }

  return globalThis.crypto.subtle
}

function randomBytes(length: number): Uint8Array {
  const values = new Uint8Array(length)
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(values)
  }

  for (let index = 0; index < values.length; index += 1) {
    values[index] = Math.floor(Math.random() * 255)
  }

  return values
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function toCryptoBufferSource(bytes: Uint8Array): BufferSource {
  if (typeof Buffer === "function") {
    return Buffer.from(bytes)
  }

  return bytes.slice()
}

function readPasswordPayload(localStorageRef: Storage): EncryptedPasswordPayload {
  const raw = localStorageRef.getItem(DESKTOP_PASSWORD_STORE_STORAGE_KEY)
  const parsed = parseJson<EncryptedPasswordPayload>(raw)

  if (!parsed || parsed.version !== 1 || typeof parsed.entries !== "object" || parsed.entries === null) {
    return {
      version: 1,
      entries: {}
    }
  }

  const normalizedEntries: Record<string, EncryptedPasswordEntry> = {}

  for (const [identityKey, candidateEntry] of Object.entries(parsed.entries)) {
    if (
      typeof candidateEntry?.cipherText === "string"
      && typeof candidateEntry?.iv === "string"
      && typeof candidateEntry?.salt === "string"
      && typeof candidateEntry?.updatedAt === "string"
    ) {
      normalizedEntries[identityKey] = {
        cipherText: candidateEntry.cipherText,
        iv: candidateEntry.iv,
        salt: candidateEntry.salt,
        updatedAt: candidateEntry.updatedAt
      }
    }
  }

  return {
    version: 1,
    entries: normalizedEntries
  }
}

function writePasswordPayload(localStorageRef: Storage, payload: EncryptedPasswordPayload): void {
  localStorageRef.setItem(DESKTOP_PASSWORD_STORE_STORAGE_KEY, JSON.stringify(payload))
}

async function derivePasswordKey(deviceId: string, salt: Uint8Array): Promise<CryptoKey | null> {
  const subtle = getSubtleCrypto()
  if (!subtle) {
    return null
  }

  const deviceIdBytes = toCryptoBufferSource(new TextEncoder().encode(deviceId))

  const baseKey = await subtle.importKey(
    "raw",
    deviceIdBytes,
    "PBKDF2",
    false,
    ["deriveKey"]
  )

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toCryptoBufferSource(salt),
      iterations: 150_000,
      hash: "SHA-256"
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  )
}

function createNoopPasswordVault(): DesktopPasswordVault {
  return {
    read: async () => null,
    write: async () => ({
      warning: null,
      storageKind: "local-encrypted-fallback"
    }),
    clearForIdentity: async () => undefined,
    clearAll: async () => undefined
  }
}

export function createEncryptedLocalPasswordVault(
  localStorageRef: Storage | null,
  deviceId: string
): DesktopPasswordVault {
  if (!localStorageRef) {
    return createNoopPasswordVault()
  }

  return {
    read: async (identity) => {
      const payload = readPasswordPayload(localStorageRef)
      const entry = payload.entries[toPasswordIdentityKey(identity)]
      if (!entry) {
        return null
      }

      try {
        const subtle = getSubtleCrypto()
        if (!subtle) {
          return null
        }

        const iv = base64ToBytes(entry.iv)
        const salt = base64ToBytes(entry.salt)
        const cipherBytes = base64ToBytes(entry.cipherText)
        const key = await derivePasswordKey(deviceId, salt)

        if (!key) {
          return null
        }

        const plainBuffer = await subtle.decrypt(
          {
            name: "AES-GCM",
            iv: toCryptoBufferSource(iv)
          },
          key,
          toCryptoBufferSource(cipherBytes)
        )

        return new TextDecoder().decode(plainBuffer)
      } catch {
        return null
      }
    },
    write: async (request) => {
      if (!request.password) {
        return {
          warning: null,
          storageKind: "local-encrypted-fallback"
        }
      }

      const subtle = getSubtleCrypto()
      if (!subtle) {
        return {
          warning: null,
          storageKind: "local-encrypted-fallback"
        }
      }

      const iv = randomBytes(12)
      const salt = randomBytes(16)
      const key = await derivePasswordKey(deviceId, salt)

      if (!key) {
        return {
          warning: null,
          storageKind: "local-encrypted-fallback"
        }
      }

      const cipherBuffer = await subtle.encrypt(
        {
          name: "AES-GCM",
          iv: toCryptoBufferSource(iv)
        },
        key,
        toCryptoBufferSource(new TextEncoder().encode(request.password))
      )

      const payload = readPasswordPayload(localStorageRef)
      const identityKey = toPasswordIdentityKey(request)
      payload.entries[identityKey] = {
        cipherText: bytesToBase64(new Uint8Array(cipherBuffer)),
        iv: bytesToBase64(iv),
        salt: bytesToBase64(salt),
        updatedAt: new Date().toISOString()
      }

      writePasswordPayload(localStorageRef, payload)

      return {
        warning: null,
        storageKind: "local-encrypted-fallback"
      }
    },
    clearForIdentity: async (identity) => {
      const payload = readPasswordPayload(localStorageRef)
      const identityKey = toPasswordIdentityKey(identity)

      if (!(identityKey in payload.entries)) {
        return
      }

      delete payload.entries[identityKey]
      if (Object.keys(payload.entries).length === 0) {
        localStorageRef.removeItem(DESKTOP_PASSWORD_STORE_STORAGE_KEY)
        return
      }

      writePasswordPayload(localStorageRef, payload)
    },
    clearAll: async () => {
      localStorageRef.removeItem(DESKTOP_PASSWORD_STORE_STORAGE_KEY)
    }
  }
}

export function createPlatformBackedPasswordVault(options: {
  platformBridge: DesktopPlatformBridge
  fallbackVault: DesktopPasswordVault
  onWarning: (warning: string) => void
}): DesktopPasswordVault {
  const { platformBridge, fallbackVault, onWarning } = options

  return {
    read: async (identity) => {
      try {
        const fromDesktopStore = await platformBridge.readCredential(identity)
        if (typeof fromDesktopStore === "string" && fromDesktopStore.length > 0) {
          return fromDesktopStore
        }
      } catch {
      }

      return fallbackVault.read(identity)
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
      } catch {
        const fallbackResult = await fallbackVault.write(request)
        const warning = fallbackResult.warning
          ?? "Secure desktop credential storage unavailable. Using local encrypted fallback."

        onWarning(warning)
        return {
          warning,
          storageKind: fallbackResult.storageKind
        }
      }
    },
    clearForIdentity: async (identity) => {
      await Promise.allSettled([
        platformBridge.clearCredential(identity),
        fallbackVault.clearForIdentity(identity)
      ])
    },
    clearAll: async () => {
      await Promise.allSettled([
        platformBridge.clearAllCredentials(),
        fallbackVault.clearAll()
      ])
    }
  }
}
