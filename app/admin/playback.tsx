"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { streamRequest } from "@/lib/events";
import type { Track } from "@/lib/types";

const LIMIT_S = 30;
const FADE_S = 2;
const SC_IDLE =
  "https://w.soundcloud.com/player/?auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false";

export type PlayableTrack = {
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

type ScWidget = {
  play: () => void;
  setVolume: (n: number) => void;
};

type ScApi = {
  (el: HTMLIFrameElement): ScWidget;
};

function asTrack(track: PlayableTrack): Track {
  return {
    source: track.source,
    artist: track.artist,
    track: track.title,
    url: track.url,
    band_id: track.bandId ?? undefined,
    album_id: track.albumId ?? undefined,
    track_id: track.trackId ?? undefined,
    video_id: track.videoId ?? undefined,
    type: track.type ?? undefined,
    preview: track.source === "deezer" ? true : undefined,
  };
}

export function canPlay(track: PlayableTrack): boolean {
  const req = streamRequest(asTrack(track));
  if (!req) return false;
  if (req.source === "bandcamp") return Boolean(track.bandId && track.albumId);
  if (req.source === "soundcloud") return Boolean(track.trackId || track.url);
  if (req.source === "youtube") return Boolean(track.videoId);
  if (req.source === "deezer") return Boolean(track.trackId);
  return false;
}

function widgetSrc(url: string): string {
  return (
    "https://w.soundcloud.com/player/?url=" +
    encodeURIComponent(url) +
    "&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false"
  );
}

function loadSoundCloud(): Promise<ScApi> {
  const existing = (window as unknown as { SC?: { Widget?: ScApi } }).SC?.Widget;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.onload = () => {
      const widget = (window as unknown as { SC?: { Widget?: ScApi } }).SC?.Widget;
      if (widget) resolve(widget);
      else reject(new Error("widget"));
    };
    script.onerror = () => reject(new Error("widget"));
    document.head.appendChild(script);
  });
}

export function useAdminPlayback() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ytRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const [currentKey, setCurrentKey] = useState("");
  const [loadingKey, setLoadingKey] = useState("");
  const [error, setError] = useState("");

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }, []);

  const halt = useCallback(() => {
    clearTimers();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.volume = 1;
    }
    const iframe = iframeRef.current;
    if (iframe && iframe.src !== SC_IDLE) iframe.src = SC_IDLE;
    if (ytRef.current) ytRef.current.replaceChildren();
  }, [clearTimers]);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    halt();
    setCurrentKey("");
    setLoadingKey("");
  }, [halt]);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      setCurrentKey("");
      setLoadingKey("");
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, []);

  const armLimit = useCallback((token: number, read: () => number, fade?: (level: number) => void) => {
    const started = performance.now();
    const tick = window.setInterval(() => {
      if (token !== tokenRef.current) {
        window.clearInterval(tick);
        return;
      }
      const media = read();
      const elapsed = media > 0 ? media : (performance.now() - started) / 1000;
      if (elapsed >= LIMIT_S) {
        window.clearInterval(tick);
        stop();
        return;
      }
      if (fade && elapsed >= LIMIT_S - FADE_S) {
        fade(Math.max(0, (LIMIT_S - elapsed) / FADE_S));
      }
    }, 200);
    timersRef.current.push(tick);
  }, [stop]);

  const toggle = useCallback(async (key: string, track: PlayableTrack) => {
    if (currentKey === key || loadingKey === key) {
      stop();
      return;
    }
    const token = ++tokenRef.current;
    halt();
    setError("");
    setCurrentKey("");
    setLoadingKey(key);
    const req = streamRequest(asTrack(track));
    if (!req || !canPlay(track)) {
      setLoadingKey("");
      setError("Den här låten går inte att spela.");
      return;
    }
    try {
      if (req.source === "youtube" && req.videoId && /^[\w-]{6,}$/.test(req.videoId) && ytRef.current) {
        const frame = document.createElement("iframe");
        frame.src = `https://www.youtube.com/embed/${encodeURIComponent(req.videoId)}?autoplay=1`;
        frame.allow = "autoplay";
        frame.title = "YouTube";
        ytRef.current.replaceChildren(frame);
        if (token !== tokenRef.current) return;
        setLoadingKey("");
        setCurrentKey(key);
        armLimit(token, () => 0);
        return;
      }
      const iframe = iframeRef.current;
      if (req.source === "soundcloud" && track.url && iframe) iframe.src = widgetSrc(track.url);
      const res = await fetch(req.href, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (token !== tokenRef.current) return;
      const audio = audioRef.current;
      if (data?.stream && audio) {
        audio.src = data.stream;
        audio.volume = 1;
        await audio.play();
        if (token !== tokenRef.current) {
          audio.pause();
          return;
        }
        if (iframe && iframe.src !== SC_IDLE) iframe.src = SC_IDLE;
        setLoadingKey("");
        setCurrentKey(key);
        armLimit(token, () => audioRef.current?.currentTime || 0, (level) => {
          if (audioRef.current) audioRef.current.volume = level;
        });
        return;
      }
      if (req.source === "soundcloud" && track.url && iframe) {
        setLoadingKey("");
        setCurrentKey(key);
        armLimit(token, () => 0, (level) => {
          const widgetApi = (window as unknown as { SC?: { Widget?: ScApi } }).SC?.Widget;
          if (!widgetApi || !iframeRef.current) return;
          try { widgetApi(iframeRef.current).setVolume(Math.round(level * 100)); } catch { /* widget inte redo */ }
        });
        void loadSoundCloud().catch(() => {});
        return;
      }
      setLoadingKey("");
      setError("Kunde inte spela låten.");
    } catch {
      if (token !== tokenRef.current) return;
      const iframe = iframeRef.current;
      if (req.source === "soundcloud" && track.url && iframe && iframe.src !== SC_IDLE) {
        setLoadingKey("");
        setCurrentKey(key);
        armLimit(token, () => 0, (level) => {
          const widgetApi = (window as unknown as { SC?: { Widget?: ScApi } }).SC?.Widget;
          if (!widgetApi || !iframeRef.current) return;
          try { widgetApi(iframeRef.current).setVolume(Math.round(level * 100)); } catch { /* widget inte redo */ }
        });
        return;
      }
      halt();
      setLoadingKey("");
      setCurrentKey("");
      setError("Kunde inte spela låten.");
    }
  }, [armLimit, currentKey, halt, loadingKey, stop]);

  return { audioRef, iframeRef, ytRef, currentKey, loadingKey, error, toggle, stop };
}
