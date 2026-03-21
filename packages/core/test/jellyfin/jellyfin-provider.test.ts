import { describe, expect, it, vi } from "vitest";

import {
  createEmbyMediaProvider,
  JellyfinMediaProvider,
  JellyfinProviderError,
  createJellyfinMediaProvider
} from "../../src/providers/jellyfin";

interface JsonResponseOptions {
  status?: number;
  headers?: Record<string, string>;
}

type FetchHandler = (url: URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, options: JsonResponseOptions = {}): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...options.headers
    }
  });
}

function toUrl(input: URL | RequestInfo): URL {
  if (input instanceof URL) {
    return input;
  }

  if (typeof input === "string") {
    return new URL(input);
  }

  return new URL(input.url);
}

function createFetchMock(handler: FetchHandler): typeof globalThis.fetch {
  return vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => handler(toUrl(input), init));
}

function browserCorsResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    type: "cors",
    headers: new Headers({
      "content-type": "application/json"
    }),
    json: async () => body
  } as unknown as Response;
}

describe("jellyfin-provider-happy", () => {
  it("runs preflight/auth/session/media lifecycle and normalizes media items", async () => {
    const mediaListIncludeItemTypes: string[] = [];
    const mediaListEnableImages: string[] = [];

    const fetchMock = createFetchMock(async (url, init) => {
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined;

      if (url.pathname === "/System/Info/Public") {
        return jsonResponse(
          { Version: "10.10.3" },
          { headers: { "access-control-allow-origin": "https://app.local" } }
        );
      }

      if (url.pathname === "/Users/AuthenticateByName") {
        if (body?.Username === "") {
          return jsonResponse(
            { Error: "invalid" },
            {
              status: 401,
              headers: { "access-control-allow-origin": "https://app.local" }
            }
          );
        }

        return jsonResponse({
          AccessToken: "access-token-001",
          User: { Id: "user-001", Name: "dune" }
        });
      }

      if (url.pathname === "/Users/Me") {
        return jsonResponse({ Id: "user-001", Name: "dune" });
      }

      if (url.pathname === "/Users/user-001/Views") {
        return jsonResponse({
          Items: [{ Id: "library-001", Name: "Movies", CollectionType: "movies" }]
        });
      }

      if (url.pathname === "/Users/user-001/Items") {
        mediaListIncludeItemTypes.push(url.searchParams.get("IncludeItemTypes") ?? "");
        mediaListEnableImages.push(url.searchParams.get("EnableImages") ?? "");

        return jsonResponse({
          Items: [
            {
              Id: "item-001",
              Name: "Arrival",
              Type: "Movie",
              ProductionYear: 2016,
              RunTimeTicks: 69600000000,
              Genres: ["Sci-Fi"],
              Tags: ["first-contact"],
              People: [{ Name: "Amy Adams" }],
              ImageTags: { Primary: "poster-tag", Logo: "logo-tag" },
              BackdropImageTags: ["backdrop-tag"]
            },
            {
              Id: "item-002",
              Name: "No Poster",
              Type: "Movie",
              Genres: ["Drama"]
            },
            {
              Id: "episode-001",
              Name: "Arrival - S01E01",
              Type: "Episode",
              ImageTags: { Primary: "episode-poster-tag" }
            }
          ],
          TotalRecordCount: 3
        });
      }

      if (url.pathname === "/Sessions/Logout") {
        return new Response(null, { status: 204 });
      }

      return new Response(null, { status: 404 });
    });

    const provider = createJellyfinMediaProvider({
      fetch: fetchMock,
      now: () => new Date("2026-02-23T12:00:00.000Z")
    });

    const preflight = await provider.preflight({
      serverUrl: "https://jellyfin.local/",
      origin: "https://app.local"
    });

    expect(preflight.ok).toBe(true);
    if (preflight.ok) {
      expect(preflight.serverVersion).toBe("10.10.3");
    }

    const session = await provider.authenticate({
      serverUrl: "https://jellyfin.local",
      username: "dune",
      password: "redacted-password",
      clientName: "Media Poster Space",
      deviceId: "device-001"
    });

    expect(session).toMatchObject({
      providerId: "jellyfin",
      userId: "user-001",
      username: "dune",
      accessToken: "access-token-001"
    });

    const restored = await provider.restoreSession(session);
    expect(restored).not.toBeNull();
    expect(restored?.userId).toBe("user-001");

    const libraries = await provider.listLibraries(session);
    expect(libraries).toEqual([
      {
        id: "library-001",
        name: "Movies",
        kind: "movies"
      }
    ]);

    const page = await provider.listMedia(session, {
      libraryIds: ["library-001"],
      limit: 10
    });

    expect(mediaListIncludeItemTypes[0]).toBe("Movie,Series,BoxSet,MusicVideo");
    expect(mediaListEnableImages[0]).toBe("true");

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: "item-001",
      providerId: "jellyfin",
      libraryId: "library-001",
      kind: "movie",
      title: "Arrival"
    });
    expect(page.items[0]?.poster.url).toContain("/Items/item-001/Images/Primary");

    const visualItems = provider.toVisualItems(page.items);
    expect(visualItems).toHaveLength(1);
    expect(visualItems[0]).toMatchObject({
      mediaId: "item-001",
      title: "Arrival"
    });

    await provider.invalidateSession(session);
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("emby-provider-happy", () => {
  it("targets emby api routes and emits emby-branded session metadata", async () => {
    const authorizationHeaders: string[] = [];
    const mediaListEnableImages: string[] = [];
    const fetchMock = createFetchMock(async (url, init) => {
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined;

      if (url.pathname === "/emby/System/Info/Public") {
        return jsonResponse(
          { Version: "4.8.10.0" },
          { headers: { "access-control-allow-origin": "https://app.local" } }
        );
      }

      if (url.pathname === "/emby/Users/AuthenticateByName") {
        if (body?.Username === "") {
          return jsonResponse(
            { Error: "invalid" },
            {
              status: 401,
              headers: { "access-control-allow-origin": "https://app.local" }
            }
          );
        }

        const headers = new Headers(init?.headers);
        authorizationHeaders.push(headers.get("Authorization") ?? "");

        return jsonResponse({
          AccessToken: "emby-token-001",
          User: { Id: "emby-user-001", Name: "emby-user" }
        });
      }

      if (url.pathname === "/emby/Users/Me") {
        return jsonResponse({ Id: "emby-user-001", Name: "emby-user" });
      }

      if (url.pathname === "/emby/Users/emby-user-001/Views") {
        return jsonResponse({
          Items: [{ Id: "emby-library-001", Name: "Movies", CollectionType: "movies" }]
        });
      }

      if (url.pathname === "/emby/Users/emby-user-001/Items") {
        mediaListEnableImages.push(url.searchParams.get("EnableImages") ?? "");
        return jsonResponse({
          Items: [
            {
              Id: "emby-item-001",
              Name: "The Creator",
              Type: "Movie",
              ImageTags: { Primary: "emby-poster-tag" }
            }
          ],
          TotalRecordCount: 1
        });
      }

      if (url.pathname === "/emby/Sessions/Logout") {
        return new Response(null, { status: 204 });
      }

      return new Response(null, { status: 404 });
    });

    const provider = createEmbyMediaProvider({
      fetch: fetchMock,
      now: () => new Date("2026-03-20T17:30:00.000Z")
    });

    const preflight = await provider.preflight({
      serverUrl: "https://emby.local",
      origin: "https://app.local"
    });

    expect(preflight.ok).toBe(true);

    const session = await provider.authenticate({
      serverUrl: "https://emby.local",
      username: "emby-user",
      password: "redacted-password",
      clientName: "Media Poster Space",
      deviceId: "device-emby-001"
    });

    expect(session).toMatchObject({
      providerId: "emby",
      userId: "emby-user-001",
      username: "emby-user",
      accessToken: "emby-token-001"
    });
    expect(authorizationHeaders.some((value) => value.includes("Emby Client="))).toBe(true);

    const libraries = await provider.listLibraries(session);
    expect(libraries).toEqual([
      {
        id: "emby-library-001",
        name: "Movies",
        kind: "movies"
      }
    ]);

    const page = await provider.listMedia(session, {
      libraryIds: ["emby-library-001"]
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: "emby-item-001",
      providerId: "emby"
    });
    expect(mediaListEnableImages[0]).toBe("true");
    expect(page.items[0]?.poster.url).toContain("/emby/Items/emby-item-001/Images/Primary");

    await provider.invalidateSession(session);
  });
});

describe("jellyfin-provider-failure", () => {
  it("categorizes invalid endpoint preflight failure as network", async () => {
    const provider = new JellyfinMediaProvider({
      fetch: createFetchMock(async () => {
        throw new TypeError("fetch failed");
      })
    });

    const result = await provider.preflight({ serverUrl: "https://offline.local" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe("network");
      expect(result.error.message).not.toContain("access-token");
    }
  });

  it("categorizes auth failures without leaking password in error message", async () => {
    const password = "UltraSecretPassword-123";

    const provider = new JellyfinMediaProvider({
      fetch: createFetchMock(async (url) => {
        if (url.pathname === "/Users/AuthenticateByName") {
          return jsonResponse({ AccessToken: "server-should-not-leak" }, { status: 401 });
        }

        return new Response(null, { status: 404 });
      })
    });

    await expect(
      provider.authenticate({
        serverUrl: "https://jellyfin.local",
        username: "dune",
        password,
        clientName: "Media Poster Space",
        deviceId: "device-001"
      })
    ).rejects.toMatchObject({
      providerError: {
        category: "auth"
      }
    });

    try {
      await provider.authenticate({
        serverUrl: "https://jellyfin.local",
        username: "dune",
        password,
        clientName: "Media Poster Space",
        deviceId: "device-001"
      });
    } catch (error) {
      const providerError = (error as JellyfinProviderError).providerError;
      expect(providerError.message).not.toContain(password);
      expect(providerError.message).not.toContain("server-should-not-leak");
    }
  });

  it("categorizes cors and version preflight failures deterministically", async () => {
    const corsProvider = new JellyfinMediaProvider({
      fetch: createFetchMock(async (url) => {

        if (url.pathname === "/System/Info/Public") {
          return jsonResponse({ Version: "10.9.0" });
        }

        return new Response(null, { status: 404 });
      })
    });

    const corsResult = await corsProvider.preflight({
      serverUrl: "https://jellyfin.local",
      origin: "https://app.local"
    });

    expect(corsResult.ok).toBe(false);
    if (!corsResult.ok) {
      expect(corsResult.error.category).toBe("cors");
    }

    const sameOriginProvider = new JellyfinMediaProvider({
      fetch: createFetchMock(async (url, init) => {
        if (url.pathname === "/System/Info/Public") {
          return jsonResponse({ Version: "10.10.3" });
        }

        if (url.pathname === "/Users/AuthenticateByName") {
          const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
          if (body?.Username === "") {
            return jsonResponse({ Error: "invalid" }, { status: 401 });
          }
        }

        return new Response(null, { status: 404 });
      })
    });

    const sameOriginResult = await sameOriginProvider.preflight({
      serverUrl: "https://app.local",
      origin: "https://app.local"
    });

    expect(sameOriginResult.ok).toBe(true);
    if (sameOriginResult.ok) {
      expect(sameOriginResult.serverVersion).toBe("10.10.3");
    }

    const browserCorsProvider = new JellyfinMediaProvider({
      fetch: createFetchMock(async (url, init) => {
        if (url.pathname === "/System/Info/Public") {
          return browserCorsResponse({ Version: "10.10.3" });
        }

        if (url.pathname === "/Users/AuthenticateByName") {
          const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
          if (body?.Username === "") {
            return browserCorsResponse({ Error: "invalid" }, 401);
          }
        }

        return new Response(null, { status: 404 });
      })
    });

    const browserCorsResult = await browserCorsProvider.preflight({
      serverUrl: "https://jellyfin.local",
      origin: "https://app.local"
    });

    expect(browserCorsResult.ok).toBe(true);
    if (browserCorsResult.ok) {
      expect(browserCorsResult.serverVersion).toBe("10.10.3");
    }

    const versionProvider = new JellyfinMediaProvider({
      fetch: createFetchMock(async (url, init) => {
        if (url.pathname === "/System/Info/Public") {
          return jsonResponse({ Version: "9.0.1" });
        }

        if (url.pathname === "/Users/AuthenticateByName") {
          const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
          if (body?.Username === "") {
            return jsonResponse({ Error: "invalid" }, { status: 401 });
          }
        }

        return new Response(null, { status: 404 });
      })
    });

    const versionResult = await versionProvider.preflight({
      serverUrl: "https://jellyfin.local"
    });

    expect(versionResult.ok).toBe(false);
    if (!versionResult.ok) {
      expect(versionResult.error.category).toBe("version");
    }
  });

  it("returns null on restoreSession auth rejection and categorizes unknown preflight status", async () => {
    const provider = new JellyfinMediaProvider({
      fetch: createFetchMock(async (url) => {

        if (url.pathname === "/Users/Me") {
          return new Response(null, { status: 401 });
        }

        if (url.pathname === "/System/Info/Public") {
          return jsonResponse({ Version: "10.10.3" }, { status: 418 });
        }

        return new Response(null, { status: 404 });
      })
    });

    const restored = await provider.restoreSession({
      providerId: "jellyfin",
      serverUrl: "https://jellyfin.local",
      userId: "user-001",
      username: "dune",
      accessToken: "access-token-001",
      createdAt: "2026-02-23T12:00:00.000Z"
    });

    expect(restored).toBeNull();

    const preflight = await provider.preflight({ serverUrl: "https://jellyfin.local" });
    expect(preflight.ok).toBe(false);
    if (!preflight.ok) {
      expect(preflight.error.category).toBe("unknown");
    }
  });
});
