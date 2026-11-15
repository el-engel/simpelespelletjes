import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBatch } from '../../src/lib/server/logcheck.ts';
import { removeSent, takeBatch } from '../../src/lib/stats/tracker.ts';
import { cleanTimer, formatSeconds, newState, sessionLog, markFeedback, canGiveFeedback } from '../../src/lib/games/raadspel/logic.ts';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('cleanBatch laat alleen geldige gegevens door', () => {
	const b = cleanBatch({
		device: 'geen-uuid',
		sessions: [{ id: U(1), players: 3, age: 999, task_codes: ['uitbeelden', 'DROP TABLE'], category_ids: [U(2), 'x'], end_reason: 'hack' }, { id: 'x' }],
		events: [
			{ id: U(3), session_id: U(1), question_id: U(4), kind: 'guessed', task_code: 'tekenen', age: 8 },
			{ id: U(5), session_id: U(1), question_id: U(4), kind: 'gehackt' }
		],
		feedback: [
			{ session_id: U(1), question_id: U(4), reason: 'te_moeilijk', moment: 'niet_geraden', age: 8 },
			{ session_id: U(1), question_id: U(4), reason: 'boos', moment: 'niet_geraden' }
		]
	});
	assert.equal(b.device, null);
	assert.equal(b.sessions.length, 1);
	assert.deepEqual(b.sessions[0].task_codes, ['uitbeelden']);
	assert.deepEqual(b.sessions[0].category_ids, [U(2)]);
	assert.equal(b.sessions[0].age, 0);
	assert.equal(b.sessions[0].end_reason, null);
	assert.equal(b.events.length, 1);
	assert.equal(b.feedback.length, 1);
});

test('cleanBatch begrenst het aantal regels', () => {
	const events = Array.from({ length: 500 }, (_, i) => ({ id: U(i + 10), session_id: U(1), question_id: U(2), kind: 'swapped' }));
	assert.equal(cleanBatch({ events }).events.length, 80);
});

test('verstuurde gegevens gaan uit de wachtrij, nieuwe niet', () => {
	const s = { id: U(1), turns: 1 } as never;
	const p = { sessions: { [U(1)]: s }, events: [{ id: U(2) }, { id: U(3) }] as never[], feedback: [] };
	const batch = takeBatch(p, null);
	const later = { ...p, sessions: { [U(1)]: { id: U(1), turns: 2 } as never }, events: [...p.events, { id: U(4) } as never] };
	const rest = removeSent(later, batch);
	assert.equal(Object.keys(rest.sessions).length, 1, 'gewijzigde sessie blijft staan');
	assert.deepEqual(rest.events.map((e) => e.id), [U(4)]);
});

test('timerinstellingen blijven binnen de grenzen', () => {
	assert.deepEqual(cleanTimer(null), { on: true, seconds: 60, sound: true });
	assert.equal(cleanTimer({ seconds: 1 }).seconds, 5);
	assert.equal(cleanTimer({ seconds: 99999 }).seconds, 600);
	assert.equal(cleanTimer({ seconds: Number.NaN }).seconds, 60);
	assert.equal(formatSeconds(59.2), '1:00');
	assert.equal(formatSeconds(44.1), '45');
	assert.equal(formatSeconds(65), '1:05');
	assert.equal(formatSeconds(-3), '0');
});

test('sessielog bevat geen namen en feedback maar één keer per vraag', () => {
	const s = {
		...newState(),
		sessionId: U(1),
		startedAt: 1000,
		stage: 'end' as const,
		endReason: 'done' as const,
		endedAt: 5000,
		players: [
			{ id: 'a', name: 'Lisa', score: 1, turns: 2, canSkip: true },
			{ id: 'b', name: 'Ben', score: 0, turns: 2 }
		]
	};
	const log = sessionLog(s)!;
	assert.equal(JSON.stringify(log).includes('Lisa'), false);
	assert.equal(log.turns, 4);
	assert.equal(log.skip_players, 1);
	assert.equal(log.ended_at, 5000);
	const marked = markFeedback(s, U(9));
	assert.equal(canGiveFeedback(s, U(9)), true);
	assert.equal(canGiveFeedback(marked, U(9)), false);
});
