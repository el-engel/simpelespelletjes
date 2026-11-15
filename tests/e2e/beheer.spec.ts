import { expect, test, type Page, type Route } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Klikproeven voor /beheer. Supabase wordt in de browser nagebootst, zodat we
// de schermen kunnen testen zonder echt project. De echte toegangsregels in de
// database zijn apart getest (supabase/tests).

const SB = 'https://test.supabase.co';
const GAME = 'g1';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (aal: 'aal1' | 'aal2', admin: boolean) =>
	`${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
		sub: 'u1',
		role: 'authenticated',
		aal,
		amr: [{ method: 'password', timestamp: 1 }],
		exp: Math.floor(Date.now() / 1000) + 3600,
		app_metadata: admin ? { role: 'admin' } : {}
	})}.sig`;

interface Db {
	factors: { id: string; factor_type: string; status: string; friendly_name: string }[];
	categories: { id: string; game_id: string; name: string; is_18plus: boolean; active: boolean }[];
	taskTypes: { id: string; game_id: string; code: string; name: string; active: boolean; sort_order: number }[];
	questions: {
		id: string;
		public_id: string;
		text: string;
		min_age: number;
		active: boolean;
		created_at: string;
		updated_at: string;
		question_categories: { category_id: string }[];
		question_task_types: { task_type_id: string }[];
	}[];
	calls: { method: string; path: string; body: unknown }[];
	admin: boolean;
	stats: Record<string, unknown>[];
	messages: { id: string; created_at: string; name: string; email: string; phone: string; message: string; is_read: boolean; emailed: boolean }[];
}

function freshDb(): Db {
	const q = (n: number, text: string, cats: string[], tts: string[], age: number, active = true) => ({
		id: `q${n}`,
		public_id: `RS-${String(n).padStart(5, '0')}`,
		text,
		min_age: age,
		active,
		created_at: new Date(2026, 10, n).toISOString(),
		updated_at: new Date(2026, 10, n).toISOString(),
		question_categories: cats.map((category_id) => ({ category_id })),
		question_task_types: tts.map((task_type_id) => ({ task_type_id }))
	});
	return {
		factors: [],
		admin: true,
		calls: [],
		messages: [
			{ id: 'm2', created_at: '2026-11-15T19:30:00Z', name: 'Kim', email: 'kim@voorbeeld.nl', phone: '06 12345678', message: 'Kunnen er meer dieren bij?\nGroetjes', is_read: false, emailed: true },
			{ id: 'm1', created_at: '2026-11-14T09:00:00Z', name: 'Piet', email: 'piet@voorbeeld.nl', phone: '', message: 'Top spel', is_read: true, emailed: false }
		],
		stats: [
			{
				id: 'q2', public_id: 'RS-00002', text: 'Pindarotsje', min_age: 6, active: true,
				plays: 10, guessed: 2, not_guessed: 5, swapped: 3, reports: 4, te_moeilijk: 3, leeftijd: 1, niet_leuk: 0,
				prima: 1, dismissed: 0, last_report: '2026-11-15T10:00:00Z',
				by_age: {
					'7-9': { plays: 6, guessed: 0, not_guessed: 3, swapped: 3, reports: 4 },
					'18+': { plays: 4, guessed: 2, not_guessed: 2, swapped: 0, reports: 0 }
				}
			},
			{
				id: 'q1', public_id: 'RS-00001', text: 'Olifant', min_age: 4, active: true,
				plays: 12, guessed: 11, not_guessed: 1, swapped: 0, reports: 0, te_moeilijk: 0, leeftijd: 0, niet_leuk: 0,
				prima: 1, dismissed: 0, last_report: null,
				by_age: { '4-6': { plays: 12, guessed: 11, not_guessed: 1, swapped: 0, reports: 0 } }
			}
		],
		categories: [
			{ id: 'c1', game_id: GAME, name: 'Dieren', is_18plus: false, active: true },
			{ id: 'c2', game_id: GAME, name: 'Eten en drinken', is_18plus: false, active: true },
			{ id: 'c3', game_id: GAME, name: 'Pikant 18+', is_18plus: true, active: true }
		],
		taskTypes: [
			{ id: 't1', game_id: GAME, code: 'uitbeelden', name: 'Uitbeelden', active: true, sort_order: 1 },
			{ id: 't2', game_id: GAME, code: 'vragen', name: 'Vragen beantwoorden', active: true, sort_order: 2 },
			{ id: 't3', game_id: GAME, code: 'tekenen', name: 'Tekenen', active: true, sort_order: 4 }
		],
		questions: [
			q(1, 'Olifant', ['c1'], ['t1', 't3'], 4),
			q(2, 'Pindarotsje', ['c2'], ['t1', 't3'], 6),
			q(3, 'Kangoeroe', ['c1'], ['t1'], 5),
			q(4, 'Stiekem zoenen', ['c3'], ['t1'], 18),
			q(5, 'Hoeveel poten heeft een spin? (8)', ['c1'], ['t2'], 6, false)
		]
	};
}

