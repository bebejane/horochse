"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { displayTitle } from "@/lib/events";
import type { ConcertEvent, EventsPayload } from "@/lib/types";

import { readExcluded, writeExcluded } from "../selection-cookie";

import styles from "../ads.module.scss";
import { downloadBlob, exportFilm } from "../film";
import {
  clampCoverPan,
  drawPoster,
  loadPosterFonts,
  loadPosterImage,
  paintTicker,
  POSTER_FORMATS,
  posterImageUrl,
  TICKER_SPEED,
  venueColor,
  type CoverPan,
  type PosterFonts,
  type PosterFormat,
} from "../poster";
import { addDays, formatWeekSpan, thisWeekMonday, toIso, weekDaysFromMonday } from "@/lib/dates";

import { eventsInWeek, formatDuration, posterDate, posterWeekLine, venuesIn } from "../week";

type ImageState = HTMLImageElement | "failed";

const HOLD_OPTIONS = [1, 2, 3];

export default function WeekAdsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const fontsRef = useRef<PosterFonts | null>(null);
  const cancelExport = useRef(false);
  const [events, setEvents] = useState<ConcertEvent[] | null>(null);
  const [error, setError] = useState("");
  const [venue, setVenue] = useState("");
  const [weekMonday, setWeekMonday] = useState(() => toIso(thisWeekMonday()));
  const [formatId, setFormatId] = useState<PosterFormat["id"]>("4:5");
  const [seconds, setSeconds] = useState(2);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [excludedReady, setExcludedReady] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [images, setImages] = useState<Record<string, ImageState>>({});
  const [fonts, setFonts] = useState<PosterFonts | null>(null);
  const [cursor, setCursor] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [crops, setCrops] = useState<Record<string, CoverPan>>({});
  const [progress, setProgress] = useState("");
  const [exportError, setExportError] = useState("");
  const pausedRef = useRef(false);
  const tickerElapsed = useRef(0);
  const tickerLast = useRef<number | null>(null);
  const dragRef = useRef<{ id: string; x: number; y: number; pan: CoverPan; moved: boolean } | null>(null);

  useEffect(() => {
    setExcluded(readExcluded("hor-vecka-bort"));
    setExcludedReady(true);
  }, []);

  useEffect(() => {
    if (excludedReady) writeExcluded("hor-vecka-bort", excluded);
  }, [excluded, excludedReady]);

  useEffect(() => {
    document.title = "Veckans konserter — ADS";
    let cancel = false;
    fetch("/api/events", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<EventsPayload>;
      })
      .then((payload) => {
        if (!cancel) setEvents(payload.events ?? []);
      })
      .catch(() => {
        if (!cancel) setError("Kunde inte hämta konserterna.");
      });
    loadPosterFonts()
      .then((loaded) => {
        if (cancel) return;
        fontsRef.current = loaded;
        setFonts(loaded);
      })
      .catch(() => {
        if (!cancel) setError("Kunde inte läsa in typsnitten.");
      });
    return () => {
      cancel = true;
      cancelExport.current = true;
    };
  }, []);

  const format = POSTER_FORMATS.find((item) => item.id === formatId) ?? POSTER_FORMATS[0];
  const weekOptions = useMemo(
    () =>
      Array.from({ length: 5 }, (_, index) => {
        const monday = toIso(addDays(thisWeekMonday(), index * 7));
        const days = weekDaysFromMonday(monday);
        return { monday, label: formatWeekSpan(days[0], days[days.length - 1]) };
      }),
    [],
  );
  const week = useMemo(() => eventsInWeek(events ?? [], weekMonday), [events, weekMonday]);
  const venues = useMemo(() => venuesIn(week), [week]);
  const days = useMemo(() => weekDaysFromMonday(weekMonday), [weekMonday]);
  const weekLabel = days.length ? formatWeekSpan(days[0], days[days.length - 1]) : "";
  const ticker = days.length >= 2 ? posterWeekLine(days[0], days[days.length - 1]) : "";

  const visible = useMemo(
    () => week.filter((event) => !venue || event.venue_slug === venue),
    [week, venue],
  );

  const slides = useMemo(
    () => visible.filter((event) => !excluded.has(event.id)),
    [visible, excluded],
  );

  const slideKey = slides.map((event) => event.id).join("\n");
  const startedImages = useRef(new Set<string>());

  useEffect(() => {
    let cancel = false;
    const queue = week.filter((event) => event.image && !startedImages.current.has(event.id));
    for (const event of queue) startedImages.current.add(event.id);
    let index = 0;
    async function worker() {
      while (index < queue.length && !cancel) {
        const event = queue[index++];
        const image = event.image ? await loadPosterImage(event.image) : null;
        if (cancel) return;
        setImages((prev) => ({ ...prev, [event.id]: image ?? "failed" }));
      }
    }
    const workers = Math.min(4, queue.length);
    for (let i = 0; i < workers; i++) void worker();
    return () => {
      cancel = true;
      for (const event of queue) startedImages.current.delete(event.id);
    };
  }, [week]);

  useEffect(() => {
    setCursor(0);
  }, [venue, weekMonday]);

  useEffect(() => {
    if (exporting || paused || slides.length < 2) return;
    const id = window.setInterval(() => setCursor((value) => value + 1), seconds * 1000);
    return () => window.clearInterval(id);
  }, [slideKey, seconds, exporting, paused, slides.length]);

  const slideIndex = slides.length ? ((cursor % slides.length) + slides.length) % slides.length : 0;
  const current = slides.length ? slides[slideIndex] : null;
  const currentImage = current ? images[current.id] : undefined;
  const currentCrop = current ? crops[current.id] : undefined;
  pausedRef.current = paused;

  useEffect(() => {
    const list = listRef.current;
    if (!list || !current) return;
    const row = list.querySelector<HTMLElement>("[data-current='true']");
    if (!row) return;
    const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  }, [current]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const loaded = fontsRef.current;
    if (!canvas || !loaded) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    if (canvas.width !== format.width || canvas.height !== format.height) {
      canvas.width = format.width;
      canvas.height = format.height;
    }
    const bitmap = currentImage;
    const slide = current
      ? {
          title: titles[current.id] ?? displayTitle(current),
          venue: current.venue,
          date: posterDate(current.date),
          color: venueColor(current.venue_slug),
          image: bitmap && bitmap !== "failed" ? bitmap : null,
          crop: crops[current.id],
        }
      : null;
    const still = document.createElement("canvas");
    still.width = canvas.width;
    still.height = canvas.height;
    const stillCtx = still.getContext("2d", { alpha: false });
    if (!stillCtx) return;
    drawPoster(stillCtx, slide, loaded);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const paint = (now: number) => {
      const prev = tickerLast.current ?? now;
      if (!pausedRef.current) tickerElapsed.current += now - prev;
      tickerLast.current = now;
      ctx.drawImage(still, 0, 0);
      if (ticker) {
        paintTicker(
          ctx,
          { text: ticker, offset: reduced ? 0 : (tickerElapsed.current / 1000) * TICKER_SPEED },
          loaded,
        );
      }
      frame = window.requestAnimationFrame(paint);
    };
    frame = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(frame);
  }, [current, currentImage, currentCrop, fonts, format, ticker, titles, crops]);

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const picturesPending = slides.some((event) => event.image && images[event.id] === undefined);

  async function onExport() {
    const loaded = fontsRef.current;
    if (!loaded || !slides.length || exporting) return;
    setExporting(true);
    setExportError("");
    setProgress("Förbereder film…");
    cancelExport.current = false;
    try {
      const frames = slides.map((event) => {
        const bitmap = images[event.id];
        return {
          title: titles[event.id] ?? displayTitle(event),
          venue: event.venue,
          date: posterDate(event.date),
          color: venueColor(String(event.venue_slug)),
          image: bitmap && bitmap !== "failed" ? bitmap : null,
          crop: crops[event.id],
        };
      });
      const blob = await exportFilm(
        frames,
        seconds,
        loaded,
        format,
        ticker,
        (done, total) => setProgress(`Kodar ${done} av ${total}`),
        () => cancelExport.current,
      );
      const who = venue || "vecka";
      downloadBlob(blob, `hor-och-se-${who}-${days[0] || "vecka"}-${format.id.replace(":", "x")}.mp4`);
      setProgress("Filmen är sparad.");
    } catch (err) {
      if (!cancelExport.current) {
        setExportError(err instanceof Error ? err.message : "Exporten misslyckades.");
        setProgress("");
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/ads">
        ADS
      </Link>
      <h1>Veckans konserter</h1>
      <p className={styles.lead}>
        {format.label}, {format.width}×{format.height}. {weekLabel ? `Vecka ${weekLabel}. ` : ""}
        Bilden, titeln, scenen och datumet byts direkt, utan övergång.
      </p>

      {error ? <p className={styles.empty}>{error}</p> : null}
      {events === null && !error ? <p className={styles.empty}>Hämtar konserter…</p> : null}

      <div className={styles.controls}>
        <label className={styles.field}>
          Vecka
          <select value={weekMonday} onChange={(event) => setWeekMonday(event.target.value)}>
            {weekOptions.map((item, index) => (
              <option key={item.monday} value={item.monday}>
                {index === 0 ? "Denna vecka · " : ""}{item.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Scen
          <select value={venue} onChange={(event) => setVenue(event.target.value)}>
            <option value="">Alla scener</option>
            {venues.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Format
          <select value={format.id} onChange={(event) => setFormatId(event.target.value as PosterFormat["id"])}>
            {POSTER_FORMATS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Tid per bild
          <select value={seconds} onChange={(event) => setSeconds(Number(event.target.value))}>
            {HOLD_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value} {value === 1 ? "sekund" : "sekunder"}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.actions}>
          <button
            className={styles.button}
            type="button"
            disabled={!current || exporting}
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? "Fortsätt" : "Pausa"}
          </button>
          <button
            className={styles.button}
            type="button"
            disabled={!current || exporting}
            onClick={() => current && toggle(current.id)}
          >
            Välj bort
          </button>
          <button
            className={styles.export}
            type="button"
            disabled={!slides.length || exporting || picturesPending || !fonts}
            onClick={() => void onExport()}
          >
            Export
          </button>
        </div>
      </div>
      <p className={styles.meta}>
        {events === null
          ? ""
          : `${slides.length} inlägg · ${formatDuration(slides.length * seconds)} · tyst mp4${picturesPending ? " · laddar bilder" : ""}`}
        {paused && current ? " · dra i bilden för att beskära" : ""}
      </p>
      <p className={styles.status}>{exportError || progress}</p>

      <div className={styles.work}>
        <div className={styles.stage}>
          <canvas
            ref={canvasRef}
            width={format.width}
            height={format.height}
            className={styles.canvas}
            style={{
              width: `min(100%, calc((100vh - 7rem) * ${format.width} / ${format.height}))`,
              aspectRatio: `${format.width} / ${format.height}`,
            }}
            data-hit={current && !exporting && !paused ? "true" : "false"}
            data-paused={paused && current && !exporting ? "true" : "false"}
            role="button"
            tabIndex={current && !exporting ? 0 : -1}
            aria-label={
              paused && current
                ? `Dra för att beskära ${displayTitle(current)}`
                : current
                  ? `Välj bort ${displayTitle(current)}`
                  : "Ingen konsert"
            }
            onPointerDown={(event) => {
              if (!paused || !current || exporting) return;
              const image = images[current.id];
              if (!image || image === "failed") return;
              const canvas = canvasRef.current;
              if (!canvas) return;
              dragRef.current = {
                id: current.id,
                x: event.clientX,
                y: event.clientY,
                pan: crops[current.id] ?? { x: 0, y: 0 },
                moved: false,
              };
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                /* Utan capture följer draget ändå musen så länge den är över bilden. */
              }
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              const canvas = canvasRef.current;
              if (!drag || !canvas || !current || drag.id !== current.id) return;
              const image = images[drag.id];
              if (!image || image === "failed") return;
              const rect = canvas.getBoundingClientRect();
              if (!rect.width || !rect.height) return;
              const pan = clampCoverPan(image, canvas.width, canvas.height, {
                x: drag.pan.x + (event.clientX - drag.x) * (canvas.width / rect.width),
                y: drag.pan.y + (event.clientY - drag.y) * (canvas.height / rect.height),
              });
              if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) drag.moved = true;
              dragRef.current = { ...drag, moved: drag.moved };
              setCrops((prev) => {
                const existing = prev[drag.id];
                if (existing && existing.x === pan.x && existing.y === pan.y) return prev;
                return { ...prev, [drag.id]: pan };
              });
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onClick={() => {
              if (!current || exporting || paused) return;
              if (dragRef.current?.moved) return;
              toggle(current.id);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              if (!current || exporting || paused) return;
              toggle(current.id);
            }}
          />
          <div className={styles.stageNav}>
            <button
              className={styles.button}
              type="button"
              aria-label="Föregående bild"
              disabled={slides.length < 2 || exporting}
              onClick={() => setCursor((value) => value - 1)}
            >
              ←
            </button>
            <button
              className={styles.button}
              type="button"
              aria-label={paused ? "Spela" : "Pausa"}
              aria-pressed={paused}
              disabled={!current || exporting}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? "▶" : "❚❚"}
            </button>
            <button
              className={styles.button}
              type="button"
              aria-label="Nästa bild"
              disabled={slides.length < 2 || exporting}
              onClick={() => setCursor((value) => value + 1)}
            >
              →
            </button>
          </div>
        </div>
        <ul ref={listRef} className={styles.list}>
          {visible.map((event) => {
            const out = excluded.has(event.id);
            const onStage = current?.id === event.id;
            return (
              <li
                key={event.id}
                className={styles.row}
                data-current={onStage ? "true" : "false"}
                data-out={out ? "true" : "false"}
                style={{ borderLeftColor: onStage ? venueColor(String(event.venue_slug)) : "transparent" }}
              >
                <button
                  className={styles.thumbButton}
                  type="button"
                  aria-label={(out ? "Ta med" : "Välj bort") + " bilden för " + displayTitle(event)}
                  aria-pressed={!out}
                  onClick={() => toggle(event.id)}
                  disabled={exporting}
                >
                  {event.image ? (
                    <img className={styles.thumb} src={posterImageUrl(event.image, 200)} alt="" />
                  ) : (
                    <span className={styles.thumb} />
                  )}
                </button>
                <div className={styles.copy}>
                  <label className={styles.field}>
                    Konserttitel
                    <textarea
                      className={styles.titleEditor}
                      aria-label={`Konserttitel för ${displayTitle(event)}`}
                      value={titles[event.id] ?? displayTitle(event)}
                      rows={2}
                      disabled={exporting}
                      onChange={(change) => setTitles((prev) => ({ ...prev, [event.id]: change.target.value }))}
                    />
                  </label>
                  <span>
                    {event.venue} · {posterDate(event.date)}
                  </span>
                </div>
                <button type="button" onClick={() => toggle(event.id)} disabled={exporting}>
                  {out ? "Ta med" : "Välj bort"}
                </button>
              </li>
            );
          })}
        </ul>
        {events !== null && visible.length === 0 ? <p className={styles.empty}>Inga konserter den här veckan.</p> : null}
      </div>
    </main>
  );
}
