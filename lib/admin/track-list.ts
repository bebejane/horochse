export type AdminTrack = {
  position: number;
  source: string;
  artist: string;
  title: string;
  url: string;
  bandId: number | null;
  albumId: number | null;
  trackId: number | null;
  videoId: string | null;
  type: string | null;
};

export function ärBandcampSpår(track: {
  source?: string | null;
  url?: string | null;
  bandId?: number | null;
  albumId?: number | null;
}): boolean {
  if (track.source === "bandcamp" || (!track.source && track.bandId && track.albumId)) return true;
  if (!track.url || !URL.canParse(track.url)) return false;
  const host = new URL(track.url).hostname;
  return host === "bandcamp.com" || host.endsWith(".bandcamp.com");
}
