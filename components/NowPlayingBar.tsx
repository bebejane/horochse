"use client";

import s from "./NowPlayingBar.module.scss";
import cn from "classnames";

import { formatClock } from "@/lib/dates";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./Icons";
import type { NowPlayingData } from "@/hooks/usePlayer";
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from "react";

export function NowPlayingBar({
  hidden,
  on,
  playing,
  data,
  progress,
  scrubbingRef,
  onSeek,
  onPrev,
  onToggle,
  onNext,
}: {
  hidden: boolean;
  on: boolean;
  playing: boolean;
  data: NowPlayingData | null;
  progress: { ratio: number; current: number; duration: number };
  scrubbingRef: MutableRefObject<boolean>;
  onSeek: (ratio: number) => void;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
}) {
  function seekFromPoint(clientX: number) {
    const track = document.querySelector("." + s.nowplayingTrackbar);
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    scrubbingRef.current = true;
    event.currentTarget.classList.add("isDragging");
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    onSeek(seekFromPoint(event.clientX));
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!scrubbingRef.current) return;
    onSeek(seekFromPoint(event.clientX));
  }

  function endSeek(event: ReactPointerEvent<HTMLDivElement>) {
    if (!scrubbingRef.current) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    scrubbingRef.current = false;
    event.currentTarget.classList.remove("isDragging");
  }

  return (
    <aside
      className={cn(s.nowplaying, { isOn: on })}
      id="nowplaying"
      aria-live="polite"
      hidden={hidden}
      aria-hidden={on ? "false" : "true"}
    >
      <div className={s.nowplayingInner}>
        <div className={s.nowplayingMeta}>
          {data?.image ? (
            <img
              className={s.nowplayingArt}
              alt={data.album ? "Omslag: " + data.album : ""}
              src={data.image}
            />
          ) : null}
          <div className={s.nowplayingCopy}>
            {data?.trackUrl ? (
              <a className={s.nowplayingTrack} href={data.trackUrl} target="_blank" rel="noopener noreferrer">
                {data.track}
              </a>
            ) : (
              <a className={s.nowplayingTrack}>{data?.track || ""}</a>
            )}
            {data?.artistUrl ? (
              <a className={s.nowplayingArtist} href={data.artistUrl} target="_blank" rel="noopener noreferrer">
                {data.artist}
              </a>
            ) : (
              <a className={s.nowplayingArtist}>{data?.artist || ""}</a>
            )}
          </div>
        </div>
        <div className={s.nowplayingMain}>
          <div
            className={s.nowplayingProgress}
            role="slider"
            aria-label="Position i låten"
            aria-valuemin={0}
            aria-valuemax={Math.round(progress.duration)}
            aria-valuenow={Math.round(progress.current)}
            aria-valuetext={formatClock(progress.current) + " av " + formatClock(progress.duration)}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endSeek}
            onPointerCancel={endSeek}
            onKeyDown={(event) => {
              const duration = progress.duration;
              if (!duration) return;
              const step = event.shiftKey ? 10 : 5;
              let nextRatio = progress.current / duration;
              if (event.key === "ArrowLeft" || event.key === "ArrowDown") nextRatio -= step / duration;
              else if (event.key === "ArrowRight" || event.key === "ArrowUp") nextRatio += step / duration;
              else if (event.key === "Home") nextRatio = 0;
              else if (event.key === "End") nextRatio = 1;
              else return;
              event.preventDefault();
              onSeek(nextRatio);
            }}
          >
            <span className={s.nowplayingTime}>{formatClock(progress.current)}</span>
            <div className={s.nowplayingTrackbar}>
              <i style={{ width: progress.ratio * 100 + "%" }} />
              <b className={s.nowplayingKnob} style={{ left: progress.ratio * 100 + "%" }} />
            </div>
            <span className={s.nowplayingTime}>{formatClock(progress.duration)}</span>
          </div>
          <div className={s.nowplayingControls}>
            <button type="button" className={s.npBtn} aria-label="Föregående" onClick={onPrev}>
              <PrevIcon />
            </button>
            <button
              type="button"
              className={cn(s.npBtn, s.npPlay, { isOn: playing })}
              aria-label={playing ? "Pausa" : "Spela"}
              aria-pressed={playing ? "true" : "false"}
              onClick={onToggle}
            >
              <PlayIcon />
              <PauseIcon />
            </button>
            <button type="button" className={s.npBtn} aria-label="Nästa" onClick={onNext}>
              <NextIcon />
            </button>
          </div>
          <span className={s.nowplayingSource}>
            <a
              className={s.nowplayingLink}
              href={data?.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              hidden={!data?.url}
            >
              {data?.source === "soundcloud"
                ? "SoundCloud"
                : data?.source === "youtube"
                  ? "YouTube"
                  : data?.source === "deezer"
                    ? "Deezer"
                    : "Bandcamp"}
              {data?.preview ? " (preview)" : ""}
            </a>
          </span>
        </div>
      </div>
    </aside>
  );
}
