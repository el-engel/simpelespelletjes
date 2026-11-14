// Exporteren in hetzelfde formaat als de upload, zodat je kunt aanpassen en terug uploaden.
import type { AdminCategory, AdminQuestion, AdminTaskType } from './api.ts';

export const HEADER = ['ID', 'vraag', 'categorieën', 'soort opdracht', 'minimum leeftijd', 'actief'];

export function toRows(questions: AdminQuestion[], categories: AdminCategory[], taskTypes: AdminTaskType[]) {
	const cat = new Map(categories.map((c) => [c.id, c.name]));
	const tt = new Map(taskTypes.map((t) => [t.id, t.name.toLowerCase()]));
	return questions.map((q) => [
		q.public_id,
		q.text,
		q.categoryIds.map((id) => cat.get(id) ?? '').filter(Boolean).join(';'),
		q.taskTypeIds.map((id) => tt.get(id) ?? '').filter(Boolean).join(';'),
		q.min_age,
		q.active ? 'ja' : 'nee'
	]);
}

function download(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportCsv(rows: (string | number)[][], filename: string) {
	const Papa = (await import('papaparse')).default;
	const csv = Papa.unparse([HEADER, ...rows], { quotes: true });
	download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), filename);
}

export async function exportXlsx(rows: (string | number)[][], filename: string) {
	const writeExcelFile = (await import('write-excel-file/universal')).default;
	const blob = await writeExcelFile([HEADER, ...rows] as never).toBlob();
	download(blob, filename);
}
