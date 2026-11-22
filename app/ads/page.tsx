"use client";

import Link from "next/link";
import { useEffect } from "react";

import styles from "./ads.module.scss";

export default function AdsPage() {
  useEffect(() => {
    document.title = "ADS — Hör & Se";
  }, []);

  return (
    <main className={styles.page}>
      <p className={styles.back}>ADS</p>
      <h1>Inlägg</h1>
      <p className={styles.lead}>Verktyg som skapar bilder och filmer för Instagram. Allt ritas i webbläsaren.</p>
      <ul className={styles.tools}>
        <li>
          <Link className={styles.tool} href="/ads/vecka">
            <strong>Veckans konserter</strong>
            <span>4:5, 1:1 eller 9:16. Bild, titel, scen och datum. Bilderna byts utan övergång.</span>
          </Link>
        </li>
        <li>
          <Link className={styles.tool} href="/ads/manad">
            <strong>Månad</strong>
            <span>Alla bilder de närmaste fem veckorna. Bara en mening i mitten, i vitt.</span>
          </Link>
        </li>
        <li>
          <Link className={styles.tool} href="/ads/helg">
            <strong>Live i helgen</strong>
            <span>Textfilm med helgens artister för Instagram Stories.</span>
          </Link>
        </li>
        <li>
          <Link className={styles.tool} href="/ads/helg-2">
            <strong>Helg 2</strong>
            <span>Helgens artister tänds en efter en i ett flödande textfält.</span>
          </Link>
        </li>
        <li>
          <Link className={styles.tool} href="/ads/tips">
            <strong>Tips</strong>
            <span>Egen bild med scen, artist och datum.</span>
          </Link>
        </li>
      </ul>
    </main>
  );
}
