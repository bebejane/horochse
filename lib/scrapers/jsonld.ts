import { isCancelled } from "./text";

export function walkJsonld(node: unknown, found: any[] = []): any[] {
  if (Array.isArray(node)) {
    for (const item of node) walkJsonld(item, found);
    return found;
  }
  if (!node || typeof node !== "object") return found;
  const record = node as Record<string, any>;
  let types = record["@type"];
  if (Array.isArray(types)) types = types.map(String).join(" ");
  types = String(types ?? "");
  if (types.endsWith("Event") || types === "Event") found.push(record);
  for (const key of ["@graph", "itemListElement", "item", "subEvent"]) {
    if (key in record) walkJsonld(record[key], found);
  }
  return found;
}

export function jsonldEvents(html: string): any[] {
  const found: any[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    let payload: unknown;
    try {
      payload = JSON.parse(match[1]);
    } catch {
      continue;
    }
    for (const node of walkJsonld(payload)) {
      if (
        !isCancelled(
          node.name || node.title || "",
          node.description || "",
          String(node.eventStatus || ""),
        )
      ) {
        found.push(node);
      }
    }
  }
  return found;
}
