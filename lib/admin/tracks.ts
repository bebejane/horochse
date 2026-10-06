import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { lookupBandcampUrl, bcTrack } from "@/lib/scrapers/bandcamp";
import { lookupSoundcloudUrl, scTrack } from "@/lib/scrapers/soundcloud";
import { trackArtistKey } from "@/lib/scrapers/text";
import type { TrackInput } from "@/lib/db/queries";
import { dedupeTracks } from "@/lib/db/merge-tracks";
import { db } from "@/lib/db/client";
import { events, trackOverrides, tracks } from "@/lib/db/schema";

export class AdminTrackError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

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

function musicHost(value: string): "bandcamp" | "soundcloud" | null {
  let host = "";
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === "bandcamp.com" || host.endsWith(".bandcamp.com")) return "bandcamp";
  if (host === "soundcloud.com" || host.endsWith(".soundcloud.com")) return "soundcloud";
  return null;
}

function toInput(raw: Record<string, unknown>): TrackInput {
  const num = (key: string) => {
    const value = raw[key];
    return typeof value === "number" ? value : null;
  };
  const str = (key: string) => {
    const value = raw[key];
    return typeof value === "string" && value ? value : null;
  };
  return {
    source: String(raw.source || ""),
    artist: str("artist"),
    album: str("album"),
    title: str("track"),
    url: str("url"),
    image: str("image"),
    bandId: num("band_id"),
    albumId: num("album_id"),
    trackId: num("track_id"),
    videoId: str("video_id"),
    type: str("type"),
  };
}

async function resolveMusicUrl(value: string): Promise<TrackInput> {
  const url = value.trim();
  const host = musicHost(url);
  if (!host) {
    throw new AdminTrackError("Klistra in en Bandcamp- eller SoundCloud-länk.");
  }
  try {
    const release =
      host === "bandcamp"
        ? await lookupBandcampUrl(url, new Map())
        : await lookupSoundcloudUrl(url, new Map());
    if (!release) throw new AdminTrackError("Ingen spelbar låt hittades på länken.");
    const item = toInput(host === "bandcamp" ? bcTrack(release) : scTrack(release));
    if (!item.source || !trackArtistKey(item.artist, item.title, item.url)) {
      throw new AdminTrackError("Länken saknar en låt som går att spara.");
    }
    return item;
  } catch (err) {
    if (err instanceof AdminTrackError) throw err;
    throw new AdminTrackError("Kunde inte läsa länken.");
  }
}

function rowToInput(row: typeof tracks.$inferSelect): TrackInput {
  return {
    source: row.source,
    artist: row.artist,
    album: row.album,
    title: row.title,
    url: row.url,
    image: row.image,
    bandId: row.bandId,
    albumId: row.albumId,
    trackId: row.trackId,
    videoId: row.videoId,
    type: row.type,
  };
}

function toAdminTrack(row: TrackInput, position: number): AdminTrack {
  return {
    position,
    source: row.source,
    artist: row.artist || "",
    title: row.title || "",
    url: row.url || "",
    bandId: row.bandId ?? null,
    albumId: row.albumId ?? null,
    trackId: row.trackId ?? null,
    videoId: row.videoId ?? null,
    type: row.type ?? null,
  };
}

async function loadRows(eventId: string) {
  const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new AdminTrackError("Konserten finns inte.", 404);
  return db.select().from(tracks).where(eq(tracks.eventId, eventId)).orderBy(asc(tracks.position));
}

function overrideWrite(eventId: string, artistKey: string, action: "remove" | "replace", item?: TrackInput) {
  const keep = action === "replace" ? item : undefined;
  return {
    eventId,
    artistKey,
    action,
    source: keep?.source ?? null,
    artist: keep?.artist ?? null,
    album: keep?.album ?? null,
    title: keep?.title ?? null,
    url: keep?.url ?? null,
    image: keep?.image ?? null,
    bandId: keep?.bandId ?? null,
    albumId: keep?.albumId ?? null,
    trackId: keep?.trackId ?? null,
    videoId: keep?.videoId ?? null,
    type: keep?.type ?? null,
    createdAt: new Date(),
  };
}

