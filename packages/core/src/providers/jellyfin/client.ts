import type {
  AuthCredentials,
  ProviderSession,
  SessionSnapshot
} from "../../types/auth";
import type { ArtworkImage, MediaItem, MediaKind, VisualItem } from "../../types/media";
import type { ProviderError } from "../../types/provider";
import type {
  MediaLibrary,
  MediaPage,
  MediaProvider,
  MediaQuery,
  ProviderPreflightRequest,
  ProviderPreflightResult,
  ProviderRequestOptions
} from "../../provider/media-provider";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_PAGE_LIMIT = 100;
const ROOT_LIBRARY_ITEM_TYPES = "Movie,Series,BoxSet,MusicVideo";

const AUTH_FAILURE_STATUS = new Set([400, 401, 403, 415]);

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Which server API dialect the provider talks.
 * - `jellyfin`: session token in `Authorization: MediaBrowser … Token="…"` (Jellyfin 12 ignores legacy
 *   `X-Emby-Token`), current user via `Users/Me`.
 * - `emby`: session token in `X-Emby-Token`, current user via `Users/{userId}`.
 */
type ApiFlavor = "jellyfin" | "emby";

interface JellyfinProviderOptions {
  fetch?: FetchLike;
  appVersion?: string;
  now?: () => Date;
  providerId?: "jellyfin" | "emby";
  displayName?: string;
  apiBasePath?: string;
  authorizationScheme?: string;
  minSupportedMajorVersion?: number;
  apiFlavor?: ApiFlavor;
}

type EmbyProviderOptions = Omit<
  JellyfinProviderOptions,
  "providerId" | "displayName" | "apiBasePath" | "authorizationScheme" | "minSupportedMajorVersion" | "apiFlavor"
>;

interface AuthHeaderFields {
  appVersion: string;
  clientName?: string | undefined;
  deviceId?: string | undefined;
  token?: string | undefined;
}

interface RequestOptions {
  timeoutMs: number;
  fallbackMessage: string;
  signal?: AbortSignal | undefined;
}

type ServerUrlCheck =
  | {
      ok: true;
      serverUrl: string;
    }
  | {
      ok: false;
      error: ProviderError;
    };

type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

type JsonRecord = Record<string, unknown>;

function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.trim().replace(/\/+$/, "");
}

function normalizeApiBasePath(apiBasePath: string | undefined): string {
  if (!apiBasePath) {
    return "";
  }

  const normalizedApiBasePath = apiBasePath.trim().replace(/^\/+|\/+$/g, "");
  return normalizedApiBasePath.length > 0 ? `/${normalizedApiBasePath}` : "";
}

function buildApiUrl(serverUrl: string, endpointPath: string, apiBasePath = ""): string {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const normalizedEndpointPath = endpointPath.replace(/^\/+/, "");
  // Relative reference (no leading "/") so a server base path such as "/jellyfin" is kept.
  const relativePath = `${normalizeApiBasePath(apiBasePath)}/${normalizedEndpointPath}`.replace(/^\/+/, "");
  const url = new URL(relativePath, `${normalizedServerUrl}/`);
  return url.toString();
}

function checkServerUrl(rawServerUrl: string, providerName: string, origin?: string): ServerUrlCheck {
  const serverUrl = normalizeServerUrl(rawServerUrl);

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(serverUrl)) {
    return {
      ok: false,
      error: {
        category: "unknown",
        message: `${providerName} server address must start with http:// or https:// (for example http://192.168.1.10:8096)`,
        retriable: false
      }
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(serverUrl);
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }

    return {
      ok: false,
      error: {
        category: "unknown",
        message: `${providerName} server address is not a valid URL`,
        retriable: false
      }
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      error: {
        category: "unknown",
        message: `${providerName} server address must use http:// or https://`,
        retriable: false
      }
    };
  }

  if (parsedUrl.username.length > 0 || parsedUrl.password.length > 0) {
    return {
      ok: false,
      error: {
        category: "unknown",
        message: `${providerName} server address must not include a username or password; sign in with the form instead`,
        retriable: false
      }
    };
  }

  if (
    origin?.toLowerCase().startsWith("https:")
    && parsedUrl.protocol === "http:"
    && !LOOPBACK_HOSTNAMES.has(parsedUrl.hostname)
  ) {
    return {
      ok: false,
      error: {
        category: "network",
        message: `This page is served over HTTPS, so the browser blocks requests to an http:// ${providerName} server. Use an https:// server address (for example through a reverse proxy) or the desktop app.`,
        retriable: false
      }
    };
  }

  return { ok: true, serverUrl };
}

