import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPreview } from '../../src/lib/admin/upload.ts';

const known = {
	categories: ['Dieren'],
	taskTypes: [
		{ code: 'uitbeelden', name: 'Uitbeelden' },
		{ code: 'vragen', name: 'Raden (ja of nee)' }
	],
	ids: new Map<string, string>(),
	texts: new Set<string>()
};
const head = ['ID', 'vraag', 'categorieën', 'soort opdracht', 'minimum leeftijd'];

test('upload: nieuwe naam, code en oude namen van een soort worden allemaal herkend', () => {
	const { rows } = buildPreview(
		[
			head,
			['', 'Olifant', 'Dieren', 'Raden (ja of nee)', '6'],
			['', 'Giraf', 'Dieren', 'vragen', '6'],
			['', 'Spin', 'Dieren', 'Vragen beantwoorden; uitbeelden', '6'],
			['', 'Mier', 'Dieren', 'Vragen stellen', '6']
		],
		known
	);
	assert.deepEqual(rows.map((r) => r.status), ['nieuw', 'nieuw', 'nieuw', 'nieuw']);
	assert.deepEqual(rows[2].task_types, ['vragen', 'uitbeelden']);
	assert.deepEqual(rows[3].task_types, ['vragen']);
});

test('upload: echt onbekende soort blijft een fout', () => {
	const { rows } = buildPreview([head, ['', 'Olifant', 'Dieren', 'zingen', '6']], known);
	assert.equal(rows[0].status, 'fout');
	assert.match(rows[0].problems.join(), /Onbekende soort opdracht: zingen/);
});
