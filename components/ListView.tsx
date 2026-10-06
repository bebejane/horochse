"use client";

import s from "./ListView.module.scss";
import cn from "classnames";

import { useLayoutEffect, useRef } from "react";
import { formatDay, toIso, todayDate, weekTitle } from "@/lib/dates";
import { groupByDay, groupEventsByWeek, isPlayable } from "@/lib/events";
import type { ConcertEvent } from "@/lib/types";
import { EventCard } from "./EventCard";
import { PauseIcon, PlayIcon } from "./Icons";
import play from "./PlayButton.module.scss";

function WeekHead({
  title,
  weekKey,
  events,
  isFirst,
  always,
  playing,
  currentWeek,
  hidePlay,
  onPlayWeek,
  onPreloadWeek,
}: {
  title: string;
  weekKey: string;
  events: ConcertEvent[];
  isFirst: boolean;
  always?: boolean;
  playing: boolean;
  currentWeek: string;
  hidePlay?: boolean;
  onPlayWeek: (week: string) => void;
  onPreloadWeek?: (week: string) => void;
}) {
  const today = toIso(todayDate());
  const playable = events.some((event) => isPlayable(event) && event.date >= today);
  if (!always && !events.length) return null;
  const label = isFirst
    ? "Spela från första låten"
    : title === "Nästa vecka"
      ? "Spela nästa vecka"
      : "Spela " + title;
  const on = playing && currentWeek === weekKey;
  const headRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = headRef.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const apply = () => {
      parent.style.setProperty("--week-head", Math.ceil(node.offsetHeight) + "px");
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => {
      observer.disconnect();
      parent.style.removeProperty("--week-head");
    };
  }, []);
  return (
    <div ref={headRef} className={cn(s.weekHead, { isNext: !isFirst })} data-week-head>
      <div className={s.weekHeadMain}>
        <p className={s.weekHeadTitle}>{title}</p>
        {playable && !hidePlay ? (
          <div className={s.weekHeadListen}>
            <span className={s.weekHeadListenLabel}>Hör exempel på veckans musik</span>
            <button
              type="button"
              className={cn(play.play, { isOn: on })}
              data-week={weekKey}
              aria-pressed={on ? "true" : "false"}
              aria-label={label}
              title={label}
              onPointerEnter={() => onPreloadWeek?.(weekKey)}
              onFocus={() => onPreloadWeek?.(weekKey)}
              onClick={() => onPlayWeek(weekKey)}
            >
              <PlayIcon />
              <PauseIcon />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ListView({
  events,
  playing,
  eventId,
  trackIndex,
  loadingId,
  currentWeek,
  onToggle,
  onPrev,
  onNext,
  onPlayWeek,
  onFilterVenue,
  compact,
  expandedId,
  onExpandCard,
  onPreload,
  onPreloadWeek,
}: {
  events: ConcertEvent[];
  playing: boolean;
  eventId: string;
  trackIndex: number;
  loadingId: string;
  currentWeek: string;
  onToggle: (event: ConcertEvent) => void;
  onPrev: () => void;
  onNext: () => void;
  onPlayWeek: (week: string) => void;
  onFilterVenue: (slug: string) => void;
  compact?: boolean;
  expandedId?: string | null;
  onExpandCard?: (id: string) => void;
  onPreload?: (event: ConcertEvent) => void;
  onPreloadWeek?: (week: string) => void;
}) {
  return (
    <>
      {groupEventsByWeek(events).map((group, index) => (
        <div className={s.week} key={group.key}>
          <WeekHead
            title={weekTitle(group.key, group.days)}
            weekKey={group.key}
            events={group.events}
            isFirst={index === 0}
            playing={playing}
            currentWeek={currentWeek}
            onPlayWeek={onPlayWeek}
            onPreloadWeek={onPreloadWeek}
          />
          {groupByDay(group.events).map((day, dayIndex) => {
            const heading = formatDay(day.date);
            return (
              <section className={cn(s.day, { isWeekStart: dayIndex === 0 })} data-day key={day.date}>
                <h2 className={s.dayTitle} data-day-title>
                  <b>{heading.kicker}</b>
                  <span>{heading.rest}</span>
                </h2>
                <div className={s.list}>
                  <div className={s.listRule} aria-hidden="true" />
                  {day.events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      playing={playing}
                      current={eventId === event.id}
                      loading={loadingId === event.id}
                      trackIndex={trackIndex}
                      compact={compact}
                      expanded={expandedId === event.id}
                      onToggle={() => onToggle(event)}
                      onPrev={onPrev}
                      onNext={onNext}
                      onFilterVenue={onFilterVenue}
                      onExpand={() => onExpandCard?.(event.id)}
                      onPreload={() => onPreload?.(event)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ))}
    </>
  );
}

export { WeekHead };
