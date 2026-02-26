import { describe, expect, it } from "vitest";

import {
  createOledCinematicControllerState,
  createMediaIngestionRuntime,
  createDynamicAccentTokens,
  getBrandFontFamilies,
  schedulePoster,
  validateMediaItem,
  validateVisualItem
} from "../src";
import { createMediaIngestionRuntime as createMediaIngestionRuntimeFromIngestion } from "../src/ingestion";
import { createOledCinematicControllerState as createOledCinematicControllerStateFromOled } from "../src/oled";
import { schedulePoster as schedulePosterFromScheduler } from "../src/scheduler";
import {
  validateMediaItem as validateMediaItemFromValidation,
  validateVisualItem as validateVisualItemFromValidation
} from "../src/validation";
import {
  createDynamicAccentTokens as createDynamicAccentTokensFromTokens,
  getBrandFontFamilies as getBrandFontFamiliesFromTokens
} from "../src/tokens";
import type { MediaItem, ProviderSession, VisualItem } from "../src/types";
import type { MediaPage, MediaProvider, MediaQuery } from "../src/provider";

type Assert<T extends true> = T;

type _MediaItemTypeExported = Assert<MediaItem extends object ? true : false>;
type _VisualItemTypeExported = Assert<VisualItem extends object ? true : false>;
type _ProviderSessionTypeExported = Assert<ProviderSession extends object ? true : false>;
type _MediaProviderContractExported = Assert<
  MediaProvider["listMedia"] extends (
    session: ProviderSession,
    query: MediaQuery
  ) => Promise<MediaPage>
    ? true
    : false
>;

const mediaItemTypeExported: _MediaItemTypeExported = true;
const visualItemTypeExported: _VisualItemTypeExported = true;
const providerSessionTypeExported: _ProviderSessionTypeExported = true;
const mediaProviderContractExported: _MediaProviderContractExported = true;

void mediaItemTypeExported;
void visualItemTypeExported;
void providerSessionTypeExported;
void mediaProviderContractExported;

describe("public exports", () => {
  it("keeps root and validation function exports aligned", () => {
    expect(validateMediaItem).toBe(validateMediaItemFromValidation);
    expect(validateVisualItem).toBe(validateVisualItemFromValidation);
  });

  it("keeps root and tokens exports aligned", () => {
    expect(createDynamicAccentTokens).toBe(createDynamicAccentTokensFromTokens);
    expect(getBrandFontFamilies).toBe(getBrandFontFamiliesFromTokens);
  });

  it("keeps root and ingestion exports aligned", () => {
    expect(createMediaIngestionRuntime).toBe(createMediaIngestionRuntimeFromIngestion);
  });

  it("keeps root and scheduler exports aligned", () => {
    expect(schedulePoster).toBe(schedulePosterFromScheduler);
  });

  it("keeps root and oled exports aligned", () => {
    expect(createOledCinematicControllerState).toBe(createOledCinematicControllerStateFromOled);
  });
});