function requireServerUrl(rawServerUrl: string, providerName: string): string {
  const serverUrlCheck = checkServerUrl(rawServerUrl, providerName);
  if (!serverUrlCheck.ok) {
    throw new JellyfinProviderError(serverUrlCheck.error);
  }

  return serverUrlCheck.serverUrl;
}

function shouldValidateCors(serverUrl: string, origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }

  return new URL(serverUrl).origin !== origin;
}

function safeMessageFromStatus(status: number, fallback: string, providerName: string): string {
  if (status === 401 || status === 403) {
    return `Authentication was rejected by ${providerName}`;
  }

  if (status >= 500) {
    return `${providerName} server is temporarily unavailable`;
  }

  return fallback;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readFiniteNumber(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(record: JsonRecord, key: string): string[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function parseMajorVersion(version: string): number | null {
  const [majorSegment] = version.split(".");
  if (!majorSegment) {
    return null;
  }

  const major = Number.parseInt(majorSegment, 10);
  return Number.isNaN(major) ? null : major;
}

function detectServerProduct(publicInfo: JsonRecord): "jellyfin" | "emby" | null {
  const productName = (readString(publicInfo, "ProductName") ?? "").trim().toLowerCase();

  if (productName.includes("jellyfin")) {
    return "jellyfin";
  }

  if (productName.includes("emby")) {
    return "emby";
  }

  // Emby's public system info has no ProductName and Emby versions are 4.x; Jellyfin always
  // reports ProductName and started at 10.x.
  const version = readString(publicInfo, "Version");
  const majorVersion = version ? parseMajorVersion(version) : null;
  if (productName.length === 0 && majorVersion !== null && majorVersion < 10) {
    return "emby";
  }

  return null;
}

function timeoutError(providerName: string): ProviderError {
  return {
    category: "timeout",
    message: `${providerName} request timed out`,
    retriable: true
  };
}

function cancelledError(providerName: string): ProviderError {
  return {
    category: "network",
    message: `${providerName} request was cancelled`,
    retriable: true
  };
}

function toProviderError(error: unknown, fallbackMessage: string, providerName: string): ProviderError {
  if (error instanceof JellyfinProviderError) {
    return error.providerError;
  }

  if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return timeoutError(providerName);
  }

  if (error instanceof TypeError) {
    return {
      category: "network",
      message: `Could not reach ${providerName} server`,
      retriable: true
    };
  }

  return {
    category: "unknown",
    message: fallbackMessage,
    retriable: false
  };
}

function unexpectedResponseError(providerName: string, statusCode: number, detail: string): JellyfinProviderError {
  return new JellyfinProviderError({
    category: "unknown",
    message: `${providerName} returned ${detail}`,
    statusCode,
    retriable: true
  });
}

function toMediaKind(value: string | undefined): MediaKind {
  switch (value) {
    case "Movie":
      return "movie";
    case "Series":
      return "series";
    case "Season":
      return "season";
    case "Episode":
      return "episode";
    case "BoxSet":
      return "collection";
    case "MusicVideo":
      return "music-video";
    default:
      return "other";
  }
}

function toLibraryKind(collectionType: string | undefined): MediaLibrary["kind"] {
  switch (collectionType) {
    case "movies":
      return "movies";
    case "tvshows":
      return "shows";
    case "mixed":
      return "mixed";
    default:
      return "other";
  }
}

function escapeAuthHeaderValue(value: string): string {
  return value.replaceAll('"', "\\\"");
}

function makeAuthHeader(authorizationScheme: string, fields: AuthHeaderFields): string {
  const parts: string[] = [];

  if (fields.clientName) {
    const escapedClientName = escapeAuthHeaderValue(fields.clientName);
    parts.push(`Client="${escapedClientName}"`, `Device="${escapedClientName}"`);
  }

  if (fields.deviceId) {
    parts.push(`DeviceId="${escapeAuthHeaderValue(fields.deviceId)}"`);
  }

  parts.push(`Version="${escapeAuthHeaderValue(fields.appVersion)}"`);

  if (fields.token) {
    parts.push(`Token="${escapeAuthHeaderValue(fields.token)}"`);
  }

  return `${authorizationScheme} ${parts.join(", ")}`;
}

function buildImageUrl(
  serverUrl: string,
  itemId: string,
  imageType: "Primary" | "Backdrop" | "Logo",
  tag?: string,
  apiBasePath = ""
): string {
  const url = new URL(
    buildApiUrl(serverUrl, `Items/${encodeURIComponent(itemId)}/Images/${imageType}`, apiBasePath)
  );

  if (tag) {
    url.searchParams.set("tag", tag);
  }

  url.searchParams.set("quality", "90");
  return url.toString();
}

function toRuntimeMs(runTimeTicks: number | undefined): number | undefined {
  if (typeof runTimeTicks !== "number" || !Number.isFinite(runTimeTicks) || runTimeTicks < 0) {
    return undefined;
  }

  return Math.trunc(runTimeTicks / 10_000);
}

export class JellyfinProviderError extends Error {
  readonly providerError: ProviderError;

  constructor(providerError: ProviderError) {
    super(providerError.message);
    this.name = "JellyfinProviderError";
    this.providerError = providerError;
  }
}

export class JellyfinMediaProvider implements MediaProvider {
  readonly id: string;

  readonly displayName: string;

  readonly capabilities = [
    "preflight",
    "username-password-auth",
    "session-restore",
    "library-selection",
    "media-browse",
    "image-resolution"
  ] as const;

  private readonly fetchImpl: FetchLike;

  private readonly appVersion: string;

  private readonly now: () => Date;

  private readonly apiBasePath: string;

  private readonly authorizationScheme: string;

  private readonly minSupportedMajorVersion: number;

  private readonly apiFlavor: ApiFlavor;

  constructor(options: JellyfinProviderOptions = {}) {
    if (!options.fetch && typeof globalThis.fetch !== "function") {
      throw new Error(`${options.displayName ?? "Media"} provider requires a fetch implementation`);
    }

    const fetchRef = options.fetch ?? globalThis.fetch;

    this.fetchImpl = fetchRef.bind(globalThis) as FetchLike;
    this.id = options.providerId ?? "jellyfin";
    this.displayName = options.displayName ?? "Jellyfin";
    this.appVersion = options.appVersion ?? "1.0.0";
    this.now = options.now ?? (() => new Date());
    this.apiBasePath = normalizeApiBasePath(options.apiBasePath);
    this.authorizationScheme = options.authorizationScheme ?? "MediaBrowser";
    this.minSupportedMajorVersion = options.minSupportedMajorVersion ?? 10;
    this.apiFlavor = options.apiFlavor ?? "jellyfin";
  }

  async preflight(request: ProviderPreflightRequest): Promise<ProviderPreflightResult> {
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const serverUrlCheck = checkServerUrl(request.serverUrl, this.displayName, request.origin);
    if (!serverUrlCheck.ok) {
      return { ok: false, error: serverUrlCheck.error };
    }

    const serverUrl = serverUrlCheck.serverUrl;
    const enforceCorsValidation = shouldValidateCors(serverUrl, request.origin);
    const startedAt = Date.now();
    const requestOptions: RequestOptions = {
      timeoutMs,
      fallbackMessage: `${this.displayName} preflight failed`,
      signal: request.signal
    };

    try {
      const publicInfoOutcome = await this.request<{ error: ProviderError } | { publicInfo: JsonRecord }>(
        buildApiUrl(serverUrl, "System/Info/Public", this.apiBasePath),
        {
          method: "GET",
          headers: this.makeJsonHeaders(request.origin)
        },
        requestOptions,
        async (response) => {
          if (!response.ok) {
            return {
              error: {
                category: response.status >= 500 ? "network" : "unknown",
                message: safeMessageFromStatus(
                  response.status,
                  `${this.displayName} preflight failed while checking server info`,
                  this.displayName
                ),
                statusCode: response.status,
                retriable: response.status >= 500
              }
            };
          }

          const corsError = enforceCorsValidation ? this.validateCors(response, request.origin) : null;
          if (corsError) {
            return { error: corsError };
          }

          return { publicInfo: await this.readJsonObject(response) };
        }
      );

      if ("error" in publicInfoOutcome) {
        return { ok: false, error: publicInfoOutcome.error };
      }

      const publicInfo = publicInfoOutcome.publicInfo;
      const version = readString(publicInfo, "Version");
      const detectedProduct = detectServerProduct(publicInfo);

      if (detectedProduct && detectedProduct !== this.id) {
        const expectedProviderName = this.displayName;
        const detectedProviderName = detectedProduct === "jellyfin" ? "Jellyfin" : "Emby";

        return {
          ok: false,
          error: {
            category: "unknown",
            message: `${expectedProviderName} sign-in is not available for detected ${detectedProviderName} servers`,
            retriable: false
          }
        };
      }

      if (!version) {
        return {
          ok: false,
          error: {
            category: "version",
            message: `${this.displayName} preflight could not determine server version`,
            retriable: false
          }
        };
      }

      const majorVersion = parseMajorVersion(version);
      if (majorVersion === null || majorVersion < this.minSupportedMajorVersion) {
        return {
          ok: false,
          error: {
            category: "version",
            message: `${this.displayName} server version is not supported`,
            retriable: false
          }
        };
      }

      const authCheckResponse = await this.request(
        buildApiUrl(serverUrl, "Users/AuthenticateByName", this.apiBasePath),
        {
          method: "POST",
          headers: this.makeJsonHeaders(request.origin),
          body: JSON.stringify({ Username: "", Pw: "" })
        },
        requestOptions,
        async (response) => response
      );

      const authCorsError = enforceCorsValidation ? this.validateCors(authCheckResponse, request.origin) : null;
      if (authCorsError) {
        return { ok: false, error: authCorsError };
      }

      if (authCheckResponse.status === 404) {
        return {
          ok: false,
          error: {
            category: "version",
            message: `${this.displayName} authentication endpoint is unavailable`,
            statusCode: authCheckResponse.status,
            retriable: false
          }
        };
      }

      if (!AUTH_FAILURE_STATUS.has(authCheckResponse.status) && !authCheckResponse.ok) {
        return {
          ok: false,
          error: {
            category: authCheckResponse.status >= 500 ? "network" : "unknown",
            message: safeMessageFromStatus(
              authCheckResponse.status,
              `${this.displayName} preflight failed while checking authentication endpoint`,
              this.displayName
            ),
            statusCode: authCheckResponse.status,
            retriable: authCheckResponse.status >= 500
          }
        };
      }

      return {
        ok: true,
        serverVersion: version,
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      return {
        ok: false,
        error: toProviderError(error, `${this.displayName} preflight failed`, this.displayName)
      };
    }
  }

  async authenticate(credentials: AuthCredentials): Promise<ProviderSession> {
    const serverUrl = requireServerUrl(credentials.serverUrl, this.displayName);

    const payload = await this.request(
      buildApiUrl(serverUrl, "Users/AuthenticateByName", this.apiBasePath),
      {
        method: "POST",
        headers: {
          ...this.makeJsonHeaders(),
          Authorization: makeAuthHeader(this.authorizationScheme, {
            clientName: credentials.clientName,
            deviceId: credentials.deviceId,
            appVersion: this.appVersion
          })
        },
        body: JSON.stringify({
          Username: credentials.username,
          Pw: credentials.password
        })
      },
      {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        fallbackMessage: `${this.displayName} authentication request failed`
      },
      async (response) => {
        if (response.status === 401 || response.status === 403) {
          throw new JellyfinProviderError({
            category: "auth",
            message: `Invalid ${this.displayName} username or password`,
            statusCode: response.status,
            retriable: false
          });
        }

        if (!response.ok) {
          throw new JellyfinProviderError({
            category: response.status >= 500 ? "network" : "unknown",
            message: safeMessageFromStatus(
              response.status,
              `${this.displayName} authentication failed`,
              this.displayName
            ),
            statusCode: response.status,
            retriable: response.status >= 500
          });
        }

        return this.readJsonObject(response);
      }
    );

    const accessToken = readString(payload, "AccessToken");
    const userId = isRecord(payload.User) ? readString(payload.User, "Id") : undefined;

    if (!accessToken || !userId) {
      throw new JellyfinProviderError({
        category: "auth",
        message: `${this.displayName} authentication response is missing session data`,
        retriable: false
      });
    }

    return {
      providerId: this.id,
      serverUrl,
      userId,
      username: credentials.username,
      accessToken,
      createdAt: this.now().toISOString(),
      clientName: credentials.clientName,
      deviceId: credentials.deviceId
    };
  }

  async restoreSession(snapshot: SessionSnapshot): Promise<ProviderSession | null> {
    if (snapshot.providerId !== this.id) {
      return null;
    }

    const serverUrl = requireServerUrl(snapshot.serverUrl, this.displayName);
    const currentUserPath = this.apiFlavor === "emby"
      ? `Users/${encodeURIComponent(snapshot.userId)}`
      : "Users/Me";

    const payload = await this.request(
      buildApiUrl(serverUrl, currentUserPath, this.apiBasePath),
      {
        method: "GET",
        headers: this.makeSessionHeaders(snapshot)
      },
      {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        fallbackMessage: `${this.displayName} session restore failed`
      },
      async (response) => {
        if (response.status === 401 || response.status === 403) {
          return null;
        }

        if (!response.ok) {
          throw new JellyfinProviderError({
            category: response.status >= 500 ? "network" : "unknown",
            message: safeMessageFromStatus(
              response.status,
              `${this.displayName} session restore failed`,
              this.displayName
            ),
            statusCode: response.status,
            retriable: response.status >= 500
          });
        }

        return this.readJsonObject(response);
      }
    );

    if (!payload) {
      return null;
    }

    return {
      ...snapshot,
      serverUrl,
      userId: readString(payload, "Id") ?? snapshot.userId,
      username: readString(payload, "Name") ?? snapshot.username
    };
  }

  async invalidateSession(session: ProviderSession): Promise<void> {
    if (session.providerId !== this.id) {
      return;
    }

    const serverUrl = requireServerUrl(session.serverUrl, this.displayName);

    await this.request(
      buildApiUrl(serverUrl, "Sessions/Logout", this.apiBasePath),
      {
        method: "POST",
        headers: this.makeSessionHeaders(session)
      },
      {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        fallbackMessage: `${this.displayName} session invalidation failed`
      },
      async (response) => {
        // Logout answers 204 with an empty body; 401/403 means the token is already invalid.
        if (response.status === 401 || response.status === 403 || response.ok) {
          return;
        }

        throw new JellyfinProviderError({
          category: response.status >= 500 ? "network" : "unknown",
          message: safeMessageFromStatus(
            response.status,
            `${this.displayName} session invalidation failed`,
            this.displayName
          ),
          statusCode: response.status,
          retriable: response.status >= 500
        });
      }
    );
  }

  async listLibraries(session: ProviderSession, options: ProviderRequestOptions = {}): Promise<MediaLibrary[]> {
    const serverUrl = requireServerUrl(session.serverUrl, this.displayName);

    const { response, payload } = await this.request(
      buildApiUrl(serverUrl, `Users/${encodeURIComponent(session.userId)}/Views`, this.apiBasePath),
      {
        method: "GET",
        headers: this.makeSessionHeaders(session)
      },
      {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        fallbackMessage: `Failed to list ${this.displayName} libraries`,
        signal: options.signal
      },
      async (response) => {
        if (response.status === 401 || response.status === 403) {
          throw new JellyfinProviderError({
            category: "auth",
            message: `${this.displayName} session is not authorized to list libraries`,
            statusCode: response.status,
            retriable: false
          });
        }

        if (!response.ok) {
          throw new JellyfinProviderError({
            category: response.status >= 500 ? "network" : "unknown",
            message: safeMessageFromStatus(
              response.status,
              `Failed to list ${this.displayName} libraries`,
              this.displayName
            ),
            statusCode: response.status,
            retriable: response.status >= 500
          });
        }

        return { response, payload: await this.readJsonObject(response) };
      }
    );

    const libraries: MediaLibrary[] = [];

    for (const library of this.readItems(payload, response.status)) {
      if (!isRecord(library)) {
        continue;
      }

      const id = readString(library, "Id");
      const name = readString(library, "Name");

      if (id !== undefined && name !== undefined) {
        libraries.push({
          id,
          name,
          kind: toLibraryKind(readString(library, "CollectionType"))
        });
      }
    }

    return libraries;
  }

  async listMedia(session: ProviderSession, query: MediaQuery): Promise<MediaPage> {
    const serverUrl = requireServerUrl(session.serverUrl, this.displayName);
    const startIndex = this.parseCursor(query.cursor);
    const limit = query.limit && query.limit > 0 ? query.limit : DEFAULT_PAGE_LIMIT;
    const items: MediaItem[] = [];
    let hasMore = false;

    for (const libraryId of query.libraryIds) {
      const url = new URL(
        buildApiUrl(serverUrl, `Users/${encodeURIComponent(session.userId)}/Items`, this.apiBasePath)
      );

      url.searchParams.set("ParentId", libraryId);
      url.searchParams.set("Recursive", "true");
      url.searchParams.set("Limit", String(limit));
      url.searchParams.set("StartIndex", String(startIndex));
      url.searchParams.set("IncludeItemTypes", ROOT_LIBRARY_ITEM_TYPES);
      url.searchParams.set("Fields", "SortName,OriginalTitle,Overview,Genres,Tags,People,ProductionYear,RunTimeTicks,CommunityRating,CriticRating,DateCreated,DateLastMediaAdded,PremiereDate,ImageTags,BackdropImageTags");
      url.searchParams.set("EnableImages", "true");
      url.searchParams.set("SortBy", "DateCreated");
      url.searchParams.set("SortOrder", "Descending");
      url.searchParams.set("EnableImageTypes", "Primary,Backdrop,Logo");
      url.searchParams.set("ImageTypeLimit", "1");

      if (query.updatedSince) {
        url.searchParams.set("MinDateLastSavedForUser", query.updatedSince);
      }

      const { response, payload } = await this.request(
        url.toString(),
        {
          method: "GET",
          headers: this.makeSessionHeaders(session)
        },
        {
          timeoutMs: DEFAULT_TIMEOUT_MS,
          fallbackMessage: `Failed to list ${this.displayName} media`,
          signal: query.signal
        },
        async (response) => {
          if (response.status === 401 || response.status === 403) {
            throw new JellyfinProviderError({
              category: "auth",
              message: `${this.displayName} session is not authorized to list media`,
              statusCode: response.status,
              retriable: false
            });
          }

          if (!response.ok) {
            throw new JellyfinProviderError({
              category: response.status >= 500 ? "network" : "unknown",
              message: safeMessageFromStatus(
                response.status,
                `Failed to list ${this.displayName} media`,
                this.displayName
              ),
              statusCode: response.status,
              retriable: response.status >= 500
            });
          }

          return { response, payload: await this.readJsonObject(response) };
        }
      );

      const sourceItems = this.readItems(payload, response.status);

      for (const sourceItem of sourceItems) {
        const mapped = this.mapItem(sourceItem, serverUrl, libraryId);
        if (mapped) {
          items.push(mapped);
        }
      }

      const totalRecordCount = readFiniteNumber(payload, "TotalRecordCount");
      if (totalRecordCount !== undefined && totalRecordCount > startIndex + sourceItems.length) {
        hasMore = true;
      }
    }

    return {
      items,
      fetchedAt: this.now().toISOString(),
      ...(hasMore ? { nextCursor: String(startIndex + limit) } : {})
    };
  }

  toVisualItems(items: readonly MediaItem[]): VisualItem[] {
    return items.map((item) => {
      const visualItem: VisualItem = {
        id: `visual-${item.id}`,
        mediaId: item.id,
        title: item.title,
        posterUrl: item.poster.url,
        subtitle: item.year ? String(item.year) : item.kind
      };

      if (item.backdrop?.url) {
        visualItem.backdropUrl = item.backdrop.url;
      }

      if (item.poster.dominantColor) {
        visualItem.accentColor = item.poster.dominantColor;
      }

      if (item.genres[0]) {
        visualItem.primaryMeta = item.genres[0];
      }

      if (typeof item.communityRating === "number") {
        visualItem.secondaryMeta = item.communityRating.toFixed(1);
      }

      return visualItem;
    });
  }

  /**
   * Returns the raw `Items` entries. A missing or non-array `Items` is a malformed response (typed
   * error); individual malformed entries are kept in the count (for pagination) but are not records,
   * so callers skip them.
   */
  private readItems(payload: JsonRecord, statusCode: number): unknown[] {
    const items = payload.Items;
    if (!Array.isArray(items)) {
      throw unexpectedResponseError(this.displayName, statusCode, "a response without an Items list");
    }

    return items;
  }

  private mapItem(item: unknown, serverUrl: string, libraryId: string): MediaItem | null {
    if (!isRecord(item)) {
      return null;
    }

    const id = readString(item, "Id");
    const name = readString(item, "Name");
    if (!id || !name) {
      return null;
    }

    const type = readString(item, "Type");
    if (type === "Season" || type === "Episode") {
      return null;
    }

    const imageTags = isRecord(item.ImageTags) ? item.ImageTags : {};
    const primaryTag = readString(imageTags, "Primary");
    if (!primaryTag) {
      return null;
    }

    const poster: ArtworkImage = {
      url: buildImageUrl(serverUrl, id, "Primary", primaryTag, this.apiBasePath)
    };

    const backdropTag = readStringArray(item, "BackdropImageTags")[0];
    const logoTag = readString(imageTags, "Logo");
    const people = Array.isArray(item.People) ? item.People : [];

    const mediaItem: MediaItem = {
      id,
      providerId: this.id,
      libraryId,
      kind: toMediaKind(type),
      title: name,
      genres: readStringArray(item, "Genres"),
      tags: readStringArray(item, "Tags"),
      people: people
        .map((person) => (isRecord(person) ? readString(person, "Name") : undefined))
        .filter((personName): personName is string => typeof personName === "string"),
      poster
    };

    const sortName = readString(item, "SortName");
    if (sortName) {
      mediaItem.sortTitle = sortName;
    }

    const originalTitle = readString(item, "OriginalTitle");
    if (originalTitle) {
      mediaItem.originalTitle = originalTitle;
    }

    const overview = readString(item, "Overview");
    if (overview) {
      mediaItem.overview = overview;
    }

    const productionYear = readFiniteNumber(item, "ProductionYear");
    if (typeof productionYear === "number") {
      mediaItem.year = productionYear;
    }

    const runtimeMs = toRuntimeMs(readFiniteNumber(item, "RunTimeTicks"));
    if (typeof runtimeMs === "number") {
      mediaItem.runtimeMs = runtimeMs;
    }

    const communityRating = readFiniteNumber(item, "CommunityRating");
    if (typeof communityRating === "number") {
      mediaItem.communityRating = communityRating;
    }

    const criticRating = readFiniteNumber(item, "CriticRating");
    if (typeof criticRating === "number") {
      mediaItem.criticRating = criticRating;
    }

    if (backdropTag) {
      mediaItem.backdrop = {
        url: buildImageUrl(serverUrl, id, "Backdrop", backdropTag, this.apiBasePath)
      };
    }

    if (logoTag) {
      mediaItem.logo = { url: buildImageUrl(serverUrl, id, "Logo", logoTag, this.apiBasePath) };
    }

    const dateCreated = readString(item, "DateCreated");
    if (dateCreated) {
      mediaItem.dateAdded = dateCreated;
    }

    const dateLastMediaAdded = readString(item, "DateLastMediaAdded");
    if (dateLastMediaAdded) {
      mediaItem.dateUpdated = dateLastMediaAdded;
    }

    const premiereDate = readString(item, "PremiereDate");
    if (premiereDate) {
      mediaItem.premiereDate = premiereDate;
    }

    return mediaItem;
  }

  private makeJsonHeaders(origin?: string): HeadersInit {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin } : {})
    };
  }

  private makeSessionHeaders(session: SessionSnapshot): HeadersInit {
    if (this.apiFlavor === "emby") {
      return {
        Accept: "application/json",
        "X-Emby-Token": session.accessToken
      };
    }

    return {
      Accept: "application/json",
      Authorization: makeAuthHeader(this.authorizationScheme, {
        clientName: session.clientName,
        deviceId: session.deviceId,
        appVersion: this.appVersion,
        token: session.accessToken
      })
    };
  }

  /**
   * Runs one request; the timeout and the caller's abort signal cover the fetch *and* everything
   * `handle` does with the response (status checks, reading and parsing the body). Every failure
   * leaves as a `JellyfinProviderError`.
   */
  private async request<T>(
    url: string,
    init: RequestInit,
    options: RequestOptions,
    handle: (response: Response) => Promise<T>
  ): Promise<T> {
    const controller = new AbortController();
    const callerSignal = options.signal;
    let timedOut = false;

    const onCallerAbort = (): void => {
      controller.abort();
    };

    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);

    if (callerSignal?.aborted) {
      controller.abort();
    } else {
      callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
    }

    try {
      if (controller.signal.aborted) {
        throw new JellyfinProviderError(cancelledError(this.displayName));
      }

      const response = await this.fetchImpl(url, {
        ...init,
        signal: controller.signal
      });

      return await handle(response);
    } catch (error) {
      if (timedOut) {
        throw new JellyfinProviderError(timeoutError(this.displayName));
      }

      if (callerSignal?.aborted) {
        throw new JellyfinProviderError(cancelledError(this.displayName));
      }

      if (error instanceof JellyfinProviderError) {
        throw error;
      }

      throw new JellyfinProviderError(toProviderError(error, options.fallbackMessage, this.displayName));
    } finally {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  }

  /**
   * Reads a 2xx JSON object body. Non-JSON content, unparsable JSON and non-object JSON are typed,
   * retriable errors instead of an empty result. Messages never include the body.
   */
  private async readJsonObject(response: Response): Promise<JsonRecord> {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw unexpectedResponseError(this.displayName, response.status, "a non-JSON response");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw unexpectedResponseError(this.displayName, response.status, "an invalid JSON response");
      }

      throw error;
    }

    if (!isRecord(payload)) {
      throw unexpectedResponseError(this.displayName, response.status, "an unexpected JSON response");
    }

    return payload;
  }

  private parseCursor(cursor: string | undefined): number {
    if (!cursor) {
      return 0;
    }

    const value = Number.parseInt(cursor, 10);
    if (Number.isNaN(value) || value < 0) {
      return 0;
    }

    return value;
  }

  private validateCors(response: Response, origin: string | undefined): ProviderError | null {
    if (!origin) {
      return null;
    }

    if (response.type === "cors") {
      return null;
    }

    const allowOrigin = response.headers.get("access-control-allow-origin");
    if (!allowOrigin || (allowOrigin !== "*" && allowOrigin !== origin)) {
      return {
        category: "cors",
        message: `${this.displayName} server CORS policy does not allow this origin`,
        statusCode: response.status,
        retriable: false
      };
    }

    return null;
  }
}

export function createJellyfinMediaProvider(options?: JellyfinProviderOptions): JellyfinMediaProvider {
  return new JellyfinMediaProvider(options);
}

export class EmbyMediaProvider extends JellyfinMediaProvider {
  constructor(options: EmbyProviderOptions = {}) {
    super({
      ...options,
      providerId: "emby",
      displayName: "Emby",
      apiBasePath: "/emby",
      authorizationScheme: "Emby",
      minSupportedMajorVersion: 4,
      apiFlavor: "emby"
    });
  }
}

export function createEmbyMediaProvider(options?: EmbyProviderOptions): EmbyMediaProvider {
  return new EmbyMediaProvider(options);
}
