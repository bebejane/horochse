import { NextResponse } from 'next/server';

import { scrapeAndStore } from '@/lib/scrapers/store';
import { revalidatePath } from 'next/cache';

// The scrape takes ~5 min including Bandcamp/SoundCloud lookups.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

function authorized(request: Request): boolean {
	const secret = process.env.CRON_SECRET;
	if (!secret) return false;
	const header = request.headers.get('authorization') || '';
	if (header === `Bearer ${secret}`) return true;
	// Vercel Cron sends the Authorization header; allow ?secret= for local curl.
	const query = new URL(request.url).searchParams.get('secret');
	return query === secret;
}

export async function GET(request: Request) {
	if (!authorized(request)) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const url = new URL(request.url);
	const only = url.searchParams.get('only') ?? undefined;
	const tracks = url.searchParams.get('tracks') !== 'false';

	try {
		console.log('starting scrape', { only, tracks });
		const summary = await scrapeAndStore({ only, tracks, quiet: true });
		revalidatePath('/', 'layout');
		return NextResponse.json(summary, { status: summary.ok ? 200 : 207 });
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}
