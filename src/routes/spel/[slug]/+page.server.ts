import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';
import { data } from '#lib/server/data.ts';
import { isDemo } from '#lib/server/config.ts';
import { games } from '#lib/games/registry.ts';

export const load: PageServerLoad = async ({ params }) => {
	const list = await data().listGames();
	const game = list.find((g) => g.slug === params.slug);
	if (!game || !games[game.slug]) error(404, 'Dit spel bestaat niet (meer).');
	return {
		game,
		siteKey: PUBLIC_TURNSTILE_SITE_KEY,
		demo: isDemo()
	};
};
