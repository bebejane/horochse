import { NextResponse } from 'next/server';

import { scrapeAndStore } from '@/lib/scrapers/store';
import { sendScrapeReport } from '@/lib/run-report';
import { mailConfigured, sendMail } from '@/lib/mail';
import { cronAuthorized } from '@/lib/cron-auth';
import { revalidatePath } from 'next/cache';

// The scrape takes ~5 min including Bandcamp/SoundCloud lookups.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function GET(request: Request) {
	if (!cronAuthorized(request)) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const url = new URL(request.url);
	const only = url.searchParams.get('only') ?? undefined;
	const tracks = url.searchParams.get('tracks') !== 'false';

	try {
		console.log('starting scrape', { only, tracks });
		const summary = await scrapeAndStore({ only, tracks, quiet: true });
		revalidatePath('/', 'layout');
		// Best-effort report; never block the response on mail problems.
		await sendScrapeReport(summary, {
			trigger: only ? `cron (only=${only})` : tracks ? 'cron' : 'cron (utan låtar)',
		}).catch(() => {});
		return NextResponse.json(summary, { status: summary.ok ? 200 : 207 });
	} catch (err) {
		const message = err instanceof Error ? err.stack || err.message : String(err);
		console.error('scrape failed', message);
		if (mailConfigured()) {
			const to = (process.env.SCRAPE_REPORT_TO || 'dev@konst-teknik.se').trim();
			await sendMail({
				to,
				subject: 'Hör & Se: scrape misslyckades',
				text:
					'Cron-körningen kraschade innan den blev klar.\n\n' +
					`Tid: ${new Date().toISOString()}\n` +
					`Utlösare: ${only ? `only=${only}` : tracks ? 'cron' : 'cron (utan låtar)'}\n\n` +
					message.slice(0, 4000),
				tag: 'scrape-failure',
			}).catch(() => {});
		}
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}
