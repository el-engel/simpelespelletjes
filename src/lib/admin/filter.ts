import type { AdminCategory, AdminQuestion, AdminTaskType } from './api.ts';

export interface Filters {
	search: string;
	id: string;
	text: string;
	categoryId: string;
	taskTypeId: string;
	ageMin: number | null;
	ageMax: number | null;
	status: 'alle' | 'actief' | 'inactief';
}

export type SortKey = 'public_id' | 'text' | 'categories' | 'taskTypes' | 'min_age' | 'active' | 'created_at';

export const emptyFilters = (): Filters => ({
	search: '',
	id: '',
	text: '',
	categoryId: '',
	taskTypeId: '',
	ageMin: null,
	ageMax: null,
	status: 'alle'
});

export interface Row extends AdminQuestion {
	categoryNames: string;
	taskTypeNames: string;
	adult: boolean;
}

export function decorate(qs: AdminQuestion[], cats: AdminCategory[], tts: AdminTaskType[]): Row[] {
	const cat = new Map(cats.map((c) => [c.id, c]));
	const tt = new Map(tts.map((t) => [t.id, t.name]));
	return qs.map((q) => ({
		...q,
		categoryNames: q.categoryIds
			.map((id) => cat.get(id)?.name ?? '')
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b, 'nl'))
			.join(', '),
		taskTypeNames: q.taskTypeIds
			.map((id) => tt.get(id) ?? '')
			.filter(Boolean)
			.join(', '),
		adult: q.min_age >= 18 || q.categoryIds.some((id) => cat.get(id)?.is_18plus)
	}));
}

const norm = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase();

/** Zoeken over alle kolommen plus filters per kolom. */
export function applyFilters(rows: Row[], f: Filters): Row[] {
	const terms = norm(f.search).split(/\s+/).filter(Boolean);
	const id = norm(f.id.trim());
	const text = norm(f.text.trim());
	return rows.filter((r) => {
		if (f.status === 'actief' && !r.active) return false;
		if (f.status === 'inactief' && r.active) return false;
		if (f.categoryId && !r.categoryIds.includes(f.categoryId)) return false;
		if (f.taskTypeId && !r.taskTypeIds.includes(f.taskTypeId)) return false;
		if (f.ageMin !== null && r.min_age < f.ageMin) return false;
		if (f.ageMax !== null && r.min_age > f.ageMax) return false;
		if (id && !norm(r.public_id).includes(id)) return false;
		if (text && !norm(r.text).includes(text)) return false;
		if (terms.length) {
			const hay = norm(
				[r.public_id, r.text, r.categoryNames, r.taskTypeNames, String(r.min_age), r.active ? 'actief' : 'inactief'].join(' ')
			);
			if (!terms.every((t) => hay.includes(t))) return false;
		}
		return true;
	});
}

export function sortRows(rows: Row[], key: SortKey, asc: boolean): Row[] {
	const val = (r: Row): string | number => {
		switch (key) {
			case 'categories':
				return r.categoryNames;
			case 'taskTypes':
				return r.taskTypeNames;
			case 'min_age':
				return r.min_age;
			case 'active':
				return r.active ? 1 : 0;
			default:
				return r[key];
		}
	};
	const dir = asc ? 1 : -1;
	return [...rows].sort((a, b) => {
		const x = val(a);
		const y = val(b);
		const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'nl', { numeric: true });
		return c * dir;
	});
}
