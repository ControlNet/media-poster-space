import type { ProviderSession } from "../types/auth";
import type { ArtworkImage, MediaItem, MediaKind, VisualItem } from "../types/media";
import type { ProviderCapability } from "../types/provider";

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      errors: ValidationIssue[];
    };

const MEDIA_KIND_VALUES: readonly MediaKind[] = [
  "movie",
  "series",
  "season",
  "episode",
  "collection",
  "music-video",
  "other"
];

const PROVIDER_CAPABILITY_VALUES: readonly ProviderCapability[] = [
  "preflight",
  "username-password-auth",
  "session-restore",
  "library-selection",
  "media-browse",
  "image-resolution"
];

const ARTWORK_KEYS = ["url", "width", "height", "dominantColor"] as const;
const MEDIA_ITEM_KEYS = [
  "id",
  "providerId",
  "libraryId",
  "kind",
  "title",
  "sortTitle",
  "originalTitle",
  "overview",
  "year",
  "runtimeMs",
  "communityRating",
  "criticRating",
  "genres",
  "tags",
  "people",
  "poster",
  "backdrop",
  "logo",
  "dateAdded",
  "dateUpdated",
  "premiereDate"
] as const;

const VISUAL_ITEM_KEYS = [
  "id",
  "mediaId",
  "title",
  "subtitle",
  "posterUrl",
  "backdropUrl",
  "accentColor",
  "primaryMeta",
  "secondaryMeta"
] as const;

const PROVIDER_SESSION_KEYS = [
  "providerId",
  "serverUrl",
  "userId",
  "username",
  "accessToken",
  "createdAt",
  "expiresAt",
  "refreshToken"
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function ensureKnownKeys(
  input: Record<string, unknown>,
  path: string,
  allowedKeys: readonly string[],
  issues: ValidationIssue[]
): void {
  for (const key of Object.keys(input)) {
    if (!allowedKeys.includes(key)) {
      addIssue(issues, `${path}.${key}`, "Unknown field is not part of the public contract");
    }
  }
}

function readRequiredString(
  input: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[]
): string | undefined {
  const value = input[key];

  if (typeof value !== "string") {
    addIssue(issues, `${path}.${key}`, "Expected a non-empty string");
    return undefined;
  }

  if (value.trim().length === 0) {
    addIssue(issues, `${path}.${key}`, "String cannot be empty");
  }

  return value;
}

function readOptionalString(
  input: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[]
): string | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    addIssue(issues, `${path}.${key}`, "Expected a string when provided");
    return undefined;
  }

  return value;
}

function readOptionalFiniteNumber(
  input: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[]
): number | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    addIssue(issues, `${path}.${key}`, "Expected a finite number when provided");
    return undefined;
  }

  return value;
}

function readRequiredStringArray(
  input: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[]
): string[] | undefined {
  const value = input[key];

  if (!Array.isArray(value)) {
    addIssue(issues, `${path}.${key}`, "Expected an array of strings");
    return undefined;
  }

  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      addIssue(issues, `${path}.${key}[${index}]`, "Expected string value");
    }
  });

  return value as string[];
}

function validateIsoDateString(value: string | undefined, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (Number.isNaN(Date.parse(value))) {
    addIssue(issues, path, "Expected an ISO date string");
  }
}

function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === "string" && MEDIA_KIND_VALUES.includes(value as MediaKind);
}

function isProviderCapability(value: unknown): value is ProviderCapability {
  return (
    typeof value === "string" &&
    PROVIDER_CAPABILITY_VALUES.includes(value as ProviderCapability)
  );
}

function validateArtworkImageAtPath(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): value is ArtworkImage {
  if (!isPlainObject(value)) {
    addIssue(issues, path, "Expected artwork object");
    return false;
  }

  ensureKnownKeys(value, path, ARTWORK_KEYS, issues);

  readRequiredString(value, "url", path, issues);

  const width = readOptionalFiniteNumber(value, "width", path, issues);
  if (width !== undefined && width <= 0) {
    addIssue(issues, `${path}.width`, "Expected a positive number");
  }

  const height = readOptionalFiniteNumber(value, "height", path, issues);
  if (height !== undefined && height <= 0) {
    addIssue(issues, `${path}.height`, "Expected a positive number");
  }

  readOptionalString(value, "dominantColor", path, issues);

  return true;
}

