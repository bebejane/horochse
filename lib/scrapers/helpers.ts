import { ogDescription, shorten, stripTags } from "./html";
import { jsonldEvents } from "./jsonld";

export * from "./core";

/** Python `helpers.page_blurb(*values, page=...)`. */
export function pageBlurb(values: unknown[], page = ""): string {
  const extras: unknown[] = [];
  if (page) {
    extras.push(ogDescription(page));
    for (const node of jsonldEvents(page)) extras.push(String(node.description || ""));
  }
  for (const value of [...values, ...extras]) {
    const text = shorten(stripTags(String(value ?? "")));
    if (text.length >= 24) return text;
  }
  return "";
}
