// Inlezen en controleren van een upload (Excel of CSV) vóór het opslaan.
// De database controleert alles nog een keer; dit is voor het voorbeeld.
import type { ImportRow } from './api.ts';

export type RowStatus = 'nieuw' | 'bijwerken' | 'fout';

export interface PreviewRow extends ImportRow {
	status: RowStatus;
	problems: string[];
	newCategories: string[];
}

export interface Known {
	categories: string[];
	taskTypes: { code: string; name: string }[];
	/** Vraag-ID → tekst (alleen van dit spel). */
	ids: Map<string, string>;
	/** Bestaande vragen (kleine letters), om dubbele te vinden. */
	texts: Set<string>;
}

const COLUMNS = {
	id: ['id', 'vraagid', 'vraag-id'],
	text: ['vraag', 'vragen', 'tekst', 'opdracht'],
	categories: ['categorieen', 'categorie', 'categories', 'category'],
	taskTypes: ['soortopdracht', 'soortopdrachten', 'soort', 'soorten', 'opdrachtsoort', 'type'],
	minAge: ['minimumleeftijd', 'minleeftijd', 'leeftijd', 'minimaleleeftijd', 'minage']
} as const;

export const normalizeHeader = (h: unknown) =>
	String(h ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '');

const splitList = (v: unknown) =>
	String(v ?? '')
		.split(';')
		.map((x) => x.trim())
		.filter(Boolean);

const cell = (v: unknown) => {
	if (v === null || v === undefined) return '';
	if (v instanceof Date) return v.toISOString().slice(0, 10);
	return String(v).trim();
};

/** Zoekt de kolommen op naam; geeft een foutmelding als er een ontbreekt. */
export function mapColumns(header: unknown[]): { map: Record<keyof typeof COLUMNS, number>; missing: string[] } {
	const norm = header.map(normalizeHeader);
	const map = {} as Record<keyof typeof COLUMNS, number>;
	const missing: string[] = [];
	const labels: Record<keyof typeof COLUMNS, string> = {
		id: 'ID',
		text: 'vraag',
		categories: 'categorieën',
		taskTypes: 'soort opdracht',
		minAge: 'minimum leeftijd'
	};
	for (const key of Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]) {
		const idx = norm.findIndex((h) => (COLUMNS[key] as readonly string[]).includes(h));
		map[key] = idx;
		if (idx === -1 && key !== 'id') missing.push(labels[key]);
	}
	return { map, missing };
}

/** Zet ruwe rijen (eerste rij = kopregel) om naar gecontroleerde voorbeeldrijen. */
export function buildPreview(table: unknown[][], known: Known): { rows: PreviewRow[]; missing: string[] } {
	const [header = [], ...body] = table;
	const { map, missing } = mapColumns(header);
	if (missing.length) return { rows: [], missing };

	const catLower = new Map(known.categories.map((c) => [c.toLowerCase(), c]));
	const ttLower = new Set(known.taskTypes.flatMap((t) => [t.code.toLowerCase(), t.name.toLowerCase()]));
	const seen = new Set<string>();
	const rows: PreviewRow[] = [];

	body.forEach((raw, i) => {
		const get = (k: keyof typeof COLUMNS) => (map[k] >= 0 ? raw[map[k]] : '');
		const id = cell(get('id')) || null;
		const text = cell(get('text'));
		const categories = splitList(get('categories'));
		const taskTypes = splitList(get('taskTypes')).map((t) => t.toLowerCase());
		const minAge = cell(get('minAge'));
		if (!id && !text && categories.length === 0 && taskTypes.length === 0 && !minAge) return; // lege rij

		const problems: string[] = [];
		if (!text) problems.push('Vraag is leeg');
		else if (text.length > 500) problems.push('Vraag is langer dan 500 tekens');
		if (!/^\d{1,2}$/.test(minAge)) problems.push('Minimum leeftijd moet een getal van 0 tot 99 zijn');
		if (categories.length === 0) problems.push('Geen categorie ingevuld');
		if (taskTypes.length === 0) problems.push('Geen soort opdracht ingevuld');
		for (const t of taskTypes) if (!ttLower.has(t)) problems.push(`Onbekende soort opdracht: ${t}`);
		if (id && !known.ids.has(id)) problems.push(`ID ${id} bestaat niet; laat de ID leeg voor een nieuwe vraag`);
		const key = text.toLowerCase();
		if (!id && text && (known.texts.has(key) || seen.has(key))) problems.push('Deze vraag bestaat al');
		if (text) seen.add(key);

		const newCategories = categories.filter((c) => !catLower.has(c.toLowerCase()));
		rows.push({
			row: i + 2,
			id,
			text,
			categories: categories.map((c) => catLower.get(c.toLowerCase()) ?? c),
			task_types: taskTypes,
			min_age: minAge,
			status: problems.length ? 'fout' : id ? 'bijwerken' : 'nieuw',
			problems,
			newCategories
		});
	});
	return { rows, missing };
}

/** Leest een .xlsx- of .csv-bestand als tabel. */
export async function readTable(file: File): Promise<unknown[][]> {
	const name = file.name.toLowerCase();
	if (file.size > 5 * 1024 * 1024) throw new Error('Het bestand is groter dan 5 MB.');
	if (name.endsWith('.csv') || name.endsWith('.txt')) {
		const Papa = (await import('papaparse')).default;
		const text = await file.text();
		const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
		return res.data;
	}
	if (name.endsWith('.xlsx')) {
		const { readSheet } = await import('read-excel-file/universal');
		return (await readSheet(file)) as unknown[][];
	}
	if (name.endsWith('.xls')) {
		throw new Error('Oude .xls-bestanden worden niet ondersteund. Sla het bestand in Excel op als .xlsx of .csv.');
	}
	throw new Error('Kies een .xlsx- of .csv-bestand.');
}
