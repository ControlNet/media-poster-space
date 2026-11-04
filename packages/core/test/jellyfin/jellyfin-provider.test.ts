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

      if (url.pathname === "/emby/Users/emby-user-001") {
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

    const restored = await provider.restoreSession(session);
    expect(restored?.userId).toBe("emby-user-001");

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
  it("rejects explicit Jellyfin servers when Emby provider is selected", async () => {
    const provider = createEmbyMediaProvider({
      fetch: createFetchMock(async (url) => {
        if (url.pathname === "/emby/System/Info/Public") {
          return jsonResponse(
            { Version: "10.10.3", ProductName: "Jellyfin Server" },
            { headers: { "access-control-allow-origin": "https://app.local" } }
          );
        }

        return new Response(null, { status: 404 });
      })
    });

    const result = await provider.preflight({
      serverUrl: "https://media.local",
      origin: "https://app.local"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe("unknown");
      expect(result.error.message).toContain("Emby sign-in is not available for detected Jellyfin servers");
    }
  });

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
          return jsonResponse({ Version: "9.0.1", ProductName: "Jellyfin Server" });
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

const JELLYFIN_SESSION = {
  providerId: "jellyfin",
  serverUrl: "https://jellyfin.local",
  userId: "user-001",
  username: "dune",
  accessToken: "access-token-001",
  createdAt: "2026-02-23T12:00:00.000Z",
  clientName: "Media Poster Space",
  deviceId: "device-001"
};

const EMBY_SESSION = {
  providerId: "emby",
  serverUrl: "https://emby.local",
  userId: "emby-user-001",
  username: "emby-user",
  accessToken: "emby-token-001",
  createdAt: "2026-03-20T17:30:00.000Z"
};

function stalledJsonResponse(signal: AbortSignal | null | undefined): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"Items":['));
      signal?.addEventListener("abort", () => {
        controller.error(new DOMException("This operation was aborted", "AbortError"));
      });
    }
  });

  return new Response(stream, { status: 200, headers: { "content-type": "application/json" } });
}

async function captureProviderError(promise: Promise<unknown>): Promise<JellyfinProviderError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof JellyfinProviderError) {
      return error;
    }

    throw new Error(`Expected JellyfinProviderError, received ${String(error)}`);
  }

  throw new Error("Expected promise to reject");
}

describe("jellyfin-provider-auth-headers", () => {
  it("sends the MediaBrowser Authorization header with the token for every Jellyfin session call", async () => {
    const sessionHeaders: Headers[] = [];
    const fetchMock = createFetchMock(async (url, init) => {
      const headers = new Headers(init?.headers);

      if (url.pathname === "/Users/AuthenticateByName") {
        return jsonResponse({ AccessToken: "access-token-001", User: { Id: "user-001", Name: "dune" } });
      }

      sessionHeaders.push(headers);

      if (url.pathname === "/Users/Me") {
        return jsonResponse({ Id: "user-001", Name: "dune" });
      }

      if (url.pathname === "/Users/user-001/Views") {
        return jsonResponse({ Items: [] });
      }

      if (url.pathname === "/Users/user-001/Items") {
        return jsonResponse({ Items: [], TotalRecordCount: 0 });
      }

      if (url.pathname === "/Sessions/Logout") {
        return new Response(null, { status: 204 });
      }

      return new Response(null, { status: 404 });
    });

    const provider = createJellyfinMediaProvider({ fetch: fetchMock, appVersion: "2.3.4" });
    const session = await provider.authenticate({
      serverUrl: "https://jellyfin.local",
      username: "dune",
      password: "redacted-password",
      clientName: "Media Poster Space",
      deviceId: "device-001"
    });

    expect(session).toMatchObject({ clientName: "Media Poster Space", deviceId: "device-001" });

    await provider.restoreSession(session);
    await provider.listLibraries(session);
    await provider.listMedia(session, { libraryIds: ["library-001"] });
    await provider.invalidateSession(session);

    expect(sessionHeaders).toHaveLength(4);
    for (const headers of sessionHeaders) {
      expect(headers.get("Authorization")).toBe(
        'MediaBrowser Client="Media Poster Space", Device="Media Poster Space", DeviceId="device-001", Version="2.3.4", Token="access-token-001"'
      );
      expect(headers.get("X-Emby-Token")).toBeNull();
    }
  });

  it("falls back to a token-only MediaBrowser header for sessions without client metadata", async () => {
    let authorization: string | null = null;
    const provider = createJellyfinMediaProvider({
      appVersion: "2.3.4",
      fetch: createFetchMock(async (_url, init) => {
        authorization = new Headers(init?.headers).get("Authorization");
        return jsonResponse({ Items: [] });
      })
    });

    const { clientName: _clientName, deviceId: _deviceId, ...legacySession } = JELLYFIN_SESSION;
    await provider.listLibraries(legacySession);

    expect(authorization).toBe('MediaBrowser Version="2.3.4", Token="access-token-001"');
  });

  it("keeps X-Emby-Token for Emby session calls", async () => {
    const sessionHeaders: Headers[] = [];
    const provider = createEmbyMediaProvider({
      fetch: createFetchMock(async (url, init) => {
        sessionHeaders.push(new Headers(init?.headers));

        if (url.pathname === "/emby/Sessions/Logout") {
          return new Response(null, { status: 204 });
        }

        return jsonResponse({ Items: [] });
      })
    });

    await provider.listLibraries(EMBY_SESSION);
    await provider.invalidateSession(EMBY_SESSION);

    expect(sessionHeaders).toHaveLength(2);
    for (const headers of sessionHeaders) {
      expect(headers.get("X-Emby-Token")).toBe("emby-token-001");
      expect(headers.get("Authorization")).toBeNull();
    }
  });
});

