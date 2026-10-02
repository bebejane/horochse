"use client";

import s from "./EventCard.module.scss";
import cn from "classnames";

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
      <span className={cn(s.posterWrap, "is-fallback")} aria-hidden="true">
        <MastSymbol />
      </span>
    );
  }
  return (
    <span className={s.posterWrap}>
      <img
        className={s.poster}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
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
      <span className={s.metaTimeSep}>:</span>
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
  const parts: ReactNode[] = [<NowArrow key="lead" className={cn(s.nowArrow, s.nowArrowLead)} />];
  if (hits.length) {
    let cursor = 0;
    hits.forEach((hit) => {
      if (hit.start > cursor) parts.push(title.slice(cursor, hit.start));
      parts.push(
        <span
          key={hit.i + hit.start}
          className={cn(s.titleArtist, { "is-current": current && hit.i === trackIndex })}
          data-i={hit.i}
        >
          <NowArrow className={s.nowArrow} />
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
    <h3 className={cn(s.title, { "has-artists": hits.length > 0, "has-current-artist": hasCurrentArtist })}>
      <a className={s.cardTitleLink} href={href} target="_blank" rel="noopener noreferrer">
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
      className={cn(s.card, {
        "has-play": playable,
        "is-live": playing && current,
        "is-current": current,
        "is-compact": compact,
        "is-compact-closed": compactClosed,
      })}
      data-card
      data-id={event.id}
      onClick={(eventClick) => {
        if (!compact) return;
        const target = eventClick.target;
        if (target instanceof Element && target.closest("a, button, [data-listen-more]")) return;
        onExpand?.();
      }}
    >
      <div className={s.cardMain}>
        <div className={s.posterSlot}>
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
        <div className={s.cardText}>
          <p className={s.meta}>
          {times.length ? times.map((item) => <span key={item}>{formatMetaTime(item)}</span>) : <span>Tid saknas</span>}
          <button
            type="button"
            className={s.venue}
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
          <span className={s.nowLabel}>Spelas nu</span>
          <span className={cn(s.metaHint, s.metaRead, s.venue)} data-venue={event.venue_slug} aria-hidden="true">
            Läs mer hos {event.venue}
          </span>
          {listenLabel ? (
            <span className={cn(s.metaHint, s.metaListen, s.venue)} data-venue={event.venue_slug} aria-hidden="true">
              Lyssna på fler låtar på {listenLabel}
            </span>
          ) : null}
        </p>
        <div className={s.cardBody}>
          <div className={s.cardCopy}>
            <Title event={event} current={current} trackIndex={trackIndex} href={href} />
            {event.text ? <p className={s.text}>{event.text}</p> : null}
          </div>
          <div className={s.cardActions}>
            <a className={cn("go", s.cardRead)} href={href} target="_blank" rel="noopener noreferrer">Se mer</a>
            <ListenMore event={event} />
            <a className={cn("go", "go-down")} href={ics}>Lägg till i kalender</a>
          </div>
        </div>
        </div>
      </div>
    </article>
  );
}
