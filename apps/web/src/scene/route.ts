import type { OledSceneProfile } from "@mps/core";

import { isAppPath } from "../routing/base-path";

const WALL_SCENE_PATHNAME = "/wall";
const WALL_SCENE_MODE_QUERY_PARAM = "mode";
const WALL_SCENE_TEST_MODE = "test";
const WALL_SCENE_SEED_QUERY_PARAM = "seed";
const WALL_SCENE_PROFILE_QUERY_PARAM = "profile";

export interface WallSceneRouteMatch {
  mode: "test" | "cinematic";
  seed: string;
  profile: OledSceneProfile;
}

function parseCinematicProfile(profile: string | null): OledSceneProfile | null {
  if (profile === "showcase" || profile === "balanced") {
    return profile;
  }

  return null;
}

function parseSeed(seed: string | null): string | null {
  const normalized = (seed ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveWallSceneRoute(url: URL, basePath?: string): WallSceneRouteMatch | null {
  if (!isAppPath(url.pathname, WALL_SCENE_PATHNAME, basePath)) {
    return null;
  }

  if (url.searchParams.get(WALL_SCENE_MODE_QUERY_PARAM) === WALL_SCENE_TEST_MODE) {
    return {
      mode: "test",
      seed: "mode-test",
      profile: "balanced"
    };
  }

  const seed = parseSeed(url.searchParams.get(WALL_SCENE_SEED_QUERY_PARAM));
  const profile = parseCinematicProfile(url.searchParams.get(WALL_SCENE_PROFILE_QUERY_PARAM));

  if (!seed || !profile) {
    return null;
  }

  return {
    mode: "cinematic",
    seed,
    profile
  };
}

export function shouldRenderWallScene(url: URL, basePath?: string): boolean {
  return resolveWallSceneRoute(url, basePath) !== null;
}
