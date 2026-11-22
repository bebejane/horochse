"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { addDays, formatWeekSpan, thisWeekMonday, toIso, weekDaysFromMonday } from "@/lib/dates";
import type { EventsPayload } from "@/lib/types";

import styles from "../ads.module.scss";
import { downloadBlob, encodeFilm } from "../film";
import { loadPosterFonts, type PosterFonts } from "../poster";
import { artistnamnMedGemener, skapaFlödandeStory } from "../helg-2/story";
import { blanda, helgensArtister, skapaStory, STORY } from "./story";

export default function HelgRedigerare({ flöde = false }: { flöde?: boolean }) {
  const titel = flöde ? "Helg 2" : "Live i helgen";
  const canvas = useRef<HTMLCanvasElement>(null);
  const avbruten = useRef(false);
  const [payload, setPayload] = useState<EventsPayload>();
  const [fonts, setFonts] = useState<PosterFonts>();
  const [fel, setFel] = useState("");
  const [exportfel, setExportfel] = useState("");
  const [exportstatus, setExportstatus] = useState("");
  const [paus, setPaus] = useState(false);
  const [rubrik, setRubrik] = useState(flöde ? "Live i Stockholm denna helgen" : titel);
  const [redigering, setRedigering] = useState<string>();
  const [måndag, setMåndag] = useState(() => toIso(thisWeekMonday()));

  useEffect(() => {
    document.title = `${titel} — ADS`;
    const controller = new AbortController();
    fetch("/api/events", { cache: "no-store", signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<EventsPayload>;
      })
      .then(setPayload)
      .catch(() => {
        if (!controller.signal.aborted) setFel("Kunde inte hämta konserterna. Du kan skriva in artisterna själv.");
      });
    loadPosterFonts()
      .then((loaded) => {
        if (!controller.signal.aborted) setFonts(loaded);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFel("Kunde inte läsa in typsnittet.");
      });
    return () => {
      controller.abort();
      avbruten.current = true;
    };
  }, [titel]);

  const helger = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    const datum = toIso(addDays(thisWeekMonday(), index * 7));
    const dagar = weekDaysFromMonday(datum);
    return { datum, etikett: formatWeekSpan(dagar[4], dagar[6]) };
  }), []);
  const förslag = useMemo(() => {
    const namn = helgensArtister(payload?.events ?? [], måndag);
    return (flöde ? namn.map(artistnamnMedGemener) : namn).join("\n");
  }, [flöde, payload, måndag]);
  const text = redigering ?? förslag;
  const artister = useMemo(() => {
    const namn = text.split("\n").map((rad) => rad.trim()).filter(Boolean);
    return flöde ? namn : blanda(namn);
  }, [flöde, text]);
  const skapaFilm = flöde ? skapaFlödandeStory : skapaStory;
  const delar = useMemo(
    () => fonts ? skapaFilm(rubrik.trim(), artister, fonts) : [],
    [fonts, rubrik, artister, skapaFilm],
  );
  const tid = useRef(0);

  useEffect(() => {
    tid.current = 0;
  }, [delar]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d", { alpha: false });
    if (!ctx || !delar.length) return;
    const längd = delar.reduce((summa, del) => summa + del.seconds, 0);
    let föregående: number | undefined;
    let bild = 0;

    function rita(nu: number) {
      if (!ctx) return;
      if (föregående !== undefined) tid.current = (tid.current + (nu - föregående) / 1000) % längd;
      föregående = nu;
      let kvar = tid.current;
      for (const del of delar) {
        if (kvar < del.seconds) {
          del.paint(ctx, kvar);
          break;
        }
        kvar -= del.seconds;
      }
      if (!paus && !exportstatus) bild = requestAnimationFrame(rita);
    }

    bild = requestAnimationFrame(rita);
    return () => cancelAnimationFrame(bild);
  }, [delar, paus, exportstatus]);

  async function exportera() {
    avbruten.current = false;
    setExportfel("");
    setExportstatus("Skapar filmen …");
    try {
      const film = await encodeFilm(
        delar,
        STORY,
        (klar, totalt) => setExportstatus(`Skapar filmen … ${Math.round(klar / totalt * 100)} %`),
        () => avbruten.current,
      );
      if (!avbruten.current) downloadBlob(film, `${flöde ? "helg-2" : "live-i-helgen"}-${weekDaysFromMonday(måndag)[4]}.mp4`);
    } catch (error) {
      if (!avbruten.current) setExportfel(error instanceof Error ? error.message : "Kunde inte skapa filmen.");
    } finally {
      setExportstatus("");
    }
  }

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/ads">← ADS</Link>
      <h1>{titel}</h1>
      <p className={styles.lead}>En textfilm med helgens artister för Instagram Stories, 1080 × 1920.</p>
      <div className={styles.work}>
        <div>
          <fieldset className={styles.storyFields} disabled={!!exportstatus}>
            <label className={styles.field}>
              Helg
              <select value={måndag} onChange={(event) => {
                setMåndag(event.target.value);
                setRedigering(undefined);
              }}>
                {helger.map(({ datum, etikett }) => <option key={datum} value={datum}>{etikett}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              Rubrik
              <input className={styles.storyTitle} type="text" value={rubrik} onChange={(event) => setRubrik(event.target.value)} />
            </label>
            <label className={styles.field}>
              {flöde ? "Artister, en per rad. Namnen tänds i slumpad ordning." : "Artister, en per rad. Ordningen slumpas."}
              <textarea rows={10} value={text} onChange={(event) => setRedigering(event.target.value)} />
            </label>
            <button type="button" className={styles.button} disabled={redigering === undefined} onClick={() => setRedigering(undefined)}>
              Återställ artistlistan
            </button>
          </fieldset>
          <div className={styles.controls}>
            <button type="button" className={styles.export} disabled={!delar.length || !rubrik.trim() || !text.trim() || !!exportstatus} onClick={exportera}>
              Ladda ner MP4
            </button>
            {exportstatus && <button type="button" className={styles.button} onClick={() => { avbruten.current = true; }}>Avbryt</button>}
          </div>
          <p className={styles.status} role="status">
            {exportstatus || exportfel || fel || (!payload ? "Hämtar konserterna …" : !förslag ? "Inga artister hittades för den här helgen." : "")}
          </p>
        </div>
        <div className={styles.stage}>
          <canvas ref={canvas} className={`${styles.canvas} ${styles.storyCanvas}`} width={STORY.width} height={STORY.height}
            role="img" aria-label="Förhandsvisning av textfilmen" />
          <div className={styles.controls}>
            <button type="button" className={styles.button} disabled={!delar.length || !!exportstatus} onClick={() => setPaus(!paus)}>
              {paus ? "Spela" : "Pausa"}
            </button>
            <button type="button" className={styles.button} disabled={!delar.length || !!exportstatus} onClick={() => {
              tid.current = 0;
              delar[0].paint(canvas.current!.getContext("2d")!, 0);
            }}>
              Börja om
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
