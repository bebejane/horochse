"use client";

import s from "./CalendarView.module.scss";
import cn from "classnames";

import { useState } from "react";
import { formatDay, parseDay, toIso, todayDate, weekTitle } from "@/lib/dates";
import { calendarWeeks, displayTitle, eventTimes, isPlayable } from "@/lib/events";
import type { ConcertEvent } from "@/lib/types";
import { WeekHead } from "./ListView";
import { MastSymbol } from "./Mast";
import { PlayButton } from "./PlayButton";

function CalendarEvent({
  event,
  playing,
  current,
  loading,
  simple,
  onToggle,
  onPrev,
  onNext,
  onFilterVenue,
  onPreload,
}: {
  event: ConcertEvent;
  playing: boolean;
  current: boolean;
  loading: boolean;
  simple?: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onFilterVenue: (slug: string) => void;
  onPreload?: () => void;
}) {
  const playable = !simple && isPlayable(event);
  const title = displayTitle(event);
  const [artFailed, setArtFailed] = useState(!event.image);
  const showArt = !simple && !!event.image && !artFailed;
  const showSymbol = !simple && !showArt;
  return (
    <article
      className={cn(s.calEvent, {
        "has-art": showArt,
        "has-symbol": showSymbol,
        "has-play": playable,
        "is-live": playing && current,
        "is-current": current,
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
        {showArt ? (
          <img
            className={s.calEventArt}
            src={event.image}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setArtFailed(true)}
          />
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
        <span className={s.calTitle}>{title}</span>
      </div>
      {simple ? null : (
        <a className={cn("go", s.calIcs, "go-down")} href={"/kalender/" + encodeURIComponent(event.id) + ".ics"}>
          Lägg till<span className={s.calIcsRest}>&nbsp;i kalender</span>
        </a>
      )}
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
        loading={loadingId === event.id}
        simple={simple}
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
      <div className={cn(s.weeks, "is-simple")}>
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
                    className={cn(s.calHead, { "is-today": iso === today })}
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
                  className={cn(s.calDay, { "is-today": iso === today })}
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
                      className={cn(s.calHead, { "is-today": iso === today })}
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
                    className={cn(s.calDay, { "is-today": iso === today })}
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
