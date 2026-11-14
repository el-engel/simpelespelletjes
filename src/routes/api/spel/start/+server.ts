import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { data } from '#lib/server/data.ts';
import { isDemo, serverConfig } from '#lib/server/config.ts';
import { rateLimit, readJson } from '#lib/server/guard.ts';
import { signGameToken } from '#lib/server/token.ts';
import { verifyTurnstile } from '#lib/server/turnstile.ts';
import { renderMarkdown } from '#lib/markdown.ts';
import type { StartData } from '#lib/types.ts';

// Start van een spel: botcheck, daarna een spel-token en de spelgegevens.
export const POST: RequestHandler = async (event) => {
	const ip = await rateLimit(event, 'start', 10, 60);
	const body = await readJson(event.request);
	const slug = typeof body.slug === 'string' && /^[a-z0-9-]{2,40}$/.test(body.slug) ? body.slug : null;
	if (!slug) error(400, 'Ongeldig verzoek');

	const cfg = serverConfig();
	if (!isDemo()) {
		const ok = await verifyTurnstile(String(body.captcha ?? ''), cfg.turnstileSecret, ip);
		if (!ok) error(403, 'De botcheck is niet gelukt. Probeer het opnieuw.');
	}

	const game = await data().getGame(slug);
	if (!game) error(404, 'Dit spel bestaat niet (meer).');

	const { token, exp } = signGameToken(game.id, cfg.tokenSecret);
	const res: StartData = {
		token,
		expiresAt: exp,
		game: {
			id: game.id,
			slug: game.slug,
			name: game.name,
			description: game.description,
			minutesPerQuestion: game.minutesPerQuestion
		},
		rulesHtml: renderMarkdown(game.rules),
		taskTypes: game.taskTypes,
		categories: game.categories
	};
	return json(res, { headers: { 'cache-control': 'no-store' } });
};