async function commit(
  eventId: string,
  next: TrackInput[],
  writes: ReturnType<typeof overrideWrite>[],
  extra: unknown[] = [],
) {
  const statements: unknown[] = [
    ...extra,
    db.delete(tracks).where(eq(tracks.eventId, eventId)),
  ];
  if (next.length) {
    statements.push(
      db.insert(tracks).values(
        next.map((item, position) => ({
          eventId,
          position,
          source: item.source,
          artist: item.artist ?? null,
          album: item.album ?? null,
          title: item.title ?? null,
          url: item.url ?? null,
          image: item.image ?? null,
          bandId: item.bandId ?? null,
          albumId: item.albumId ?? null,
          trackId: item.trackId ?? null,
          videoId: item.videoId ?? null,
          type: item.type ?? null,
        })),
      ),
    );
  }
  for (const row of writes) {
    statements.push(
      db
        .insert(trackOverrides)
        .values(row)
        .onConflictDoUpdate({
          target: [trackOverrides.eventId, trackOverrides.artistKey],
          set: {
            action: row.action,
            source: row.source,
            artist: row.artist,
            album: row.album,
            title: row.title,
            url: row.url,
            image: row.image,
            bandId: row.bandId,
            albumId: row.albumId,
            trackId: row.trackId,
            videoId: row.videoId,
            type: row.type,
            createdAt: row.createdAt,
          },
        }),
    );
  }
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  return next.map(toAdminTrack);
}

export async function replaceEventTrack(eventId: string, position: number, url: string): Promise<AdminTrack[]> {
  const rows = await loadRows(eventId);
  const current = rows[position];
  if (!current) throw new AdminTrackError("Låten finns inte.", 404);
  const item = await resolveMusicUrl(url);
  const currentKey = trackArtistKey(current.artist, current.title, current.url);
  if (!currentKey) throw new AdminTrackError("Låten saknar namn och kan inte bytas ut.");

  const overrides = await db.select().from(trackOverrides).where(eq(trackOverrides.eventId, eventId));
  const cover = overrides.find(
    (row) => row.action === "replace" && trackArtistKey(row.artist, row.title, row.url) === currentKey,
  );
  const key = cover?.artistKey || currentKey;
  const next = dedupeTracks(rows.map((row, index) => (index === position ? item : rowToInput(row))));
  const newKey = trackArtistKey(item.artist, item.title, item.url);
  const extra =
    newKey && newKey !== key
      ? [
          db
            .delete(trackOverrides)
            .where(and(eq(trackOverrides.eventId, eventId), eq(trackOverrides.artistKey, newKey), eq(trackOverrides.action, "remove"))),
        ]
      : [];
  return commit(eventId, next, [overrideWrite(eventId, key, "replace", item)], extra);
}

export async function addEventTrack(eventId: string, url: string): Promise<AdminTrack[]> {
  const rows = await loadRows(eventId);
  const item = await resolveMusicUrl(url);
  const key = trackArtistKey(item.artist, item.title, item.url);
  if (!key) throw new AdminTrackError("Länken saknar en låt som går att spara.");
  const next = dedupeTracks([item, ...rows.map(rowToInput)]);
  return commit(eventId, next, [overrideWrite(eventId, key, "replace", item)], [
    db
      .delete(trackOverrides)
      .where(and(eq(trackOverrides.eventId, eventId), eq(trackOverrides.artistKey, key), eq(trackOverrides.action, "remove"))),
  ]);
}

export async function removeEventTrack(eventId: string, position: number): Promise<AdminTrack[]> {
  const rows = await loadRows(eventId);
  const current = rows[position];
  if (!current) throw new AdminTrackError("Låten finns inte.", 404);
  const currentKey = trackArtistKey(current.artist, current.title, current.url);
  if (!currentKey) throw new AdminTrackError("Låten saknar namn och kan inte tas bort.");

  const overrides = await db.select().from(trackOverrides).where(eq(trackOverrides.eventId, eventId));
  const cover = overrides.find(
    (row) => row.action === "replace" && trackArtistKey(row.artist, row.title, row.url) === currentKey,
  );
  const writes = [overrideWrite(eventId, cover?.artistKey || currentKey, "remove")];
  if (cover && cover.artistKey !== currentKey) writes.push(overrideWrite(eventId, currentKey, "remove"));
  const next = rows.filter((_, index) => index !== position).map(rowToInput);
  return commit(eventId, next, writes);
}