export function validateMediaItem(value: unknown): ValidationResult<MediaItem> {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(value)) {
    return {
      ok: false,
      errors: [{ path: "mediaItem", message: "Expected object" }]
    };
  }

  ensureKnownKeys(value, "mediaItem", MEDIA_ITEM_KEYS, issues);

  readRequiredString(value, "id", "mediaItem", issues);
  readRequiredString(value, "providerId", "mediaItem", issues);
  readRequiredString(value, "libraryId", "mediaItem", issues);

  if (!isMediaKind(value.kind)) {
    addIssue(issues, "mediaItem.kind", "Expected supported media kind");
  }

  readRequiredString(value, "title", "mediaItem", issues);
  readOptionalString(value, "sortTitle", "mediaItem", issues);
  readOptionalString(value, "originalTitle", "mediaItem", issues);
  readOptionalString(value, "overview", "mediaItem", issues);

  const year = readOptionalFiniteNumber(value, "year", "mediaItem", issues);
  if (year !== undefined && (!Number.isInteger(year) || year < 1800 || year > 3000)) {
    addIssue(issues, "mediaItem.year", "Expected an integer year in [1800, 3000]");
  }

  const runtimeMs = readOptionalFiniteNumber(value, "runtimeMs", "mediaItem", issues);
  if (runtimeMs !== undefined && runtimeMs < 0) {
    addIssue(issues, "mediaItem.runtimeMs", "Expected runtimeMs to be >= 0");
  }

  const communityRating = readOptionalFiniteNumber(value, "communityRating", "mediaItem", issues);
  if (communityRating !== undefined && (communityRating < 0 || communityRating > 10)) {
    addIssue(issues, "mediaItem.communityRating", "Expected rating in range [0, 10]");
  }

  const criticRating = readOptionalFiniteNumber(value, "criticRating", "mediaItem", issues);
  if (criticRating !== undefined && (criticRating < 0 || criticRating > 10)) {
    addIssue(issues, "mediaItem.criticRating", "Expected rating in range [0, 10]");
  }

  readRequiredStringArray(value, "genres", "mediaItem", issues);
  readRequiredStringArray(value, "tags", "mediaItem", issues);
  readRequiredStringArray(value, "people", "mediaItem", issues);

  validateArtworkImageAtPath(value.poster, "mediaItem.poster", issues);

  if (value.backdrop !== undefined) {
    validateArtworkImageAtPath(value.backdrop, "mediaItem.backdrop", issues);
  }

  if (value.logo !== undefined) {
    validateArtworkImageAtPath(value.logo, "mediaItem.logo", issues);
  }

  validateIsoDateString(readOptionalString(value, "dateAdded", "mediaItem", issues), "mediaItem.dateAdded", issues);
  validateIsoDateString(
    readOptionalString(value, "dateUpdated", "mediaItem", issues),
    "mediaItem.dateUpdated",
    issues
  );
  validateIsoDateString(
    readOptionalString(value, "premiereDate", "mediaItem", issues),
    "mediaItem.premiereDate",
    issues
  );

  if (issues.length > 0) {
    return { ok: false, errors: issues };
  }

  return {
    ok: true,
    value: value as unknown as MediaItem
  };
}

export function validateVisualItem(value: unknown): ValidationResult<VisualItem> {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(value)) {
    return {
      ok: false,
      errors: [{ path: "visualItem", message: "Expected object" }]
    };
  }

  ensureKnownKeys(value, "visualItem", VISUAL_ITEM_KEYS, issues);

  readRequiredString(value, "id", "visualItem", issues);
  readRequiredString(value, "mediaId", "visualItem", issues);
  readRequiredString(value, "title", "visualItem", issues);
  readRequiredString(value, "posterUrl", "visualItem", issues);

  readOptionalString(value, "subtitle", "visualItem", issues);
  readOptionalString(value, "backdropUrl", "visualItem", issues);
  readOptionalString(value, "accentColor", "visualItem", issues);
  readOptionalString(value, "primaryMeta", "visualItem", issues);
  readOptionalString(value, "secondaryMeta", "visualItem", issues);

  if (issues.length > 0) {
    return { ok: false, errors: issues };
  }

  return {
    ok: true,
    value: value as unknown as VisualItem
  };
}

export function validateProviderSession(value: unknown): ValidationResult<ProviderSession> {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(value)) {
    return {
      ok: false,
      errors: [{ path: "providerSession", message: "Expected object" }]
    };
  }

  ensureKnownKeys(value, "providerSession", PROVIDER_SESSION_KEYS, issues);

  readRequiredString(value, "providerId", "providerSession", issues);
  readRequiredString(value, "serverUrl", "providerSession", issues);
  readRequiredString(value, "userId", "providerSession", issues);
  readRequiredString(value, "username", "providerSession", issues);
  readRequiredString(value, "accessToken", "providerSession", issues);

  const createdAt = readRequiredString(value, "createdAt", "providerSession", issues);
  validateIsoDateString(createdAt, "providerSession.createdAt", issues);

  validateIsoDateString(
    readOptionalString(value, "expiresAt", "providerSession", issues),
    "providerSession.expiresAt",
    issues
  );
  readOptionalString(value, "refreshToken", "providerSession", issues);

  if (issues.length > 0) {
    return { ok: false, errors: issues };
  }

  return {
    ok: true,
    value: value as unknown as ProviderSession
  };
}

export function validateProviderCapabilities(
  value: unknown
): ValidationResult<readonly ProviderCapability[]> {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      errors: [{ path: "capabilities", message: "Expected an array" }]
    };
  }

  const issues: ValidationIssue[] = [];
  const unique = new Set<ProviderCapability>();

  value.forEach((entry, index) => {
    if (!isProviderCapability(entry)) {
      addIssue(issues, `capabilities[${index}]`, "Unsupported provider capability");
      return;
    }

    if (unique.has(entry)) {
      addIssue(issues, `capabilities[${index}]`, "Duplicate provider capability");
      return;
    }

    unique.add(entry);
  });

  if (issues.length > 0) {
    return { ok: false, errors: issues };
  }

  return {
    ok: true,
    value: [...unique]
  };
}

export function isMediaItem(value: unknown): value is MediaItem {
  return validateMediaItem(value).ok;
}

export function isVisualItem(value: unknown): value is VisualItem {
  return validateVisualItem(value).ok;
}

export function isProviderSession(value: unknown): value is ProviderSession {
  return validateProviderSession(value).ok;
}

export function assertMediaItem(value: unknown): asserts value is MediaItem {
  const result = validateMediaItem(value);

  if (!result.ok) {
    throw new Error(formatValidationIssues(result.errors));
  }
}

export function assertProviderSession(value: unknown): asserts value is ProviderSession {
  const result = validateProviderSession(value);

  if (!result.ok) {
    throw new Error(formatValidationIssues(result.errors));
  }
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}
