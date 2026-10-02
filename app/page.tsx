import { ConcertApp } from '@/components/ConcertApp';
import { loadPayload } from '@/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

export default async function Page() {
	const payload = await loadPayload();
	return <ConcertApp payload={payload} />;
}
