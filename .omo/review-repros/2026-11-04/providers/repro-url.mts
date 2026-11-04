// Throwaway repro: URL normalisation + mixed-content classification in the Jellyfin/Emby client.
import {
  createJellyfinMediaProvider,
  createEmbyMediaProvider
} from "../../../../packages/core/src/providers/jellyfin/client.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const seen: string[] = [];
const recordingFetch = async (input: URL | RequestInfo): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  seen.push(url);
  if (url.endsWith("/System/Info/Public")) return json({ Version: "10.10.3", ProductName: "Jellyfin Server" });
  if (url.endsWith("/Users/AuthenticateByName")) return json({}, 401);
  return new Response(null, { status: 404 });
};

// 1) Subpath-mounted server (Jellyfin "Base URL" = /jellyfin)
for (const serverUrl of ["https://media.example.com/jellyfin", "https://media.example.com/jellyfin/"]) {
  seen.length = 0;
  const p = createJellyfinMediaProvider({ fetch: recordingFetch });
  const r = await p.preflight({ serverUrl });
  console.log("[subpath jellyfin]", serverUrl, "-> requested:", seen, "ok:", r.ok);
}
seen.length = 0;
await createEmbyMediaProvider({ fetch: recordingFetch }).preflight({ serverUrl: "https://media.example.com/emby-proxy" });
console.log("[subpath emby] -> requested:", seen);

// image URL with subpath
const imgFetch = async (input: URL | RequestInfo): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes("/Items")) return json({ Items: [{ Id: "abc", Name: "X", Type: "Movie", ImageTags: { Primary: "t" } }], TotalRecordCount: 1 });
  return new Response(null, { status: 404 });
};
const page = await createJellyfinMediaProvider({ fetch: imgFetch }).listMedia(
  { providerId: "jellyfin", serverUrl: "https://media.example.com/jellyfin", userId: "u1", username: "u", accessToken: "SECRET-TOKEN", createdAt: "2026-01-01T00:00:00.000Z" },
  { libraryIds: ["lib"] }
);
console.log("[subpath poster url]", page.items[0]?.poster.url, "| contains token:", page.items[0]?.poster.url.includes("SECRET-TOKEN"));

// 2) Missing scheme
for (const serverUrl of ["192.168.1.10:8096", "jellyfin.local:8096", "localhost:8096"]) {
  seen.length = 0;
  const r = await createJellyfinMediaProvider({ fetch: recordingFetch }).preflight({ serverUrl, origin: "https://controlnet.github.io" });
  console.log("[no scheme]", serverUrl, "-> fetch calls:", seen.length, "result:", JSON.stringify(r));
}

// 3) Mixed content: HTTPS page origin + http LAN server; browser rejects fetch with TypeError("Failed to fetch")
seen.length = 0;
const mixedFetch = async (input: URL | RequestInfo): Promise<Response> => {
  seen.push(String(input));
  throw new TypeError("Failed to fetch");
};
const mixed = await createJellyfinMediaProvider({ fetch: mixedFetch }).preflight({
  serverUrl: "http://192.168.1.10:8096",
  origin: "https://controlnet.github.io"
});
console.log("[mixed content] fetch attempted:", seen.length, "result:", JSON.stringify(mixed));
