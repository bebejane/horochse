"use client";

import s from "./ConcertApp.module.scss";
import cn from "classnames";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUpdated, toIso, todayDate, weekMondayIso } from "@/lib/dates";
import { clearStoredSettings, filteredEvents, isLocalHost, loadFilterMode, loadMine, loadPickerOpen, saveFilterMode, saveMine, savePickerSeen, upcomingEvents } from "@/lib/events";
import type { CalStyle, ConcertEvent, EventsPayload, FilterMode, ListDensity, ThemeMode, ViewMode } from "@/lib/types";
import { usePlayer } from "@/hooks/usePlayer";
import { CalendarView } from "./CalendarView";
import { ListView } from "./ListView";
import list from "./ListView.module.scss";
import { Mast, MastSymbol } from "./Mast";
import { NowPlayingBar } from "./NowPlayingBar";

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToCard(event: ConcertEvent, opts: { force?: boolean; behavior?: ScrollBehavior } = {}) {
  const card =
    document.querySelector<HTMLElement>('[data-card][data-id="' + event.id + '"]') ||
    document.querySelector<HTMLElement>('[data-cal-event][data-id="' + event.id + '"]');
  if (!card) return;
  const mast = document.querySelector<HTMLElement>("[data-mast]");
  const bar = document.getElementById("nowplaying");
  let topBound = mast ? mast.getBoundingClientRect().bottom : 0;
  const bottomBound = bar && bar.classList.contains("isOn")
    ? bar.getBoundingClientRect().top
    : window.innerHeight;
  const motion = opts.behavior || (prefersReducedMotion() ? "auto" : "smooth");
  if (card.matches("[data-cal-event]")) {
    const week = card.closest<HTMLElement>("[data-week]");
    const calHeads = week && week.querySelector<HTMLElement>("[data-cal-heads]");
    if (calHeads) topBound += calHeads.getBoundingClientRect().height;
    const dayCol = card.closest<HTMLElement>("[data-cal-day]");
    if (week && dayCol && week.scrollWidth > week.clientWidth + 2) {
      const dayRect = dayCol.getBoundingClientRect();
      const weekRect = week.getBoundingClientRect();
      if (dayRect.left < weekRect.left + 4 || dayRect.right > weekRect.right - 4) {
        week.scrollLeft += dayRect.left - weekRect.left;
      }
    }
    const calRect = card.getBoundingClientRect();
    if (!opts.force && Math.abs(calRect.top - (topBound + 10)) < 12) return;
    window.scrollTo({
      top: Math.max(0, window.scrollY + calRect.top - topBound - 10),
      behavior: opts.behavior || "auto",
    });
    return;
  }
  const day = card.closest<HTMLElement>("[data-day]");
  const heading = day?.querySelector<HTMLElement>("[data-day-title]");
  if (heading && heading.getBoundingClientRect().bottom <= card.getBoundingClientRect().top + 4) {
    topBound += heading.getBoundingClientRect().height;
  }
  const rect = card.getBoundingClientRect();
  if (!opts.force && rect.top >= topBound - 2 && rect.bottom <= bottomBound - 16) return;
  window.scrollTo({
    top: Math.max(0, window.scrollY + rect.top - topBound - 10),
    behavior: motion,
  });
}

function queueScrollToCard(event: ConcertEvent) {
  const id = event.id;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      scrollToCard(event);
    });
  });
  void id;
}

