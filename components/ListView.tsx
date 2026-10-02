"use client";

import { formatDay, toIso, todayDate, weekTitle } from "@/lib/dates";
import { groupByDay, groupEventsByWeek, isPlayable } from "@/lib/events";
import type { ConcertEvent } from "@/lib/types";
import { EventCard } from "./EventCard";
import { PauseIcon, PlayIcon } from "./Icons";

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
  return (
    <div className={"week-head" + (isFirst ? "" : " is-next")}>
      <div className="week-head-main">
        <p className="week-head-title">{title}</p>
        {playable && !hidePlay ? (
          <div className="week-head-listen">
            <span className="week-head-listen-label">Hör exempel på veckans musik</span>
            <button
              type="button"
              className={"play week-play" + (on ? " is-on" : "")}
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
        <div key={group.key}>
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
              <section className={"day" + (dayIndex === 0 ? " is-week-start" : "")} key={day.date}>
                <h2 className="day-title">
                  <b>{heading.kicker}</b>
                  <span>{heading.rest}</span>
                </h2>
                <div className="list">
                  <div className="list-rule" aria-hidden="true" />
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
