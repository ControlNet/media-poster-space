export type ProviderCapability =
  | "preflight"
  | "username-password-auth"
  | "session-restore"
  | "library-selection"
  | "media-browse"
  | "image-resolution";

export interface ProviderInfo {
  id: string;
  name: string;
  capabilities: readonly ProviderCapability[];
}

export type ProviderErrorCategory =
  | "network"
  | "auth"
  | "cors"
  | "version"
  | "timeout"
  | "unknown";

export interface ProviderError {
  category: ProviderErrorCategory;
  message: string;
  statusCode?: number;
  retriable?: boolean;
}
