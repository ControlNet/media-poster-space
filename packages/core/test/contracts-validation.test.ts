import { describe, expect, it } from "vitest";

import {
  assertMediaItem,
  formatValidationIssues,
  validateMediaItem,
  validateProviderCapabilities,
  validateProviderSession,
  validateVisualItem
} from "../src";
import { validMediaItem, validProviderSession, validVisualItem } from "./fixtures";

describe("validation contracts", () => {
  it("accepts a valid MediaItem contract", () => {
    const result = validateMediaItem(validMediaItem);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("Arrival");
      expect(result.value.poster.url).toContain("arrival.jpg");
    }
  });

  it("rejects invalid MediaItem shape", () => {
    const malformed = {
      ...validMediaItem,
      year: 1400,
      genres: ["Sci-Fi", 123]
    };

    const result = validateMediaItem(malformed);
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.some((error) => error.path === "mediaItem.year")).toBe(true);
      expect(result.errors.some((error) => error.path === "mediaItem.genres[1]")).toBe(true);
    }
  });

  it("assertMediaItem throws with readable diagnostics", () => {
    const malformed = {
      ...validMediaItem,
      poster: { width: 100 }
    };

    expect(() => assertMediaItem(malformed)).toThrowError(/mediaItem.poster.url/);
  });

  it("accepts a valid VisualItem contract", () => {
    const result = validateVisualItem(validVisualItem);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mediaId).toBe(validMediaItem.id);
    }
  });

  it("accepts a valid provider session contract", () => {
    const result = validateProviderSession(validProviderSession);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.providerId).toBe("provider-001");
    }
  });

  it("rejects duplicated/unknown provider capabilities", () => {
    const result = validateProviderCapabilities([
      "preflight",
      "media-browse",
      "media-browse",
      "jellyfin-direct"
    ]);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      const pretty = formatValidationIssues(result.errors);
      expect(pretty).toContain("Duplicate provider capability");
      expect(pretty).toContain("Unsupported provider capability");
    }
  });
});
