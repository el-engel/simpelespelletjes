import type { PageServerLoad } from './$types';
import { data } from '#lib/server/data.ts';

export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=60' });
	try {
		return { games: await data().listGames(), failed: false };
	} catch (e) {
		console.error('listGames', e);
		return { games: [], failed: true };
	}
};
