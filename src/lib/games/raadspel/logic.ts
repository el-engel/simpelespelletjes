// Spelregels van het raadspel als losse functies, zodat ze te testen zijn.
import type { DrawnQuestion, SessionLog } from '../../types';

export interface Player {
	id: string;
	name: string;
	score: number;
	turns: number;
	/** Mag deze speler een vraag overslaan (handig voor kinderen)? */
	canSkip?: boolean;
}

export interface CurrentTurn {
	playerId: string;
	question: DrawnQuestion;
	taskCode: string;
}

export type Stage = 'setup' | 'turn' | 'type' | 'question' | 'guess' | 'end';

export interface GameState {
	version: 1;
	stage: Stage;
	players: Player[];
	perPlayer: number;
	age: number;
	taskCodes: string[];
	categoryIds: string[];
	queue: DrawnQuestion[];
	used: string[];
	current: CurrentTurn | null;
	/** Index van de speler die het laatst aan de beurt was (-1 = nog niemand). */
	lastIndex: number;
	/** Wie de vorige beurt raadde, om kort te tonen. */
	lastGuess: { by: string | null; playerId: string } | null;
	endReason: 'done' | 'out' | 'stopped' | null;
	/** Mogen vragen terugkomen die op deze telefoon al eens gespeeld zijn? */
	allowRepeats?: boolean;
	/** Timer per beurt. */
	timer?: TimerSettings;
	/** Anonieme statistieken: nummer van dit spel en wanneer het begon/eindigde. */
	sessionId?: string;
	startedAt?: number;
	endedAt?: number;
	/** Kwam "Alles al gespeeld?" in beeld, en werd er op "Toch spelen" gedrukt? */
	repeatsOffered?: boolean;
	playedRepeats?: boolean;
	/** Vragen die in dit spel al feedback kregen (maximaal één keer per vraag). */
	feedbackGiven?: string[];
	/** Opdrachtsoorten van de laatste beurten (nieuwste achteraan), om herhaling te beperken. */
	recentTasks?: string[];
}

/** Hoe vaak dezelfde opdrachtsoort maximaal achter elkaar mag komen (als het anders kan). */
export const MAX_SAME_TASK = 2;

export interface TimerSettings {
	on: boolean;
	seconds: number;
	sound: boolean;
}

export const DEFAULT_TIMER: TimerSettings = { on: true, seconds: 60, sound: true };
export const MIN_TIMER_SECONDS = 5;
export const MAX_TIMER_SECONDS = 600;

/** Houdt de timerinstellingen binnen redelijke grenzen. */
export function cleanTimer(t: Partial<TimerSettings> | null | undefined): TimerSettings {
	const n = Math.round(Number(t?.seconds));
	return {
		on: typeof t?.on === 'boolean' ? t.on : DEFAULT_TIMER.on,
		seconds: Number.isFinite(n) ? Math.min(MAX_TIMER_SECONDS, Math.max(MIN_TIMER_SECONDS, n)) : DEFAULT_TIMER.seconds,
		sound: typeof t?.sound === 'boolean' ? t.sound : DEFAULT_TIMER.sound
	};
}

