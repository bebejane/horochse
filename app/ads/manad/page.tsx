"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { addDays, todayDate, toIso } from "@/lib/dates";
import { displayTitle, isCancelledEvent } from "@/lib/events";
import type { ConcertEvent, EventsPayload } from "@/lib/types";

import styles from "../ads.module.scss";
import { downloadBlob, exportFilm } from "../film";
import { formatDuration } from "../week";
import {
  drawMonthPoster,
  loadPosterFonts,
  loadPosterImage,
  alignedTextHold,
  monthFrame,
  monthPlayColor,
  monthPlayColors,
  monthSlices,
  POSTER_FORMATS,
  posterImageUrl,
  type PosterFonts,
  type PosterFormat,
} from "../poster";

type ImageState = HTMLImageElement | "failed";

const HOLD_OPTIONS = [0.25, 0.5, 0.75, 1, 2, 3];
const WINDOW_DAYS = 5 * 7;
const EXCLUDED_COOKIE = "hor-manad-bort";
const EXCLUDED_CHUNK = 3200;
const EXCLUDED_MAX_AGE = 60 * 60 * 24 * 400;

function excludedCookieName(index: number): string {
  return index === 0 ? EXCLUDED_COOKIE : `${EXCLUDED_COOKIE}.${index}`;
}

function readExcludedChunks(): { index: number; value: string }[] {
  return document.cookie.split("; ").flatMap((row) => {
    const eq = row.indexOf("=");
    if (eq < 0) return [];
    const name = row.slice(0, eq);
    const value = row.slice(eq + 1);
    if (name === EXCLUDED_COOKIE) return [{ index: 0, value }];
    if (!name.startsWith(`${EXCLUDED_COOKIE}.`)) return [];
    const index = Number(name.slice(EXCLUDED_COOKIE.length + 1));
    if (!Number.isInteger(index) || index < 1) return [];
    return [{ index, value }];
  });
}

function readExcluded(): Set<string> {
  const chunks = readExcludedChunks().sort((a, b) => a.index - b.index);
  if (!chunks.length) return new Set();
  try {
    const ids = JSON.parse(chunks.map((chunk) => decodeURIComponent(chunk.value)).join(""));
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.filter((id) => typeof id === "string" && id));
  } catch {
    return new Set();
  }
}

