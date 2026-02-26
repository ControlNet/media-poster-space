export type MediaKind =
  | "movie"
  | "series"
  | "season"
  | "episode"
  | "collection"
  | "music-video"
  | "other";

export interface ArtworkImage {
  url: string;
  width?: number;
  height?: number;
  dominantColor?: string;
}

export interface MediaItem {
  id: string;
  providerId: string;
  libraryId: string;
  kind: MediaKind;
  title: string;
  sortTitle?: string;
  originalTitle?: string;
  overview?: string;
  year?: number;
  runtimeMs?: number;
  communityRating?: number;
  criticRating?: number;
  genres: string[];
  tags: string[];
  people: string[];
  poster: ArtworkImage;
  backdrop?: ArtworkImage;
  logo?: ArtworkImage;
  dateAdded?: string;
  dateUpdated?: string;
  premiereDate?: string;
}

export interface VisualItem {
  id: string;
  mediaId: MediaItem["id"];
  title: string;
  subtitle?: string;
  posterUrl: string;
  backdropUrl?: string;
  accentColor?: string;
  primaryMeta?: string;
  secondaryMeta?: string;
}
