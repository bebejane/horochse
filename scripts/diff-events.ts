import { readFile } from "node:fs/promises";

type Event = Record<string, any>;

const FIELD_KEYS = ["venue_slug", "title", "date", "time", "datetime", "url", "place", "text"];

function index(events: Event[]): Map<string, Event> {
  const map = new Map<string, Event>();
  for (const event of events) map.set(String(event.id), event);
  return map;
}

function counts(events: Event[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const event of events) {
    const key = String(event.venue_slug || "?");
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

async function load(file: string): Promise<{ events: Event[]; errors: Record<string, string> }> {
  const raw = JSON.parse(await readFile(file, "utf8"));
  return { events: raw.events || [], errors: raw.errors || {} };
}

async function main() {
  const [aPath, bPath] = process.argv.slice(2);
  if (!aPath || !bPath) {
    console.error("usage: tsx scripts/diff-events.ts <a.json> <b.json>");
    process.exit(2);
  }
  const a = await load(aPath);
  const b = await load(bPath);
  const ai = index(a.events);
  const bi = index(b.events);

  const onlyA = [...ai.keys()].filter((id) => !bi.has(id));
  const onlyB = [...bi.keys()].filter((id) => !ai.has(id));
  const fieldDiffs: string[] = [];
  const imageDiffs: string[] = [];
  const trackDiffs: string[] = [];
  for (const id of ai.keys()) {
    if (!bi.has(id)) continue;
    const ea = ai.get(id)!;
    const eb = bi.get(id)!;
    for (const key of FIELD_KEYS) {
      if (String(ea[key] ?? "") !== String(eb[key] ?? "")) {
        fieldDiffs.push(`  ${id} .${key}\n    A: ${JSON.stringify(ea[key])}\n    B: ${JSON.stringify(eb[key])}`);
      }
    }
    if (JSON.stringify(ea.image || "") !== JSON.stringify(eb.image || "")) {
      imageDiffs.push(`  ${id}\n    A: ${ea.image}\n    B: ${eb.image}`);
    }
    const ta = JSON.stringify((ea.tracks || []).map((t: any) => ({ a: t.artist, s: t.source, u: t.url })));
    const tb = JSON.stringify((eb.tracks || []).map((t: any) => ({ a: t.artist, s: t.source, u: t.url })));
    if (ta !== tb) trackDiffs.push(`  ${id}\n    A: ${ta}\n    B: ${tb}`);
  }

  const ca = counts(a.events);
  const cb = counts(b.events);
  const slugs = [...new Set([...ca.keys(), ...cb.keys()])].sort();
  console.log(`A=${aPath} (${a.events.length})  B=${bPath} (${b.events.length})`);
  console.log("\n per-venue counts (A/B):");
  for (const slug of slugs) {
    const x = ca.get(slug) || 0;
    const y = cb.get(slug) || 0;
    if (x !== y) console.log(`  ${slug.padEnd(24)} ${x}/${y}  <-- differ`);
  }
  console.log(`  (unchanged counts omitted: ${slugs.filter((s) => (ca.get(s) || 0) === (cb.get(s) || 0)).length} venues)`);
  console.log(`\nA errors: ${JSON.stringify(a.errors)}`);
  console.log(`B errors: ${JSON.stringify(b.errors)}`);
  console.log(`\nonly in A: ${onlyA.length}`);
  onlyA.slice(0, 30).forEach((id) => console.log("  " + id));
  console.log(`only in B: ${onlyB.length}`);
  onlyB.slice(0, 30).forEach((id) => console.log("  " + id));
  console.log(`\nfield diffs: ${fieldDiffs.length}`);
  fieldDiffs.slice(0, 40).forEach((line) => console.log(line));
  console.log(`\nimage diffs: ${imageDiffs.length}`);
  imageDiffs.slice(0, 15).forEach((line) => console.log(line));
  console.log(`\ntrack diffs: ${trackDiffs.length}`);
  trackDiffs.slice(0, 15).forEach((line) => console.log(line));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
