import { ConcertApp } from '@/components/ConcertApp';
import { JsonLd } from '@/components/JsonLd';
import { loadPayload } from '@/lib/db/queries';
import { upcomingEvents } from '@/lib/events';
import { musicEventGraph } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
	title: 'Konserter i Stockholm – lyssna och hitta spelningar | Hör & Se',
};

export default async function Page() {
	const payload = await loadPayload();
	const events = upcomingEvents(payload.events ?? [], [], 'all');
	return (
		<>
			<JsonLd data={musicEventGraph(events)} />
			<ConcertApp payload={payload} />
		</>
	);
}
import type { Metadata } from 'next';
