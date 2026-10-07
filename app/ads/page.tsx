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
      <p className={styles.lead}>Verktyg som sätter ihop bilder för Instagram. Allt ritas i webbläsaren.</p>
      <ul className={styles.tools}>
        <li>
          <Link className={styles.tool} href="/ads/vecka">
            <strong>Veckans konserter</strong>
            <span>4:5, 1:1 eller 9:16. Bild, titel, scen och datum. Bilderna byts utan övergång.</span>
          </Link>
        </li>
      </ul>
    </main>
  );
}
