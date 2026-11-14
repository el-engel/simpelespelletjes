import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DrawnQuestion, GameDetails, GameSummary } from '#lib/types.ts';
import { isDemo, serverConfig } from './config';
import { demoData } from './demo';

export interface DrawParams {
	gameId: string;
	age: number;
	taskCodes: string[];
	categoryIds: string[];
	count: number;
	exclude: string[];
}

export interface DataSource {
	listGames(): Promise<GameSummary[]>;
	getGame(slug: string): Promise<GameDetails | null>;
	drawQuestions(p: DrawParams): Promise<DrawnQuestion[]>;
	/** true = verzoek toegestaan, false = te veel verzoeken. */
	hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
	if (client) return client;
	const { supabaseUrl, supabaseSecretKey } = serverConfig();
	if (!supabaseUrl || !supabaseSecretKey) {
		throw new Error('Supabase is nog niet ingesteld (PUBLIC_SUPABASE_URL en SUPABASE_SECRET_KEY)');
	}
	client = createClient(supabaseUrl, supabaseSecretKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	return client;
}

const supabaseData: DataSource = {
	async listGames() {
		const { data, error } = await supabase()
			.from('games')
			.select('id, slug, name, description')
			.eq('active', true)
			.order('sort_order')
			.order('name');
		if (error) throw error;
		return data ?? [];
	},

	async getGame(slug) {
		const db = supabase();
		const { data: g, error } = await db
			.from('games')
			.select('id, slug, name, description, rules, minutes_per_question')
			.eq('slug', slug)
			.eq('active', true)
			.maybeSingle();
		if (error) throw error;
		if (!g) return null;
		const [tt, cats] = await Promise.all([
			db.from('task_types').select('id, code, name').eq('game_id', g.id).eq('active', true).order('sort_order'),
			db.from('categories').select('id, name, is_18plus').eq('game_id', g.id).eq('active', true).order('name')
		]);
		if (tt.error) throw tt.error;
		if (cats.error) throw cats.error;
		return {
			id: g.id,
			slug: g.slug,
			name: g.name,
			description: g.description,
			rules: g.rules,
			minutesPerQuestion: Number(g.minutes_per_question),
			taskTypes: tt.data ?? [],
			categories: (cats.data ?? []).map((c) => ({ id: c.id, name: c.name, is18plus: c.is_18plus }))
		};
	},

	async drawQuestions(p) {
		const { data, error } = await supabase().rpc('draw_questions', {
			p_game: p.gameId,
			p_age: p.age,
			p_task_codes: p.taskCodes,
			p_category_ids: p.categoryIds,
			p_limit: p.count,
			p_exclude: p.exclude
		});
		if (error) throw error;
		return ((data ?? []) as { id: string; text: string; min_age: number; task_codes: string[]; adult: boolean }[]).map(
			(q) => ({ id: q.id, text: q.text, minAge: q.min_age, taskCodes: q.task_codes, adult: q.adult })
		);
	},

	async hitRateLimit(key, limit, windowSeconds) {
		const { data, error } = await supabase().rpc('hit_rate_limit', {
			p_key: key,
			p_limit: limit,
			p_window_seconds: windowSeconds
		});
		if (error) {
			// Liever spelen dan blokkeren als de teller even niet werkt.
			console.error('rate limit', error.message);
			return true;
		}
		return data === true;
	}
};

export const data = (): DataSource => (isDemo() ? demoData : supabaseData);
