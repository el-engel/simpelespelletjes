// Alles wat /beheer met de database doet. De database controleert zelf of je
// admin bent en met 2FA bent ingelogd; zonder dat lukt geen enkele wijziging.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$app/env/public';

export interface AdminGame {
	id: string;
	slug: string;
	name: string;
	description: string;
	rules: string;
	id_prefix: string;
	minutes_per_question: number;
	active: boolean;
	sort_order: number;
}

export interface AdminCategory {
	id: string;
	game_id: string;
	name: string;
	is_18plus: boolean;
	active: boolean;
}

export interface AdminTaskType {
	id: string;
	game_id: string;
	code: string;
	name: string;
	active: boolean;
	sort_order: number;
}

export interface AdminQuestion {
	id: string;
	public_id: string;
	text: string;
	min_age: number;
	active: boolean;
	created_at: string;
	updated_at: string;
	categoryIds: string[];
	taskTypeIds: string[];
}

export interface Draft {
	text: string;
	min_age: number;
	active: boolean;
	categoryIds: string[];
	taskTypeIds: string[];
}

export interface ImportRow {
	row: number;
	id: string | null;
	text: string;
	categories: string[];
	task_types: string[];
	min_age: string;
}

export interface ImportResult {
	upload_id: string;
	created: number;
	updated: number;
	failed: number;
	errors: { row: number; message: string }[];
}

let client: SupabaseClient | null = null;

export const isConfigured = () => !!PUBLIC_SUPABASE_URL && !!PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function supabase(): SupabaseClient {
	if (!client) {
		if (!isConfigured()) throw new Error('Supabase is nog niet ingesteld.');
		client = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
			auth: { persistSession: true, autoRefreshToken: true, storageKey: 'simplegames-beheer' }
		});
	}
	return client;
}

/** Leesbare foutmelding uit een Supabase-fout. */
export function message(e: unknown): string {
	if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
		const m = e.message;
		if (/duplicate key/i.test(m)) return 'Deze naam of code bestaat al.';
		if (/row-level security|permission denied|Geen toegang/i.test(m))
			return 'Geen toegang. Log opnieuw in met je 2FA-code.';
		return m;
	}
	return 'Er ging iets mis.';
}

export function check<T>(res: { data: T; error: unknown }): T {
	if (res.error) throw new Error(message(res.error));
	return res.data;
}

export async function loadGames(): Promise<AdminGame[]> {
	return check(
		await supabase()
			.from('games')
			.select('id, slug, name, description, rules, id_prefix, minutes_per_question, active, sort_order')
			.order('sort_order')
			.order('name')
	) as AdminGame[];
}

export async function loadMeta(gameId: string) {
	const db = supabase();
	const [cats, tts] = await Promise.all([
		db.from('categories').select('id, game_id, name, is_18plus, active').eq('game_id', gameId).order('name'),
		db.from('task_types').select('id, game_id, code, name, active, sort_order').eq('game_id', gameId).order('sort_order')
	]);
	return {
		categories: check(cats) as AdminCategory[],
		taskTypes: check(tts) as AdminTaskType[]
	};
}

/** Haalt alle vragen van een spel op, in delen van 1000. */
export async function loadQuestions(gameId: string): Promise<AdminQuestion[]> {
	const out: AdminQuestion[] = [];
	const size = 1000;
	for (let from = 0; ; from += size) {
		const rows = check(
			await supabase()
				.from('questions')
				.select(
					'id, public_id, text, min_age, active, created_at, updated_at, question_categories(category_id), question_task_types(task_type_id)'
				)
				.eq('game_id', gameId)
				.order('created_at', { ascending: false })
				.order('public_id', { ascending: false })
				.range(from, from + size - 1)
		) as unknown as (Omit<AdminQuestion, 'categoryIds' | 'taskTypeIds'> & {
			question_categories: { category_id: string }[];
			question_task_types: { task_type_id: string }[];
		})[];
		for (const r of rows) {
			const { question_categories, question_task_types, ...rest } = r;
			out.push({
				...rest,
				categoryIds: question_categories.map((c) => c.category_id),
				taskTypeIds: question_task_types.map((t) => t.task_type_id)
			});
		}
		if (rows.length < size) break;
	}
	return out;
}

export async function saveQuestion(
	gameId: string,
	q: { id: string | null; text: string; min_age: number; active: boolean; categoryIds: string[]; taskTypeIds: string[] }
) {
	return check(
		await supabase().rpc('admin_save_question', {
			p_id: q.id,
			p_game: gameId,
			p_text: q.text,
			p_min_age: q.min_age,
			p_active: q.active,
			p_category_ids: q.categoryIds,
			p_task_type_ids: q.taskTypeIds
		})
	) as { id: string; public_id: string; min_age: number };
}

export async function setActive(ids: string[], active: boolean) {
	for (let i = 0; i < ids.length; i += 200) {
		check(await supabase().from('questions').update({ active }).in('id', ids.slice(i, i + 200)));
	}
}

export async function deleteQuestions(ids: string[]) {
	for (let i = 0; i < ids.length; i += 200) {
		check(await supabase().from('questions').delete().in('id', ids.slice(i, i + 200)));
	}
}

export async function importQuestions(gameId: string, rows: ImportRow[], createCategories: boolean, filename: string) {
	return check(
		await supabase().rpc('admin_import_questions', {
			p_game: gameId,
			p_rows: rows,
			p_create_categories: createCategories,
			p_filename: filename
		})
	) as ImportResult;
}

export async function saveGame(g: Partial<AdminGame> & { id?: string }) {
	const { id, ...fields } = g;
	if (id) return check(await supabase().from('games').update(fields).eq('id', id).select().single()) as AdminGame;
	return check(await supabase().from('games').insert(fields).select().single()) as AdminGame;
}

export async function saveCategory(c: Partial<AdminCategory> & { game_id: string }) {
	const { id, ...fields } = c;
	if (id) check(await supabase().from('categories').update(fields).eq('id', id));
	else check(await supabase().from('categories').insert(fields));
}

export async function saveTaskType(t: Partial<AdminTaskType> & { game_id: string }) {
	const { id, ...fields } = t;
	if (id) check(await supabase().from('task_types').update(fields).eq('id', id));
	else check(await supabase().from('task_types').insert(fields));
}
