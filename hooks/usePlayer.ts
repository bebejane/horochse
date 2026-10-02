"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/dates";
import { artistExploreUrl, playlistFrom, streamRequest, trackExploreUrl } from "@/lib/events";
import type { ConcertEvent, PlaylistItem, StreamPayload } from "@/lib/types";

const SOUNDCLOUD_VOLUME = 0.75;
const STREAM_CACHE_MS = 4 * 60 * 1000;
const STREAM_CACHE_MAX = 16;
const SC_WIDGET_IDLE =
  "https://w.soundcloud.com/player/?auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false";

type StreamCacheEntry = {
  at: number;
  data?: StreamPayload;
  inflight?: Promise<StreamPayload | null>;
};

type ScWidget = {
  bind: (event: string, fn: (data?: { currentPosition?: number; relativePosition?: number }) => void) => void;
  play: () => void;
  pause: () => void;
  load: (url: string, opts?: { auto_play?: boolean }) => void;
  seekTo: (ms: number) => void;
  setVolume: (n: number) => void;
  getDuration: (cb: (ms: number) => void) => void;
};

type ScApi = {
  (el: HTMLIFrameElement): ScWidget;
  Events: { READY: string; PLAY: string; PAUSE: string; FINISH: string; PLAY_PROGRESS: string };
};

type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  loadVideoById: (id: string) => void;
  getDuration: () => number;
  getCurrentTime: () => number;
  destroy: () => void;
};

type YtApi = {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YtPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
};

