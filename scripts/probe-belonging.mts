import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

import { interpretedPerformers, isInterpretedWork, isSearchableArtist } from "../lib/scrapers/text";
import { client } from "../lib/db/client";

const cases = [
  ["Belonging 50 år - Paulsberg/Hulbækmo/Fiske/Storaas", "Nya norska jazzeliten tolkar Keith Jarrett-klassikern Belonging."],
  ["Max Lorentz", "Max Lorentz tolkar David Bowies låtskatt med eget band över två set."],
  ["Frida Öhrn", "Enkel, vacker, öm – En hyllning till Monica Z"],
  ["100 Miles MD tolkar MD", "I år skulle Miles Davis ha fyllt 100 år."],
];
for (const [title, text] of cases) {
  const people = isInterpretedWork(title, text) ? interpretedPerformers(title, text).filter(isSearchableArtist) : "(ej tolkning)";
  console.log(isInterpretedWork(title, text) ? "TOLKAR" : "vanlig", "|", title, "→", people);
}

const id = "fasching-16287-2026-10-12";
const before = await client.execute({ sql: "SELECT source, artist, title FROM tracks WHERE event_id = ?", args: [id] });
console.log("before", before.rows);
await client.execute({ sql: "DELETE FROM tracks WHERE event_id = ?", args: [id] });
const after = await client.execute({ sql: "SELECT COUNT(*) AS n FROM tracks WHERE event_id = ?", args: [id] });
console.log("after", after.rows);
