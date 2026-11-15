import type { RequestHandler } from './$types';
import { data } from '#lib/server/data.ts';
import { rateLimit, readJson } from '#lib/server/guard.ts';
import { isUuid } from '#lib/server/logcheck.ts';

// Unieke bezoekers tellen met het anonieme toestelnummer (één keer per dag).
export const POST: RequestHandler = async (event) => {
	await rateLimit(event, 'bezoek', 10, 60);
	const body = await readJson(event.request);
	if (isUuid(body.device)) {
		try {
			await data().recordVisit(body.device);
		} catch (e) {
			console.error('bezoek', e instanceof Error ? e.message : e);
		}
	}
	return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};
