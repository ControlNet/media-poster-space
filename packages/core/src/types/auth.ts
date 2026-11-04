export interface AuthCredentials {
  serverUrl: string;
  username: string;
  password: string;
  clientName: string;
  deviceId: string;
}

export interface SessionSnapshot {
  providerId: string;
  serverUrl: string;
  userId: string;
  username: string;
  accessToken: string;
  createdAt: string;
  expiresAt?: string;
  /** Client name sent at sign-in; reused in session Authorization headers when present. */
  clientName?: string;
  /** Device id sent at sign-in; reused in session Authorization headers when present. */
  deviceId?: string;
}

export interface ProviderSession extends SessionSnapshot {
  refreshToken?: string;
}

export interface AuthResult {
  session: ProviderSession;
  availableLibraryIds?: string[];
}