function writeExcluded(ids: Set<string>) {
  const json = JSON.stringify([...ids]);
  const parts: string[] = [];
  for (let i = 0; i < json.length; i += EXCLUDED_CHUNK) {
    parts.push(encodeURIComponent(json.slice(i, i + EXCLUDED_CHUNK)));
  }
  if (!parts.length) parts.push(encodeURIComponent("[]"));
  const keep = new Set(parts.map((_, index) => index));
  for (const chunk of readExcludedChunks()) {
    if (keep.has(chunk.index)) continue;
    document.cookie = `${excludedCookieName(chunk.index)}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
  parts.forEach((part, index) => {
    document.cookie = `${excludedCookieName(index)}=${part}; Path=/; Max-Age=${EXCLUDED_MAX_AGE}; SameSite=Lax`;
  });
}

export default function MonthAdsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fontsRef = useRef<PosterFonts | null>(null);
  const cancelExport = useRef(false);
  const [events, setEvents] = useState<ConcertEvent[] | null>(null);
  const [error, setError] = useState("");
  const [formatId, setFormatId] = useState<PosterFormat["id"]>("4:5");
  const [seconds, setSeconds] = useState(2);
  const [textAfter, setTextAfter] = useState(4);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [excludedReady, setExcludedReady] = useState(false);
  const [images, setImages] = useState<Record<string, ImageState>>({});
  const [fonts, setFonts] = useState<PosterFonts | null>(null);
  const [cursor, setCursor] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    setExcluded(readExcluded());
    setExcludedReady(true);
  }, []);

  useEffect(() => {
    if (!excludedReady) return;
    writeExcluded(excluded);
  }, [excluded, excludedReady]);

  useEffect(() => {
    document.title = "Månad — ADS";
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
  const range = useMemo(() => {
    const from = toIso(todayDate());
    const to = toIso(addDays(todayDate(), WINDOW_DAYS - 1));
    return { from, to };
  }, []);

  const pictures = useMemo(() => {
    const seen = new Set<string>();
    return (events ?? [])
      .filter((event) => {
        if (isCancelledEvent(event) || !event.image) return false;
        if (event.date < range.from || event.date > range.to) return false;
        if (seen.has(event.image)) return false;
        seen.add(event.image);
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
  }, [events, range.from, range.to]);

  const slides = useMemo(
    () => pictures.filter((event) => !excluded.has(event.id)),
    [pictures, excluded],
  );

  const slideKey = slides.map((event) => event.id).join("\n");
  const frameCount = slides.length ? slides.length + 1 : 0;
  const startedImages = useRef(new Set<string>());

  useEffect(() => {
    let cancel = false;
    const queue = pictures.filter((event) => event.image && !startedImages.current.has(event.id));
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
  }, [pictures]);

  useEffect(() => {
    if (exporting || slides.length < 1) return;
    const id = window.setInterval(() => setCursor((value) => value + 1), seconds * 1000);
    return () => window.clearInterval(id);
  }, [slideKey, seconds, exporting, slides.length]);

  const onBlack = slides.length > 0 && cursor === 0;
  const current = onBlack ? null : slides[(cursor - 1) % slides.length] ?? null;
  const currentImage = current ? images[current.id] : undefined;
  const [textFrame, setTextFrame] = useState(() => monthFrame(0, 4));

  useEffect(() => {
    setTextFrame(monthFrame(cursor * seconds, textAfter));
  }, [textAfter, seconds, cursor]);

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
    drawMonthPoster(
      ctx,
      {
        title: "",
        venue: "",
        date: "",
        color: monthPlayColor(cursor, monthPlayColors()),
        image: onBlack || !bitmap || bitmap === "failed" ? null : bitmap,
        solid: onBlack ? "#000000" : undefined,
        lines: textFrame.lines,
        mark: textFrame.mark,
      },
      loaded,
    );
  }, [current, currentImage, cursor, fonts, format, onBlack, textFrame]);

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
      const palette = monthPlayColors();
      const opening = monthSlices(0, seconds, textAfter).map((slice) => ({
        title: "",
        venue: "",
        date: "",
        color: monthPlayColor(0, palette),
        image: null,
        solid: "#000000",
        ...slice,
      }));
      const frames = [
        ...opening,
        ...slides.flatMap((event, index) => {
          const bitmap = images[event.id];
          const start = (index + 1) * seconds;
          const end = start + seconds;
          const image = bitmap && bitmap !== "failed" ? bitmap : null;
          const base = {
            title: "",
            venue: "",
            date: "",
            color: monthPlayColor(index + 1, palette),
            image,
          };
          return monthSlices(start, end, textAfter).map((slice) => ({ ...base, ...slice }));
        }),
      ];
      const blob = await exportFilm(
        frames,
        seconds,
        loaded,
        format,
        "",
        (done, total) => setProgress(`Kodar ${done} av ${total}`),
        () => cancelExport.current,
        drawMonthPoster,
      );
      downloadBlob(blob, `hor-och-se-manad-${range.from}-${format.id.replace(":", "x")}.mp4`);
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
      <h1>Månad</h1>
      <p className={styles.lead}>
        {format.label}, {format.width}×{format.height}. Alla bilder de närmaste fem veckorna. Första rutan är svart.
        Bilderna byts direkt, utan text om spelningar eller scener. Texten byts på en tid som går jämnt upp i tiden
        per bild.
      </p>

      {error ? <p className={styles.empty}>{error}</p> : null}
      {events === null && !error ? <p className={styles.empty}>Hämtar konserter…</p> : null}

      <div className={styles.controls}>
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
          Byt text efter, sekunder
          <input
            type="number"
            min={seconds}
            step={seconds}
            value={textAfter}
            aria-label="Byt text efter, sekunder"
            onChange={(event) => {
              const next = Number(event.target.value.replace(",", "."));
              if (Number.isFinite(next) && next >= 0) setTextAfter(alignedTextHold(next, seconds));
            }}
          />
        </label>
        <label className={styles.field}>
          Tid per bild
          <select
            value={seconds}
            onChange={(event) => {
              const next = Number(event.target.value);
              setSeconds(next);
              setTextAfter((current) => alignedTextHold(current, next));
            }}
          >
            {HOLD_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {String(value).replace(".", ",")} {value === 1 ? "sekund" : "sekunder"}
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
          : `${slides.length} bilder · ${formatDuration(frameCount * seconds)} · tyst mp4${picturesPending ? " · laddar bilder" : ""}`}
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
            aria-label={current ? `Välj bort ${displayTitle(current)}` : "Ingen bild"}
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
          {pictures.map((event) => {
            const out = excluded.has(event.id);
            const onStage = current?.id === event.id;
            return (
              <li
                key={event.id}
                className={`${styles.row} ${styles.rowPlain}`}
                data-current={onStage ? "true" : "false"}
                data-out={out ? "true" : "false"}
              >
                {event.image ? (
                  <img className={styles.thumb} src={posterImageUrl(event.image, 200)} alt="" />
                ) : (
                  <span className={styles.thumb} />
                )}
                <button type="button" onClick={() => toggle(event.id)} disabled={exporting}>
                  {out ? "Ta med" : "Välj bort"}
                </button>
              </li>
            );
          })}
        </ul>
        {events !== null && pictures.length === 0 ? (
          <p className={styles.empty}>Inga bilder de närmaste fem veckorna.</p>
        ) : null}
      </div>
    </main>
  );
}
