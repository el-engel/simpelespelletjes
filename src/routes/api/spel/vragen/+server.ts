import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { data } from '#lib/server/data.ts';
import { serverConfig } from '#lib/server/config.ts';
import { intIn, rateLimit, readJson, strArray } from '#lib/server/guard.ts';
import { verifyGameToken } from '#lib/server/token.ts';

// Vragen ophalen; alleen met een geldig spel-token.
export const POST: RequestHandler = async (event) => {
	await rateLimit(event, 'vragen', 60, 60);
	const body = await readJson(event.request);
	const payload = verifyGameToken(String(body.token ?? ''), serverConfig().tokenSecret);
	if (!payload) error(401, 'Je sessie is verlopen. Start het spel opnieuw.');

	const questions = await data().drawQuestions({
		gameId: payload.g,
		age: intIn(body.age, 0, 120),
		taskCodes: strArray(body.taskCodes, 20, 30),
		categoryIds: strArray(body.categoryIds, 200),
		count: intIn(body.count, 1, 200),
		exclude: strArray(body.exclude ?? [], 3000)
	});
	return json({ questions }, { headers: { 'cache-control': 'no-store' } });
};