/** "1:05" of "45". */
export function formatSeconds(sec: number): string {
	const s = Math.max(0, Math.ceil(sec));
	if (s < 60) return String(s);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const MAX_PLAYERS = 20;
export const MAX_PER_PLAYER = 20;

export function newState(): GameState {
	return {
		version: 1,
		stage: 'setup',
		players: [],
		perPlayer: 3,
		age: 0,
		taskCodes: [],
		categoryIds: [],
		queue: [],
		used: [],
		current: null,
		lastIndex: -1,
		lastGuess: null,
		endReason: null
	};
}

let counter = 0;
export const makeId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function makePlayer(name: string, canSkip = false): Player {
	return { id: makeId(), name: name.trim().slice(0, 30), score: 0, turns: 0, canSkip };
}

/** "Spel duurt ongeveer X minuten". */
export function estimateMinutes(players: number, perPlayer: number, minutesPerQuestion: number): number {
	if (players <= 0 || perPlayer <= 0) return 0;
	return Math.max(1, Math.round(players * perPlayer * minutesPerQuestion));
}

/** Aantal beurten dat nog gespeeld moet worden (exclusief de lopende beurt). */
export function remainingTurns(s: GameState): number {
	const total = s.players.reduce((n, p) => n + Math.max(0, s.perPlayer - p.turns), 0);
	return Math.max(0, total - (s.current ? 1 : 0));
}

/** De volgende speler in de rij die nog beurten over heeft, of null als het spel klaar is. */
export function nextPlayerIndex(s: GameState): number | null {
	const n = s.players.length;
	for (let step = 1; step <= n; step++) {
		const i = (s.lastIndex + step + n) % n;
		if (s.players[i].turns < s.perPlayer) return i;
	}
	return null;
}

/** Past de wachtrij aan na een nieuwe leeftijd: weg met wat niet meer mag. */
export function allowedForAge(q: DrawnQuestion, age: number): boolean {
	if (q.minAge > age) return false;
	if (age < 18 && q.adult) return false;
	return true;
}

export function filterQueue(queue: DrawnQuestion[], age: number): DrawnQuestion[] {
	return queue.filter((q) => allowedForAge(q, age));
}

/** De soorten die deze vraag in dit spel kan krijgen (alleen die aan staan). */
export function taskOptions(q: DrawnQuestion, taskCodes: string[]): string[] {
	const options = q.taskCodes.filter((c) => taskCodes.includes(c));
	return options.length ? options : q.taskCodes;
}

/** De soort die al MAX_SAME_TASK keer achter elkaar kwam, of null. */
export function blockedTask(recent: string[] = []): string | null {
	const last = recent.slice(-MAX_SAME_TASK);
	return last.length === MAX_SAME_TASK && last.every((c) => c === last[0]) ? last[0] : null;
}

/**
 * Kiest willekeurig één van de toegestane opdrachtsoorten van deze vraag.
 * Kwam dezelfde soort al twee keer achter elkaar, dan wordt die overgeslagen als de vraag een andere soort heeft.
 */
export function pickTask(q: DrawnQuestion, taskCodes: string[], rnd = Math.random, recent: string[] = []): string {
	const list = taskOptions(q, taskCodes);
	const blocked = blockedTask(recent);
	const fresh = blocked ? list.filter((c) => c !== blocked) : list;
	const pool = fresh.length ? fresh : list;
	return pool[Math.floor(rnd() * pool.length)] ?? '';
}

/**
 * Pakt de eerste vraag uit de wachtrij. Zou die vraag alleen de soort kunnen krijgen die al twee keer
 * achter elkaar kwam, dan nemen we de eerste vraag verderop die wél een andere soort heeft.
 */
function takeQuestion(queue: DrawnQuestion[], taskCodes: string[], recent: string[] = []) {
	const blocked = blockedTask(recent);
	let i = 0;
	if (blocked) {
		const better = queue.findIndex((q) => taskOptions(q, taskCodes).some((c) => c !== blocked));
		if (better > 0) i = better;
	}
	return { question: queue[i], rest: [...queue.slice(0, i), ...queue.slice(i + 1)] };
}

const remember = (recent: string[] = [], code: string) => [...recent, code].slice(-MAX_SAME_TASK);

/** Hoogste score; bij gelijkspel meerdere winnaars. Niemand gescoord = geen winnaar. */
export function winners(players: Player[]): Player[] {
	const top = Math.max(0, ...players.map((p) => p.score));
	if (top === 0) return [];
	return players.filter((p) => p.score === top);
}

/** Begint de beurt van de volgende speler met de eerste vraag uit de wachtrij. */
export function startTurn(s: GameState, rnd = Math.random): GameState {
	const idx = nextPlayerIndex(s);
	if (idx === null) return { ...s, stage: 'end', current: null, endReason: 'done' };
	const queue = filterQueue(s.queue, s.age);
	const { question, rest } = takeQuestion(queue, s.taskCodes, s.recentTasks);
	if (!question) return { ...s, queue, stage: 'end', current: null, endReason: 'out' };
	const taskCode = pickTask(question, s.taskCodes, rnd, s.recentTasks);
	return {
		...s,
		queue: rest,
		used: [...s.used, question.id],
		lastIndex: idx,
		current: { playerId: s.players[idx].id, question, taskCode },
		recentTasks: remember(s.recentTasks, taskCode),
		stage: 'type'
	};
}

/** Andere vraag voor dezelfde beurt (bijvoorbeeld als het woord onbekend is). */
export function swapQuestion(s: GameState, rnd = Math.random): GameState {
	if (!s.current) return s;
	const queue = filterQueue(s.queue, s.age);
	// De overgeslagen vraag telt niet mee voor de reeks: kijk naar de beurten daarvóór.
	const before = (s.recentTasks ?? []).slice(0, -1);
	const { question, rest } = takeQuestion(queue, s.taskCodes, before);
	if (!question) return s;
	const taskCode = pickTask(question, s.taskCodes, rnd, before);
	return {
		...s,
		queue: rest,
		used: [...s.used, question.id],
		current: { ...s.current, question, taskCode },
		recentTasks: remember(before, taskCode),
		stage: 'type'
	};
}

/** Beurt afronden: wie heeft het geraden (null = niemand). */
export function finishTurn(s: GameState, guessedBy: string | null): GameState {
	if (!s.current) return s;
	const playerId = s.current.playerId;
	const players = s.players.map((p) => {
		let next = p;
		if (p.id === playerId) next = { ...next, turns: next.turns + 1 };
		if (guessedBy && p.id === guessedBy && p.id !== playerId) next = { ...next, score: next.score + 1 };
		return next;
	});
	const after: GameState = { ...s, players, current: null, lastGuess: { by: guessedBy, playerId }, stage: 'turn' };
	return nextPlayerIndex(after) === null ? { ...after, stage: 'end', endReason: 'done' } : after;
}

export function addPlayer(s: GameState, name: string, canSkip = false): GameState {
	if (!name.trim() || s.players.length >= MAX_PLAYERS) return s;
	const players = [...s.players, makePlayer(name, canSkip)];
	const reopened = s.stage === 'end' && s.endReason === 'done';
	return { ...s, players, stage: reopened ? 'turn' : s.stage, endReason: reopened ? null : s.endReason };
}

export function setAge(s: GameState, age: number): GameState {
	const categoryIds = s.categoryIds;
	return { ...s, age, categoryIds, queue: filterQueue(s.queue, age) };
}

/** Zelfde spelers, nieuwe ronde: scores en beurten op nul. */
export function playAgain(s: GameState): GameState {
	return {
		...s,
		stage: 'turn',
		players: s.players.map((p) => ({ ...p, score: 0, turns: 0 })),
		current: null,
		lastIndex: -1,
		lastGuess: null,
		endReason: null,
		recentTasks: []
	};
}

/** Zet "mag vragen overslaan" aan of uit voor één speler. */
export function setCanSkip(s: GameState, playerId: string, canSkip: boolean): GameState {
	return { ...s, players: s.players.map((p) => (p.id === playerId ? { ...p, canSkip } : p)) };
}

/** Mag er voor deze vraag (nog) feedback gegeven worden in dit spel? */
export function canGiveFeedback(s: GameState, questionId: string): boolean {
	return !(s.feedbackGiven ?? []).includes(questionId);
}

export function markFeedback(s: GameState, questionId: string): GameState {
	return { ...s, feedbackGiven: [...new Set([...(s.feedbackGiven ?? []), questionId])] };
}

/** Anonieme samenvatting van het spel voor de statistieken (zonder namen). */
export function sessionLog(s: GameState, now = Date.now()): SessionLog | null {
	if (!s.sessionId) return null;
	const ended = s.stage === 'end';
	return {
		id: s.sessionId,
		started_at: s.startedAt ?? now,
		ended_at: ended ? (s.endedAt ?? now) : null,
		end_reason: ended ? s.endReason : null,
		players: s.players.length,
		per_player: s.perPlayer,
		age: s.age,
		task_codes: [...s.taskCodes],
		category_ids: [...s.categoryIds],
		skip_players: s.players.filter((p) => p.canSkip).length,
		repeats_offered: !!s.repeatsOffered,
		played_repeats: !!s.playedRepeats,
		turns: s.players.reduce((n, p) => n + p.turns, 0)
	};
}
