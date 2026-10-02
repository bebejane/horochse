"use client";

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
    const track = document.querySelector(".nowplaying-trackbar");
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    scrubbingRef.current = true;
    event.currentTarget.classList.add("is-dragging");
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
    event.currentTarget.classList.remove("is-dragging");
  }

  return (
    <aside
      className={"nowplaying" + (on ? " is-on" : "")}
      id="nowplaying"
      aria-live="polite"
      hidden={hidden}
      aria-hidden={on ? "false" : "true"}
    >
      <div className="nowplaying-inner">
        <div className="nowplaying-meta">
          {data?.image ? (
            <img
              className="nowplaying-art"
              alt={data.album ? "Omslag: " + data.album : ""}
              src={data.image}
            />
          ) : null}
          <div className="nowplaying-copy">
            {data?.trackUrl ? (
              <a className="nowplaying-track" href={data.trackUrl} target="_blank" rel="noopener noreferrer">
                {data.track}
              </a>
            ) : (
              <a className="nowplaying-track">{data?.track || ""}</a>
            )}
            {data?.artistUrl ? (
              <a className="nowplaying-artist" href={data.artistUrl} target="_blank" rel="noopener noreferrer">
                {data.artist}
              </a>
            ) : (
              <a className="nowplaying-artist">{data?.artist || ""}</a>
            )}
          </div>
        </div>
        <div className="nowplaying-main">
          <div
            className="nowplaying-progress"
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
            <span className="nowplaying-time">{formatClock(progress.current)}</span>
            <div className="nowplaying-trackbar">
              <i style={{ width: progress.ratio * 100 + "%" }} />
              <b className="nowplaying-knob" style={{ left: progress.ratio * 100 + "%" }} />
            </div>
            <span className="nowplaying-time">{formatClock(progress.duration)}</span>
          </div>
          <div className="nowplaying-controls">
            <button type="button" className="np-btn" aria-label="Föregående" onClick={onPrev}>
              <PrevIcon />
            </button>
            <button
              type="button"
              className={"np-btn np-play" + (playing ? " is-on" : "")}
              aria-label={playing ? "Pausa" : "Spela"}
              aria-pressed={playing ? "true" : "false"}
              onClick={onToggle}
            >
              <PlayIcon />
              <PauseIcon />
            </button>
            <button type="button" className="np-btn" aria-label="Nästa" onClick={onNext}>
              <NextIcon />
            </button>
          </div>
          <span className="nowplaying-source">
            <a
              className="nowplaying-link"
              href={data?.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              hidden={!data?.url}
            >
              {data?.source === "soundcloud" ? "SoundCloud" : "Bandcamp"}
            </a>
          </span>
        </div>
      </div>
    </aside>
  );
}
