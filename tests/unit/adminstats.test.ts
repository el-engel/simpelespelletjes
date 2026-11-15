import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessRate, hint, periodRange, sortFeedback, type QuestionStat } from '../../src/lib/admin/statcalc.ts';

const q = (over: Partial<QuestionStat>): QuestionStat => ({
	id: 'q', public_id: 'RS-1', text: 'x', min_age: 4, active: true, plays: 0, guessed: 0, not_guessed: 0, swapped: 0,
	reports: 0, te_moeilijk: 0, leeftijd: 0, niet_leuk: 0, prima: 0, dismissed: 0, last_report: null, by_age: {}, ...over
});

test('samenvatting noemt reden en leeftijdsgroep', () => {
	const a = q({ te_moeilijk: 3, leeftijd: 1, reports: 4, by_age: { '7-9': { plays: 5, guessed: 0, not_guessed: 2, swapped: 3, reports: 3 }, '4-6': { plays: 1, guessed: 0, not_guessed: 0, swapped: 1, reports: 1 } } });
	assert.equal(hint(a), 'Vaak te moeilijk bij 7-9 jaar');
	assert.equal(hint(q({})), '');
});

test('raadpercentage telt overslaan niet mee', () => {
	assert.equal(guessRate({ guessed: 1, not_guessed: 3 }), 25);
	assert.equal(guessRate({ guessed: 0, not_guessed: 0 }), null);
});

test('sorteren op meldingen, percentage en raadpercentage', () => {
	const rows = [q({ id: 'a', reports: 2, plays: 20, guessed: 9, not_guessed: 1 }), q({ id: 'b', reports: 1, plays: 2, guessed: 1, not_guessed: 1 })];
	assert.deepEqual(sortFeedback(rows, 'reports').map((r) => r.id), ['a', 'b']);
	assert.deepEqual(sortFeedback(rows, 'rate').map((r) => r.id), ['b', 'a']);
	assert.deepEqual(sortFeedback(rows, 'guess').map((r) => r.id), ['b', 'a']);
});

test('periode van 7 dagen loopt t/m vandaag', () => {
	assert.deepEqual(periodRange(7, new Date(2026, 10, 15)), { from: '2026-11-09', to: '2026-11-15' });
});
