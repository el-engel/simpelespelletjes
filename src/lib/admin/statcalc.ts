// Feedback en statistieken voor /beheer: rekenwerk (los te testen, zonder database).
export const AGE_GROUPS = ['0-3', '4-6', '7-9', '10-12', '13-17', '18+', 'onbekend'] as const;

export interface AgeCounts {
	plays: number;
	guessed: number;
	not_guessed: number;
	swapped: number;
	reports: number;
}

export interface QuestionStat {
	id: string;
	public_id: string;
	text: string;
	min_age: number;
	active: boolean;
	plays: number;
	guessed: number;
	not_guessed: number;
	swapped: number;
	reports: number;
	te_moeilijk: number;
	leeftijd: number;
	niet_leuk: number;
	prima: number;
	dismissed: number;
	last_report: string | null;
	by_age: Record<string, AgeCounts>;
}

export interface SeriesPoint {
	unit: 'day' | 'week' | 'month';
	period: string;
	games: number;
	completed: number;
	visitors: number;
	new_visitors: number;
}

export interface Stats {
	summary: {
		games: number;
		completed: number;
		stopped: number;
		quit: number;
		unfinished: number;
		avg_minutes: number | null;
		avg_turns: number | null;
		avg_players: number | null;
		skip_games: number;
		repeats_offered: number;
		played_repeats: number;
	};
	visitors: { visitors: number; new: number; returning: number; devices_playing: number };
	questions: { shown: number; guessed: number; not_guessed: number; swapped: number };
	series: SeriesPoint[];
	heatmap: { dow: number; hour: number; games: number }[];
	ages: { group: string; games: number }[];
	players: { players: number; games: number }[];
	task_types: { code: string; name: string; games_on: number }[];
	categories: { id: string; name: string; is_18plus: boolean; games_on: number; games_allowed: number }[];
}

// ---------------------------------------------------------------- rekenen

export const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);
export const fmtPct = (p: number | null) => (p === null ? '–' : `${p}%`);

/** Raadpercentage: geraden van alle keren dat de vraag echt gespeeld is (overslaan telt niet mee). */
export const guessRate = (c: { guessed: number; not_guessed: number }) => pct(c.guessed, c.guessed + c.not_guessed);

/** Leeftijdsgroep waar de vraag het vaakst gemeld wordt, bijvoorbeeld "7-9". */
export function worstAgeGroup(q: QuestionStat): { group: string; reports: number } | null {
	let best: { group: string; reports: number } | null = null;
	for (const g of AGE_GROUPS) {
		const r = q.by_age[g]?.reports ?? 0;
		if (r > 0 && (!best || r > best.reports)) best = { group: g, reports: r };
	}
	return best;
}

/** Belangrijkste reden van melden. */
export function mainReason(q: QuestionStat): string {
	const reasons: [string, number][] = [
		['te moeilijk', q.te_moeilijk],
		['past niet bij de leeftijd', q.leeftijd],
		['niet leuk genoeg', q.niet_leuk]
	];
	reasons.sort((a, b) => b[1] - a[1]);
	return reasons[0][1] > 0 ? reasons[0][0] : '';
}

/** Korte samenvatting voor de beheerder, bijvoorbeeld "Vaak te moeilijk bij 7-9 jaar". */
export function hint(q: QuestionStat): string {
	const worst = worstAgeGroup(q);
	const reason = mainReason(q);
	if (!worst || !reason) return '';
	const group = worst.group === 'onbekend' ? '' : ` bij ${worst.group} jaar`;
	const often = worst.reports >= 2 ? 'Vaak ' : '';
	return `${often}${reason}${group}`.replace(/^./, (c) => c.toUpperCase());
}

export type FeedbackSort = 'reports' | 'rate' | 'guess';

export function sortFeedback(rows: QuestionStat[], key: FeedbackSort): QuestionStat[] {
	const r = [...rows];
	const reportRate = (q: QuestionStat) => (q.plays ? q.reports / q.plays : q.reports);
	if (key === 'reports') r.sort((a, b) => b.reports - a.reports || reportRate(b) - reportRate(a) || b.plays - a.plays);
	if (key === 'rate') r.sort((a, b) => reportRate(b) - reportRate(a) || b.reports - a.reports);
	if (key === 'guess')
		r.sort((a, b) => (guessRate(a) ?? 101) - (guessRate(b) ?? 101) || b.not_guessed - a.not_guessed);
	return r;
}

/** Datum als JJJJ-MM-DD in de tijdzone van de browser. */
export function isoDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const PERIODS = [
	{ days: 7, label: 'Laatste 7 dagen' },
	{ days: 30, label: 'Laatste 30 dagen' },
	{ days: 90, label: 'Laatste 3 maanden' },
	{ days: 365, label: 'Laatste jaar' }
] as const;

