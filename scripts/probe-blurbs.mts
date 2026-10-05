import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const { httpRequest } = await import("../lib/scrapers/http");
const { BROWSER_HEADERS } = await import("../lib/scrapers/sources/ticketmaster");

for (const url of [
  "https://www.ticketmaster.se/artist/janne-schaffer-biljetter/950383",
  "https://www.ticketmaster.se/artist/original-enigma-voices-biljetter/1268544",
]) {
  const html = await httpRequest(url, { extraHeaders: BROWSER_HEADERS });
  const data = JSON.parse(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)![1]);
  const queries = data?.props?.pageProps?.initialReduxState?.api?.queries || {};
  console.log("\n", url, "len", html.length);
  for (const [key, payload] of Object.entries<any>(queries)) {
    if (!/artist/i.test(payload?.endpointName || key)) continue;
    const info = payload?.data;
    if (!info || typeof info !== "object") continue;
    console.log(" query", payload.endpointName || key);
    for (const [field, value] of Object.entries(info)) {
      if (typeof value === "string" && value.length > 20 && !value.startsWith("http")) {
        console.log("  ", field, value.slice(0, 160).replace(/\s+/g, " "));
      }
    }
  }
  const og = /property="og:description"[^>]*content="([^"]+)/.exec(html)?.[1];
  console.log(" og", og?.slice(0, 180));
}
