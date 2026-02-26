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
}

export interface ProviderSession extends SessionSnapshot {
  refreshToken?: string;
}

export interface AuthResult {
  session: ProviderSession;
  availableLibraryIds?: string[];
}