export function periodRange(days: number, now = new Date()): { from: string; to: string } {
	const from = new Date(now);
	from.setDate(from.getDate() - (days - 1));
	return { from: isoDate(from), to: isoDate(now) };
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

export function periodLabel(unit: SeriesPoint['unit'], period: string): string {
	const [y, m, d] = period.split('-').map(Number);
	if (unit === 'month') return `${MONTHS[m - 1]} ${y}`;
	if (unit === 'week') return `wk ${d} ${MONTHS[m - 1]}`;
	return `${d} ${MONTHS[m - 1]}`;
}

// ---------------------------------------------------------------- Excel

type Cell = string | number | null;
export interface Sheet {
	name: string;
	rows: Cell[][];
}

export function feedbackSheet(rows: QuestionStat[]): Sheet {
	const header = [
		'ID', 'vraag', 'minimum leeftijd', 'actief', 'gespeeld', 'geraden', 'niet geraden', 'overgeslagen',
		'raadpercentage', 'meldingen', 'meldingen %', 'te moeilijk', 'past niet bij leeftijd', 'niet leuk genoeg',
		'niets aan de hand', 'genegeerd', 'samenvatting',
		...AGE_GROUPS.flatMap((g) => [`${g} gespeeld`, `${g} raadpercentage`, `${g} meldingen`])
	];
	return {
		name: 'Vragen',
		rows: [
			header,
			...rows.map((q) => [
				q.public_id, q.text, q.min_age, q.active ? 'ja' : 'nee', q.plays, q.guessed, q.not_guessed, q.swapped,
				guessRate(q), q.reports, pct(q.reports, q.plays), q.te_moeilijk, q.leeftijd, q.niet_leuk, q.prima,
				q.dismissed, hint(q),
				...AGE_GROUPS.flatMap((g) => {
					const a = q.by_age[g];
					return a ? [a.plays, guessRate(a), a.reports] : [0, null, 0];
				})
			])
		]
	};
}

export function statsSheets(s: Stats, from: string, to: string): Sheet[] {
	const sm = s.summary;
	const v = s.visitors;
	const qs = s.questions;
	const overview: Sheet = {
		name: 'Overzicht',
		rows: [
			['Periode', `${from} t/m ${to}`],
			['Gespeelde spellen', sm.games],
			['Afgemaakt', sm.completed],
			['Gestopt met uitslag', sm.stopped],
			['Tussentijds gestopt', sm.quit],
			['Niet afgemaakt (weggegaan)', sm.unfinished],
			['Gemiddelde duur (minuten)', sm.avg_minutes],
			['Gemiddeld aantal beurten', sm.avg_turns],
			['Gemiddeld aantal spelers', sm.avg_players],
			['Spellen met "mag vragen overslaan"', sm.skip_games],
			['"Alles al gespeeld?" getoond', sm.repeats_offered],
			['Op "Toch spelen" gedrukt', sm.played_repeats],
			['Unieke bezoekers', v.visitors],
			['Nieuwe bezoekers', v.new],
			['Terugkerende bezoekers', v.returning],
			['Toestellen die speelden', v.devices_playing],
			['Vragen getoond', qs.shown],
			['Geraden', qs.guessed],
			['Niet geraden', qs.not_guessed],
			['Overgeslagen', qs.swapped]
		]
	};
	const per = (unit: SeriesPoint['unit'], name: string): Sheet => ({
		name,
		rows: [
			['periode', 'spellen', 'afgemaakt', 'unieke bezoekers', 'nieuwe bezoekers', 'terugkerende bezoekers'],
			...s.series
				.filter((p) => p.unit === unit)
				.map((p) => [p.period, p.games, p.completed, p.visitors, p.new_visitors, p.visitors - p.new_visitors])
		]
	});
	return [
		overview,
		per('day', 'Per dag'),
		per('week', 'Per week'),
		per('month', 'Per maand'),
		{
			name: 'Dag en uur',
			rows: [['dag', 'uur', 'spellen'], ...s.heatmap.map((h) => [DAYS[h.dow - 1], h.hour, h.games])]
		},
		{ name: 'Leeftijd jongste', rows: [['leeftijdsgroep', 'spellen'], ...s.ages.map((a) => [a.group, a.games])] },
		{ name: 'Aantal spelers', rows: [['spelers', 'spellen'], ...s.players.map((p) => [p.players, p.games])] },
		{
			name: 'Opdrachten',
			rows: [['soort opdracht', 'aan in spellen', '% aan'], ...s.task_types.map((t) => [t.name, t.games_on, pct(t.games_on, sm.games)])]
		},
		{
			name: 'Categorieën',
			rows: [
				['categorie', '18+', 'aan in spellen', '% aan (van spellen waar het mocht)'],
				...s.categories.map((c) => [c.name, c.is_18plus ? 'ja' : 'nee', c.games_on, pct(c.games_on, c.games_allowed)])
			]
		}
	];
}

