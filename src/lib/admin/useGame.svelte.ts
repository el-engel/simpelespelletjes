import { goto } from '$app/navigation';
import { page } from '$app/state';
import { loadGames, message, type AdminGame } from './api.ts';

/** Gedeelde spelkeuze voor de beheerpagina's (onthouden in de adresbalk: ?spel=raadspel). */
export function gamePicker() {
	const state = $state({ games: [] as AdminGame[], error: '', loaded: false });

	async function load() {
		try {
			state.games = await loadGames();
		} catch (e) {
			state.error = message(e);
		} finally {
			state.loaded = true;
		}
	}

	return {
		get games() {
			return state.games;
		},
		get error() {
			return state.error;
		},
		get loaded() {
			return state.loaded;
		},
		get current(): AdminGame | undefined {
			const slug = page.url.searchParams.get('spel');
			return state.games.find((g) => g.slug === slug) ?? state.games[0];
		},
		select(slug: string) {
			const url = new URL(page.url.href);
			url.searchParams.set('spel', slug);
			goto(url, { replace: true, reset: false });
		},
		load
	};
}