describe("jellyfin-provider-sub-path", () => {
  it("keeps the server base path for API and image URLs", async () => {
    const requested: string[] = [];
    const fetchMock = createFetchMock(async (url) => {
      requested.push(url.pathname);

      if (url.pathname.endsWith("/System/Info/Public")) {
        return jsonResponse({ Version: "10.10.3", ProductName: "Jellyfin Server" });
      }

      if (url.pathname.endsWith("/Users/AuthenticateByName")) {
        return jsonResponse({ Error: "invalid" }, { status: 401 });
      }

      if (url.pathname.endsWith("/Items")) {
        return jsonResponse({
          Items: [{ Id: "item-001", Name: "Arrival", Type: "Movie", ImageTags: { Primary: "poster-tag" } }],
          TotalRecordCount: 1
        });
      }

      return new Response(null, { status: 404 });
    });

    const provider = createJellyfinMediaProvider({ fetch: fetchMock });
    const preflight = await provider.preflight({ serverUrl: "https://media.example.com/jellyfin/" });
    expect(preflight.ok).toBe(true);
    expect(requested.slice(0, 2)).toEqual([
      "/jellyfin/System/Info/Public",
      "/jellyfin/Users/AuthenticateByName"
    ]);

    const page = await provider.listMedia(
      { ...JELLYFIN_SESSION, serverUrl: "https://media.example.com/jellyfin" },
      { libraryIds: ["library-001"] }
    );
    expect(requested[2]).toBe("/jellyfin/Users/user-001/Items");
    expect(page.items[0]?.poster.url).toBe(
      "https://media.example.com/jellyfin/Items/item-001/Images/Primary?tag=poster-tag&quality=90"
    );
  });

  it("keeps the server base path in front of the Emby api prefix", async () => {
    const requested: string[] = [];
    const provider = createEmbyMediaProvider({
      fetch: createFetchMock(async (url) => {
        requested.push(url.pathname);
        return jsonResponse({ Items: [] });
      })
    });

    await provider.listLibraries({ ...EMBY_SESSION, serverUrl: "https://media.example.com/emby-proxy" });

    expect(requested).toEqual(["/emby-proxy/emby/Users/emby-user-001/Views"]);
  });
});

