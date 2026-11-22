"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import { VENUES } from "@/lib/types";

import styles from "../ads.module.scss";
import { downloadBlob, encodeFilm } from "../film";
import { cssToken, drawMastSymbol, drawPosterBackground, drawPosterText, loadPosterFonts, POSTER_FORMATS, venueColor, type PosterFonts, type PosterFormat } from "../poster";
import { läsTipsUtkast, sparaTipsUtkast } from "./utkast";
import { BANTEXT, BLINKTID, FILM_FPS, filmtider, jämnaBana, MAX_UTJÄMNING, placeraBantecken, ritaBantecken, scenfont, SKRIVTID, type Punkt } from "./bana";

export default function TipsAdsPage() {
  const förhandsvisning = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ pekare: number; punkter: Punkt[] } | null>(null);
  const avbruten = useRef(false);
  const [bana, setBana] = useState<Punkt[]>([]);
  const [utjämning, setUtjämning] = useState(0);
  const [bantext, setBantext] = useState(BANTEXT);
  const [hastighet, setHastighet] = useState(1);
  const [blinktid, setBlinktid] = useState(BLINKTID);
  const [längdval, setLängdval] = useState("");
  const inmatadLängd = Number(längdval);
  const önskadLängd = Number.isFinite(inmatadLängd) && inmatadLängd >= 0.1 ? inmatadLängd : undefined;
  const [symbol, setSymbol] = useState({ visas: true, storlek: 24, höjd: 50, färg: "white" as "white" | "black" });
  const [pågåendeBana, setPågåendeBana] = useState<Punkt[]>();
  const [spelar, setSpelar] = useState(false);
  const [fil, setFil] = useState<File>();
  const [laddadBild, setLaddadBild] = useState<{ fil: File; bild: HTMLImageElement | null }>();
  const [fonts, setFonts] = useState<PosterFonts>();
  const [scen, setScen] = useState("");
  const [artist, setArtist] = useState("");
  const [artistX, setArtistX] = useState(0);
  const [datum, setDatum] = useState("");
  const [datumX, setDatumX] = useState(0);
  const [textfärg, setTextfärg] = useState<"white" | "black">("white");
  const [datumPlacering, setDatumPlacering] = useState("under");
  const [position, setPosition] = useState(100);
  const [formatId, setFormatId] = useState<PosterFormat["id"]>("4:5");
  const [sparar, setSparar] = useState<"png" | "mp4">();
  const [fontfel, setFontfel] = useState("");
  const [exportfel, setExportfel] = useState("");
  const [utkastläst, setUtkastläst] = useState(false);
  const [lagringsfel, setLagringsfel] = useState("");

  useEffect(() => {
    let aktiv = true;
    läsTipsUtkast()
      .then((utkast) => {
        if (!aktiv || !utkast) return;
        setFil(utkast.fil);
        setBana(utkast.bana ?? []);
        setUtjämning(utkast.utjämning ?? 0);
        setBantext(utkast.bantext ?? BANTEXT);
        setHastighet(utkast.hastighet ?? 1);
        setBlinktid(utkast.blinktid ?? BLINKTID);
        setLängdval(utkast.filmlängd?.toString() ?? "");
        if (utkast.symbol) setSymbol({ ...utkast.symbol, färg: utkast.symbol.färg ?? "white" });
        setScen(utkast.scen);
        setArtist(utkast.artist);
        setArtistX(utkast.artistX ?? 0);
        setDatum(utkast.datum);
        setDatumX(utkast.datumX ?? 0);
        setTextfärg(utkast.textfärg);
        setDatumPlacering(utkast.datumPlacering);
        setPosition(utkast.position);
        setFormatId(utkast.formatId);
      })
      .catch(() => { if (aktiv) setLagringsfel("Kunde inte läsa det sparade tipset."); })
      .finally(() => { if (aktiv) setUtkastläst(true); });
    return () => { aktiv = false; };
  }, []);

  useEffect(() => {
    if (!utkastläst) return;
    let aktiv = true;
    sparaTipsUtkast({ fil, bana, utjämning, bantext, hastighet, blinktid, filmlängd: önskadLängd, symbol, scen, artist, artistX, datum, datumX, textfärg, datumPlacering, position, formatId })
      .catch(() => { if (aktiv) setLagringsfel("Kunde inte spara tipset i webbläsaren."); });
    return () => { aktiv = false; };
  }, [utkastläst, fil, bana, utjämning, bantext, hastighet, blinktid, önskadLängd, symbol, scen, artist, artistX, datum, datumX, textfärg, datumPlacering, position, formatId]);

  useEffect(() => {
    document.title = "Tips — ADS";
    let aktiv = true;
    loadPosterFonts()
      .then((laddade) => { if (aktiv) setFonts(laddade); })
      .catch(() => { if (aktiv) setFontfel("Kunde inte läsa in typsnitten."); });
    return () => {
      aktiv = false;
      avbruten.current = true;
    };
  }, []);

  useEffect(() => {
    if (!fil) return;
    const url = URL.createObjectURL(fil);
    const bild = new Image();
    bild.onload = () => {
      URL.revokeObjectURL(url);
      setLaddadBild({ fil, bild });
    };
    bild.onerror = () => {
      URL.revokeObjectURL(url);
      setLaddadBild({ fil, bild: null });
    };
    bild.src = url;
    return () => {
      bild.onload = null;
      bild.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [fil]);

  const format = POSTER_FORMATS.find(({ id }) => id === formatId) ?? POSTER_FORMATS[0];
  const aktuellBild = laddadBild?.fil === fil ? laddadBild : undefined;
  const bild = aktuellBild?.bild;
  const scenSlug = VENUES.find(({ name }) => name.toLocaleLowerCase("sv-SE") === scen.trim().toLocaleLowerCase("sv-SE"))?.slug;

  const motiv = useMemo(() => {
    if (!fonts) return;

    const canvas = document.createElement("canvas");
    canvas.width = format.width;
    canvas.height = format.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    const textlager = document.createElement("canvas");
    textlager.width = format.width;
    textlager.height = format.height;
    const textctx = textlager.getContext("2d");
    if (!ctx || !textctx) return;

    const färg = scenSlug ? venueColor(scenSlug) : "";
    const inlägg = {
      title: artist.trim(),
      venue: scen.trim(),
      date: datum.trim(),
      color: färg,
      image: bild ?? null,
      textPosition: position / 100,
      titleOffsetX: artistX,
      dateOffsetX: datumX,
      textColor: textfärg,
      dateAfterVenue: datumPlacering === "efter",
      hideBottomLine: true,
      hideFade: true,
    };
    drawPosterBackground(ctx, inlägg);
    drawPosterText(textctx, inlägg, fonts);
    return { canvas, textlager, ctx, font: scenfont(fonts.walter), färg: färg || cssToken("--dark-ink") };
  }, [artist, artistX, scen, datum, datumX, position, format, bild, fonts, scenSlug, textfärg, datumPlacering]);

  const kurva = useMemo(() => jämnaBana(bana, format, utjämning), [bana, format, utjämning]);
  const tecken = useMemo(
    () => motiv ? placeraBantecken(motiv.ctx, kurva, motiv.font, bantext) : [],
    [motiv, kurva, bantext],
  );
  const kanRita = Boolean(bild && motiv && !sparar);
  const normalSkrivtid = SKRIVTID / hastighet;
  const { skrivtid, filmlängd } = filmtider(normalSkrivtid, blinktid, önskadLängd);

  const ritaSymbol = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!symbol.visas) return;
    const { width, height } = ctx.canvas;
    const färg = cssToken(symbol.färg === "black" ? "--light-ink" : "--dark-ink");
    drawMastSymbol(ctx, width / 2, height * symbol.höjd / 100, height * symbol.storlek / 100, färg);
  }, [symbol]);

  const måla = useCallback((ctx: CanvasRenderingContext2D, tid?: number) => {
    if (!motiv) return;
    ctx.drawImage(motiv.canvas, 0, 0);
    ritaBantecken(ctx, tecken, motiv.font, motiv.färg, tid, skrivtid, blinktid);
    ctx.drawImage(motiv.textlager, 0, 0);
    ritaSymbol(ctx);
  }, [motiv, tecken, skrivtid, blinktid, ritaSymbol]);

  useEffect(() => {
    const ctx = förhandsvisning.current?.getContext("2d", { alpha: false });
    if (!ctx || !motiv) return;

    const stödlinje = pågåendeBana ? jämnaBana(pågåendeBana, format) : tecken.length ? undefined : kurva;
    if (stödlinje?.length) {
      ctx.drawImage(motiv.canvas, 0, 0);
      ctx.save();
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.strokeStyle = motiv.färg;
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 5;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      stödlinje.forEach(({ x, y }, index) => {
        if (index) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
      ctx.drawImage(motiv.textlager, 0, 0);
      ritaSymbol(ctx);
      return;
    }

    if (!spelar || !tecken.length) {
      måla(ctx);
      return;
    }

    let förstaTid: number | undefined;
    let bildId = 0;
    function spela(tid: number) {
      if (!ctx || !motiv) return;
      förstaTid ??= tid;
      const sekunder = (tid - förstaTid) / 1_000;
      måla(ctx, sekunder);
      bildId = requestAnimationFrame(spela);
    }
    bildId = requestAnimationFrame(spela);
    return () => cancelAnimationFrame(bildId);
  }, [motiv, format, kurva, pågåendeBana, tecken.length, spelar, måla, ritaSymbol]);

  function bildpunkt(event: PointerEvent<HTMLCanvasElement>): Punkt {
    const ruta = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - ruta.left) / ruta.width)),
      y: Math.min(1, Math.max(0, (event.clientY - ruta.top) / ruta.height)),
    };
  }

  function börjaRita(event: PointerEvent<HTMLCanvasElement>) {
    if (!kanRita || !event.isPrimary || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSpelar(false);
    const punkter = [bildpunkt(event)];
    drag.current = { pekare: event.pointerId, punkter };
    setPågåendeBana(punkter);
  }

  function läggTillPunkt(event: PointerEvent<HTMLCanvasElement>) {
    const aktivtDrag = drag.current;
    if (!aktivtDrag || aktivtDrag.pekare !== event.pointerId) return;
    const nästa = bildpunkt(event);
    const sista = aktivtDrag.punkter.at(-1)!;
    if (Math.hypot((nästa.x - sista.x) * format.width, (nästa.y - sista.y) * format.height) < 3) return;
    aktivtDrag.punkter.push(nästa);
    setPågåendeBana([...aktivtDrag.punkter]);
  }

  function avslutaBana(event: PointerEvent<HTMLCanvasElement>) {
    const aktivtDrag = drag.current;
    if (!aktivtDrag || aktivtDrag.pekare !== event.pointerId) return;
    läggTillPunkt(event);
    drag.current = null;
    setPågåendeBana(undefined);
    if (aktivtDrag.punkter.length < 2) return;
    setBana(aktivtDrag.punkter);
    setUtjämning(0);
    setSpelar(true);
  }

  function avbrytRitning(event: PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.pekare !== event.pointerId) return;
    drag.current = null;
    setPågåendeBana(undefined);
  }

  async function spara(typ: "png" | "mp4") {
    if (!bild || !motiv || sparar || (typ === "mp4" && !tecken.length)) return;

    setSparar(typ);
    setExportfel("");
    avbruten.current = false;
    const filnamn = `tips-${format.id.replace(":", "x")}.${typ}`;
    try {
      if (typ === "mp4") {
        const film = await encodeFilm([
          { seconds: filmlängd, fps: FILM_FPS, paint: måla },
        ], format, () => {}, () => avbruten.current);
        if (!avbruten.current) downloadBlob(film, filnamn);
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = format.width;
        canvas.height = format.height;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("Kunde inte rita bilden.");
        måla(ctx);
        const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!png) throw new Error("Kunde inte skapa PNG-bilden.");
        if (!avbruten.current) downloadBlob(png, filnamn);
      }
    } catch (fel) {
      if (!avbruten.current) setExportfel(fel instanceof Error ? fel.message : "Exporten misslyckades.");
    } finally {
      if (!avbruten.current) setSparar(undefined);
    }
  }

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/ads">← ADS</Link>
      <h1>Tips</h1>
      <p className={styles.lead}>Välj en egen bild och placera konsertens text där den passar.</p>
      <div className={styles.work}>
        <div>
          <fieldset className={styles.storyFields} disabled={Boolean(sparar) || !utkastläst}>
            <label className={styles.field}>
              Bild
              <input className={styles.storyTitle} type="file" accept="image/*" onChange={(event) => {
                const vald = event.target.files?.[0];
                if (vald) setFil(vald);
                setExportfel("");
              }} />
              {fil && <span>{fil.name}</span>}
            </label>
            <label className={styles.field}>
              Scen
              <input className={styles.storyTitle} value={scen} onChange={(event) => setScen(event.target.value)} />
            </label>
            <label className={styles.field}>
              Artistnamn
              <input className={styles.storyTitle} value={artist} onChange={(event) => setArtist(event.target.value)} />
            </label>
            <label className={styles.field}>
              Artistnamnets sidläge · {artistX > 0 ? "+" : ""}{artistX} px
              <input className={styles.tipsRange} type="range" min={-64} max={64} value={artistX}
                onChange={(event) => setArtistX(event.target.valueAsNumber)} />
            </label>
            <label className={styles.field}>
              Datum
              <input className={styles.storyTitle} value={datum} onChange={(event) => setDatum(event.target.value)} />
            </label>
            <label className={styles.field}>
              Datumets sidläge · {datumX > 0 ? "+" : ""}{datumX} px
              <input className={styles.tipsRange} type="range" min={-64} max={64} value={datumX}
                onChange={(event) => setDatumX(event.target.valueAsNumber)} />
            </label>
            <label className={styles.field}>
              Datumets placering
              <select value={datumPlacering} onChange={(event) => setDatumPlacering(event.target.value)}>
                <option value="under">Under artistnamnet</option>
                <option value="efter">Efter scenen</option>
              </select>
            </label>
            <label className={styles.field}>
              Textfärg
              <select value={textfärg} onChange={(event) => setTextfärg(event.target.value === "black" ? "black" : "white")}>
                <option value="white">Vit</option>
                <option value="black">Svart</option>
              </select>
            </label>
            <label className={styles.field}>
              Text längs banan
              <input className={styles.storyTitle} value={bantext} onChange={(event) => {
                setSpelar(false);
                setBantext(event.target.value);
              }} />
            </label>
            <label className={styles.field}>
              Skrivtempo · {hastighet.toLocaleString("sv-SE")}×
              <input className={styles.tipsRange} type="range" min={0.1} max={2} step={0.1} value={hastighet}
                onChange={(event) => {
                  setHastighet(event.target.valueAsNumber);
                  if (tecken.length) setSpelar(true);
                }} />
            </label>
            <label className={styles.field}>
              Blinkcykel · {blinktid.toLocaleString("sv-SE")} s
              <input className={styles.tipsRange} type="range" min={0.5} max={6} step={0.1} value={blinktid}
                onChange={(event) => {
                  setBlinktid(event.target.valueAsNumber);
                  if (tecken.length) setSpelar(true);
                }} />
            </label>
            <label className={styles.field}>
              Filmlängd (sekunder)
              <input className={styles.storyTitle} type="number" min={0.1} step={0.1} value={längdval}
                placeholder={`Automatiskt: ${(normalSkrivtid + blinktid).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} s`}
                onChange={(event) => setLängdval(event.target.value)} />
            </label>
            <label className={styles.field}>
              Format
              <select value={formatId} onChange={(event) => setFormatId(event.target.value as PosterFormat["id"])}>
                {POSTER_FORMATS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              Textens höjd
              <input className={styles.tipsRange} type="range" min={0} max={100} value={position}
                onChange={(event) => setPosition(event.target.valueAsNumber)} />
            </label>
            <label className={styles.tipsToggle}>
              <input type="checkbox" checked={symbol.visas}
                onChange={(event) => setSymbol({ ...symbol, visas: event.target.checked })} />
              Visa symbol
            </label>
            <label className={styles.field}>
              Symbolens färg
              <select value={symbol.färg} disabled={!symbol.visas}
                onChange={(event) => setSymbol({ ...symbol, färg: event.target.value === "black" ? "black" : "white" })}>
                <option value="white">Vit</option>
                <option value="black">Svart</option>
              </select>
            </label>
            <label className={styles.field}>
              Symbolens storlek · {symbol.storlek} %
              <input className={styles.tipsRange} type="range" min={5} max={125} value={symbol.storlek}
                disabled={!symbol.visas} onChange={(event) => setSymbol({ ...symbol, storlek: event.target.valueAsNumber })} />
            </label>
            <label className={styles.field}>
              Symbolens höjd
              <input className={styles.tipsRange} type="range" min={0} max={100} value={symbol.höjd}
                disabled={!symbol.visas} onChange={(event) => setSymbol({ ...symbol, höjd: event.target.valueAsNumber })} />
            </label>
          </fieldset>
          <div className={styles.controls}>
            <button type="button" className={styles.export} disabled={!bild || !motiv || Boolean(sparar)} onClick={() => void spara("png")}>
              Ladda ner PNG
            </button>
            <button type="button" className={styles.export} disabled={!bild || !tecken.length || Boolean(sparar)} onClick={() => void spara("mp4")}>
              Ladda ner MP4
            </button>
          </div>
          <p className={styles.status} role="status">
            {(sparar === "mp4" ? "Skapar filmen …" : sparar === "png" ? "Skapar bilden …" : "")
              || exportfel || fontfel || lagringsfel
              || (aktuellBild?.bild === null ? "Bildfilen kunde inte öppnas." : fil && !aktuellBild ? "Läser in bilden …" : "")}
          </p>
        </div>
        <div className={styles.stage}>
          <canvas ref={förhandsvisning} className={`${styles.canvas} ${styles.tipsCanvas}`}
            width={format.width} height={format.height} role="img" aria-label="Förhandsvisning. Rita med musen för att placera texten."
            data-rita={kanRita}
            onPointerDown={börjaRita} onPointerMove={läggTillPunkt} onPointerUp={avslutaBana}
            onPointerCancel={avbrytRitning} onLostPointerCapture={avbrytRitning} />
          <p className={styles.tipsRitinfo}>
            {!bantext.trim() ? "Skriv texten som ska följa banan."
              : bana.length && !tecken.length && motiv ? "Banan är för kort. Rita en längre bana."
              : "Rita på bilden för att placera texten längs en bana."}
          </p>
          <div className={styles.controls}>
            <button type="button" className={styles.button} disabled={!tecken.length || Boolean(sparar)} onClick={() => setSpelar(!spelar)}>
              {spelar ? "Stoppa animationen" : "Spela animationen"}
            </button>
            <button type="button" className={styles.button}
              disabled={bana.length < 3 || utjämning >= MAX_UTJÄMNING || Boolean(sparar)}
              onClick={() => {
                setSpelar(false);
                setUtjämning((nivå) => Math.min(MAX_UTJÄMNING, nivå + 1));
              }}>
              Jämna ut banan
            </button>
            {utjämning > 0 && (
              <button type="button" className={styles.button} disabled={Boolean(sparar)} onClick={() => {
                setSpelar(false);
                setUtjämning(0);
              }}>
                Återställ banan
              </button>
            )}
            <button type="button" className={styles.button} disabled={!bana.length || Boolean(sparar)} onClick={() => {
              setSpelar(false);
              setBana([]);
              setUtjämning(0);
            }}>
              Ta bort banan
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
