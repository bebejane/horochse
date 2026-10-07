"use client";

import s from "./CalendarView.module.scss";
import cn from "classnames";

import { useState, type ReactNode } from "react";
import { formatDay, parseDay, toIso, todayDate, weekTitle } from "@/lib/dates";
import { calendarWeeks, displayTitle, eventTimes, isPlayable, titleHits } from "@/lib/events";
import type { ConcertEvent } from "@/lib/types";
import { WeekHead } from "./ListView";
import { MastSymbol } from "./Mast";
import { ListenMore } from "./ListenMore";
import { PlayButton } from "./PlayButton";
import { RemoteImage } from "./RemoteImage";

function calendarTitleParts(
  title: string,
  hits: ReturnType<typeof titleHits>,
  current: boolean,
  trackIndex: number,
): ReactNode[] {
  if (!hits.length) return [title];
  const parts: ReactNode[] = [];
  let cursor = 0;
  hits.forEach((hit) => {
    if (hit.start > cursor) parts.push(title.slice(cursor, hit.start));
    parts.push(
      <span
        key={hit.i + "-" + hit.start}
        className={cn(s.calArtist, { isCurrent: current && hit.i === trackIndex })}
      >
        {hit.text}
      </span>,
    );
    cursor = hit.end;
  });
  if (cursor < title.length) parts.push(title.slice(cursor));
  return parts;
}

function CalendarEvent({
  event,
  playing,
  current,
  trackIndex,
  loading,
  onToggle,
  onPrev,
  onNext,
  onFilterVenue,
  onPreload,
}: {
  event: ConcertEvent;
  playing: boolean;
  current: boolean;
  trackIndex: number;
  loading: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onFilterVenue: (slug: string) => void;
  onPreload?: () => void;
}) {
  const playable = isPlayable(event);
  const title = displayTitle(event);
  const hits = titleHits(event);
  const hasCurrentArtist = current && hits.some((hit) => hit.i === trackIndex);
  const [artFailed, setArtFailed] = useState(!event.image);
  const art = !artFailed ? event.image : undefined;
  const showArt = !!art;
  const showSymbol = !showArt;
  return (
    <article
      className={cn(s.calEvent, {
        hasArt: showArt,
        hasSymbol: showSymbol,
        hasPlay: playable,
        isLive: playing && current,
        isCurrent: current,
      })}
      data-cal-event
      data-venue={event.venue_slug}
      data-id={event.id}
    >
      <div className={s.calEventLink}>
        <a
          className={s.calEventHit}
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={title}
        />
        {art ? (
          <>
            <RemoteImage
              className={s.calEventArt}
              src={art}
              sizes="(max-width: 840px) 50vw, 240px"
              onError={() => setArtFailed(true)}
            />
            <span className={s.calTint} aria-hidden="true" />
          </>
        ) : showSymbol ? (
          <div className={s.calEventFallback} aria-hidden="true">
            <MastSymbol />
          </div>
        ) : null}
        <span className={s.calMeta}>
          {eventTimes(event).map((item) => (
            <span className={s.calTime} key={item}>{item}</span>
          ))}
          <button
            type="button"
            className={s.calVenue}
            aria-label={"Visa bara " + event.venue}
            onClick={() => onFilterVenue(event.venue_slug)}
          >
            {event.venue}
          </button>
          {event.place && event.place !== event.venue ? (
            <span className={s.calPlace}>{event.place}</span>
          ) : null}
        </span>
        <span className={cn(s.calTitle, { hasCurrentArtist })}>
          {calendarTitleParts(title, hits, current, trackIndex)}
        </span>
      </div>
      <div className={s.calActions}>
        <ListenMore event={event} label="Hör" />
        {event.url ? (
          <a className="go" href={event.url} target="_blank" rel="noopener noreferrer">
            Se
          </a>
        ) : null}
        <a className={cn("go", { goDown: true })} href={"/kalender/" + encodeURIComponent(event.id) + ".ics"}>
          <span>Spara</span>
        </a>
      </div>
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
    </article>
  );
}

