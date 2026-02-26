import type { AuthCredentials, ProviderSession, SessionSnapshot } from "../types/auth";
import type { MediaItem, VisualItem } from "../types/media";
import type { ProviderCapability, ProviderError } from "../types/provider";

export interface ProviderPreflightRequest {
  serverUrl: string;
  origin?: string;
  timeoutMs?: number;
}

export type ProviderPreflightResult =
  | {
      ok: true;
      serverVersion?: string;
      latencyMs?: number;
      warnings?: string[];
    }
  | {
      ok: false;
      error: ProviderError;
    };

export interface MediaLibrary {
  id: string;
  name: string;
  kind: "movies" | "shows" | "mixed" | "other";
}

export interface MediaQuery {
  libraryIds: readonly string[];
  cursor?: string;
  limit?: number;
  updatedSince?: string;
}

export interface MediaPage {
  items: MediaItem[];
  nextCursor?: string;
  fetchedAt: string;
}

export interface MediaProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: readonly ProviderCapability[];

  preflight(request: ProviderPreflightRequest): Promise<ProviderPreflightResult>;
  authenticate(credentials: AuthCredentials): Promise<ProviderSession>;
  restoreSession(snapshot: SessionSnapshot): Promise<ProviderSession | null>;
  invalidateSession(session: ProviderSession): Promise<void>;

  listLibraries(session: ProviderSession): Promise<MediaLibrary[]>;
  listMedia(session: ProviderSession, query: MediaQuery): Promise<MediaPage>;
  toVisualItems(items: readonly MediaItem[]): VisualItem[];
}
