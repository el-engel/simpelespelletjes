import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	addPlayer,
	estimateMinutes,
	filterQueue,
	finishTurn,
	makePlayer,
	newState,
	nextPlayerIndex,
	pickTask,
	playAgain,
	remainingTurns,
	setAge,
	setCanSkip,
	startTurn,
	winners,
	type GameState
} from '../../src/lib/games/raadspel/logic.ts';

const q = (id: string, minAge = 4, adult = false, taskCodes = ['uitbeelden', 'tekenen']) => ({
	id,
	text: id,
	minAge,
	adult,
	taskCodes
});

function game(players: string[], perPlayer = 2, queueSize = 10): GameState {
	return {
		...newState(),
		stage: 'turn',
		players: players.map((n) => makePlayer(n)),
		perPlayer,
		age: 8,
		taskCodes: ['uitbeelden', 'tekenen'],
		categoryIds: ['c1'],
		queue: Array.from({ length: queueSize }, (_, i) => q(`q${i}`))
	};
}

test('speelduur = spelers × vragen × minuten per vraag', () => {
	assert.equal(estimateMinutes(4, 3, 1), 12);
	assert.equal(estimateMinutes(3, 2, 1.5), 9);
	assert.equal(estimateMinutes(0, 3, 1), 0);
});

test('beurten gaan om de beurt en het spel eindigt als iedereen klaar is', () => {
	let s = game(['Ann', 'Bob', 'Cas'], 2);
	assert.equal(remainingTurns(s), 6);
	const order: string[] = [];
	for (let i = 0; i < 6; i++) {
		s = startTurn(s, () => 0);
		assert.equal(s.stage, 'type');
		order.push(s.players.find((p) => p.id === s.current!.playerId)!.name);
		s = finishTurn(s, null);
	}
	assert.deepEqual(order, ['Ann', 'Bob', 'Cas', 'Ann', 'Bob', 'Cas']);
	assert.equal(s.stage, 'end');
	assert.equal(s.endReason, 'done');
	assert.equal(s.used.length, 6);
});

test('wie raadt krijgt een punt, de uitbeelder niet', () => {
	let s = game(['Ann', 'Bob'], 1);
	s = startTurn(s);
	const ann = s.players[0].id;
	const bob = s.players[1].id;
	s = finishTurn(s, ann); // Ann is zelf aan de beurt: geen punt
	assert.equal(s.players[0].score, 0);
	s = startTurn(s);
	s = finishTurn(s, ann);
	assert.equal(s.players[0].score, 1);
	assert.equal(s.players[1].score, 0);
	assert.equal(s.stage, 'end');
	assert.deepEqual(winners(s.players).map((p) => p.id), [ann]);
	void bob;
});

test('gelijkspel geeft meerdere winnaars, niemand gescoord geeft geen winnaar', () => {
	const ps = [makePlayer('A'), makePlayer('B'), makePlayer('C')];
	assert.equal(winners(ps).length, 0);
	ps[0].score = 2;
	ps[1].score = 2;
	ps[2].score = 1;
	assert.deepEqual(winners(ps).map((p) => p.name), ['A', 'B']);
});

test('lagere leeftijd haalt ongeschikte vragen uit de wachtrij', () => {
	const queue = [q('a', 4), q('b', 10), q('c', 18, true), q('d', 6, true)];
	assert.deepEqual(filterQueue(queue, 8).map((x) => x.id), ['a']);
	assert.deepEqual(filterQueue(queue, 18).map((x) => x.id), ['a', 'b', 'c', 'd']);
	let s = { ...game(['A', 'B']), queue, age: 30 };
	s = setAge(s, 7);
	assert.deepEqual(s.queue.map((x) => x.id), ['a']);
});

test('speler toevoegen tijdens het spel geeft extra beurten', () => {
	let s = game(['A', 'B'], 1);
	s = finishTurn(startTurn(s), null);
	s = addPlayer(s, 'C');
	assert.equal(s.players.length, 3);
	assert.equal(remainingTurns(s), 2);
	s = finishTurn(startTurn(s), null);
	s = finishTurn(startTurn(s), null);
	assert.equal(s.stage, 'end');
	assert.ok(s.players.every((p) => p.turns === 1));
});

test('speler toevoegen na einde heropent het spel', () => {
	let s = game(['A', 'B'], 1);
	s = finishTurn(startTurn(s), null);
	s = finishTurn(startTurn(s), null);
	assert.equal(s.stage, 'end');
	s = addPlayer(s, 'C');
	assert.equal(s.stage, 'turn');
	assert.equal(nextPlayerIndex(s), 2);
});

test('geen vragen meer = einde met reden "out"', () => {
	let s = game(['A', 'B'], 3, 1);
	s = finishTurn(startTurn(s), null);
	s = startTurn(s);
	assert.equal(s.stage, 'end');
	assert.equal(s.endReason, 'out');
});

test('opdrachtsoort komt uit de gekozen soorten', () => {
	const question = q('x', 4, false, ['uitbeelden', 'vragen', 'tekenen']);
	assert.equal(pickTask(question, ['tekenen'], () => 0.99), 'tekenen');
	assert.equal(pickTask(question, ['vragen', 'tekenen'], () => 0), 'vragen');
});

test('nog een keer zet scores en beurten op nul', () => {
	let s = game(['A', 'B'], 1);
	s = startTurn(s);
	s = finishTurn(s, s.players[1].id);
	s = playAgain(s);
	assert.ok(s.players.every((p) => p.score === 0 && p.turns === 0));
	assert.equal(s.stage, 'turn');
});

test('vragen overslaan: per speler aan en uit, ook bij toevoegen', () => {
	let s: GameState = { ...newState(), stage: 'turn', players: [makePlayer('Kim', true), makePlayer('Papa')] };
	assert.equal(s.players[0].canSkip, true);
	assert.equal(s.players[1].canSkip, false);
	s = setCanSkip(s, s.players[1].id, true);
	assert.equal(s.players[1].canSkip, true);
	s = addPlayer(s, 'Oma', true);
	assert.equal(s.players[2].canSkip, true);
});
