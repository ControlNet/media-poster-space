import { describe, expect, it } from "vitest";

import { isMediaItem, isProviderSession, validateMediaItem, validateProviderSession } from "../../src";
import { validMediaItem, validProviderSession } from "../fixtures";

describe("validation contracts: provider data ranges", () => {
  it("accepts Jellyfin percentage critic ratings in [0, 100]", () => {
    for (const criticRating of [0, 10, 85, 100]) {
      expect(isMediaItem({ ...validMediaItem, criticRating })).toBe(true);
    }
  });

  it("rejects critic ratings outside [0, 100]", () => {
    for (const criticRating of [-1, 100.5, 250]) {
      const result = validateMediaItem({ ...validMediaItem, criticRating });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.path === "mediaItem.criticRating")).toBe(true);
      }
    }
  });
});

describe("validation contracts: provider session server URL", () => {
  it("accepts absolute http(s) server URLs, including sub-paths", () => {
    for (const serverUrl of ["https://media.example.com", "http://192.168.1.10:8096", "https://host/jellyfin"]) {
      expect(isProviderSession({ ...validProviderSession, serverUrl })).toBe(true);
    }
  });

  it("rejects server URLs that are not absolute http(s) URLs", () => {
    for (const serverUrl of ["192.168.1.10:8096", "localhost:8096", "ftp://media.example.com", "https://user:pw@media.example.com"]) {
      const result = validateProviderSession({ ...validProviderSession, serverUrl });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.path === "providerSession.serverUrl")).toBe(true);
        expect(result.errors.map((error) => error.message).join(" ")).not.toContain("pw");
      }
    }
  });

  it("accepts optional client metadata captured at sign-in", () => {
    expect(isProviderSession({ ...validProviderSession, clientName: "Media Poster Space", deviceId: "device-001" })).toBe(true);
    expect(isProviderSession({ ...validProviderSession, deviceId: 42 })).toBe(false);
  });
});