declare global {
  interface Window {
    SC?: { Widget: ScApi };
    YT?: YtApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type NowPlayingData = {
  artist: string;
  album?: string;
  track: string;
  url: string;
  artistUrl?: string;
  trackUrl?: string;
  image: string;
  source: string;
  /** Deezer tracks play a 30 s preview, not the full track. */
  preview?: boolean;
};

type PlayerOpts = {
  events: ConcertEvent[];
  onNeedScroll?: (event: ConcertEvent) => void;
};

export function usePlayer({ events, onNeedScroll }: PlayerOpts) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const streamCacheRef = useRef<Map<string, StreamCacheEntry>>(new Map());
  const hoverTimerRef = useRef<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const widgetRef = useRef<ScWidget | null>(null);
  const widgetApiRef = useRef<ScApi | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YtPlayer | null>(null);
  const ytApiRef = useRef<Promise<YtApi> | null>(null);
  const ytPlayingRef = useRef(false);
  const ytVideoRef = useRef("");
  const tokenRef = useRef(0);
  const skipGuardRef = useRef(0);
  const hideTimerRef = useRef<number | null>(null);
  const indexRef = useRef(-1);
  const eventIdRef = useRef("");
  const itemKeyRef = useRef("");
  const sourceRef = useRef("");
  const modeRef = useRef<"audio" | "widget" | "yt">("audio");
  const scPlayingRef = useRef(false);
  const scDurationRef = useRef(0);
  const scPositionRef = useRef(0);
  const scUrlRef = useRef("");
  const scReadyRef = useRef<Promise<ScApi> | null>(null);
  const scrubbingRef = useRef(false);
  const pauseRequestedRef = useRef(false);
  // Bumped on every track switch. Async widget/YouTube callbacks capture the
  // value at load time and bail if it changed, so a superseded track can never
  // restart playback after the user has switched.
  const widgetGenRef = useRef(0);
  const ytGenRef = useRef(0);
  // Generation of the widget load that is allowed to auto-play on READY.
  const scLoadGenRef = useRef(-1);
  const playlistRef = useRef<PlaylistItem[]>([]);
  const onNeedScrollRef = useRef(onNeedScroll);
  const playAtRef = useRef<(index: number, fromSkip: boolean) => void>(() => {});
  const preloadIndexRef = useRef<(index: number) => void>(() => {});
  const barOnRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [eventId, setEventId] = useState("");
  const [trackIndex, setTrackIndex] = useState(-1);
  const [itemKey, setItemKey] = useState("");
  const [barOn, setBarOn] = useState(false);
  const [barHidden, setBarHidden] = useState(true);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
  const [progress, setProgress] = useState({ ratio: 0, current: 0, duration: 0 });
  const [loadingId, setLoadingId] = useState("");

  playlistRef.current = playlistFrom(events);
  onNeedScrollRef.current = onNeedScroll;

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    const preload = new Audio();
    preload.preload = "auto";
    preload.muted = true;
    preloadAudioRef.current = preload;
    const onEnded = () => {
      if (indexRef.current < 0) return;
      playAtRef.current(indexRef.current + 1, true);
    };
    const onPlay = () => syncPlaying();
    const onPause = () => syncPlaying();
    const onTime = () => updateProgress();
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onTime);
    audio.addEventListener("loadedmetadata", onTime);
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onTime);
      audio.removeEventListener("loadedmetadata", onTime);
      preload.pause();
      preload.removeAttribute("src");
      try { preload.load(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPlaying = useCallback(() => {
    if (modeRef.current === "widget") return !!scPlayingRef.current;
    if (modeRef.current === "yt") return !!ytPlayingRef.current;
    return !!(audioRef.current && !audioRef.current.paused);
  }, []);

  const mediaDuration = useCallback(() => {
    if (modeRef.current === "widget") {
      return scDurationRef.current > 0 ? scDurationRef.current / 1000 : 0;
    }
    if (modeRef.current === "yt") {
      const duration = ytPlayerRef.current?.getDuration?.() || 0;
      return duration && isFinite(duration) && duration > 0 ? duration : 0;
    }
    const duration = audioRef.current?.duration || 0;
    return duration && isFinite(duration) && duration > 0 ? duration : 0;
  }, []);

  const mediaCurrent = useCallback(() => {
    if (modeRef.current === "widget") return (scPositionRef.current || 0) / 1000;
    if (modeRef.current === "yt") return ytPlayerRef.current?.getCurrentTime?.() || 0;
    return audioRef.current?.currentTime || 0;
  }, []);

  const syncPlaying = useCallback(() => {
    setPlaying(isPlaying());
    setEventId(eventIdRef.current);
    setItemKey(itemKeyRef.current);
    const item = indexRef.current >= 0 ? playlistRef.current[indexRef.current] : null;
    setTrackIndex(item ? item.i : -1);
  }, [isPlaying]);

  const applyPlaybackVolume = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.volume = sourceRef.current === "soundcloud" && modeRef.current === "audio" ? SOUNDCLOUD_VOLUME : 1;
    }
    if (widgetRef.current && modeRef.current === "widget") {
      try { widgetRef.current.setVolume(Math.round(SOUNDCLOUD_VOLUME * 100)); } catch { /* ignore */ }
    }
    if (ytPlayerRef.current && modeRef.current === "yt") {
      try { ytPlayerRef.current.setVolume(100); } catch { /* ignore */ }
    }
  }, []);

  const updateProgress = useCallback(() => {
    if (scrubbingRef.current) return;
    const duration = mediaDuration();
    const t = mediaCurrent();
    const ratio = duration > 0 ? t / duration : 0;
    setProgress({ ratio, current: t, duration });
  }, [mediaCurrent, mediaDuration]);

  const applyProgress = useCallback((ratio: number, duration = mediaDuration()) => {
    ratio = Math.min(1, Math.max(0, ratio));
    const t = duration ? ratio * duration : mediaCurrent();
    setProgress({ ratio, current: t, duration });
  }, [mediaCurrent, mediaDuration]);

  // The YouTube player emits no progress event; poll it while it is the
  // active mode so the now-playing bar keeps up.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (modeRef.current !== "yt") return;
      updateProgress();
    }, 500);
    return () => window.clearInterval(id);
  }, [updateProgress]);

  const showNowPlaying = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    barOnRef.current = true;
    setBarHidden(false);
    setBarOn(true);
  }, []);

  const hideNowPlaying = useCallback(() => {
    barOnRef.current = false;
    setBarOn(false);
    hideTimerRef.current = window.setTimeout(() => {
      if (!barOnRef.current) setBarHidden(true);
      hideTimerRef.current = null;
    }, 450);
  }, []);

  const pauseHtmlAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    try { audio.load(); } catch { /* ignore */ }
  }, []);

  const pauseWidget = useCallback(() => {
    // Invalidate any in-flight widget load so its READY handler can't auto-play.
    widgetGenRef.current += 1;
    pauseRequestedRef.current = true;
    scPlayingRef.current = false;
    if (widgetRef.current) {
      try { widgetRef.current.pause(); } catch { /* ignore */ }
      return;
    }
    const iframe = iframeRef.current;
    if (iframe && iframe.src && iframe.src !== SC_WIDGET_IDLE) {
      iframe.src = SC_WIDGET_IDLE;
    }
  }, []);

  const loadScApi = useCallback(() => {
    if (window.SC && window.SC.Widget) return Promise.resolve(window.SC.Widget);
    if (scReadyRef.current) return scReadyRef.current;
    scReadyRef.current = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://w.soundcloud.com/player/api.js";
      script.onload = () => {
        if (window.SC && window.SC.Widget) resolve(window.SC.Widget);
        else reject(new Error("widget"));
      };
      script.onerror = () => {
        scReadyRef.current = null;
        reject(new Error("widget"));
      };
      document.head.appendChild(script);
    });
    return scReadyRef.current;
  }, []);

  const widgetSrc = useCallback((url: string) => {
    return "https://w.soundcloud.com/player/?url=" + encodeURIComponent(url) +
      "&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false";
  }, []);

  const markWidgetPlaying = useCallback(() => {
    pauseRequestedRef.current = false;
    scPlayingRef.current = true;
    syncPlaying();
  }, [syncPlaying]);

  const bindScWidget = useCallback((Widget: ScApi) => {
    if (widgetRef.current) return widgetRef.current;
    const iframe = iframeRef.current;
    if (!iframe) throw new Error("widget");
    const widget = Widget(iframe);
    widgetApiRef.current = Widget;
    widgetRef.current = widget;
    widget.bind(Widget.Events.READY, () => {
      applyPlaybackVolume();
      // Only auto-play if this is still the load that was requested last; a
      // stale READY from a superseded track must not restart audio after the
      // user has switched to another track.
      if (scLoadGenRef.current !== widgetGenRef.current || modeRef.current !== "widget" || !scUrlRef.current) return;
      try { widget.play(); } catch { /* ignore */ }
    });
    widget.bind(Widget.Events.PLAY, () => {
      scPlayingRef.current = true;
      applyPlaybackVolume();
      widget.getDuration((ms) => {
        scDurationRef.current = ms || scDurationRef.current || 0;
      });
      if (modeRef.current === "widget") {
        showNowPlaying();
        syncPlaying();
      }
    });
    widget.bind(Widget.Events.PAUSE, () => {
      if (modeRef.current !== "widget") return;
      if (!pauseRequestedRef.current) return;
      scPlayingRef.current = false;
      syncPlaying();
    });
    widget.bind(Widget.Events.FINISH, () => {
      scPlayingRef.current = false;
      if (modeRef.current !== "widget" || indexRef.current < 0) return;
      playAtRef.current(indexRef.current + 1, true);
    });    widget.bind(Widget.Events.PLAY_PROGRESS, (data) => {
      scPositionRef.current = data?.currentPosition || 0;
      if (data?.currentPosition && scDurationRef.current <= 0 && data.relativePosition) {
        scDurationRef.current = data.currentPosition / data.relativePosition;
      }
      if (modeRef.current === "widget") updateProgress();
    });
    return widget;
  }, [applyPlaybackVolume, showNowPlaying, syncPlaying, updateProgress]);

  const loadYtApi = useCallback(() => {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (ytApiRef.current) return ytApiRef.current;
    ytApiRef.current = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT && window.YT.Player) resolve(window.YT);
        else reject(new Error("yt"));
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => {
        ytApiRef.current = null;
        reject(new Error("yt"));
      };
      document.head.appendChild(script);
    });
    return ytApiRef.current;
  }, []);

  const markYtPlaying = useCallback(() => {
    pauseRequestedRef.current = false;
    ytPlayingRef.current = true;
    syncPlaying();
  }, [syncPlaying]);

  const ensureYtPlayer = useCallback((): Promise<YtPlayer> => {
    if (ytPlayerRef.current) return Promise.resolve(ytPlayerRef.current);
    return loadYtApi().then(
      (YT) =>
        new Promise<YtPlayer>((resolve) => {
          const el = ytContainerRef.current;
          if (!el) throw new Error("yt");
          const player = new YT.Player(el, {
            width: "1",
            height: "1",
            playerVars: {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              playsinline: 1,
              rel: 0,
              origin: window.location.origin,
            },
            events: {
              onReady: () => {
                ytPlayerRef.current = player;
                applyPlaybackVolume();
                resolve(player);
              },
              onStateChange: (event: { data: number }) => {
                const S = YT.PlayerState;
                if (event.data === S.PLAYING) {
                  ytPlayingRef.current = true;
                  if (modeRef.current === "yt") {
                    showNowPlaying();
                    syncPlaying();
                  }
                } else if (event.data === S.PAUSED) {
                  ytPlayingRef.current = false;
                  if (modeRef.current === "yt") syncPlaying();
                } else if (event.data === S.ENDED) {
                  ytPlayingRef.current = false;
                  if (modeRef.current === "yt" && indexRef.current >= 0) {
                    playAtRef.current(indexRef.current + 1, true);
                  }
                }
              },
            },
          });
        }),
    );
  }, [applyPlaybackVolume, loadYtApi, showNowPlaying, syncPlaying]);

  const pauseYt = useCallback(() => {
    pauseRequestedRef.current = true;
    ytPlayingRef.current = false;
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.pauseVideo(); } catch { /* ignore */ }
    }
  }, []);

  const playYt = useCallback((videoId: string, token: number): Promise<void> => {
    const gen = widgetGenRef.current + 1;
    ytGenRef.current = gen;
    return ensureYtPlayer().then((player) => {
      if (token !== tokenRef.current || gen !== ytGenRef.current) return;
      ytVideoRef.current = videoId;
      modeRef.current = "yt";
      pauseHtmlAudio();
      pauseWidget();
      markYtPlaying();
      applyPlaybackVolume();
      player.loadVideoById(videoId);
    });
  }, [applyPlaybackVolume, ensureYtPlayer, markYtPlaying, pauseHtmlAudio, pauseWidget]);

  const playWidget = useCallback((url: string, token: number) => {
    const gen = widgetGenRef.current + 1;
    widgetGenRef.current = gen;
    scLoadGenRef.current = gen;
    return loadScApi().then((Widget) => {
      if (token !== tokenRef.current || gen !== widgetGenRef.current) return;
      const widget = bindScWidget(Widget);
      scUrlRef.current = url;
      scPositionRef.current = 0;
      scDurationRef.current = 0;
      markWidgetPlaying();
      const iframe = iframeRef.current;
      const primed = iframe && iframe.src.indexOf(encodeURIComponent(url)) !== -1;
      if (primed) {
        try { widget.play(); } catch { /* ignore */ }
        return;
      }
      widget.load(url, { auto_play: true });
    });
  }, [bindScWidget, loadScApi, markWidgetPlaying]);

  const peekStream = useCallback((href: string) => {
    const entry = streamCacheRef.current.get(href);
    if (!entry?.data) return null;
    if (Date.now() - entry.at > STREAM_CACHE_MS) return null;
    return entry.data;
  }, []);

  const resolveStream = useCallback((href: string) => {
    const cached = peekStream(href);
    if (cached) return Promise.resolve(cached);
    const existing = streamCacheRef.current.get(href);
    if (existing?.inflight) return existing.inflight;
    const inflight = fetch(href, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("stream");
        return res.json() as Promise<StreamPayload>;
      })
      .then((data) => {
        if (!data || data.error || (!data.stream && !data.widget)) throw new Error("stream");
        const cache = streamCacheRef.current;
        cache.set(href, { at: Date.now(), data });
        if (cache.size > STREAM_CACHE_MAX) {
          const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
          if (oldest) cache.delete(oldest[0]);
        }
        return data;
      })
      .catch(() => {
        streamCacheRef.current.delete(href);
        return null;
      });
    streamCacheRef.current.set(href, { at: Date.now(), inflight });
    return inflight;
  }, [peekStream]);

  const warmMedia = useCallback((stream: string) => {
    if (!stream) return;
    const current = audioRef.current;
    if (current && current.src === stream) return;
    const preload = preloadAudioRef.current;
    if (!preload || preload.src === stream) return;
    preload.src = stream;
    try { preload.load(); } catch { /* ignore */ }
  }, []);

  const primeWidget = useCallback((url: string) => {
    if (!url) return;
    if (isPlaying() || indexRef.current >= 0) return;
    const iframe = iframeRef.current;
    if (iframe && iframe.src.indexOf(encodeURIComponent(url)) !== -1) return;
    void loadScApi().then((Widget) => {
      if (isPlaying() || indexRef.current >= 0) return;
      const widget = bindScWidget(Widget);
      if (iframeRef.current && iframeRef.current.src.indexOf(encodeURIComponent(url)) !== -1) return;
      widget.load(url, { auto_play: false });
    }).catch(() => {});
  }, [bindScWidget, isPlaying, loadScApi]);

  const preloadIndex = useCallback((index: number) => {
    const list = playlistRef.current;
    if (!list.length) return;
    const n = list.length;
    index = ((index % n) + n) % n;
    const req = streamRequest(list[index]?.track);
    if (!req || !req.href) return;
    void resolveStream(req.href).then((data) => {
      if (!data) return;
      const next = indexRef.current >= 0 ? list[(indexRef.current + 1) % n] : null;
      const isNext = !!(next && streamRequest(next.track)?.href === req.href);
      if (data.stream && (indexRef.current < 0 || isNext)) warmMedia(data.stream);
      if (req.source === "soundcloud" && (data.url || req.fallback)) {
        primeWidget(data.url || req.fallback);
      }
    });
  }, [primeWidget, resolveStream, warmMedia]);

  preloadIndexRef.current = preloadIndex;

  useEffect(() => {
    loadScApi()
      .then((Widget) => {
        try { bindScWidget(Widget); } catch { /* ignore */ }
      })
      .catch(() => {});
  }, [bindScWidget, loadScApi]);

  const fillNowPlaying = useCallback((data: NowPlayingData) => {
    const media = { url: data.url };
    setNowPlaying({
      ...data,
      artistUrl: data.artistUrl || artistExploreUrl(media),
      trackUrl: data.trackUrl || trackExploreUrl(media),
    });
    applyProgress(0);
  }, [applyProgress]);

  const stopPlay = useCallback(() => {
    indexRef.current = -1;
    eventIdRef.current = "";
    itemKeyRef.current = "";
    skipGuardRef.current = 0;
    tokenRef.current += 1;
    sourceRef.current = "";
    modeRef.current = "audio";
    pauseWidget();
    pauseHtmlAudio();
    pauseYt();
    hideNowPlaying();
    setLoadingId("");
    syncPlaying();
  }, [hideNowPlaying, pauseHtmlAudio, pauseWidget, pauseYt, syncPlaying]);

  const pausePlay = useCallback(() => {
    if (modeRef.current === "widget") pauseWidget();
    else if (modeRef.current === "yt") pauseYt();
    else audioRef.current?.pause();
    syncPlaying();
  }, [pauseWidget, pauseYt, syncPlaying]);

  const seekToRatio = useCallback((ratio: number) => {
    const duration = mediaDuration();
    ratio = Math.min(1, Math.max(0, ratio));
    applyProgress(ratio, duration);
    if (!duration) return;
    if (modeRef.current === "widget" && widgetRef.current) {
      scPositionRef.current = ratio * scDurationRef.current;
      widgetRef.current.seekTo(scPositionRef.current);
      return;
    }
    if (modeRef.current === "yt" && ytPlayerRef.current) {
      try { ytPlayerRef.current.seekTo(ratio * duration, true); } catch { /* ignore */ }
      return;
    }
    if (audioRef.current) audioRef.current.currentTime = ratio * duration;
  }, [applyProgress, mediaDuration]);

  const playAt = useCallback((index: number, fromSkip: boolean) => {
    const list = playlistRef.current;
    if (!list.length) {
      stopPlay();
      return;
    }
    const n = list.length;
    index = ((index % n) + n) % n;
    const item = list[index];
    const event = item.event;
    const track = item.track;
    const req = streamRequest(track);
    indexRef.current = index;
    eventIdRef.current = event.id;
    itemKeyRef.current = item.key;
    const token = ++tokenRef.current;
    // Stop whatever is playing *now*, before any async stream resolution, so
    // switching tracks never leaves the previous audio running under the new
    // title/thumbnail while the next stream is fetched.
    pauseHtmlAudio();
    pauseWidget();
    pauseYt();
    onNeedScrollRef.current?.(event);
    preloadIndexRef.current(index + 1);
    if (!req) {
      if (fromSkip && skipGuardRef.current < n) {
        skipGuardRef.current += 1;
        playAt(index + 1, true);
        return;
      }
      stopPlay();
      return;
    }
    sourceRef.current = req.source;
    // YouTube needs no stream resolution: the embedded player takes the id.
    if (req.source === "youtube") {
      fillNowPlaying({
        artist: track.artist || "",
        track: track.track || "",
        url: track.url || req.fallback,
        image: track.image || "",
        source: "youtube",
      });
      showNowPlaying();
      onNeedScrollRef.current?.(event);
      setLoadingId(event.id);
      void playYt(req.videoId || "", token)
        .then(() => {
          if (token !== tokenRef.current) return;
          setLoadingId("");
          skipGuardRef.current = 0;
          showNowPlaying();
          syncPlaying();
        })
        .catch(() => {
          if (token !== tokenRef.current) return;
          setLoadingId("");
          if (skipGuardRef.current < n) {
            skipGuardRef.current += 1;
            playAt(index + 1, true);
            return;
          }
          skipGuardRef.current = 0;
          stopPlay();
        });
      return;
    }
    const cached = peekStream(req.href);
    const startFromPayload = (data: StreamPayload) => {
      if (token !== tokenRef.current) return Promise.resolve();
      setLoadingId("");
      if (!data || (!data.stream && !data.widget)) throw new Error("stream");
      skipGuardRef.current = 0;
      fillNowPlaying({
        artist: data.artist || track.artist || "",
        album: data.album || track.album,
        track: data.track || track.track || "",
        url: data.url || track.url || "",
        image: data.image || track.image || "",
        source: req.source,
        preview: req.source === "deezer" || Boolean(track?.preview),
      });
      const startWidget = () => {
        const url = data.url || req.fallback;
        if (req.source !== "soundcloud" || (!data.widget && !url)) throw new Error("stream");
        modeRef.current = "widget";
        pauseHtmlAudio();
        pauseYt();
        markWidgetPlaying();
        if (widgetRef.current) {
          try { widgetRef.current.play(); } catch { /* ignore */ }
          return Promise.resolve();
        }
        return playWidget(url, token);
      };
      if (data.stream && audioRef.current) {
        modeRef.current = "audio";
        pauseYt();
        audioRef.current.src = data.stream;
        applyPlaybackVolume();
        return audioRef.current.play().then(() => {
          if (token !== tokenRef.current) {
            audioRef.current?.pause();
            return;
          }
          modeRef.current = "audio";
          pauseWidget();
        }).catch(() => {
          if (token !== tokenRef.current) return;
          if (req.source === "soundcloud") return startWidget();
          throw new Error("stream");
        });
      }
      return startWidget();
    };
    if (cached) {
      void startFromPayload(cached)
        .then(() => {
          if (token !== tokenRef.current) return;
          showNowPlaying();
          syncPlaying();
          onNeedScrollRef.current?.(event);
        })
        .catch(() => {
          if (token !== tokenRef.current) return;
          setLoadingId("");
          if (skipGuardRef.current < n) {
            skipGuardRef.current += 1;
            playAt(index + 1, true);
            return;
          }
          skipGuardRef.current = 0;
          stopPlay();
        });
      return;
    }
    if (req.source === "soundcloud" && req.fallback) {
      modeRef.current = "widget";
      fillNowPlaying({
        artist: track.artist || "",
        track: track.track || "",
        url: track.url || req.fallback,
        image: track.image || "",
        source: "soundcloud",
      });
      showNowPlaying();
      onNeedScrollRef.current?.(event);
      scPositionRef.current = 0;
      scDurationRef.current = 0;
      scUrlRef.current = req.fallback;
      markWidgetPlaying();
      void playWidget(req.fallback, token).catch(() => {
        if (token !== tokenRef.current) return;
        if (iframeRef.current) iframeRef.current.src = widgetSrc(req.fallback);
      });
    }
    setLoadingId(event.id);
    void resolveStream(req.href)
      .then((data) => {
        if (token !== tokenRef.current) return;
        if (!data) throw new Error("stream");
        return startFromPayload(data);
      })
      .then(() => {
        if (token !== tokenRef.current) return;
        showNowPlaying();
        syncPlaying();
        onNeedScrollRef.current?.(event);
      })
      .catch(() => {
        if (token !== tokenRef.current) return;
        setLoadingId("");
        if (modeRef.current === "widget" && scUrlRef.current) {
          showNowPlaying();
          syncPlaying();
          onNeedScrollRef.current?.(event);
          return;
        }
        if (skipGuardRef.current < n) {
          skipGuardRef.current += 1;
          playAt(index + 1, true);
          return;
        }
        skipGuardRef.current = 0;
        stopPlay();
      });
  }, [applyPlaybackVolume, fillNowPlaying, markWidgetPlaying, pauseHtmlAudio, pauseWidget, pauseYt, peekStream, playWidget, playYt, resolveStream, showNowPlaying, stopPlay, syncPlaying, widgetSrc]);

  playAtRef.current = playAt;

  const resumePlay = useCallback(() => {
    if (modeRef.current === "yt") {
      markYtPlaying();
      showNowPlaying();
      try { ytPlayerRef.current?.playVideo(); } catch { /* ignore */ }
      return;
    }
    if (modeRef.current === "widget") {
      markWidgetPlaying();
      showNowPlaying();
      if (widgetRef.current) {
        try { widgetRef.current.play(); } catch { /* ignore */ }
        return;
      }
      if (scUrlRef.current) {
        void playWidget(scUrlRef.current, tokenRef.current);
        return;
      }
    }
    if (!audioRef.current?.src) {
      playAt(indexRef.current >= 0 ? indexRef.current : 0, false);
      return;
    }
    audioRef.current.play().then(() => {
      showNowPlaying();
      syncPlaying();
    }).catch(() => stopPlay());
  }, [markWidgetPlaying, markYtPlaying, playAt, playWidget, showNowPlaying, stopPlay, syncPlaying]);

  const playNext = useCallback(() => playAt((indexRef.current < 0 ? 0 : indexRef.current) + 1, true), [playAt]);
  const playPrev = useCallback(() => {
    if (mediaCurrent() > 3) {
      seekToRatio(0);
      return;
    }
    playAt((indexRef.current < 0 ? 0 : indexRef.current) - 1, true);
  }, [mediaCurrent, playAt, seekToRatio]);

  const eventPlaylistRange = useCallback((id: string) => {
    const list = playlistRef.current;
    let start = -1;
    let end = -1;
    list.forEach((item, i) => {
      if (item.event.id !== id) return;
      if (start < 0) start = i;
      end = i;
    });
    return { start, end };
  }, []);

  const playEventNext = useCallback(() => {
    const range = eventPlaylistRange(eventIdRef.current);
    if (range.start < 0) {
      playNext();
      return;
    }
    let next = indexRef.current + 1;
    if (next > range.end) next = range.start;
    playAt(next, true);
  }, [eventPlaylistRange, playAt, playNext]);

  const playEventPrev = useCallback(() => {
    const range = eventPlaylistRange(eventIdRef.current);
    if (range.start < 0) {
      playPrev();
      return;
    }
    let prev = indexRef.current - 1;
    if (prev < range.start) prev = range.end;
    playAt(prev, false);
  }, [eventPlaylistRange, playAt, playPrev]);

  const playWeek = useCallback((week: string, weekMondayIsoFn: (iso: string) => string, today: string) => {
    const list = playlistRef.current;
    const start = list.findIndex((item) => weekMondayIsoFn(item.event.date) === week && item.event.date >= today);
    if (start < 0) return;
    const current = indexRef.current >= 0 ? playlistRef.current[indexRef.current] : null;
    const currentIsWeek = current && weekMondayIsoFn(current.event.date) === week;
    if (isPlaying() && currentIsWeek) {
      pausePlay();
      return;
    }
    if (!isPlaying() && currentIsWeek && (audioRef.current?.src || modeRef.current === "widget" || (modeRef.current === "yt" && ytVideoRef.current))) {
      resumePlay();
      return;
    }
    playAt(start, false);
  }, [isPlaying, pausePlay, playAt, resumePlay]);

  const togglePlay = useCallback((event: ConcertEvent) => {
    if (eventIdRef.current === event.id) {
      if (isPlaying()) pausePlay();
      else resumePlay();
      return;
    }
    const index = playlistRef.current.findIndex((item) => item.event.id === event.id);
    if (index < 0) return;
    playAt(index, false);
  }, [isPlaying, pausePlay, playAt, resumePlay]);

  const preloadEvent = useCallback((event: ConcertEvent) => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      const index = playlistRef.current.findIndex((item) => item.event.id === event.id);
      if (index < 0) return;
      preloadIndex(eventIdRef.current === event.id ? index + 1 : index);
    }, 80);
  }, [preloadIndex]);

  const preloadWeek = useCallback((week: string, weekMondayIsoFn: (iso: string) => string, today: string) => {
    const start = playlistRef.current.findIndex(
      (item) => weekMondayIsoFn(item.event.date) === week && item.event.date >= today,
    );
    if (start < 0) return;
    preloadIndex(start);
  }, [preloadIndex]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const toggleBarPlay = useCallback(() => {
    if (isPlaying()) pausePlay();
    else resumePlay();
  }, [isPlaying, pausePlay, resumePlay]);

  const rebindAfterRender = useCallback(() => {
    const list = playlistRef.current;
    if (!eventIdRef.current) return;
    indexRef.current = -1;
    list.forEach((item, i) => {
      if (itemKeyRef.current && item.key === itemKeyRef.current) indexRef.current = i;
      else if (!itemKeyRef.current && item.event.id === eventIdRef.current && indexRef.current < 0) indexRef.current = i;
    });
    syncPlaying();
  }, [syncPlaying]);

  return {
    iframeRef,
    ytContainerRef,
    playing,
    eventId,
    trackIndex,
    itemKey,
    barOn,
    barHidden,
    nowPlaying,
    progress,
    loadingId,
    formatClock,
    togglePlay,
    preloadEvent,
    preloadWeek,
    playWeek,
    playEventNext,
    playEventPrev,
    playNext,
    playPrev,
    toggleBarPlay,
    seekToRatio,
    scrubbingRef,
    rebindAfterRender,
    currentEventId: eventId,
  };
}

export type UsePlayer = ReturnType<typeof usePlayer>;
