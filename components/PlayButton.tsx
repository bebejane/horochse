"use client";

import s from "./PlayButton.module.scss";
import cn from "classnames";

import { eventTracks, trackSource } from "@/lib/events";
import type { ConcertEvent } from "@/lib/types";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./Icons";

export function PlayButton({
  event,
  playing,
  current,
  loading,
  onToggle,
  onPrev,
  onNext,
  onPreload,
}: {
  event: ConcertEvent;
  playing: boolean;
  current: boolean;
  loading: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPreload?: () => void;
}) {
  const tracks = eventTracks(event);
  if (!tracks.length) return null;
  const first = tracks[0];
  const source = trackSource(first);
  const n = tracks.length;
  const label = n > 1
    ? "Spela " + n + " låtar från " + (event.title || "konserten")
    : "Spela " + (first.track || first.album || "en låt") +
      (first.artist ? " av " + first.artist : "") +
      (source === "soundcloud" ? " från SoundCloud" : " från Bandcamp");
  const playBtn = (
    <button
      type="button"
      className={cn(s.play, { "is-on": playing && current, "is-loading": loading })}
      data-play
      data-id={event.id}
      title={label}
      aria-label={label}
      aria-pressed={playing && current ? "true" : "false"}
      onPointerEnter={() => onPreload?.()}
      onFocus={() => onPreload?.()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
    >
      <PlayIcon />
      <PauseIcon />
      {n > 1 ? <span className={s.playCount} data-play-count>{n}</span> : null}
    </button>
  );
  if (n < 2) return playBtn;
  return (
    <div className={cn(s.playCluster, { "is-open": current })} data-play-cluster data-id={event.id}>
      <button
        type="button"
        className={cn(s.playSkip, s.playSkipPrev)}
        data-play-skip
        tabIndex={current ? 0 : -1}
        aria-hidden={current ? "false" : "true"}
        aria-label="Föregående låt"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPrev();
        }}
      >
        <PrevIcon />
      </button>
      {playBtn}
      <button
        type="button"
        className={cn(s.playSkip, s.playSkipNext)}
        data-play-skip
        tabIndex={current ? 0 : -1}
        aria-hidden={current ? "false" : "true"}
        aria-label="Nästa låt"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onNext();
        }}
      >
        <NextIcon />
      </button>
    </div>
  );
}
