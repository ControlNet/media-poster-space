import { describe, expect, it } from "vitest";

import type { MediaItem, VisualItem } from "../src";
import { validateMediaItem, validateVisualItem } from "../src";
import { validMediaItem, validVisualItem } from "./fixtures";

type ForbiddenProviderFields =
  | "jellyfinId"
  | "jellyfinServerId"
  | "jellyfinUserId"
  | "jellyfinItemType"
  | "jellyfinBackdropId"
  | "jellyfinImageTag";

type Assert<T extends true> = T;
type _MediaItemHasNoProviderLeakage = Assert<
  Extract<keyof MediaItem, ForbiddenProviderFields> extends never ? true : false
>;
type _VisualItemHasNoProviderLeakage = Assert<
  Extract<keyof VisualItem, ForbiddenProviderFields> extends never ? true : false
>;

const noProviderLeakageInMediaItemType: _MediaItemHasNoProviderLeakage = true;
const noProviderLeakageInVisualItemType: _VisualItemHasNoProviderLeakage = true;
void noProviderLeakageInMediaItemType;
void noProviderLeakageInVisualItemType;

describe("provider contract boundary", () => {
  it("rejects top-level provider-specific fields in MediaItem", () => {
    const leaked = {
      ...validMediaItem,
      jellyfinId: "jf-123"
    };

    const result = validateMediaItem(leaked);
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.some((error) => error.path === "mediaItem.jellyfinId")).toBe(true);
    }
  });

  it("rejects provider-specific nested fields in artwork blocks", () => {
    const leaked = {
      ...validMediaItem,
      poster: {
        ...validMediaItem.poster,
        jellyfinImageTag: "abcdef"
      }
    };

    const result = validateMediaItem(leaked);
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.some((error) => error.path === "mediaItem.poster.jellyfinImageTag")).toBe(
        true
      );
    }
  });

  it("rejects provider-specific fields in VisualItem", () => {
    const leaked = {
      ...validVisualItem,
      jellyfinBackdropId: "backdrop-001"
    };

    const result = validateVisualItem(leaked);
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.some((error) => error.path === "visualItem.jellyfinBackdropId")).toBe(
        true
      );
    }
  });
});
