"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { displayTitle } from "@/lib/events";
import type { ConcertEvent, EventsPayload } from "@/lib/types";

import styles from "../ads.module.scss";
import { downloadBlob, exportFilm } from "../film";
import {
  drawPoster,
  loadPosterFonts,
  loadPosterImage,
  POSTER_FORMATS,
  posterImageUrl,
  venueColor,
  type PosterFonts,
  type PosterFormat,
} from "../poster";
import { addDays, formatWeekSpan, thisWeekMonday, toIso, weekDaysFromMonday } from "@/lib/dates";

import { eventsInWeek, formatDuration, posterDate, venuesIn } from "../week";

type ImageState = HTMLImageElement | "failed";

const HOLD_OPTIONS = [1, 2, 3];

export default function WeekAdsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fontsRef = useRef<PosterFonts | null>(null);
  const cancelExport = useRef(false);
  const [events, setEvents] = useState<ConcertEvent[] | null>(null);
  const [error, setError] = useState("");
  const [venue, setVenue] = useState("");
  const [weekMonday, setWeekMonday] = useState(() => toIso(thisWeekMonday()));
  const [formatId, setFormatId] = useState<PosterFormat["id"]>("4:5");
  const [seconds, setSeconds] = useState(2);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [images, setImages] = useState<Record<string, ImageState>>({});
  const [fonts, setFonts] = useState<PosterFonts | null>(null);
  const [cursor, setCursor] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [exportError, setExportError] = useState("");

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
    if (exporting || slides.length < 2) return;
    const id = window.setInterval(() => setCursor((value) => value + 1), seconds * 1000);
    return () => window.clearInterval(id);
  }, [slideKey, seconds, exporting, slides.length]);

  const current = slides.length ? slides[cursor % slides.length] : null;
  const currentImage = current ? images[current.id] : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    const loaded = fontsRef.current;
    if (!canvas || !loaded) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    canvas.width = format.width;
    canvas.height = format.height;
    if (!current) {
      drawPoster(ctx, null, loaded);
      return;
    }
    const bitmap = currentImage;
    drawPoster(
      ctx,
      {
        title: displayTitle(current),
        venue: current.venue,
        date: posterDate(current.date),
        color: venueColor(current.venue_slug),
        image: bitmap && bitmap !== "failed" ? bitmap : null,
      },
      loaded,
    );
  }, [current, currentImage, fonts, format]);

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
          title: displayTitle(event),
          venue: event.venue,
          date: posterDate(event.date),
          color: venueColor(String(event.venue_slug)),
          image: bitmap && bitmap !== "failed" ? bitmap : null,
        };
      });
      const blob = await exportFilm(
        frames,
        seconds,
        loaded,
        format,
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
            data-hit={current && !exporting ? "true" : "false"}
            role="button"
            tabIndex={current && !exporting ? 0 : -1}
            aria-label={current ? `Välj bort ${displayTitle(current)}` : "Ingen konsert"}
            onClick={() => {
              if (!current || exporting) return;
              toggle(current.id);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              if (!current || exporting) return;
              toggle(current.id);
            }}
          />
        </div>
        <ul className={styles.list}>
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
                {event.image ? (
                  <img className={styles.thumb} src={posterImageUrl(event.image, 200)} alt="" />
                ) : (
                  <span className={styles.thumb} />
                )}
                <div className={styles.copy}>
                  <strong>{displayTitle(event)}</strong>
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
