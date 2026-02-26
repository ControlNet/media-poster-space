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
  ProviderPreflightResult
} from "../../provider/media-provider";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_PAGE_LIMIT = 100;
const ROOT_LIBRARY_ITEM_TYPES = "Movie,Series,BoxSet,MusicVideo";

const AUTH_FAILURE_STATUS = new Set([400, 401, 403, 415]);

interface JellyfinProviderOptions {
  fetch?: FetchLike;
  appVersion?: string;
  now?: () => Date;
}

interface JellyfinPublicSystemInfo {
  Version?: string;
}

interface JellyfinUser {
  Id?: string;
  Name?: string;
}

interface JellyfinAuthResponse {
  AccessToken?: string;
  User?: JellyfinUser;
}

interface JellyfinLibraryView {
  Id?: string;
  Name?: string;
  CollectionType?: string;
}

interface JellyfinViewsResponse {
  Items?: JellyfinLibraryView[];
}

interface JellyfinPerson {
  Name?: string;
}

interface JellyfinBaseItem {
  Id?: string;
  Name?: string;
  Type?: string;
  SortName?: string;
  OriginalTitle?: string;
  Overview?: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  CommunityRating?: number;
  CriticRating?: number;
  Genres?: string[];
  Tags?: string[];
  People?: JellyfinPerson[];
  DateCreated?: string;
  DateLastMediaAdded?: string;
  PremiereDate?: string;
  ImageTags?: Record<string, string | undefined>;
  BackdropImageTags?: string[];
}

interface JellyfinItemsResponse {
  Items?: JellyfinBaseItem[];
  TotalRecordCount?: number;
}

type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.trim().replace(/\/+$/, "");
}

function shouldValidateCors(serverUrl: string, origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }

  try {
    return new URL(serverUrl).origin !== origin;
  } catch {
    return true;
  }
}

