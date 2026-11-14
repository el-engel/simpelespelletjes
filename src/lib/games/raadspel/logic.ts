// Spelregels van het raadspel als losse functies, zodat ze te testen zijn.
import type { DrawnQuestion } from '../../types';

export interface Player {
	id: string;
	name: string;
	score: number;
	turns: number;
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

export function makePlayer(name: string): Player {
	return { id: makeId(), name: name.trim().slice(0, 30), score: 0, turns: 0 };
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

/** Kiest een van de toegestane opdrachtsoorten van deze vraag. */
export function pickTask(q: DrawnQuestion, taskCodes: string[], rnd = Math.random): string {
	const options = q.taskCodes.filter((c) => taskCodes.includes(c));
	const list = options.length ? options : q.taskCodes;
	return list[Math.floor(rnd() * list.length)] ?? '';
}

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
	const question = queue[0];
	if (!question) return { ...s, queue, stage: 'end', current: null, endReason: 'out' };
	return {
		...s,
		queue: queue.slice(1),
		used: [...s.used, question.id],
		lastIndex: idx,
		current: { playerId: s.players[idx].id, question, taskCode: pickTask(question, s.taskCodes, rnd) },
		stage: 'type'
	};
}

/** Andere vraag voor dezelfde beurt (bijvoorbeeld als het woord onbekend is). */
export function swapQuestion(s: GameState, rnd = Math.random): GameState {
	if (!s.current) return s;
	const queue = filterQueue(s.queue, s.age);
	const question = queue[0];
	if (!question) return s;
	return {
		...s,
		queue: queue.slice(1),
		used: [...s.used, question.id],
		current: { ...s.current, question, taskCode: pickTask(question, s.taskCodes, rnd) },
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

export function addPlayer(s: GameState, name: string): GameState {
	if (!name.trim() || s.players.length >= MAX_PLAYERS) return s;
	const players = [...s.players, makePlayer(name)];
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
		endReason: null
	};
}
