// Throwaway repro: media-ingestion runtime lifecycle races.
import { createMediaIngestionRuntime } from "../../../../packages/core/src/ingestion/media-ingestion.ts";
import { createJellyfinMediaProvider } from "../../../../packages/core/src/providers/jellyfin/client.ts";

const SESSION = {
  providerId: "jellyfin",
  serverUrl: "https://jf.local",
  userId: "u1",
  username: "u",
  accessToken: "SECRET-TOKEN",
  createdAt: "2026-01-01T00:00:00.000Z"
};

const ITEM = {
  id: "m1", providerId: "jellyfin", libraryId: "lib", kind: "movie" as const, title: "Old library poster",
  genres: [], tags: [], people: [], poster: { url: "https://jf.local/Items/m1/Images/Primary" }
};

// A) dispose() while a refresh is in flight -> onStateChange still fires afterwards
{
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const published: string[] = [];
  const runtime = createMediaIngestionRuntime({
    provider: { listMedia: async () => { await gate; return { items: [ITEM], fetchedAt: "2026-01-01T00:00:00.000Z" }; } },
    session: SESSION,
    selectedLibraryIds: ["lib"],
    refreshIntervalMs: 60_000,
    onStateChange: (s) => published.push(`${s.status}:${s.items.length}`)
  });
  runtime.start();
  runtime.dispose();
  const before = [...published];
  release();
  await new Promise((r) => setTimeout(r, 20));
  console.log("[dispose race] published before dispose:", before, "| after dispose:", published.slice(before.length));
}

// B) A refresh whose body never finishes blocks every later refresh (manual and scheduled)
{
  let calls = 0;
  const provider = createJellyfinMediaProvider({
    fetch: async (_input, init) => {
      calls += 1;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('{"Items":['));
          init?.signal?.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
        }
      });
      return new Response(stream, { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const runtime = createMediaIngestionRuntime({
    provider, session: SESSION, selectedLibraryIds: ["lib"], refreshIntervalMs: 100
  });
  runtime.start();
  await new Promise((r) => setTimeout(r, 500)); // 4-5 interval ticks
  const manual = await Promise.race([runtime.refreshNow().then(() => "resolved"), new Promise((r) => setTimeout(() => r("STILL-PENDING"), 200))]);
  console.log("[hung refresh] fetch calls after ~700ms with 100ms interval:", calls, "| status:", runtime.status, "| refreshNow():", manual);
  runtime.dispose();
}

// C) Raw fetch failure from listMedia is mapped to a non-retriable "unknown" error
{
  const provider = createJellyfinMediaProvider({ fetch: async () => { throw new TypeError("Failed to fetch"); } });
  const runtime = createMediaIngestionRuntime({ provider, session: SESSION, selectedLibraryIds: ["lib"] });
  const s = await runtime.refreshNow();
  console.log("[network failure in listMedia] ingestion error:", JSON.stringify(s.error));
  runtime.dispose();
}

// D) Truncated JSON on refresh -> "ready" with 0 items (glue treats this as: clear wall + clear persisted poster cache)
{
  const provider = createJellyfinMediaProvider({
    fetch: async () => new Response('{"Items":[{"Id":"a"', { status: 200, headers: { "content-type": "application/json" } })
  });
  const runtime = createMediaIngestionRuntime({ provider, session: SESSION, selectedLibraryIds: ["lib"] });
  const s = await runtime.refreshNow();
  console.log("[truncated JSON refresh] status:", s.status, "items:", s.items.length, "error:", s.error);
  runtime.dispose();
}
process.exit(0);
