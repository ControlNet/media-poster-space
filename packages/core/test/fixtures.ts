import type { MediaItem, ProviderSession, VisualItem } from "../src";

export const validMediaItem: MediaItem = {
  id: "media-001",
  providerId: "provider-001",
  libraryId: "library-001",
  kind: "movie",
  title: "Arrival",
  sortTitle: "Arrival",
  overview: "A linguist communicates with extraterrestrial visitors.",
  year: 2016,
  runtimeMs: 6960000,
  communityRating: 8.2,
  criticRating: 9,
  genres: ["Sci-Fi", "Drama"],
  tags: ["first-contact"],
  people: ["Amy Adams", "Jeremy Renner"],
  poster: {
    url: "https://cdn.example.com/posters/arrival.jpg",
    width: 1000,
    height: 1500,
    dominantColor: "#224466"
  },
  backdrop: {
    url: "https://cdn.example.com/backdrops/arrival.jpg",
    width: 1920,
    height: 1080
  },
  dateAdded: "2026-02-23T12:00:00.000Z",
  dateUpdated: "2026-02-23T12:05:00.000Z",
  premiereDate: "2016-11-11T00:00:00.000Z"
};

export const validVisualItem: VisualItem = {
  id: "visual-001",
  mediaId: "media-001",
  title: "Arrival",
  subtitle: "2016",
  posterUrl: "https://cdn.example.com/posters/arrival.jpg",
  backdropUrl: "https://cdn.example.com/backdrops/arrival.jpg",
  accentColor: "#224466",
  primaryMeta: "Sci-Fi",
  secondaryMeta: "8.2"
};

export const validProviderSession: ProviderSession = {
  providerId: "provider-001",
  serverUrl: "https://media.example.com",
  userId: "user-001",
  username: "dune",
  accessToken: "token-001",
  refreshToken: "refresh-001",
  createdAt: "2026-02-23T12:00:00.000Z",
  expiresAt: "2026-02-23T13:00:00.000Z"
};
