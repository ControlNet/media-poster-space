// Throwaway repro: provider output vs validation contract; contract leniency.
import { createJellyfinMediaProvider } from "../../../../packages/core/src/providers/jellyfin/client.ts";
import { validateMediaItem, validateProviderSession } from "../../../../packages/core/src/validation/contracts.ts";

const SESSION = {
  providerId: "jellyfin", serverUrl: "https://jf.local", userId: "u1", username: "u",
  accessToken: "SECRET-TOKEN", createdAt: "2026-01-01T00:00:00.000Z"
};

// Jellyfin CriticRating is a Rotten Tomatoes percentage (0-100); CommunityRating is 0-10.
const provider = createJellyfinMediaProvider({
  fetch: async () => new Response(JSON.stringify({
    Items: [{ Id: "a", Name: "Arrival", Type: "Movie", CriticRating: 94, CommunityRating: 7.9, ImageTags: { Primary: "t" } }],
    TotalRecordCount: 1
  }), { status: 200, headers: { "content-type": "application/json" } })
});
const page = await provider.listMedia(SESSION, { libraryIds: ["lib"] });
const v = validateMediaItem(page.items[0]);
console.log("[provider item vs contract] ok:", v.ok, v.ok ? "" : JSON.stringify(v.errors));

// Genres with non-string entries pass straight through the provider (Array.isArray only)
const p2 = createJellyfinMediaProvider({
  fetch: async () => new Response(JSON.stringify({
    Items: [{ Id: "b", Name: "B", Type: "Movie", Genres: [42, null], ImageTags: { Primary: "t" } }], TotalRecordCount: 1
  }), { status: 200, headers: { "content-type": "application/json" } })
});
const page2 = await p2.listMedia(SESSION, { libraryIds: ["lib"] });
console.log("[non-string genres] provider emitted genres:", JSON.stringify(page2.items[0]?.genres),
  "| visual primaryMeta:", JSON.stringify(p2.toVisualItems(page2.items)[0]?.primaryMeta));

// Session contract: whitespace-only serverUrl / non-URL serverUrl
console.log("[session contract] non-URL serverUrl accepted:",
  validateProviderSession({ ...SESSION, serverUrl: "not a url" }).ok);
process.exit(0);
