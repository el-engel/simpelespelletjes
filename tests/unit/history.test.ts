import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExclude } from '../../src/lib/games/raadspel/history.ts';

test('uitsluiten: vragen uit het spel altijd, daarna de nieuwste eerder gespeelde', () => {
	assert.deepEqual(buildExclude(['a', 'b'], ['x', 'y', 'a']), ['a', 'b', 'y', 'x']);
	assert.deepEqual(buildExclude(['a'], ['x', 'y', 'z'], 3), ['a', 'z', 'y']);
	assert.deepEqual(buildExclude([], []), []);
});
