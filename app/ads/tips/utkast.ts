import type { PosterFormat } from "../poster";
import type { Punkt } from "./bana";

export type TipsUtkast = {
  fil?: File;
  bana?: Punkt[];
  utjämning?: number;
  bantext?: string;
  hastighet?: number;
  blinktid?: number;
  filmlängd?: number;
  symbol?: { visas: boolean; storlek: number; höjd: number; färg?: "white" | "black" };
  scen: string;
  artist: string;
  artistX?: number;
  datum: string;
  datumX?: number;
  textfärg: "white" | "black";
  datumPlacering: string;
  position: number;
  formatId: PosterFormat["id"];
};

const BUTIK = "utkast";
const NYCKEL = "senaste";

let anslutning: Promise<IDBDatabase> | undefined;

function öppnaDatabas() {
  if (anslutning) return anslutning;

  anslutning = new Promise<IDBDatabase>((resolve, reject) => {
    const öppning = indexedDB.open("horochse-ads-tips", 1);
    öppning.onupgradeneeded = () => öppning.result.createObjectStore(BUTIK);
    öppning.onsuccess = () => {
      const databas = öppning.result;
      databas.onversionchange = () => {
        databas.close();
        anslutning = undefined;
      };
      resolve(databas);
    };
    öppning.onerror = () => reject(öppning.error);
  });
  return anslutning;
}

export async function läsTipsUtkast(): Promise<TipsUtkast | undefined> {
  const databas = await öppnaDatabas();
  return new Promise((resolve, reject) => {
    const begäran = databas.transaction(BUTIK, "readonly").objectStore(BUTIK).get(NYCKEL);
    begäran.onsuccess = () => resolve(begäran.result);
    begäran.onerror = () => reject(begäran.error);
  });
}

export async function sparaTipsUtkast(utkast: TipsUtkast): Promise<void> {
  const databas = await öppnaDatabas();
  return new Promise((resolve, reject) => {
    const transaktion = databas.transaction(BUTIK, "readwrite");
    transaktion.oncomplete = () => resolve();
    transaktion.onabort = () => reject(transaktion.error);
    transaktion.objectStore(BUTIK).put(utkast, NYCKEL);
  });
}
