import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { data } from '#lib/server/data.ts';
import { serverConfig } from '#lib/server/config.ts';
import { rateLimit, readJson } from '#lib/server/guard.ts';
import { cleanBatch } from '#lib/server/logcheck.ts';
import { verifyGameToken } from '#lib/server/token.ts';

// Anonieme spelgegevens en feedback opslaan. Alleen met een geldig spel-token.
export const POST: RequestHandler = async (event) => {
	await rateLimit(event, 'log', 30, 60);
	const body = await readJson(event.request);
	const payload = verifyGameToken(String(body.token ?? ''), serverConfig().tokenSecret);
	if (!payload) error(401, 'Je sessie is verlopen.');
	const batch = cleanBatch(body);
	if (batch.sessions.length || batch.events.length || batch.feedback.length) {
		try {
			await data().logPlay(payload.g, batch);
		} catch (e) {
			console.error('log', e instanceof Error ? e.message : e);
			error(503, 'Opslaan lukte even niet.');
		}
	}
	return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
};