export function ConcertApp({ payload }: { payload: EventsPayload }) {
  const events: ConcertEvent[] = payload.events || [];
  const updated = payload.updated || "";
  const rangeTo = payload.range?.to || null;
  const errors = payload.errors || {};
  const status = "";
  const loaded = true;
  const [mode, setMode] = useState<FilterMode>("all");
  const [mine, setMine] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [calStyle, setCalStyle] = useState<CalStyle>("full");
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [density, setDensity] = useState<ListDensity>("more");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [localHost, setLocalHost] = useState(false);
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 840px)").matches,
  );
  const effectiveView: ViewMode = narrow ? "list" : view;

  const visible = useMemo(
    () => (effectiveView === "calendar" ? filteredEvents(events, mine, mode, peek) : upcomingEvents(events, mine, mode, peek)),
    [events, mine, mode, peek, effectiveView],
  );
  const playlistEvents = useMemo(() => filteredEvents(events, mine, mode, peek), [events, mine, mode, peek]);

  const scrollPlaying = useCallback((event: ConcertEvent) => {
    scrollToCard(event);
    queueScrollToCard(event);
  }, []);

  const player = usePlayer({ events: playlistEvents, onNeedScroll: scrollPlaying });

  useEffect(() => {
    setMine(loadMine());
    setMode(loadFilterMode());
    setPickerOpen(loadPickerOpen());
    try {
      const storedView = localStorage.getItem("konserter-view");
      if (window.location.hash === "#kalender") setView("calendar");
      else if (window.location.hash === "#lista") setView("list");
      else if (storedView === "calendar") setView("calendar");
      const storedCal = localStorage.getItem("konserter-cal-style");
      if (storedCal === "simple") setCalStyle("simple");
      const storedTheme = localStorage.getItem("konserter-theme");
      if (storedTheme === "light") setTheme("light");
      const storedDensity = localStorage.getItem("konserter-density");
      if (storedDensity === "less") setDensity("less");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setLocalHost(isLocalHost());
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 840px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("isCalendar", effectiveView === "calendar");
    document.body.classList.toggle("isCalSimple", effectiveView === "calendar" && calStyle === "simple");
  }, [effectiveView, calStyle]);

  useEffect(() => {
    try { localStorage.setItem("konserter-view", view); } catch { /* ignore */ }
    try { localStorage.setItem("konserter-cal-style", calStyle); } catch { /* ignore */ }
    if (view === "calendar") history.replaceState(null, "", "#kalender");
    else history.replaceState(null, "", "#lista");
  }, [view, calStyle]);

  useEffect(() => {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("konserter-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem("konserter-density", density); } catch { /* ignore */ }
    if (density === "more") setOpenCardId(null);
  }, [density]);

  const syncLayout = useCallback(() => {
    const mast = document.querySelector<HTMLElement>("[data-mast]");
    const title = document.querySelector<HTMLElement>("[data-mast] h1");
    if (mast) {
      document.documentElement.style.setProperty("--mast-height", mast.getBoundingClientRect().height + "px");
    }
    const inner = document.querySelector<HTMLElement>("[data-mast-inner]");
    const heads = document.querySelector<HTMLElement>("[data-week] [data-cal-heads]");
    if (inner) {
      const cs = getComputedStyle(inner);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const gap = parseFloat(cs.columnGap) || 0;
      const contentWidth = inner.getBoundingClientRect().width - padL - padR;
      const weekBorder = 1;
      const mondayLine = weekBorder + (contentWidth - weekBorder) / 7;
      document.documentElement.style.setProperty(
        "--title-col",
        Math.max(0, Math.round(mondayLine - gap)) + "px"
      );
    } else if (title) {
      document.documentElement.style.setProperty("--title-col", Math.ceil(title.getBoundingClientRect().width) + "px");
    }
    if (heads) {
      document.documentElement.style.setProperty("--cal-heads-height", Math.ceil(heads.getBoundingClientRect().height) + "px");
    }
    const bar = document.getElementById("nowplaying");
    let height = 0;
    if (bar && !bar.hidden && bar.classList.contains("isOn")) {
      height = Math.ceil(bar.getBoundingClientRect().height);
    }
    document.documentElement.style.setProperty("--player-height", height + "px");
  }, []);

  useEffect(() => {
    syncLayout();
    const mast = document.querySelector<HTMLElement>("[data-mast]");
    const inner = document.querySelector<HTMLElement>("[data-mast-inner]");
    const bar = document.getElementById("nowplaying");
    const heads = document.querySelector<HTMLElement>("[data-cal-heads]");
    const ro = window.ResizeObserver ? new ResizeObserver(syncLayout) : null;
    if (ro && mast) ro.observe(mast);
    if (ro && inner) ro.observe(inner);
    if (ro && bar) ro.observe(bar);
    if (ro && heads) ro.observe(heads);
    window.addEventListener("resize", syncLayout);
    return () => {
      window.removeEventListener("resize", syncLayout);
      ro?.disconnect();
    };
  }, [syncLayout, effectiveView, player.barOn, visible.length, pickerOpen]);

  useEffect(() => {
    player.rebindAfterRender();
    // Intentionally omit `player` so rebind runs on view/filter changes, not every player tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveView, visible, player.rebindAfterRender]);

  const sourceErrors = Object.keys(errors || {});
  const statusText = !loaded
    ? "Hämtar veckans konserter…"
    : !visible.length
      ? "Inga konserter hittades för den här veckan" + (
        peek
          ? " på den valda scenen."
          : mode === "mine"
            ? mine.length
              ? " på dina scener."
              : ". Välj scener under Dina scener."
            : "."
      )
      : sourceErrors.length
        ? "Kunde inte hämta: " + sourceErrors.join(", ") + "."
        : "";
  const emptyList = loaded && !visible.length;
  const statusHidden = emptyList || (loaded && visible.length > 0 && !sourceErrors.length);

  const currentWeek = player.eventId
    ? (() => {
        const ev = playlistEvents.find((e) => e.id === player.eventId);
        return ev ? weekMondayIso(ev.date) : "";
      })()
    : "";

  const closePicker = useCallback(() => {
    savePickerSeen();
    setPickerOpen(false);
  }, []);

  const onFilterVenue = useCallback((slug: string) => {
    setPickerOpen(false);
    setPeek((current) => (current === slug ? null : slug));
  }, []);

  function onSetView(next: ViewMode) {
    const changed = next !== view;
    setView(next);
    if (next === "calendar") setCalStyle("full");
    if (changed && player.eventId) {
      const ev = playlistEvents.find((e) => e.id === player.eventId);
      if (ev) {
        const go = () => scrollToCard(ev, { force: true, behavior: "auto" });
        setTimeout(go, 0);
        setTimeout(go, 80);
      }
    }
  }

  return (
    <div>
      <a className="skip" href="#program">Hoppa till programmet</a>
      <Mast
        mode={mode}
        mine={mine}
        peek={peek}
        pickerOpen={pickerOpen}
        view={view}
        calStyle={calStyle}
        theme={theme}
        density={density}
        onSelectAll={() => {
          savePickerSeen();
          setMode("all");
          saveFilterMode("all");
          setPeek(null);
          setPickerOpen(false);
        }}
        onTogglePicker={() => {
          setPeek(null);
          if (pickerOpen) {
            savePickerSeen();
            setPickerOpen(false);
            if (mine.length) {
              setMode("mine");
              saveFilterMode("mine");
            }
            return;
          }
          if (!mine.length) {
            setPickerOpen(true);
            return;
          }
          if (mode !== "mine") {
            setMode("mine");
            saveFilterMode("mine");
            return;
          }
          setPickerOpen(true);
        }}
        onClosePicker={closePicker}
        onAddMine={(slug) => {
          if (mine.includes(slug)) return;
          const next = [...mine, slug];
          setMine(next);
          saveMine(next);
          savePickerSeen();
          setMode("mine");
          saveFilterMode("mine");
        }}
        onRemoveMine={(slug) => {
          const next = mine.filter((item) => item !== slug);
          setMine(next);
          saveMine(next);
          if (peek === slug) setPeek(null);
          if (!next.length && !pickerOpen) {
            setMode("all");
            saveFilterMode("all");
          }
        }}
        onPeekVenue={(slug) => {
          if (pickerOpen) return;
          setPeek((current) => (current === slug ? null : slug));
        }}
        onClearPeek={() => setPeek(null)}
        onSetView={onSetView}
        onSetCalStyle={(style) => {
          setView("calendar");
          setCalStyle(style);
        }}
        onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
        onToggleDensity={() => setDensity(density === "less" ? "more" : "less")}
        onLayout={syncLayout}
      />
      <div className={s.shell}>
        <main id="program">
          <p className={cn(s.status, { isHidden: statusHidden })}>{statusText || status}</p>
          {emptyList ? (
            <div className={cn(list.weekHead, { isNext: true })}>
              <div className={list.weekHeadMain}>
                <p className={list.weekHeadTitle}>{statusText}</p>
              </div>
            </div>
          ) : null}
          <div id="days">
            {emptyList ? null : effectiveView === "calendar" ? (
              <CalendarView
                events={visible}
                rangeTo={rangeTo}
                playing={player.playing}
                eventId={player.eventId}
                loadingId={player.loadingId}
                currentWeek={currentWeek}
                simple={calStyle === "simple"}
                onToggle={player.togglePlay}
                onPrev={player.playEventPrev}
                onNext={player.playEventNext}
                onPlayWeek={(week) => player.playWeek(week, weekMondayIso, toIso(todayDate()))}
                onFilterVenue={onFilterVenue}
                onPreload={player.preloadEvent}
                onPreloadWeek={(week) => player.preloadWeek(week, weekMondayIso, toIso(todayDate()))}
              />
            ) : (
              <ListView
                events={visible}
                playing={player.playing}
                eventId={player.eventId}
                trackIndex={player.trackIndex}
                loadingId={player.loadingId}
                currentWeek={currentWeek}
                compact={narrow && density === "less"}
                expandedId={openCardId}
                onToggle={player.togglePlay}
                onPrev={player.playEventPrev}
                onNext={player.playEventNext}
                onPlayWeek={(week) => player.playWeek(week, weekMondayIso, toIso(todayDate()))}
                onFilterVenue={onFilterVenue}
                onExpandCard={(id) => setOpenCardId((current) => (current === id ? null : id))}
                onPreload={player.preloadEvent}
                onPreloadWeek={(week) => player.preloadWeek(week, weekMondayIso, toIso(todayDate()))}
              />
            )}
          </div>
        </main>
      </div>
      <footer className={s.colophon}>
        {localHost ? (
          <button
            type="button"
            className={s.colophonReset}
            aria-label="Nollställ sidan till första besöket"
            title="Nollställ sidan till första besöket"
            onClick={() => {
              clearStoredSettings();
              document.documentElement.removeAttribute("data-theme");
              history.replaceState(null, "", window.location.pathname + window.location.search);
              window.location.reload();
            }}
          >
            <MastSymbol />
          </button>
        ) : (
          <MastSymbol />
        )}
        <p className={s.colophonCopy}>
          Hör & Se hämtar informationen veckovis från alla scenerna. Fel kan ibland uppstå,{" "}
          <a href="mailto:hos@konst-teknik.se">maila oss</a> gärna i så fall.
        </p>
        <p className={s.updated}>{formatUpdated(updated)}</p>
      </footer>
      <NowPlayingBar
        hidden={player.barHidden}
        on={player.barOn}
        playing={player.playing}
        data={player.nowPlaying}
        progress={player.progress}
        scrubbingRef={player.scrubbingRef}
        onSeek={player.seekToRatio}
        onPrev={player.playPrev}
        onToggle={player.toggleBarPlay}
        onNext={player.playNext}
      />
      <iframe
        ref={player.iframeRef}
        id="sc-widget"
        title="SoundCloud"
        allow="autoplay; encrypted-media"
        src="https://w.soundcloud.com/player/?auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false"
      />
      <div id="yt-host" aria-hidden="true">
        <div ref={player.ytContainerRef} />
      </div>
    </div>
  );
}
