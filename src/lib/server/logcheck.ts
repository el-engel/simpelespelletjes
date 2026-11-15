import type { EventLog, FeedbackLog, LogBatch, SessionLog } from '../types.ts';

// Controle van wat de browser aan statistieken en feedback opstuurt.
// Alles wat niet klopt wordt stil weggelaten; nooit een fout naar de speler.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

const int = (v: unknown, min: number, max: number, dflt: number) =>
	typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : dflt;
const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null =>
	typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;
const obj = (v: unknown): Record<string, unknown> | null =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);

export const LIMITS = { sessions: 5, events: 80, feedback: 40 };

function session(v: unknown): SessionLog | null {
	const o = obj(v);
	if (!o || !isUuid(o.id)) return null;
	return {
		id: o.id,
		started_at: time(o.started_at) ?? Date.now(),
		ended_at: time(o.ended_at),
		end_reason: oneOf(o.end_reason, ['done', 'out', 'stopped', 'quit'] as const),
		players: int(o.players, 0, 50, 0),
		per_player: int(o.per_player, 0, 50, 0),
		age: int(o.age, 0, 120, 0),
		task_codes: list(o.task_codes, 20).filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,30}$/.test(x)),
		category_ids: list(o.category_ids, 200).filter(isUuid),
		skip_players: int(o.skip_players, 0, 50, 0),
		repeats_offered: o.repeats_offered === true,
		played_repeats: o.played_repeats === true,
		turns: int(o.turns, 0, 5000, 0)
	};
}

function event(v: unknown): EventLog | null {
	const o = obj(v);
	const kind = oneOf(o?.kind, ['guessed', 'not_guessed', 'swapped'] as const);
	if (!o || !kind || !isUuid(o.id) || !isUuid(o.session_id) || !isUuid(o.question_id)) return null;
	const task = typeof o.task_code === 'string' && /^[a-z0-9-]{0,30}$/.test(o.task_code) ? o.task_code : '';
	return { id: o.id, session_id: o.session_id, question_id: o.question_id, kind, task_code: task, age: int(o.age, 0, 120, 0) };
}

function feedback(v: unknown): FeedbackLog | null {
	const o = obj(v);
	const reason = oneOf(o?.reason, ['te_moeilijk', 'leeftijd', 'niet_leuk', 'prima'] as const);
	const moment = oneOf(o?.moment, ['andere_vraag', 'niet_geraden'] as const);
	if (!o || !reason || !moment || !isUuid(o.session_id) || !isUuid(o.question_id)) return null;
	return { session_id: o.session_id, question_id: o.question_id, reason, moment, age: int(o.age, 0, 120, 0) };
}

export function cleanBatch(body: Record<string, unknown>): LogBatch {
	const notNull = <T>(x: T | null): x is T => x !== null;
	return {
		device: isUuid(body.device) ? body.device : null,
		sessions: list(body.sessions, LIMITS.sessions).map(session).filter(notNull),
		events: list(body.events, LIMITS.events).map(event).filter(notNull),
		feedback: list(body.feedback, LIMITS.feedback).map(feedback).filter(notNull)
	};
}