describe("jellyfin-provider-timeouts", () => {
  it("times out preflight when the response body stalls", async () => {
    vi.useFakeTimers();

    try {
      const provider = createJellyfinMediaProvider({
        fetch: createFetchMock(async (_url, init) => stalledJsonResponse(init?.signal))
      });

      const resultPromise = provider.preflight({ serverUrl: "https://jellyfin.local", timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      const result = await resultPromise;

      expect(result).toEqual({
        ok: false,
        error: {
          category: "timeout",
          message: "Jellyfin request timed out",
          retriable: true
        }
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out listMedia when the response body stalls", async () => {
    vi.useFakeTimers();

    try {
      const provider = createJellyfinMediaProvider({
        fetch: createFetchMock(async (_url, init) => stalledJsonResponse(init?.signal))
      });

      const errorPromise = captureProviderError(provider.listMedia(JELLYFIN_SESSION, { libraryIds: ["library-001"] }));
      await vi.advanceTimersByTimeAsync(8_000);
      const error = await errorPromise;

      expect(error.providerError).toEqual({
        category: "timeout",
        message: "Jellyfin request timed out",
        retriable: true
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts the in-flight request when the caller signal aborts", async () => {
    let requestSignal: AbortSignal | null | undefined;
    const provider = createJellyfinMediaProvider({
      fetch: createFetchMock(async (_url, init) => {
        requestSignal = init?.signal;
        return stalledJsonResponse(init?.signal);
      })
    });
    const controller = new AbortController();

    const errorPromise = captureProviderError(
      provider.listMedia(JELLYFIN_SESSION, { libraryIds: ["library-001"], signal: controller.signal })
    );
    await vi.waitFor(() => {
      expect(requestSignal).toBeDefined();
    });
    controller.abort();
    const error = await errorPromise;

    expect(requestSignal?.aborted).toBe(true);
    expect(error.providerError.category).toBe("network");
    expect(error.providerError.message).toBe("Jellyfin request was cancelled");
  });

  it("forwards an optional signal for listLibraries", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = createFetchMock(async (_url, init) => stalledJsonResponse(init?.signal));
    const provider = createJellyfinMediaProvider({ fetch: fetchMock });

    const error = await captureProviderError(provider.listLibraries(JELLYFIN_SESSION, { signal: controller.signal }));

    expect(error.providerError.message).toBe("Jellyfin request was cancelled");
  });
});

describe("jellyfin-provider-typed-errors", () => {
  it.each([
    ["TypeError", new TypeError("Failed to fetch"), "network", "Could not reach Jellyfin server"],
    ["AbortError", new DOMException("This operation was aborted", "AbortError"), "timeout", "Jellyfin request timed out"]
  ] as const)("maps %s from list calls to typed provider errors", async (_label, thrown, category, message) => {
    const provider = createJellyfinMediaProvider({
      fetch: createFetchMock(async () => {
        throw thrown;
      })
    });

    const librariesError = await captureProviderError(provider.listLibraries(JELLYFIN_SESSION));
    const mediaError = await captureProviderError(provider.listMedia(JELLYFIN_SESSION, { libraryIds: ["library-001"] }));

    for (const error of [librariesError, mediaError]) {
      expect(error.providerError).toEqual({ category, message, retriable: true });
    }
  });

  it("rejects 2xx responses that are not JSON or fail to parse", async () => {
    const bodies: Response[] = [
      new Response("<html>Sign in</html>", { status: 200, headers: { "content-type": "text/html" } }),
      new Response('{"Items":[{"Id":"a"', { status: 200, headers: { "content-type": "application/json" } }),
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
    ];

    for (const body of bodies) {
      const provider = createJellyfinMediaProvider({ fetch: createFetchMock(async () => body) });
      const error = await captureProviderError(provider.listMedia(JELLYFIN_SESSION, { libraryIds: ["library-001"] }));

      expect(error.providerError).toMatchObject({ category: "unknown", statusCode: 200, retriable: true });
      expect(error.providerError.message).not.toContain("access-token-001");
    }
  });

  it("does not restore a session from a non-JSON 200 response", async () => {
    const provider = createJellyfinMediaProvider({
      fetch: createFetchMock(async () => {
        return new Response("<html>Sign in</html>", { status: 200, headers: { "content-type": "text/html" } });
      })
    });

    const error = await captureProviderError(provider.restoreSession(JELLYFIN_SESSION));
    expect(error.providerError.statusCode).toBe(200);
  });

  it("rejects list responses without an Items array", async () => {
    const provider = createJellyfinMediaProvider({ fetch: createFetchMock(async () => jsonResponse({ Error: "x" })) });

    const error = await captureProviderError(provider.listLibraries(JELLYFIN_SESSION));
    expect(error.providerError).toMatchObject({ category: "unknown", statusCode: 200, retriable: true });
  });

  it("skips malformed Items entries and non-string array values", async () => {
    const provider = createJellyfinMediaProvider({
      fetch: createFetchMock(async (url) => {
        if (url.pathname.endsWith("/Views")) {
          return jsonResponse({ Items: [null, 7, { Id: 1, Name: "Bad" }, { Id: "library-001", Name: "Movies" }] });
        }

        return jsonResponse({
          Items: [
            null,
            "item",
            { Id: "item-001", Name: "Arrival", Type: "Movie", ImageTags: null },
            {
              Id: "item-002",
              Name: "Dune",
              Type: "Movie",
              Genres: ["Sci-Fi", 3, null],
              Tags: "not-an-array",
              People: [null, { Name: 5 }, { Name: "Zendaya" }],
              ImageTags: { Primary: "poster-tag" },
              BackdropImageTags: [42]
            }
          ],
          TotalRecordCount: 4
        });
      })
    });

    const libraries = await provider.listLibraries(JELLYFIN_SESSION);
    expect(libraries).toEqual([{ id: "library-001", name: "Movies", kind: "other" }]);

    const page = await provider.listMedia(JELLYFIN_SESSION, { libraryIds: ["library-001"] });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: "item-002",
      genres: ["Sci-Fi"],
      tags: [],
      people: ["Zendaya"]
    });
    expect(page.items[0]?.backdrop).toBeUndefined();
  });

  it("treats 401 and 204 logout responses as success", async () => {
    for (const status of [204, 401]) {
      const provider = createJellyfinMediaProvider({
        fetch: createFetchMock(async () => new Response(null, { status }))
      });

      await expect(provider.invalidateSession(JELLYFIN_SESSION)).resolves.toBeUndefined();
    }
  });
});

describe("jellyfin-provider-server-url-preflight", () => {
  it.each(["192.168.1.10:8096", "localhost:8096", "jellyfin.local"])(
    "rejects %s without a scheme before any request",
    async (serverUrl) => {
      const fetchMock = createFetchMock(async () => jsonResponse({}));
      const provider = createJellyfinMediaProvider({ fetch: fetchMock });

      const result = await provider.preflight({ serverUrl, origin: "https://app.local" });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.retriable).toBe(false);
        expect(result.error.message).toContain("http://");
        expect(result.error.message).toContain("https://");
      }
    }
  );

  it("rejects unsupported schemes and embedded credentials without echoing them", async () => {
    const fetchMock = createFetchMock(async () => jsonResponse({}));
    const provider = createJellyfinMediaProvider({ fetch: fetchMock });

    const ftpResult = await provider.preflight({ serverUrl: "ftp://jellyfin.local" });
    const userInfoResult = await provider.preflight({ serverUrl: "https://admin:hunter2@jellyfin.local" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ftpResult.ok).toBe(false);
    expect(userInfoResult.ok).toBe(false);
    if (!userInfoResult.ok) {
      expect(userInfoResult.error.retriable).toBe(false);
      expect(userInfoResult.error.message).not.toContain("hunter2");
      expect(userInfoResult.error.message).not.toContain("admin");
    }
  });

  it("explains that an HTTPS page cannot reach a plain http server", async () => {
    const fetchMock = createFetchMock(async () => {
      throw new TypeError("Failed to fetch");
    });
    const provider = createJellyfinMediaProvider({ fetch: fetchMock });

    const result = await provider.preflight({
      serverUrl: "http://192.168.1.10:8096",
      origin: "https://controlnet.github.io"
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.retriable).toBe(false);
      expect(result.error.message).toContain("HTTPS");
      expect(result.error.message).toContain("http://");
      expect(result.error.message).toContain("desktop app");
    }
  });

  it.each(["http://localhost:8096", "http://127.0.0.1:8096", "http://[::1]:8096"])(
    "allows loopback http server %s from an HTTPS page",
    async (serverUrl) => {
      const fetchMock = createFetchMock(async () => {
        throw new TypeError("Failed to fetch");
      });
      const provider = createJellyfinMediaProvider({ fetch: fetchMock });

      await provider.preflight({ serverUrl, origin: "https://app.local" });

      expect(fetchMock).toHaveBeenCalled();
    }
  );

  it("allows http servers from http pages", async () => {
    const fetchMock = createFetchMock(async () => {
      throw new TypeError("Failed to fetch");
    });
    const provider = createJellyfinMediaProvider({ fetch: fetchMock });

    await provider.preflight({ serverUrl: "http://192.168.1.10:8096", origin: "http://tauri.localhost" });

    expect(fetchMock).toHaveBeenCalled();
  });

  it("rejects an invalid server URL on authenticate with a typed error", async () => {
    const fetchMock = createFetchMock(async () => jsonResponse({}));
    const provider = createJellyfinMediaProvider({ fetch: fetchMock });

    const error = await captureProviderError(provider.authenticate({
      serverUrl: "192.168.1.10:8096",
      username: "dune",
      password: "redacted-password",
      clientName: "Media Poster Space",
      deviceId: "device-001"
    }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(error.providerError.retriable).toBe(false);
  });
});

describe("emby-provider-compat", () => {
  it("restores Emby sessions through Users/{userId}", async () => {
    const requested: string[] = [];
    const provider = createEmbyMediaProvider({
      fetch: createFetchMock(async (url) => {
        requested.push(url.pathname);

        if (url.pathname === "/emby/Users/emby-user-001") {
          return jsonResponse({ Id: "emby-user-001", Name: "Emby User" });
        }

        return new Response(null, { status: 404 });
      })
    });

    const restored = await provider.restoreSession(EMBY_SESSION);

    expect(requested).toEqual(["/emby/Users/emby-user-001"]);
    expect(restored?.username).toBe("Emby User");
  });

  it("reports an Emby server mismatch when Emby public info has no ProductName", async () => {
    const provider = createJellyfinMediaProvider({
      fetch: createFetchMock(async (url) => {
        if (url.pathname === "/System/Info/Public") {
          return jsonResponse({ Version: "4.8.10.0", ServerName: "emby-box" });
        }

        return new Response(null, { status: 404 });
      })
    });

    const result = await provider.preflight({ serverUrl: "https://media.local" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("Jellyfin sign-in is not available for detected Emby servers");
      expect(result.error.retriable).toBe(false);
    }
  });
});