function safeMessageFromStatus(status: number, fallback: string): string {
  if (status === 401 || status === 403) {
    return "Authentication was rejected by Jellyfin";
  }

  if (status >= 500) {
    return "Jellyfin server is temporarily unavailable";
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMajorVersion(version: string): number | null {
  const [majorSegment] = version.split(".");
  if (!majorSegment) {
    return null;
  }

  const major = Number.parseInt(majorSegment, 10);
  return Number.isNaN(major) ? null : major;
}

function toProviderError(error: unknown, fallbackMessage: string): ProviderError {
  if (error instanceof JellyfinProviderError) {
    return error.providerError;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      category: "network",
      message: "Jellyfin request timed out",
      retriable: true
    };
  }

  if (error instanceof TypeError) {
    return {
      category: "network",
      message: "Could not reach Jellyfin server",
      retriable: true
    };
  }

  return {
    category: "unknown",
    message: fallbackMessage,
    retriable: false
  };
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

function makeAuthHeader(clientName: string, deviceId: string, appVersion: string): string {
  const escapedClientName = clientName.replaceAll('"', "\\\"");
  const escapedDeviceId = deviceId.replaceAll('"', "\\\"");

  return `MediaBrowser Client="${escapedClientName}", Device="${escapedClientName}", DeviceId="${escapedDeviceId}", Version="${appVersion}"`;
}

function buildImageUrl(
  serverUrl: string,
  itemId: string,
  imageType: "Primary" | "Backdrop" | "Logo",
  tag?: string
): string {
  const url = new URL(
    `/Items/${encodeURIComponent(itemId)}/Images/${imageType}`,
    `${normalizeServerUrl(serverUrl)}/`
  );

  if (tag) {
    url.searchParams.set("tag", tag);
  }

  url.searchParams.set("quality", "90");
  return url.toString();
}

function readJsonValue<T>(value: unknown, fallback: T): T {
  return isRecord(value) ? (value as T) : fallback;
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
  readonly id = "jellyfin";

  readonly displayName = "Jellyfin";

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

  constructor(options: JellyfinProviderOptions = {}) {
    if (!options.fetch && typeof globalThis.fetch !== "function") {
      throw new Error("Jellyfin provider requires a fetch implementation");
    }

    const fetchRef = options.fetch ?? globalThis.fetch;

    this.fetchImpl = fetchRef.bind(globalThis) as FetchLike;
    this.appVersion = options.appVersion ?? "1.0.0";
    this.now = options.now ?? (() => new Date());
  }

  async preflight(request: ProviderPreflightRequest): Promise<ProviderPreflightResult> {
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const serverUrl = normalizeServerUrl(request.serverUrl);
    const enforceCorsValidation = shouldValidateCors(serverUrl, request.origin);
    const startedAt = Date.now();

    try {
      const publicInfoResponse = await this.fetchWithTimeout(
        `${serverUrl}/System/Info/Public`,
        {
          method: "GET",
          headers: this.makeJsonHeaders(request.origin)
        },
        timeoutMs
      );

      if (!publicInfoResponse.ok) {
        return {
          ok: false,
          error: {
            category: publicInfoResponse.status >= 500 ? "network" : "unknown",
            message: safeMessageFromStatus(
              publicInfoResponse.status,
              "Jellyfin preflight failed while checking server info"
            ),
            statusCode: publicInfoResponse.status,
            retriable: publicInfoResponse.status >= 500
          }
        };
      }

      const corsError = enforceCorsValidation ? this.validateCors(publicInfoResponse, request.origin) : null;
      if (corsError) {
        return { ok: false, error: corsError };
      }

      const publicInfo = readJsonValue<JellyfinPublicSystemInfo>(await this.readJsonSafely(publicInfoResponse), {});
      const version = typeof publicInfo.Version === "string" ? publicInfo.Version : undefined;

      if (!version) {
        return {
          ok: false,
          error: {
            category: "version",
            message: "Jellyfin preflight could not determine server version",
            retriable: false
          }
        };
      }

      const majorVersion = parseMajorVersion(version);
      if (majorVersion === null || majorVersion < 10) {
        return {
          ok: false,
          error: {
            category: "version",
            message: "Jellyfin server version is not supported",
            retriable: false
          }
        };
      }

      const authCheckResponse = await this.fetchWithTimeout(
        `${serverUrl}/Users/AuthenticateByName`,
        {
          method: "POST",
          headers: this.makeJsonHeaders(request.origin),
          body: JSON.stringify({ Username: "", Pw: "" })
        },
        timeoutMs
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
            message: "Jellyfin authentication endpoint is unavailable",
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
              "Jellyfin preflight failed while checking authentication endpoint"
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
        error: toProviderError(error, "Jellyfin preflight failed")
      };
    }
  }

  async authenticate(credentials: AuthCredentials): Promise<ProviderSession> {
    const serverUrl = normalizeServerUrl(credentials.serverUrl);

    let response: Response;

    try {
      response = await this.fetchWithTimeout(
        `${serverUrl}/Users/AuthenticateByName`,
        {
          method: "POST",
          headers: {
            ...this.makeJsonHeaders(),
            Authorization: makeAuthHeader(
              credentials.clientName,
              credentials.deviceId,
              this.appVersion
            )
          },
          body: JSON.stringify({
            Username: credentials.username,
            Pw: credentials.password
          })
        },
        DEFAULT_TIMEOUT_MS
      );
    } catch (error) {
      throw new JellyfinProviderError(toProviderError(error, "Jellyfin authentication request failed"));
    }

    if (response.status === 401 || response.status === 403) {
      throw new JellyfinProviderError({
        category: "auth",
        message: "Invalid Jellyfin username or password",
        statusCode: response.status,
        retriable: false
      });
    }

    if (!response.ok) {
      throw new JellyfinProviderError({
        category: response.status >= 500 ? "network" : "unknown",
        message: safeMessageFromStatus(response.status, "Jellyfin authentication failed"),
        statusCode: response.status,
        retriable: response.status >= 500
      });
    }

    const payload = readJsonValue<JellyfinAuthResponse>(await this.readJsonSafely(response), {});
    const accessToken = typeof payload.AccessToken === "string" ? payload.AccessToken : undefined;
    const userId = typeof payload.User?.Id === "string" ? payload.User.Id : undefined;

    if (!accessToken || !userId) {
      throw new JellyfinProviderError({
        category: "auth",
        message: "Jellyfin authentication response is missing session data",
        retriable: false
      });
    }

    return {
      providerId: this.id,
      serverUrl,
      userId,
      username: credentials.username,
      accessToken,
      createdAt: this.now().toISOString()
    };
  }

  async restoreSession(snapshot: SessionSnapshot): Promise<ProviderSession | null> {
    if (snapshot.providerId !== this.id) {
      return null;
    }

    const serverUrl = normalizeServerUrl(snapshot.serverUrl);

    let response: Response;

    try {
      response = await this.fetchWithTimeout(
        `${serverUrl}/Users/Me`,
        {
          method: "GET",
          headers: this.makeSessionHeaders(snapshot.accessToken)
        },
        DEFAULT_TIMEOUT_MS
      );
    } catch (error) {
      throw new JellyfinProviderError(toProviderError(error, "Jellyfin session restore failed"));
    }

    if (response.status === 401 || response.status === 403) {
      return null;
    }

    if (!response.ok) {
      throw new JellyfinProviderError({
        category: response.status >= 500 ? "network" : "unknown",
        message: safeMessageFromStatus(response.status, "Jellyfin session restore failed"),
        statusCode: response.status,
        retriable: response.status >= 500
      });
    }

    const payload = readJsonValue<JellyfinUser>(await this.readJsonSafely(response), {});

    return {
      ...snapshot,
      serverUrl,
      userId: typeof payload.Id === "string" ? payload.Id : snapshot.userId,
      username: typeof payload.Name === "string" ? payload.Name : snapshot.username
    };
  }

  async invalidateSession(session: ProviderSession): Promise<void> {
    if (session.providerId !== this.id) {
      return;
    }

    const serverUrl = normalizeServerUrl(session.serverUrl);

    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${serverUrl}/Sessions/Logout`,
        {
          method: "POST",
          headers: this.makeSessionHeaders(session.accessToken)
        },
        DEFAULT_TIMEOUT_MS
      );
    } catch (error) {
      throw new JellyfinProviderError(toProviderError(error, "Jellyfin session invalidation failed"));
    }

    if (response.status === 401 || response.status === 403 || response.ok) {
      return;
    }

    throw new JellyfinProviderError({
      category: response.status >= 500 ? "network" : "unknown",
      message: safeMessageFromStatus(response.status, "Jellyfin session invalidation failed"),
      statusCode: response.status,
      retriable: response.status >= 500
    });
  }

  async listLibraries(session: ProviderSession): Promise<MediaLibrary[]> {
    const serverUrl = normalizeServerUrl(session.serverUrl);

    const response = await this.fetchWithTimeout(
      `${serverUrl}/Users/${encodeURIComponent(session.userId)}/Views`,
      {
        method: "GET",
        headers: this.makeSessionHeaders(session.accessToken)
      },
      DEFAULT_TIMEOUT_MS
    );

    if (response.status === 401 || response.status === 403) {
      throw new JellyfinProviderError({
        category: "auth",
        message: "Jellyfin session is not authorized to list libraries",
        statusCode: response.status,
        retriable: false
      });
    }

    if (!response.ok) {
      throw new JellyfinProviderError({
        category: response.status >= 500 ? "network" : "unknown",
        message: safeMessageFromStatus(response.status, "Failed to list Jellyfin libraries"),
        statusCode: response.status,
        retriable: response.status >= 500
      });
    }

    const payload = readJsonValue<JellyfinViewsResponse>(await this.readJsonSafely(response), {});

    return (payload.Items ?? [])
      .filter((library): library is Required<Pick<JellyfinLibraryView, "Id" | "Name">> & JellyfinLibraryView => {
        return typeof library.Id === "string" && typeof library.Name === "string";
      })
      .map((library) => ({
        id: library.Id,
        name: library.Name,
        kind: toLibraryKind(library.CollectionType)
      }));
  }

  async listMedia(session: ProviderSession, query: MediaQuery): Promise<MediaPage> {
    const serverUrl = normalizeServerUrl(session.serverUrl);
    const startIndex = this.parseCursor(query.cursor);
    const limit = query.limit && query.limit > 0 ? query.limit : DEFAULT_PAGE_LIMIT;
    const items: MediaItem[] = [];
    let hasMore = false;

    for (const libraryId of query.libraryIds) {
      const url = new URL(
        `/Users/${encodeURIComponent(session.userId)}/Items`,
        `${serverUrl}/`
      );

      url.searchParams.set("ParentId", libraryId);
      url.searchParams.set("Recursive", "true");
      url.searchParams.set("Limit", String(limit));
      url.searchParams.set("StartIndex", String(startIndex));
      url.searchParams.set("IncludeItemTypes", ROOT_LIBRARY_ITEM_TYPES);
      url.searchParams.set("Fields", "SortName,OriginalTitle,Overview,Genres,Tags,People,ProductionYear,RunTimeTicks,CommunityRating,CriticRating,DateCreated,DateLastMediaAdded,PremiereDate,ImageTags,BackdropImageTags");
      url.searchParams.set("SortBy", "DateCreated");
      url.searchParams.set("SortOrder", "Descending");
      url.searchParams.set("EnableImageTypes", "Primary,Backdrop,Logo");
      url.searchParams.set("ImageTypeLimit", "1");

      if (query.updatedSince) {
        url.searchParams.set("MinDateLastSavedForUser", query.updatedSince);
      }

      const response = await this.fetchWithTimeout(
        url.toString(),
        {
          method: "GET",
          headers: this.makeSessionHeaders(session.accessToken)
        },
        DEFAULT_TIMEOUT_MS
      );

      if (response.status === 401 || response.status === 403) {
        throw new JellyfinProviderError({
          category: "auth",
          message: "Jellyfin session is not authorized to list media",
          statusCode: response.status,
          retriable: false
        });
      }

      if (!response.ok) {
        throw new JellyfinProviderError({
          category: response.status >= 500 ? "network" : "unknown",
          message: safeMessageFromStatus(response.status, "Failed to list Jellyfin media"),
          statusCode: response.status,
          retriable: response.status >= 500
        });
      }

      const payload = readJsonValue<JellyfinItemsResponse>(await this.readJsonSafely(response), {});
      const sourceItems = payload.Items ?? [];

      for (const sourceItem of sourceItems) {
        const mapped = this.mapItem(sourceItem, serverUrl, libraryId);
        if (mapped) {
          items.push(mapped);
        }
      }

      if (
        typeof payload.TotalRecordCount === "number" &&
        payload.TotalRecordCount > startIndex + sourceItems.length
      ) {
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

  private mapItem(item: JellyfinBaseItem, serverUrl: string, libraryId: string): MediaItem | null {
    if (!item.Id || !item.Name) {
      return null;
    }

    if (item.Type === "Season" || item.Type === "Episode") {
      return null;
    }

    const imageTags = item.ImageTags ?? {};
    const primaryTag = imageTags.Primary;
    if (!primaryTag) {
      return null;
    }

    const poster: ArtworkImage = {
      url: buildImageUrl(serverUrl, item.Id, "Primary", primaryTag)
    };

    const backdropTag = item.BackdropImageTags?.[0];
    const logoTag = imageTags.Logo;

    const mediaItem: MediaItem = {
      id: item.Id,
      providerId: this.id,
      libraryId,
      kind: toMediaKind(item.Type),
      title: item.Name,
      genres: Array.isArray(item.Genres) ? item.Genres : [],
      tags: Array.isArray(item.Tags) ? item.Tags : [],
      people: Array.isArray(item.People)
        ? item.People
            .map((person) => person.Name)
            .filter((name): name is string => typeof name === "string")
        : [],
      poster
    };

    if (item.SortName) {
      mediaItem.sortTitle = item.SortName;
    }

    if (item.OriginalTitle) {
      mediaItem.originalTitle = item.OriginalTitle;
    }

    if (item.Overview) {
      mediaItem.overview = item.Overview;
    }

    if (typeof item.ProductionYear === "number") {
      mediaItem.year = item.ProductionYear;
    }

    const runtimeMs = toRuntimeMs(item.RunTimeTicks);
    if (typeof runtimeMs === "number") {
      mediaItem.runtimeMs = runtimeMs;
    }

    if (typeof item.CommunityRating === "number") {
      mediaItem.communityRating = item.CommunityRating;
    }

    if (typeof item.CriticRating === "number") {
      mediaItem.criticRating = item.CriticRating;
    }

    if (backdropTag) {
      mediaItem.backdrop = { url: buildImageUrl(serverUrl, item.Id, "Backdrop", backdropTag) };
    }

    if (logoTag) {
      mediaItem.logo = { url: buildImageUrl(serverUrl, item.Id, "Logo", logoTag) };
    }

    if (item.DateCreated) {
      mediaItem.dateAdded = item.DateCreated;
    }

    if (item.DateLastMediaAdded) {
      mediaItem.dateUpdated = item.DateLastMediaAdded;
    }

    if (item.PremiereDate) {
      mediaItem.premiereDate = item.PremiereDate;
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

  private makeSessionHeaders(accessToken: string): HeadersInit {
    return {
      Accept: "application/json",
      "X-Emby-Token": accessToken
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async readJsonSafely(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return {};
    }

    try {
      return await response.json();
    } catch {
      return {};
    }
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
        message: "Jellyfin server CORS policy does not allow this origin",
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
