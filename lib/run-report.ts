// Builds and sends the scrape-run report email (Postmark).

import { runReport } from "./db/queries";
import { mailConfigured, sendMail } from "./mail";
import { warn } from "./scrapers/log";
import type { StoreSummary } from "./scrapers/store";

const REPORT_TO = (process.env.SCRAPE_REPORT_TO || "dev@konst-teknik.se").trim();

function fmtDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function rows(pairs: [string, number | string][]): string {
  if (!pairs.length) return "  (inga)";
  return pairs.map(([k, v]) => `  ${String(k).padEnd(22)} ${v}`).join("\n");
}

/**
 * Send a detailed report for a finished run. Best-effort — never throws, so a
 * mail problem can't fail the cron. Returns true when the mail was accepted.
 */
export async function sendScrapeReport(
  summary: StoreSummary,
  ctx?: { trigger?: string },
): Promise<boolean> {
  if (!mailConfigured()) {
    warn("scrape-rapport: Postmark är inte konfigurerat — hoppar över");
    return false;
  }

  const detail = await runReport(summary.runId);
  const finished = detail?.run.finishedAt ? new Date(detail.run.finishedAt) : new Date();
  const range =
    detail?.run.rangeFrom && detail.run.rangeTo
      ? `${detail.run.rangeFrom} → ${detail.run.rangeTo}`
      : "(okänt)";
  const status = summary.ok ? "OK" : `FEL (${summary.errorCount})`;

  const lines: string[] = [
    `Scrape-körning #${summary.runId} — ${status}`,
    "",
    `Tid:         ${finished.toISOString()}`,
    `Varaktighet: ${fmtDuration(summary.durationMs)}`,
    `Utlösare:    ${ctx?.trigger || "cron"}`,
    `Period:      ${range}`,
    "",
    "EVENEMANG",
    `  Nya:             ${detail?.newEvents ?? "?"}`,
    `  Uppdaterade:     ${detail?.updatedEvents ?? "?"}`,
    `  Med spelbar låt: ${detail?.withTracks ?? "?"} / ${summary.eventCount}`,
    `  Källor:          ${summary.sourceCount}`,
    "",
    "LÅTAR PER KÄLLA",
    rows((detail?.trackSources || []).map((t) => [t.source, t.count])),
    "",
    "EVENEMANG PER SCEN",
    rows((detail?.perVenue || []).map((v) => [v.venueSlug, v.count])),
    "",
  ];

  if (summary.errorCount) {
    lines.push(`FEL (${summary.errorCount})`);
    lines.push(
      rows(Object.entries(summary.errors).map(([k, v]) => [k, String(v).slice(0, 120)])),
    );
  } else {
    lines.push("FEL", "  (inga)");
  }

  const text = lines.join("\n");
  const html =
    `<h2>Scrape-körning #${summary.runId} — ${status}</h2><pre ` +
    `style="font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">` +
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
    `</pre>`;

  return sendMail({
    to: REPORT_TO,
    subject: `Hör & Se: scrape #${summary.runId} — ${status}`,
    text,
    html,
    tag: "scrape-report",
  });
}
