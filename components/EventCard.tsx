"use client";

import { useState, type ReactNode } from "react";
import { displayTitle, eventTimes, isPlayable, listenMoreItems, titleHits } from "@/lib/events";
import type { ConcertEvent } from "@/lib/types";
import { NowArrow } from "./Icons";
import { ListenMore } from "./ListenMore";
import { MastSymbol } from "./Mast";
import { PlayButton } from "./PlayButton";

function EventPoster({ src }: { src?: string }) {
  const [failed, setFailed] = useState(!src);
  if (!src || failed) {
    return (
      <span className="poster-wrap is-fallback" aria-hidden="true">
        <MastSymbol />
      </span>
    );
  }
  return (
    <span className="poster-wrap">
      <img
        className="poster"
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function formatMetaTime(time: string) {
  const colon = time.indexOf(":");
  if (colon < 0) return time;
  return (
    <>
      {time.slice(0, colon)}
      <span className="meta-time-sep">:</span>
      {time.slice(colon + 1)}
    </>
  );
}

function Title({
  event,
  current,
  trackIndex,
  href,
}: {
  event: ConcertEvent;
  current: boolean;
  trackIndex: number;
  href: string;
}) {
  const title = displayTitle(event);
  const hits = titleHits(event);
  const hasCurrentArtist = current && hits.some((hit) => hit.i === trackIndex);
  const parts: ReactNode[] = [<NowArrow key="lead" kind="lead" />];
  if (hits.length) {
    let cursor = 0;
    hits.forEach((hit) => {
      if (hit.start > cursor) parts.push(title.slice(cursor, hit.start));
      parts.push(
        <span
          key={hit.i + hit.start}
          className={"title-artist" + (current && hit.i === trackIndex ? " is-current" : "")}
          data-i={hit.i}
        >
          <NowArrow />
          {hit.text}
        </span>,
      );
      cursor = hit.end;
    });
    if (cursor < title.length) parts.push(title.slice(cursor));
  } else {
    parts.push(title);
  }
  return (
    <h3 className={"title" + (hits.length ? " has-artists" : "") + (hasCurrentArtist ? " has-current-artist" : "")}>
      <a className="card-title-link" href={href} target="_blank" rel="noopener noreferrer">
        {parts}
      </a>
    </h3>
  );
}

export function EventCard({
  event,
  playing,
  current,
  loading,
  trackIndex,
  compact,
  expanded,
  onToggle,
  onPrev,
  onNext,
  onFilterVenue,
  onExpand,
  onPreload,
}: {
  event: ConcertEvent;
  playing: boolean;
  current: boolean;
  loading: boolean;
  trackIndex: number;
  compact?: boolean;
  expanded?: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onFilterVenue: (slug: string) => void;
  onExpand?: () => void;
  onPreload?: () => void;
}) {
  const href = event.url;
  const ics = "/kalender/" + encodeURIComponent(event.id) + ".ics";
  const times = eventTimes(event);
  const place = event.place && event.place !== event.venue ? event.place : "";
  const playable = isPlayable(event);
  const compactClosed = Boolean(compact && !expanded);
  const listenSources = [...new Set(listenMoreItems(event).map((item) => item.source).filter(Boolean))];
  const listenLabel = listenSources.length < 2
    ? listenSources[0] || ""
    : listenSources.slice(0, -1).join(", ") + " och " + listenSources[listenSources.length - 1];
  return (
    <article
      className={
        "card"
        + (playable ? " has-play" : "")
        + (playing && current ? " is-live" : "")
        + (current ? " is-current" : "")
        + (compact ? " is-compact" : "")
        + (compactClosed ? " is-compact-closed" : "")
      }
      data-id={event.id}
      onClick={(eventClick) => {
        if (!compact) return;
        const target = eventClick.target;
        if (target instanceof Element && target.closest("a, button, .listen-more")) return;
        onExpand?.();
      }}
    >
      <div className="card-main">
        <div className="poster-slot">
          <EventPoster src={event.image} />
          {playable ? (
            <PlayButton
              event={event}
              playing={playing}
              current={current}
              loading={loading}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              onPreload={onPreload}
            />
          ) : null}
        </div>
        <div className="card-text">
          <p className="meta">
          {times.length ? times.map((item) => <span key={item}>{formatMetaTime(item)}</span>) : <span>Tid saknas</span>}
          <button
            type="button"
            className="venue"
            data-venue={event.venue_slug}
            aria-label={"Visa bara " + event.venue}
            onClick={(click) => {
              click.stopPropagation();
              onFilterVenue(event.venue_slug);
            }}
          >
            {event.venue}
          </button>
          {place ? <span>{place}</span> : null}
          <span className="now-label">Spelas nu</span>
          <span className="meta-hint meta-read venue" data-venue={event.venue_slug} aria-hidden="true">
            Läs mer hos {event.venue}
          </span>
          {listenLabel ? (
            <span className="meta-hint meta-listen venue" data-venue={event.venue_slug} aria-hidden="true">
              Lyssna på fler låtar på {listenLabel}
            </span>
          ) : null}
        </p>
        <div className="card-body">
          <div className="card-copy">
            <Title event={event} current={current} trackIndex={trackIndex} href={href} />
            {event.text ? <p className="text">{event.text}</p> : null}
          </div>
          <div className="card-actions">
            <a className="go card-read" href={href} target="_blank" rel="noopener noreferrer">Se mer</a>
            <ListenMore event={event} />
            <a className="go go-down" href={ics}>Lägg till i kalender</a>
          </div>
        </div>
        </div>
      </div>
    </article>
  );
}
