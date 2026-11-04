// Throwaway repro: timeout scope, error typing of list calls, swallowed JSON errors.
import { createJellyfinMediaProvider } from "../../../../packages/core/src/providers/jellyfin/client.ts";

const SESSION = {
  providerId: "jellyfin",
  serverUrl: "https://jf.local",
  userId: "u1",
  username: "u",
  accessToken: "SECRET-TOKEN",
  createdAt: "2026-01-01T00:00:00.000Z"
};

function urlOf(input: URL | RequestInfo): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

// Headers arrive immediately, body never completes (stalled proxy / slow link).
function stalledBodyResponse(signal: AbortSignal | null | undefined): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"Version":"10.'));
      // Honour abort like a real fetch body would.
      signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
    }
  });
  return new Response(stream, { status: 200, headers: { "content-type": "application/json" } });
}

async function race<T>(p: Promise<T>, ms: number): Promise<T | "STILL-PENDING"> {
  return Promise.race([p, new Promise<"STILL-PENDING">((r) => setTimeout(() => r("STILL-PENDING"), ms))]);
}

// 1) preflight timeoutMs=50, body stalls -> should time out at ~50ms
{
  const p = createJellyfinMediaProvider({
    fetch: async (_input, init) => stalledBodyResponse(init?.signal)
  });
  const result = await race(p.preflight({ serverUrl: "https://jf.local", timeoutMs: 50 }), 1500);
  console.log("[stalled body, timeoutMs=50] after 1500ms:", JSON.stringify(result));
}

// 2) listLibraries / listMedia: network failure and timeout are NOT mapped to ProviderError
for (const [label, err] of [
  ["TypeError", new TypeError("Failed to fetch")],
  ["AbortError", new DOMException("This operation was aborted", "AbortError")]
] as const) {
  const p = createJellyfinMediaProvider({ fetch: async () => { throw err; } });
  for (const method of ["listLibraries", "listMedia"] as const) {
    try {
      if (method === "listLibraries") await p.listLibraries(SESSION);
      else await p.listMedia(SESSION, { libraryIds: ["lib"] });
      console.log(`[${method} ${label}] resolved?!`);
    } catch (e) {
      const pe = (e as { providerError?: unknown }).providerError;
      console.log(`[${method} ${label}] threw ${(e as Error).constructor.name}: "${(e as Error).message}" providerError=${JSON.stringify(pe)}`);
    }
  }
}

// Since the fix these calls throw a typed provider error; print it instead of crashing.
async function observe(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    console.log(`[${label}] ->`, JSON.stringify(await run()));
  } catch (e) {
    const pe = (e as Error & { providerError?: unknown }).providerError;
    console.log(`[${label}] threw ${(e as Error).constructor.name}: "${(e as Error).message}" providerError=${JSON.stringify(pe)}`);
  }
}

// 3) Truncated JSON body on a 200 listMedia -> silently becomes an empty page (before the fix)
{
  const p = createJellyfinMediaProvider({
    fetch: async () => new Response('{"Items":[{"Id":"a","Name":"A","Type":"Movie","ImageTags":{"Primary":"t"}}],"TotalRec', {
      status: 200, headers: { "content-type": "application/json" }
    })
  });
  await observe("truncated JSON listMedia", () => p.listMedia(SESSION, { libraryIds: ["lib"] }));
}

// 4) Body stream errors mid-read (connection reset) -> also swallowed into an empty page
{
  const p = createJellyfinMediaProvider({
    fetch: async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(c) { c.enqueue(new TextEncoder().encode('{"Items":[')); c.error(new TypeError("network error")); }
      });
      return new Response(stream, { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  await observe("body reset listMedia", () => p.listMedia(SESSION, { libraryIds: ["lib"] }));
}

// 5) SSO / captive portal: every API call returns 200 text/html (fetch follows the 302 to the login page)
{
  const htmlFetch = async (input: URL | RequestInfo) => {
    void urlOf(input);
    return new Response("<html>Sign in</html>", { status: 200, headers: { "content-type": "text/html" } });
  };
  const p = createJellyfinMediaProvider({ fetch: htmlFetch });
  await observe("html 200 restoreSession", () => p.restoreSession(SESSION));
  await observe("html 200 listLibraries", () => p.listLibraries(SESSION));
  await observe("html 200 listMedia", () => p.listMedia(SESSION, { libraryIds: ["lib"] }));
}

// 6) Malformed entries -> raw TypeError, not ProviderError
{
  const p = createJellyfinMediaProvider({
    fetch: async () => new Response(JSON.stringify({ Items: [null], TotalRecordCount: 1 }), {
      status: 200, headers: { "content-type": "application/json" }
    })
  });
  for (const method of ["listLibraries", "listMedia"] as const) {
    try {
      if (method === "listLibraries") await p.listLibraries(SESSION);
      else await p.listMedia(SESSION, { libraryIds: ["lib"] });
      console.log(`[Items:[null] ${method}] resolved`);
    } catch (e) {
      console.log(`[Items:[null] ${method}] threw ${(e as Error).constructor.name}: ${(e as Error).message}`);
    }
  }
}
process.exit(0);
