/**
 * Onthoudt per telefoon (localStorage) welke vragen al gespeeld zijn,
 * zodat een nieuw spel eerst vragen geeft die nog niet geweest zijn.
 */
export const MAX_SEEN = 2500;

const key = (slug: string) => `spel:${slug}:gespeeld`;

export function loadSeen(slug: string): string[] {
	try {
		const raw = localStorage.getItem(key(slug));
		const list = raw ? JSON.parse(raw) : [];
		return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(-MAX_SEEN) : [];
	} catch {
		return [];
	}
}

/** Voegt gespeelde vragen toe (nieuwste achteraan, zonder dubbele). */
export function addSeen(slug: string, ids: string[]): void {
	if (ids.length === 0) return;
	try {
		const list = loadSeen(slug);
		const known = new Set(list);
		const fresh = ids.filter((id) => !known.has(id));
		if (fresh.length === 0) return;
		localStorage.setItem(key(slug), JSON.stringify([...list, ...fresh].slice(-MAX_SEEN)));
	} catch {
		/* opslag niet beschikbaar: dan onthouden we niets */
	}
}

/** Lijst om uit te sluiten: eerst wat in dit spel zit (moet), daarna eerder gespeelde vragen. */
export function buildExclude(gameIds: string[], seen: string[], max = 3000): string[] {
	const out = [...new Set(gameIds)].slice(-max);
	const have = new Set(out);
	for (let i = seen.length - 1; i >= 0 && out.length < max; i--) {
		if (!have.has(seen[i])) {
			have.add(seen[i]);
			out.push(seen[i]);
		}
	}
	return out;
}