export function CalendarView({
  events,
  rangeTo,
  playing,
  eventId,
  trackIndex,
  loadingId,
  currentWeek,
  simple,
  onToggle,
  onPrev,
  onNext,
  onPlayWeek,
  onFilterVenue,
  onPreload,
  onPreloadWeek,
}: {
  events: ConcertEvent[];
  rangeTo?: string | null;
  playing: boolean;
  eventId: string;
  trackIndex: number;
  loadingId: string;
  currentWeek: string;
  simple?: boolean;
  onToggle: (event: ConcertEvent) => void;
  onPrev: () => void;
  onNext: () => void;
  onPlayWeek: (week: string) => void;
  onFilterVenue: (slug: string) => void;
  onPreload?: (event: ConcertEvent) => void;
  onPreloadWeek?: (week: string) => void;
}) {
  const byDay: Record<string, ConcertEvent[]> = {};
  events.forEach((event) => {
    if (!byDay[event.date]) byDay[event.date] = [];
    byDay[event.date].push(event);
  });
  const today = toIso(todayDate());
  const weeks = calendarWeeks(rangeTo);

  function renderEvent(event: ConcertEvent) {
    return (
      <CalendarEvent
        key={event.id}
        event={event}
        playing={playing}
        current={eventId === event.id}
        trackIndex={trackIndex}
        loading={loadingId === event.id}
        onToggle={() => onToggle(event)}
        onPrev={onPrev}
        onNext={onNext}
        onFilterVenue={onFilterVenue}
        onPreload={() => onPreload?.(event)}
      />
    );
  }

  if (simple) {
    return (
      <div className={cn(s.weeks, { isSimple: true })}>
        {weeks.map((weekDays, index) => {
          const hasEvents = weekDays.some((iso) => (byDay[iso] || []).length);
          if (!hasEvents && index !== 0) return null;
          return (
          <div className={s.week} key={weekDays[0]} role="grid" aria-label="Veckokalender" data-week>
            <div className={s.calHeads} data-cal-heads>
              {weekDays.map((iso) => {
                const day = parseDay(iso);
                const heading = formatDay(iso);
                return (
                  <h2
                    key={iso}
                    className={cn(s.calHead, { isToday: iso === today })}
                    id={"cal-" + iso}
                    aria-current={iso === today ? "date" : undefined}
                  >
                    <span>{heading.kicker}</span>
                    <b>{day.getDate()}</b>
                  </h2>
                );
              })}
            </div>
            <div className={s.calCols}>
              {weekDays.map((iso) => (
                <section
                  key={iso}
                  className={cn(s.calDay, { isToday: iso === today })}
                  role="gridcell"
                  aria-labelledby={"cal-" + iso}
                  data-cal-day
                >
                  <div className={s.calBody}>
                    {(byDay[iso] || []).map(renderEvent)}
                  </div>
                </section>
              ))}
            </div>
          </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={s.weeks}>
      {weeks.map((weekDays, index) => {
        const weekEvents: ConcertEvent[] = [];
        weekDays.forEach((iso) => {
          (byDay[iso] || []).forEach((event) => weekEvents.push(event));
        });
        const key = weekDays[0];
        if (!weekEvents.length && index !== 0) return null;
        return (
          <div className={s.weekBlock} key={key}>
            <WeekHead
              title={weekTitle(key, weekDays)}
              weekKey={key}
              events={weekEvents}
              isFirst={index === 0}
              always
              playing={playing}
              currentWeek={currentWeek}
              onPlayWeek={onPlayWeek}
              onPreloadWeek={onPreloadWeek}
            />
            <div className={s.week} role="grid" aria-label="Veckokalender" data-week>
              <div className={s.calHeads} data-cal-heads>
                {weekDays.map((iso) => {
                  const day = parseDay(iso);
                  const heading = formatDay(iso);
                  return (
                    <h2
                      key={iso}
                      className={cn(s.calHead, { isToday: iso === today })}
                      id={"cal-" + iso}
                      aria-current={iso === today ? "date" : undefined}
                    >
                      <span>{heading.kicker}</span>
                      <b>{day.getDate()}</b>
                    </h2>
                  );
                })}
              </div>
              <div className={s.calCols}>
                {weekDays.map((iso) => (
                  <section
                    key={iso}
                    className={cn(s.calDay, { isToday: iso === today })}
                    role="gridcell"
                    aria-labelledby={"cal-" + iso}
                    data-cal-day
                  >
                    <div className={s.calBody}>
                      {(byDay[iso] || []).map(renderEvent)}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