async function mockSupabase(page: Page, db: Db) {
	const user = () => ({
		id: 'u1',
		email: 'engel@example.com',
		app_metadata: db.admin ? { role: 'admin' } : {},
		user_metadata: {},
		aud: 'authenticated',
		factors: db.factors
	});
	const session = (aal: 'aal1' | 'aal2') => ({
		access_token: jwt(aal, db.admin),
		token_type: 'bearer',
		expires_in: 3600,
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		refresh_token: 'r',
		user: user()
	});

	await page.route(`${SB}/**`, async (route: Route) => {
		const req = route.request();
		const url = new URL(req.url());
		const p = url.pathname;
		const method = req.method();
		const body = req.postData() ? JSON.parse(req.postData()!) : null;
		db.calls.push({ method, path: p + url.search, body });
		const json = (data: unknown, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

		// --- auth
		if (p === '/auth/v1/token') {
			if (body?.password !== 'goed-wachtwoord')
				return json({ error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
			return json(session('aal1'));
		}
		if (p === '/auth/v1/user') return json(user());
		if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
		if (p === '/auth/v1/factors' && method === 'POST') {
			db.factors.push({ id: 'f1', factor_type: 'totp', status: 'unverified', friendly_name: body.friendly_name });
			return json({
				id: 'f1',
				type: 'totp',
				totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', secret: 'GEHEIM123', uri: 'otpauth://x' }
			});
		}
		if (/\/auth\/v1\/factors\/f1\/challenge$/.test(p)) return json({ id: 'ch1', type: 'totp', expires_at: 9e9 });
		if (/\/auth\/v1\/factors\/f1\/verify$/.test(p)) {
			if (body?.code !== '123456') return json({ code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' }, 422);
			db.factors = db.factors.map((f) => ({ ...f, status: 'verified' }));
			return json(session('aal2'));
		}
		if (/\/auth\/v1\/factors\/[^/]+$/.test(p) && method === 'DELETE') return json({ id: 'x' });

		// --- database (PostgREST)
		const eq = (name: string) => url.searchParams.get(name)?.replace(/^eq\./, '');
		if (p === '/rest/v1/games' && method === 'PATCH') return json({ id: GAME, ...body });
		if (p === '/rest/v1/games')
			return json([
				{ id: GAME, slug: 'raadspel', name: 'Raadspel', description: '', rules: '## Regels', id_prefix: 'RS', minutes_per_question: 1, active: true, sort_order: 10 }
			]);
		if (p === '/rest/v1/categories') {
			if (method === 'POST') {
				const row = { id: `c${db.categories.length + 1}`, active: true, is_18plus: false, ...body };
				db.categories.push(row);
				return json([row], 201);
			}
			return json(db.categories.filter((c) => !eq('game_id') || c.game_id === eq('game_id')));
		}
		if (p === '/rest/v1/task_types') return json(db.taskTypes);
		if (p === '/rest/v1/questions') {
			if (method === 'PATCH') {
				const ids = (url.searchParams.get('id') ?? '').replace(/^in\.\(|^eq\.|\)$/g, '').split(',').map((s) => s.replace(/"/g, ''));
				db.stats = db.stats.map((q) => (ids.includes(q.id as string) ? { ...q, ...body } : q));
				db.questions = db.questions.map((q) => (ids.includes(q.id) ? { ...q, ...body } : q));
				return route.fulfill({ status: 204 });
			}
			const offset = Number(url.searchParams.get('offset') ?? 0);
			return json(db.questions.slice(offset, offset + 1000));
		}
		if (p === '/rest/v1/rpc/admin_save_question') {
			const adult = db.categories.some((c) => c.is_18plus && body.p_category_ids.includes(c.id));
			const min_age = adult ? Math.max(18, body.p_min_age) : body.p_min_age;
			const existing = db.questions.find((q) => q.id === body.p_id);
			const row = {
				id: existing?.id ?? `q${db.questions.length + 1}`,
				public_id: existing?.public_id ?? `RS-${String(db.questions.length + 1).padStart(5, '0')}`,
				text: body.p_text,
				min_age,
				active: body.p_active,
				created_at: existing?.created_at ?? new Date().toISOString(),
				updated_at: new Date().toISOString(),
				question_categories: body.p_category_ids.map((category_id: string) => ({ category_id })),
				question_task_types: body.p_task_type_ids.map((task_type_id: string) => ({ task_type_id }))
			};
			db.questions = existing ? db.questions.map((q) => (q.id === row.id ? row : q)) : [row, ...db.questions];
			return json({ id: row.id, public_id: row.public_id, min_age, text: row.text });
		}
		if (p === '/rest/v1/rpc/admin_import_questions') {
			const rows = body.p_rows as { id: string | null }[];
			return json({
				upload_id: 'u1',
				created: rows.filter((r) => !r.id).length,
				updated: rows.filter((r) => r.id).length,
				failed: 0,
				errors: []
			});
		}
		if (p === '/rest/v1/rpc/admin_question_stats') return json(db.stats);
		if (p === '/rest/v1/rpc/admin_stats')
			return json({
				summary: { games: 5, completed: 3, stopped: 1, quit: 1, unfinished: 0, avg_minutes: 14.5, avg_turns: 9, avg_players: 3.2, skip_games: 2, repeats_offered: 1, played_repeats: 1 },
				visitors: { visitors: 7, new: 4, returning: 3, devices_playing: 3 },
				questions: { shown: 22, guessed: 13, not_guessed: 6, swapped: 3 },
				series: [
					{ unit: 'day', period: '2026-11-14', games: 2, completed: 1, visitors: 3, new_visitors: 3 },
					{ unit: 'day', period: '2026-11-15', games: 3, completed: 2, visitors: 5, new_visitors: 1 },
					{ unit: 'week', period: '2026-11-09', games: 5, completed: 3, visitors: 7, new_visitors: 4 },
					{ unit: 'month', period: '2026-11-01', games: 5, completed: 3, visitors: 7, new_visitors: 4 }
				],
				heatmap: [{ dow: 7, hour: 15, games: 3 }, { dow: 6, hour: 10, games: 2 }],
				ages: [{ group: '7-9', games: 3 }, { group: '18+', games: 2 }],
				players: [{ players: 3, games: 4 }, { players: 4, games: 1 }],
				task_types: [{ code: 'uitbeelden', name: 'Uitbeelden', games_on: 5 }, { code: 'tekenen', name: 'Tekenen', games_on: 3 }],
				categories: [{ id: 'c1', name: 'Dieren', is_18plus: false, games_on: 5, games_allowed: 5 }]
			});
		if (p === '/rest/v1/question_feedback' && method === 'PATCH') {
			const id = (url.searchParams.get('question_id') ?? '').replace(/^eq\./, '');
			db.stats = db.stats.map((q) => (q.id === id ? { ...q, dismissed: q.reports, reports: 0, te_moeilijk: 0, leeftijd: 0, niet_leuk: 0 } : q));
			return route.fulfill({ status: 204 });
		}
		if (p === '/rest/v1/contact_messages') {
			const ids = (url.searchParams.get('id') ?? '').replace(/^in\.\(|^eq\.|\)$/g, '').split(',').map((s) => s.replace(/"/g, ''));
			if (method === 'PATCH') {
				db.messages = db.messages.map((m) => (ids.includes(m.id) ? { ...m, ...body } : m));
				return route.fulfill({ status: 204 });
			}
			if (method === 'DELETE') {
				db.messages = db.messages.filter((m) => !ids.includes(m.id));
				return route.fulfill({ status: 204 });
			}
			return json(db.messages);
		}
		return json({ message: `niet nagebootst: ${method} ${p}` }, 404);
	});
}

async function loginAsAdmin(page: Page, db: Db) {
	await mockSupabase(page, db);
	await page.goto('/beheer/login');
	await page.getByLabel('E-mailadres').fill('engel@example.com');
	await page.getByLabel('Wachtwoord').fill('goed-wachtwoord');
	await page.getByRole('button', { name: 'Inloggen' }).click();
	await expect(page.getByRole('heading', { name: 'Tweestapsverificatie' })).toBeVisible();
	await page.getByLabel('Code').fill('123456');
	await page.getByRole('button', { name: 'Bevestigen' }).click();
	await expect(page.getByRole('heading', { name: 'Vragen' })).toBeVisible();
}

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

test('zonder inloggen kom je niet in het beheer', async ({ page }) => {
	const db = freshDb();
	await mockSupabase(page, db);
	await page.goto('/beheer/vragen');
	await expect(page).toHaveURL(/\/beheer\/login$/);
});

test('fout wachtwoord geeft een nette melding', async ({ page }) => {
	const db = freshDb();
	await mockSupabase(page, db);
	await page.goto('/beheer/login');
	await page.getByLabel('E-mailadres').fill('engel@example.com');
	await page.getByLabel('Wachtwoord').fill('fout');
	await page.getByRole('button', { name: 'Inloggen' }).click();
	await expect(page.getByRole('alert')).toHaveText('E-mailadres of wachtwoord klopt niet.');
});

test('eerste keer inloggen: 2FA instellen met QR-code, foute code wordt geweigerd', async ({ page }) => {
	const db = freshDb();
	await mockSupabase(page, db);
	await page.goto('/beheer/login');
	await page.getByLabel('E-mailadres').fill('engel@example.com');
	await page.getByLabel('Wachtwoord').fill('goed-wachtwoord');
	await page.getByRole('button', { name: 'Inloggen' }).click();
	await expect(page.getByAltText('QR-code voor je authenticator-app')).toBeVisible();
	await page.getByText('Lukt scannen niet?').click();
	await expect(page.getByText('GEHEIM123')).toBeVisible();
	await page.getByLabel('Code').fill('000000');
	await page.getByRole('button', { name: 'Bevestigen' }).click();
	await expect(page.getByRole('alert')).toContainText('De code klopt niet');
	await page.getByLabel('Code').fill('123456');
	await page.getByRole('button', { name: 'Bevestigen' }).click();
	await expect(page.getByTestId('telling')).toHaveText('5 van 5 vragen');
});

test('account zonder admin-rol krijgt geen toegang', async ({ page }) => {
	const db = freshDb();
	db.admin = false;
	await mockSupabase(page, db);
	await page.goto('/beheer/login');
	await page.getByLabel('E-mailadres').fill('iemand@example.com');
	await page.getByLabel('Wachtwoord').fill('goed-wachtwoord');
	await page.getByRole('button', { name: 'Inloggen' }).click();
	await page.getByLabel('Code').fill('123456');
	await page.getByRole('button', { name: 'Bevestigen' }).click();
	await expect(page.getByRole('heading', { name: 'Geen toegang' })).toBeVisible();
});

test('zoeken, filteren, sorteren en bewerken op rijniveau', async ({ page }) => {
	const db = freshDb();
	await loginAsAdmin(page, db);
	const count = page.getByTestId('telling');

	// Zoeken over alle kolommen: categorie + soort
	await page.getByLabel('Zoeken in alle kolommen').fill('dieren tekenen');
	await expect(count).toHaveText('1 van 5 vragen');
	await expect(page.getByRole('cell', { name: 'Olifant' })).toBeVisible();
	await page.getByLabel('Zoeken in alle kolommen').fill('');

	// Filters per kolom
	await page.getByText('Filters per kolom').click();
	await page.getByLabel('Categorie', { exact: true }).selectOption({ label: 'Dieren' });
	await expect(count).toHaveText('3 van 5 vragen');
	await page.getByLabel('Status').selectOption('inactief');
	await expect(count).toHaveText('1 van 5 vragen');
	await page.getByRole('button', { name: 'Filters wissen' }).click();
	await page.getByLabel('Leeftijd van').fill('18');
	await expect(count).toHaveText('1 van 5 vragen');
	await expect(page.getByRole('cell', { name: /Pikant 18\+/ })).toBeVisible();
	await page.getByRole('button', { name: 'Filters wissen' }).click();

	// Sorteren op vraag (A-Z)
	await page.getByRole('button', { name: /^Vraag/ }).click();
	await expect(page.locator('tbody tr').first()).toContainText('Hoeveel poten');

	// Bewerken op rijniveau (dubbelklik op een cel)
	await page.getByRole('cell', { name: 'Kangoeroe' }).dblclick();
	await page.getByLabel('Vraag', { exact: true }).fill('Kangoeroe met buidel');
	await page.getByLabel('Minimum leeftijd').fill('7');
	await page.getByRole('checkbox', { name: 'Tekenen' }).check();
	await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
	await expect(page.getByText('Vraag RS-00003 opgeslagen.')).toBeVisible();
	await expect(page.getByRole('cell', { name: 'Kangoeroe met buidel' })).toBeVisible();
	const call = db.calls.find((c) => c.path.includes('admin_save_question'))!;
	expect(call.body).toMatchObject({ p_id: 'q3', p_text: 'Kangoeroe met buidel', p_min_age: 7, p_task_type_ids: ['t1', 't3'] });
});

test('vragen (de)activeren per rij en in bulk', async ({ page }) => {
	const db = freshDb();
	await loginAsAdmin(page, db);
	await page.getByLabel('Actief RS-00005').check();
	await expect.poll(() => db.questions.find((q) => q.id === 'q5')?.active).toBe(true);

	await page.getByLabel('Selecteer RS-00001').check();
	await page.getByLabel('Selecteer RS-00002').check();
	await page.getByRole('button', { name: 'De-activeren' }).click();
	await expect(page.getByText('2 vragen gedeactiveerd.')).toBeVisible();
	expect(db.questions.filter((q) => !q.active).map((q) => q.id).sort()).toEqual(['q1', 'q2']);
});

test('handmatig een vraag toevoegen, ook met een nieuwe categorie', async ({ page }) => {
	const db = freshDb();
	await loginAsAdmin(page, db);
	await page.getByRole('button', { name: '+ Nieuwe vraag' }).click();
	await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveText('Vul een vraag in.');

	await page.getByLabel('Vraag', { exact: true }).fill('Regenboog');
	await page.getByLabel('Nieuwe categorie').fill('Natuur en weer');
	await page.getByRole('button', { name: 'Toevoegen' }).click();
	await expect(page.getByRole('checkbox', { name: 'Natuur en weer' })).toBeChecked();
	await page.getByRole('checkbox', { name: 'Tekenen' }).check();
	await page.getByRole('button', { name: 'Opslaan en nog een' }).click();
	await expect(page.getByText(/Vraag RS-\d+ toegevoegd/)).toBeVisible();
	await expect(page.getByTestId('telling')).toHaveText('6 van 6 vragen');
	// formulier blijft open met dezelfde keuzes voor de volgende vraag
	await expect(page.getByLabel('Vraag', { exact: true })).toHaveValue('');
	await expect(page.getByRole('checkbox', { name: 'Natuur en weer' })).toBeChecked();
});

test('upload: voorbeeld met nieuw, bijwerken en fouten, daarna importeren', async ({ page }) => {
	const db = freshDb();
	await loginAsAdmin(page, db);
	await page.getByRole('link', { name: 'Upload' }).click();

	const file = path.join(os.tmpdir(), 'vragen-test.csv');
	fs.writeFileSync(
		file,
		[
			'"ID","vraag","categorieën","soort opdracht","minimum leeftijd"',
			'"","Draak","Dieren;Fantasie","uitbeelden;tekenen","5"',
			'"RS-00001","Olifant met slurf","Dieren","uitbeelden","4"',
			'"","Zingen","Dieren","zingen","4"',
			'"","Pindarotsje","Eten en drinken","tekenen","6"',
			'"","Leeftijd fout","Dieren","tekenen","zes"',
			'"RS-99999","Bestaat niet","Dieren","tekenen","4"',
			'"","","","",""'
		].join('\n')
	);
	await page.locator('input[type=file]').setInputFiles(file);
	await expect(page.getByText('1 nieuw')).toBeVisible();
	await expect(page.getByText('1 bijwerken')).toBeVisible();
	await expect(page.getByText('4 fout')).toBeVisible();
	await expect(page.getByText('Onbekende soort opdracht: zingen')).toBeVisible();
	await expect(page.getByText('Deze vraag bestaat al')).toBeVisible();
	await expect(page.getByText(/Minimum leeftijd moet een getal/)).toBeVisible();
	await expect(page.getByText(/ID RS-99999 bestaat niet/)).toBeVisible();
	await expect(page.getByText('Nieuwe categorieën aanmaken: Fantasie')).toBeVisible();

	await page.getByRole('button', { name: '2 vragen importeren' }).click();
	await expect(page.getByText(/Klaar\. 1 nieuw, 1 bijgewerkt/)).toBeVisible();
	const call = db.calls.find((c) => c.path.includes('admin_import_questions'))!;
	expect(call.body).toMatchObject({
		p_game: GAME,
		p_create_categories: true,
		p_rows: [
			{ row: 2, id: null, text: 'Draak', categories: ['Dieren', 'Fantasie'], task_types: ['uitbeelden', 'tekenen'], min_age: '5' },
			{ row: 3, id: 'RS-00001', text: 'Olifant met slurf' }
		]
	});
});

test('upload van een Excel-bestand (.xlsx) wordt gelezen', async ({ page }) => {
	const db = freshDb();
	await loginAsAdmin(page, db);
	await page.getByRole('link', { name: 'Upload' }).click();
	const writeExcelFile = (await import('write-excel-file/node')).default;
	const file = path.join(os.tmpdir(), 'vragen-test.xlsx');
	await writeExcelFile([
		['ID', 'vraag', 'categorieën', 'soort opdracht', 'minimum leeftijd'],
		[null, 'Giraf', 'Dieren', 'tekenen;uitbeelden', 4],
		[null, 'Pannenkoek', 'Eten en drinken', 'Uitbeelden', 5]
	] as never).toFile(file);
	await page.locator('input[type=file]').setInputFiles(file);
	await expect(page.getByText('2 nieuw')).toBeVisible();
	await expect(page.getByText('0 fout')).toBeVisible();
});

test('export naar CSV in hetzelfde formaat als de upload', async ({ page }) => {
	const db = freshDb();
	await loginAsAdmin(page, db);
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
	expect(download.suggestedFilename()).toMatch(/^raadspel-vragen-\d{4}-\d{2}-\d{2}\.csv$/);
	const text = fs.readFileSync(await download.path(), 'utf8');
	expect(text).toContain('"ID","vraag","categorieën","soort opdracht","minimum leeftijd","actief"');
	expect(text).toContain('"RS-00001","Olifant","Dieren","uitbeelden;tekenen","4","ja"');
});

test('spelregels en minuten per vraag aanpassen', async ({ page }) => {
	const db = freshDb();
	await loginAsAdmin(page, db);
	await page.getByRole('link', { name: 'Spellen en spelregels' }).click();
	await expect(page.getByRole('heading', { name: 'Spellen en spelregels' })).toBeVisible();
	await page.getByRole('button', { name: 'Bewerken' }).click();
	await page.getByLabel('Minuten per vraag').fill('1.5');
	await page.getByLabel('Uitleg van de spelregels').fill('## Nieuwe regels\n\n- Niet praten\n\n<script>alert(1)</script>');
	await page.getByRole('button', { name: 'Voorbeeld' }).click();
	await expect(page.getByRole('heading', { name: 'Nieuwe regels' })).toBeVisible();
	await expect(page.getByText('<script>alert(1)</script>')).toBeVisible(); // als tekst getoond, niet uitgevoerd
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page.getByText('Raadspel opgeslagen.')).toBeVisible();
	const call = db.calls.find((c) => c.method === 'PATCH' && c.path.startsWith('/rest/v1/games'))!;
	expect(call.body).toMatchObject({ minutes_per_question: 1.5 });
});

test('feedback: meest gemelde vraag bovenaan, leeftijd aanpassen, uitzetten en negeren', async ({ page }) => {
	const db = freshDb();
	await loginAsAdmin(page, db);
	await page.getByRole('link', { name: 'Feedback' }).click();
	await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
	const rows = page.locator('tbody > tr');
	// Alleen gemelde vragen staan standaard aan: Olifant (0 meldingen) staat er niet bij.
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText('Pindarotsje');
	await expect(rows.first()).toContainText('Vaak te moeilijk bij 7-9 jaar');
	await expect(rows.first()).toContainText('40%');

	await page.getByLabel('Minimumleeftijd RS-00002').fill('10');
	await page.getByRole('button', { name: 'Leeftijd opslaan' }).click();
	await expect(page.getByText('Minimumleeftijd van RS-00002 is nu 10.')).toBeVisible();
	expect(db.calls.find((c) => c.method === 'PATCH' && c.path.startsWith('/rest/v1/questions'))?.body).toEqual({ min_age: 10 });

	await page.getByRole('button', { name: 'Uitzetten' }).click();
	await expect(page.getByText('RS-00002 is uitgezet.')).toBeVisible();

	await page.getByRole('button', { name: 'Negeren' }).click();
	await expect(page.getByText('Meldingen over RS-00002 worden genegeerd.')).toBeVisible();
	await expect(rows).toHaveCount(0);
	await page.getByLabel('Alleen gemelde vragen').uncheck();
	await expect(rows).toHaveCount(2);

	const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel' }).click()]);
	expect(download.suggestedFilename()).toMatch(/^feedback-raadspel-.*\.xlsx$/);
});

test('statistieken: kerncijfers, grafieken en Excel', async ({ page }) => {
	const db = freshDb();
	await loginAsAdmin(page, db);
	await page.getByRole('link', { name: 'Statistieken' }).click();
	await expect(page.getByTestId('stat-bezoekers')).toHaveText('7');
	await expect(page.getByTestId('stat-spellen')).toHaveText('5');
	await expect(page.getByText('4 nieuw · 3 terug')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Wanneer wordt er gespeeld?' })).toBeVisible();
	await page.getByRole('button', { name: 'Per week' }).click();
	await expect(page.getByRole('listitem', { name: /5 spellen, 3 afgemaakt/ })).toHaveCount(1);
	await expect(page.getByRole('heading', { name: 'Minst vaak geraden' })).toBeVisible();
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel' }).click()]);
	expect(download.suggestedFilename()).toMatch(/^statistieken-raadspel-.*\.xlsx$/);
	const call = db.calls.find((c) => c.path === '/rest/v1/rpc/admin_stats');
	expect(call?.body).toMatchObject({ p_game: GAME });
});

test('berichten: lezen, markeren als gelezen en verwijderen', async ({ page }) => {
	const db = freshDb();
	await loginAsAdmin(page, db);
	await page.getByRole('link', { name: 'Berichten' }).click();
	await expect(page.getByRole('heading', { name: 'Berichten' })).toBeVisible();
	await expect(page.getByTestId('telling')).toHaveText('2 van 2 berichten · 1 ongelezen');
	const kim = page.locator('li', { hasText: 'Kim' });
	await expect(kim).toContainText('Kunnen er meer dieren bij?');
	await expect(kim).toContainText('nieuw');
	await expect(kim.getByRole('link', { name: 'Beantwoorden' })).toHaveAttribute('href', /^mailto:kim%40voorbeeld\.nl\?subject=/);
	await expect(page.locator('li', { hasText: 'Piet' })).toContainText('niet gemaild');

	await page.getByLabel('Alleen ongelezen').check();
	await expect(page.getByTestId('telling')).toHaveText('1 van 2 berichten · 1 ongelezen');
	await kim.getByRole('button', { name: 'Markeer als gelezen' }).click();
	await expect(page.getByText('Bericht van Kim is gelezen.')).toBeVisible();
	expect(db.messages.find((m) => m.id === 'm2')?.is_read).toBe(true);
	await page.getByLabel('Alleen ongelezen').uncheck();

	const piet = page.locator('li', { hasText: 'Piet' });
	await piet.getByRole('button', { name: 'Verwijderen' }).click();
	await piet.getByRole('button', { name: 'Ja, verwijderen' }).click();
	await expect(page.getByText('Bericht van Piet is verwijderd.')).toBeVisible();
	await expect(page.getByTestId('telling')).toHaveText('1 van 1 berichten · 0 ongelezen');
	expect(db.messages.map((m) => m.id)).toEqual(['m2']);
});
