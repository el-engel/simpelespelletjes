import type { DrawnQuestion, GameDetails } from '#lib/types.ts';
import type { DataSource } from './data';

// Voorbeeldgegevens om lokaal te spelen en te testen zonder Supabase.
const game: GameDetails = {
	id: '00000000-0000-4000-8000-000000000001',
	slug: 'raadspel',
	name: 'Raadspel',
	description: 'Uitbeelden, tekenen, beschrijven of vragen beantwoorden. Wie raadt het eerst?',
	rules:
		'## Zo speel je het raadspel\n\nJullie spelen samen op één telefoon.\n\n1. Tik op **Laat soort opdracht zien**.\n2. Tik op **Laat vraag zien** en voer de opdracht uit.\n3. Wie het raadt, krijgt een punt.',
	minutesPerQuestion: 1,
	taskTypes: [
		{ id: 't1', code: 'uitbeelden', name: 'Uitbeelden' },
		{ id: 't2', code: 'vragen', name: 'Vragen beantwoorden' },
		{ id: 't3', code: 'beschrijven', name: 'Beschrijven' },
		{ id: 't4', code: 'tekenen', name: 'Tekenen' }
	],
	categories: [
		{ id: 'c1', name: 'Dieren', is18plus: false },
		{ id: 'c2', name: 'Eten en drinken', is18plus: false },
		{ id: 'c3', name: 'Algemene kennis', is18plus: false },
		{ id: 'c4', name: '18+', is18plus: true }
	]
};

const q = (id: number, text: string, cats: string[], codes: string[], minAge: number) => ({
	id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
	text,
	cats,
	codes,
	minAge
});

const questions = [
	q(1, 'Olifant', ['c1'], ['uitbeelden', 'tekenen', 'beschrijven'], 4),
	q(2, 'Kikker', ['c1'], ['uitbeelden', 'tekenen'], 4),
	q(3, 'Pinguïn', ['c1'], ['uitbeelden', 'tekenen', 'beschrijven'], 4),
	q(4, 'Giraf', ['c1'], ['tekenen', 'beschrijven'], 4),
	q(5, 'Kangoeroe', ['c1'], ['uitbeelden', 'beschrijven'], 5),
	q(6, 'Pindarotsje', ['c2'], ['uitbeelden', 'tekenen'], 6),
	q(7, 'Pannenkoek', ['c2'], ['uitbeelden', 'tekenen', 'beschrijven'], 4),
	q(8, 'Spaghetti', ['c2'], ['uitbeelden', 'tekenen', 'beschrijven'], 5),
	q(9, 'IJsje', ['c2'], ['uitbeelden', 'tekenen'], 4),
	q(10, 'Noem drie planeten', ['c3'], ['vragen'], 8),
	q(11, 'Hoeveel poten heeft een spin?', ['c3', 'c1'], ['vragen'], 6),
	q(12, 'Welke kleur krijg je als je blauw en geel mengt?', ['c3'], ['vragen'], 5),
	q(13, 'Hoeveel minuten zitten er in een uur?', ['c3'], ['vragen'], 7),
	q(14, 'Noem vijf soorten fruit', ['c3', 'c2'], ['vragen'], 5),
	q(15, 'Slak', ['c1'], ['uitbeelden', 'tekenen'], 4),
	q(16, 'Hagelslag', ['c2'], ['beschrijven', 'tekenen'], 5),
	q(17, 'Vrijgezellenfeest', ['c4'], ['uitbeelden', 'beschrijven'], 18),
	q(18, 'Kater na het stappen', ['c4'], ['uitbeelden', 'beschrijven'], 18)
];

const counters = new Map<string, number>();

function shuffle<T>(a: T[]): T[] {
	const r = [...a];
	for (let i = r.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[r[i], r[j]] = [r[j], r[i]];
	}
	return r;
}

export const demoData: DataSource = {
	async listGames() {
		return [{ id: game.id, slug: game.slug, name: game.name, description: game.description }];
	},
	async getGame(slug) {
		return slug === game.slug ? game : null;
	},
	async drawQuestions(p) {
		const adultCats = new Set(game.categories.filter((c) => c.is18plus).map((c) => c.id));
		const res: DrawnQuestion[] = [];
		for (const x of shuffle(questions)) {
			const adult = x.minAge >= 18 || x.cats.some((c) => adultCats.has(c));
			const codes = x.codes.filter((c) => p.taskCodes.includes(c));
			if (p.exclude.includes(x.id) || x.minAge > p.age || codes.length === 0) continue;
			if (!x.cats.some((c) => p.categoryIds.includes(c) && (p.age >= 18 || !adultCats.has(c)))) continue;
			if (p.age < 18 && adult) continue;
			res.push({ id: x.id, text: x.text, minAge: x.minAge, taskCodes: codes, adult });
			if (res.length >= Math.min(p.count, 500)) break;
		}
		return res;
	},
	async hitRateLimit(key, limit, windowSeconds) {
		const w = Math.floor(Date.now() / 1000 / windowSeconds);
		const k = `${key}:${w}`;
		const n = (counters.get(k) ?? 0) + 1;
		counters.set(k, n);
		// Demomodus is alleen voor lokaal spelen en tests (veel spellen achter elkaar): ruimere grens.
		return n <= limit * 20;
	}
};
