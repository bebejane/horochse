"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/dates";
import { artistExploreUrl, playlistFrom, streamRequest, trackExploreUrl } from "@/lib/events";
import { playbackUrl } from "@/lib/media-src";
import { attachSpectrum, type SpectrumTap } from "@/lib/spectrum";
import type { ConcertEvent, PlaylistItem, StreamPayload } from "@/lib/types";

const SOUNDCLOUD_VOLUME = 0.75;
const PLAYBACK_LIMIT_S = 30;
const FADE_S = 2;
const STREAM_CACHE_MS = 4 * 60 * 1000;
const STREAM_CACHE_MAX = 16;
const SC_WIDGET_IDLE =
  "https://w.soundcloud.com/player/?auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_artwork=false&visual=false";

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
  getPosition: (cb: (ms: number) => void) => void;
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
  mobile?: boolean;
};

export function usePlayer({ events, onNeedScroll, mobile = false }: PlayerOpts) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spectrumRef = useRef<SpectrumTap | null>(null);
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
  // The card's play button follows this, not the media element's paused flag.
  // SoundCloud's widget often plays without ever emitting PLAY, so a button
  // tied to that event stays unmarked while the song is audible.
  const engagedRef = useRef(false);
  // Set while a track change is in flight, so the track we just left cannot
  // also fire "ended" and skip a second time.
  const switchingRef = useRef(false);
  const advancedFromRef = useRef(-1);
  const lastGainRef = useRef(-1);
  // Bumped for each HTML-audio start. A play() that resolves after the user
  // has already moved on must not pause or rewind the new track.
  const audioGenRef = useRef(0);
  // Progress events from the track we just left are ignored until the new
  // media actually starts, so the bar stays at 0 during the switch.
  const progressLiveRef = useRef(false);
  // Bumped on every track switch. Async widget/YouTube callbacks capture the
  // value at load time and bail if it changed, so a superseded track can never
  // restart playback after the user has switched.
  const widgetGenRef = useRef(0);
  const ytGenRef = useRef(0);
  // Generation of the widget load that is allowed to auto-play on READY.
  const scLoadGenRef = useRef(-1);
  const playlistRef = useRef<PlaylistItem[]>([]);
  const widgetOnlyKeysRef = useRef<Set<string>>(new Set());
  const onNeedScrollRef = useRef(onNeedScroll);
  const playAtRef = useRef<(index: number, fromSkip: boolean) => void>(() => {});
  const updateProgressRef = useRef<() => void>(() => {});
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
  const [widgetOnlyTrackKeys, setWidgetOnlyTrackKeys] = useState<string[]>([]);

  const availablePlaylist = useCallback(
    () =>
      playlistFrom(events).filter(
        (item) => !mobile || !widgetOnlyKeysRef.current.has(item.key),
      ),
    [events, mobile],
  );
  playlistRef.current = availablePlaylist();
  onNeedScrollRef.current = onNeedScroll;

  const blockWidgetOnlyItem = useCallback(
    (item: PlaylistItem) => {
      if (!mobile || widgetOnlyKeysRef.current.has(item.key)) return;
      const blocked = new Set(widgetOnlyKeysRef.current);
      blocked.add(item.key);
      widgetOnlyKeysRef.current = blocked;
      setWidgetOnlyTrackKeys([...blocked]);
      playlistRef.current = availablePlaylist();
    },
    [availablePlaylist, mobile],
  );

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    spectrumRef.current = attachSpectrum(audio);
    const preload = new Audio();
    preload.preload = "auto";
    preload.muted = true;
    preloadAudioRef.current = preload;
    const onEnded = () => {
      if (switchingRef.current || indexRef.current < 0) return;
      if (advancedFromRef.current === indexRef.current) return;
      advancedFromRef.current = indexRef.current;
      playAtRef.current(indexRef.current + 1, true);
    };
    const onPlay = () => {
      switchingRef.current = false;
      syncPlaying();
    };
    const onPause = () => syncPlaying();
    const onTime = () => updateProgressRef.current();
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
      spectrumRef.current?.close();
      spectrumRef.current = null;
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
    // På mobil har den synliga SoundCloud-spelaren inte startat förrän
    // positionen rör sig. På desktop ska knappen ändå markeras direkt.
    const phone = window.matchMedia("(max-width: 840px), (pointer: coarse)").matches;
    const widgetIdle = phone && document.body.classList.contains("isScWidget") && scPositionRef.current <= 0;
    setPlaying(engagedRef.current && !widgetIdle);
    setEventId(eventIdRef.current);
    setItemKey(itemKeyRef.current);
    const item = indexRef.current >= 0 ? playlistRef.current[indexRef.current] : null;
    setTrackIndex(item ? item.i : -1);
  }, []);

  const applyPlaybackVolume = useCallback((gain = 1) => {
    if (gain !== 0 && gain !== 1 && Math.abs(gain - lastGainRef.current) < 0.02) return;
    lastGainRef.current = gain;
    const quiet = sourceRef.current === "soundcloud";
    const base = quiet ? SOUNDCLOUD_VOLUME : 1;
    const level = Math.max(0, Math.min(1, base * gain));
    if (modeRef.current === "widget") {
      if (widgetRef.current) {
        try { widgetRef.current.setVolume(Math.round(level * 100)); } catch { /* ignore */ }
      }
      return;
    }
    if (modeRef.current === "yt") {
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.setVolume(Math.round(level * 100)); } catch { /* ignore */ }
      }
      return;
    }
    if (audioRef.current) audioRef.current.volume = level;
  }, []);

  const playbackLimit = useCallback(() => {
    const real = mediaDuration();
    const source = sourceRef.current;
    const capped = source === "bandcamp" || source === "soundcloud";
    if (!capped) return real > 0 ? real : 0;
    if (real > 0) return Math.min(PLAYBACK_LIMIT_S, real);
    // A SoundCloud stream often never reports a duration. Without a stand-in
    // the bar stays at 0:00 while the track is already playing.
    return source === "soundcloud" && engagedRef.current ? PLAYBACK_LIMIT_S : 0;
  }, [mediaDuration]);

  const updateProgress = useCallback(() => {
    const limit = playbackLimit();
    const t = mediaCurrent();
    if (limit > 0 && engagedRef.current && !scrubbingRef.current) {
      const fadeStart = Math.max(0, limit - FADE_S);
      const span = Math.max(0.001, limit - fadeStart);
      const gain = t <= fadeStart ? 1 : Math.max(0, (limit - t) / span);
      applyPlaybackVolume(gain);
      if (progressLiveRef.current && t >= limit - 0.05) {
        if (!switchingRef.current && advancedFromRef.current !== indexRef.current && indexRef.current >= 0) {
          advancedFromRef.current = indexRef.current;
          playAtRef.current(indexRef.current + 1, true);
        }
        return;
      }
    }
    if (scrubbingRef.current || !progressLiveRef.current) return;
    const duration = limit || mediaDuration();
    const shown = duration > 0 ? Math.min(t, duration) : t;
    const ratio = duration > 0 ? shown / duration : 0;
    setProgress({ ratio, current: shown, duration });
  }, [applyPlaybackVolume, mediaCurrent, mediaDuration, playbackLimit]);

  updateProgressRef.current = updateProgress;

  const applyProgress = useCallback((ratio: number, duration = mediaDuration()) => {
    ratio = Math.min(1, Math.max(0, ratio));
    const t = duration ? ratio * duration : mediaCurrent();
    setProgress({ ratio, current: t, duration });
  }, [mediaCurrent, mediaDuration]);

  // YouTube emits no progress event, and the SoundCloud widget often skips
  // PLAY_PROGRESS when the iframe is parked off-screen. Poll both.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!engagedRef.current) return;
      if (modeRef.current === "widget" && widgetRef.current) {
        const widget = widgetRef.current;
        try {
          widget.getPosition((ms) => {
            if (modeRef.current !== "widget" || widgetRef.current !== widget) return;
            if (typeof ms === "number" && ms >= 0) scPositionRef.current = ms;
            if (ms > 0) progressLiveRef.current = true;
            updateProgress();
          });
        } catch { /* ignore */ }
        if (scDurationRef.current <= 0) {
          try {
            widget.getDuration((ms) => {
              if (modeRef.current !== "widget" || widgetRef.current !== widget) return;
              if (typeof ms === "number" && ms > 0) scDurationRef.current = ms;
            });
          } catch { /* ignore */ }
        }
        return;
      }
      if (!progressLiveRef.current) return;
      updateProgress();
    }, 100);
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
    // Pause only. Clearing src and calling load() races the next assignment:
    // the queued load restarts the previous file, so Next plays the same song
    // and the progress bar never leaves the old position.
    audioRef.current?.pause();
  }, []);

  const widgetChrome = useCallback((on: boolean) => {
    const phone = window.matchMedia("(max-width: 840px), (pointer: coarse)").matches;
    document.body.classList.toggle("isScWidget", on && phone);
  }, []);

  const pauseWidget = useCallback(() => {
    // widget.pause() / widget.load() keep the previous iframe document playing.
    // Navigating the iframe away is what actually stops the audio.
    widgetChrome(false);
    widgetGenRef.current += 1;
    scLoadGenRef.current = -1;
    pauseRequestedRef.current = true;
    scPlayingRef.current = false;
    scPositionRef.current = 0;
    widgetRef.current = null;
    const iframe = iframeRef.current;
    if (iframe && iframe.src !== SC_WIDGET_IDLE) iframe.src = SC_WIDGET_IDLE;
  }, [widgetChrome]);

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
      "&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_artwork=false&visual=false";
  }, []);

  const bindScWidget = useCallback((Widget: ScApi) => {
    if (widgetRef.current) return widgetRef.current;
    const iframe = iframeRef.current;
    if (!iframe) throw new Error("widget");
    const widget = Widget(iframe);
    widgetApiRef.current = Widget;
    widgetRef.current = widget;
    // Captured at bind time. A READY/progress event from the previous iframe
    // document must not pass just because a newer load reused the same refs.
    const boundGen = widgetGenRef.current;
    const stillThis = () => boundGen === widgetGenRef.current;
    widget.bind(Widget.Events.READY, () => {
      applyPlaybackVolume();
      if (!stillThis() || modeRef.current !== "widget" || !scUrlRef.current) return;
      // The iframe URL already has auto_play and starts at 0. seekTo() here
      // interrupts that and the follow-up play() is outside the click, so the
      // track stays paused at 0:00.
      try { widget.play(); } catch { /* ignore */ }
    });
    widget.bind(Widget.Events.PLAY, () => {
      if (!stillThis() || modeRef.current !== "widget") return;
      switchingRef.current = false;
      scPlayingRef.current = true;
      pauseRequestedRef.current = false;
      progressLiveRef.current = true;
      applyPlaybackVolume();
      widget.getDuration((ms) => {
        if (!stillThis()) return;
        scDurationRef.current = ms || scDurationRef.current || 0;
        updateProgress();
      });
      showNowPlaying();
      syncPlaying();
      updateProgress();
    });
    widget.bind(Widget.Events.PAUSE, () => {
      if (!stillThis() || modeRef.current !== "widget") return;
      if (!pauseRequestedRef.current) return;
      scPlayingRef.current = false;
      syncPlaying();
    });
    widget.bind(Widget.Events.FINISH, () => {
      scPlayingRef.current = false;
      if (switchingRef.current || !stillThis() || modeRef.current !== "widget" || indexRef.current < 0) return;
      if (advancedFromRef.current === indexRef.current) return;
      advancedFromRef.current = indexRef.current;
      playAtRef.current(indexRef.current + 1, true);
    });
    widget.bind(Widget.Events.PLAY_PROGRESS, (data) => {
      if (!stillThis() || modeRef.current !== "widget") return;
      scPositionRef.current = data?.currentPosition || 0;
      if (scPositionRef.current > 0) {
        progressLiveRef.current = true;
        if (!scPlayingRef.current) {
          scPlayingRef.current = true;
          syncPlaying();
        }
      }
      if (data?.currentPosition && scDurationRef.current <= 0 && data.relativePosition) {
        scDurationRef.current = data.currentPosition / data.relativePosition;
      }
      updateProgress();
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
                  switchingRef.current = false;
                  ytPlayingRef.current = true;
                  if (modeRef.current === "yt") {
                    progressLiveRef.current = true;
                    showNowPlaying();
                    syncPlaying();
                    updateProgress();
                  }
                } else if (event.data === S.PAUSED) {
                  ytPlayingRef.current = false;
                  if (modeRef.current === "yt") syncPlaying();
                } else if (event.data === S.ENDED) {
                  ytPlayingRef.current = false;
                  if (switchingRef.current || modeRef.current !== "yt" || indexRef.current < 0) return;
                  if (advancedFromRef.current === indexRef.current) return;
                  advancedFromRef.current = indexRef.current;
                  playAtRef.current(indexRef.current + 1, true);
                }
              },
            },
          });
        }),
    );
  }, [applyPlaybackVolume, loadYtApi, showNowPlaying, syncPlaying, updateProgress]);

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
    const iframe = iframeRef.current;
    if (!iframe) return Promise.reject(new Error("widget"));
    // A new iframe document. The previous Widget binding talks to the old
    // one, which is why Next kept playing the first SoundCloud track.
    widgetRef.current = null;
    scUrlRef.current = url;
    scPositionRef.current = 0;
    scDurationRef.current = 0;
    const nextSrc = widgetSrc(url);
    return new Promise<void>((resolve, reject) => {
      const attach = () => {
        iframe.removeEventListener("load", attach);
        if (token !== tokenRef.current || gen !== widgetGenRef.current) {
          resolve();
          return;
        }
        loadScApi().then((Widget) => {
          if (token !== tokenRef.current || gen !== widgetGenRef.current) {
            resolve();
            return;
          }
          try {
            bindScWidget(Widget);
            resolve();
          } catch (err) {
            reject(err);
          }
        }, reject);
      };
      iframe.addEventListener("load", attach);
      if (iframe.src === nextSrc) attach();
      else iframe.src = nextSrc;
    });
  }, [bindScWidget, loadScApi, widgetSrc]);

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
      if (data.widget && mobile && list[index]) {
        blockWidgetOnlyItem(list[index]);
        return;
      }
      const next = indexRef.current >= 0 ? list[(indexRef.current + 1) % n] : null;
      const isNext = !!(next && streamRequest(next.track)?.href === req.href);
      if (data.stream && (indexRef.current < 0 || isNext)) warmMedia(data.stream);
      if (req.source === "soundcloud" && (data.url || req.fallback)) {
        primeWidget(data.url || req.fallback);
      }
    });
  }, [blockWidgetOnlyItem, mobile, primeWidget, resolveStream, warmMedia]);

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
    if (!progressLiveRef.current) setProgress({ ratio: 0, current: 0, duration: 0 });
  }, []);

  const stopPlay = useCallback(() => {
    indexRef.current = -1;
    eventIdRef.current = "";
    itemKeyRef.current = "";
    skipGuardRef.current = 0;
    tokenRef.current += 1;
    sourceRef.current = "";
    modeRef.current = "audio";
    engagedRef.current = false;
    switchingRef.current = false;
    progressLiveRef.current = false;
    setProgress({ ratio: 0, current: 0, duration: 0 });
    pauseWidget();
    pauseHtmlAudio();
    pauseYt();
    hideNowPlaying();
    setLoadingId("");
    syncPlaying();
  }, [hideNowPlaying, pauseHtmlAudio, pauseWidget, pauseYt, syncPlaying]);

  const pausePlay = useCallback(() => {
    engagedRef.current = false;
    if (modeRef.current === "widget") {
      pauseRequestedRef.current = true;
      scPlayingRef.current = false;
      if (widgetRef.current) {
        try { widgetRef.current.pause(); } catch { /* ignore */ }
      } else {
        pauseWidget();
      }
    } else if (modeRef.current === "yt") pauseYt();
    else audioRef.current?.pause();
    syncPlaying();
  }, [pauseWidget, pauseYt, syncPlaying]);

  const seekToRatio = useCallback((ratio: number) => {
    const duration = playbackLimit() || mediaDuration();
    ratio = Math.min(1, Math.max(0, ratio));
    applyProgress(ratio, duration);
    if (!duration) return;
    const at = ratio * duration;
    if (modeRef.current === "widget" && widgetRef.current) {
      scPositionRef.current = at * 1000;
      widgetRef.current.seekTo(scPositionRef.current);
      return;
    }
    if (modeRef.current === "yt" && ytPlayerRef.current) {
      try { ytPlayerRef.current.seekTo(at, true); } catch { /* ignore */ }
      return;
    }
    if (audioRef.current) audioRef.current.currentTime = at;
  }, [applyProgress, mediaDuration, playbackLimit]);

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
    const continueAfterFailure = () => {
      if (skipGuardRef.current >= n) {
        skipGuardRef.current = 0;
        stopPlay();
        return;
      }
      skipGuardRef.current += 1;
      const nextItem = list[(index + 1) % n];
      const nextIndex = nextItem
        ? playlistRef.current.findIndex((candidate) => candidate.key === nextItem.key)
        : -1;
      if (nextIndex < 0) {
        skipGuardRef.current = 0;
        stopPlay();
        return;
      }
      playAt(nextIndex, true);
    };
    const req = streamRequest(track);
    indexRef.current = index;
    eventIdRef.current = event.id;
    itemKeyRef.current = item.key;
    engagedRef.current = true;
    switchingRef.current = true;
    lastGainRef.current = -1;
    syncPlaying();
    const token = ++tokenRef.current;
    spectrumRef.current?.resume();
    const cached = req ? peekStream(req.href) : null;
    // A SoundCloud-only track has to start from the iframe URL set in this
    // click. Parking the iframe on the idle page first consumes the gesture,
    // and the real track then stays paused at 0:00.
    const widgetInClick =
      !mobile && !!(req && req.source === "soundcloud" && req.fallback && !cached?.stream);
    // Drop the previous media before any fetch. Progress stays at 0 until the
    // new file actually starts, so a late timeupdate cannot restore the old bar.
    progressLiveRef.current = false;
    scPositionRef.current = 0;
    scDurationRef.current = 0;
    setProgress({ ratio: 0, current: 0, duration: 0 });
    pauseHtmlAudio();
    pauseYt();
    if (widgetInClick) {
      widgetGenRef.current += 1;
      scLoadGenRef.current = -1;
      widgetRef.current = null;
      scPlayingRef.current = false;
      pauseRequestedRef.current = false;
    } else {
      pauseWidget();
    }
    if (!mobile) onNeedScrollRef.current?.(event);
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
    setLoadingId(event.id);
    fillNowPlaying({
      artist: track.artist || "",
      album: track.album,
      track: "Laddar",
      url: track.url || req.fallback || "",
      image: track.image || "",
      source: req.source,
      preview: req.source === "deezer" || Boolean(track?.preview),
    });
    showNowPlaying();
    sourceRef.current = req.source;
    // YouTube needs no stream resolution: the embedded player takes the id.
    if (req.source === "youtube") {
      void playYt(req.videoId || "", token)
        .then(() => {
          if (token !== tokenRef.current) return;
          setLoadingId("");
          fillNowPlaying({
            artist: track.artist || "",
            track: track.track || "",
            url: track.url || req.fallback,
            image: track.image || "",
            source: "youtube",
          });
          skipGuardRef.current = 0;
          progressLiveRef.current = true;
          showNowPlaying();
          syncPlaying();
          updateProgress();
          if (mobile) onNeedScrollRef.current?.(event);
        })
        .catch(() => {
          if (token !== tokenRef.current) return;
          setLoadingId("");
          continueAfterFailure();
        });
      return;
    };
    const startFromPayload = (data: StreamPayload) => {
      if (token !== tokenRef.current) return Promise.resolve();
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
        if (req.source !== "soundcloud" || !url) throw new Error("stream");
        if (mobile) {
          if (data.widget) blockWidgetOnlyItem(item);
          throw new Error("widget-only");
        }
        // Ingen mp3: telefonen startar inte en dold widget. Spelaren visas
        // så att trycket hamnar på den.
        widgetChrome(true);
        modeRef.current = "widget";
        pauseHtmlAudio();
        pauseYt();
        const iframe = iframeRef.current;
        const encoded = encodeURIComponent(url);
        const live = !!(iframe && (iframe.src.indexOf(encoded) !== -1 || iframe.src.indexOf(url) !== -1));
        if (live) {
          // The iframe is already on this track (a preload, or the click that
          // started the widget before the stream lookup returned). play() is
          // what makes a paused preload actually start, and the bar follows.
          if (widgetRef.current) {
            try { widgetRef.current.play(); } catch { /* ignore */ }
            progressLiveRef.current = true;
            updateProgress();
          }
          return Promise.resolve();
        }
        return playWidget(url, token);
      };
      if (data.stream && audioRef.current) {
        const audio = audioRef.current;
        const gen = ++audioGenRef.current;
        // The click already pointed the SoundCloud iframe at this track. Pausing
        // it before audio.play() resolves drops that gesture: the mp3 then
        // starts outside the click and the widget comes back paused at 0:00,
        // so the bar never leaves 00:00.
        const widgetOwnsClick = modeRef.current === "widget" && req.source === "soundcloud";
        if (!widgetOwnsClick) {
          progressLiveRef.current = false;
          setProgress({ ratio: 0, current: 0, duration: 0 });
          pauseWidget();
          pauseYt();
          modeRef.current = "audio";
        }
        const same = audio.dataset.origin === data.stream && !!audio.src;
        if (!same) {
          audio.dataset.origin = data.stream;
          audio.src = playbackUrl(data.stream);
        }
        const seekZero = () => {
          try { if (audio.currentTime > 0.25) audio.currentTime = 0; } catch { /* not ready */ }
        };
        if (same) {
          try { audio.currentTime = 0; } catch { /* metadata pending */ }
        } else {
          audio.addEventListener("loadedmetadata", () => {
            if (gen !== audioGenRef.current) return;
            seekZero();
          }, { once: true });
        }
        applyPlaybackVolume();
        return audio.play().then(() => {
          if (gen !== audioGenRef.current || token !== tokenRef.current) {
            audio.pause();
            return;
          }
          if (widgetOwnsClick) {
            pauseWidget();
            pauseYt();
            modeRef.current = "audio";
          }
          seekZero();
          progressLiveRef.current = true;
          updateProgress();
        }).catch((err: unknown) => {
          if (gen !== audioGenRef.current || token !== tokenRef.current) return;
          const name = err && typeof err === "object" && "name" in err ? String((err as { name?: string }).name) : "";
          if (name === "AbortError") return;
          if (req.source === "soundcloud") {
            if (widgetOwnsClick) {
              modeRef.current = "widget";
              try { widgetRef.current?.play(); } catch { /* ignore */ }
              progressLiveRef.current = true;
              updateProgress();
              return;
            }
            return startWidget();
          }
          throw err;
        });
      }
      return startWidget();
    };
    if (cached) {
      void startFromPayload(cached)
        .then(() => {
          if (token !== tokenRef.current) return;
          setLoadingId("");
          showNowPlaying();
          syncPlaying();
          if (mobile) onNeedScrollRef.current?.(event);
        })
        .catch(() => {
          if (token !== tokenRef.current) return;
          setLoadingId("");
          continueAfterFailure();
        });
      return;
    }
    if (!mobile && req.source === "soundcloud" && req.fallback) {
      modeRef.current = "widget";
      scPositionRef.current = 0;
      scDurationRef.current = 0;
      scUrlRef.current = req.fallback;
      void playWidget(req.fallback, token);
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
        setLoadingId("");
        showNowPlaying();
        syncPlaying();
        if (mobile) onNeedScrollRef.current?.(event);
      })
      .catch(() => {
        if (token !== tokenRef.current) return;
        setLoadingId("");
        if (!mobile && modeRef.current === "widget" && scUrlRef.current) {
          widgetChrome(true);
          showNowPlaying();
          syncPlaying();
          return;
        }
        continueAfterFailure();
      });
  }, [applyPlaybackVolume, blockWidgetOnlyItem, fillNowPlaying, mobile, pauseHtmlAudio, pauseWidget, pauseYt, peekStream, playWidget, playYt, resolveStream, showNowPlaying, stopPlay, syncPlaying, updateProgress, widgetChrome]);

  playAtRef.current = playAt;

  const resumePlay = useCallback(() => {
    engagedRef.current = true;
    syncPlaying();
    if (modeRef.current === "yt") {
      markYtPlaying();
      showNowPlaying();
      try { ytPlayerRef.current?.playVideo(); } catch { /* ignore */ }
      return;
    }
    if (modeRef.current === "widget") {
      showNowPlaying();
      pauseRequestedRef.current = false;
      const iframe = iframeRef.current;
      if (widgetRef.current && iframe && iframe.src !== SC_WIDGET_IDLE) {
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
  }, [markYtPlaying, playAt, playWidget, showNowPlaying, stopPlay, syncPlaying]);

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
    if (engagedRef.current && currentIsWeek) {
      pausePlay();
      return;
    }
    if (!engagedRef.current && currentIsWeek && (audioRef.current?.src || modeRef.current === "widget" || (modeRef.current === "yt" && ytVideoRef.current))) {
      resumePlay();
      return;
    }
    playAt(start, false);
  }, [pausePlay, playAt, resumePlay]);

  const widgetNeedsTap = () =>
    window.matchMedia("(max-width: 840px), (pointer: coarse)").matches &&
    document.body.classList.contains("isScWidget") &&
    scPositionRef.current <= 0;

  const togglePlay = useCallback((event: ConcertEvent) => {
    if (eventIdRef.current === event.id) {
      if (engagedRef.current && !widgetNeedsTap()) pausePlay();
      else resumePlay();
      return;
    }
    const index = playlistRef.current.findIndex((item) => item.event.id === event.id);
    if (index < 0) return;
    playAt(index, false);
  }, [pausePlay, playAt, resumePlay]);

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
    if (engagedRef.current && !widgetNeedsTap()) pausePlay();
    else resumePlay();
  }, [pausePlay, resumePlay]);

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

  const sampleSpectrum = useCallback((out: Float32Array) => {
    const tap = spectrumRef.current;
    if (!tap) {
      out.fill(0);
      return;
    }
    tap.sample(out);
  }, []);

  return {
    iframeRef,
    ytContainerRef,
    playing,
    eventId,
    trackIndex,
    itemKey,
    widgetOnlyTrackKeys,
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
    sampleSpectrum,
    rebindAfterRender,
    currentEventId: eventId,
  };
}

export type UsePlayer = ReturnType<typeof usePlayer>;
