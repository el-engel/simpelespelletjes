import { expect, test, type Page } from '@playwright/test';

// Feedbackknoppen, anonieme statistieken en de timer.

async function setup(page: Page, opts: { skip?: boolean; perPlayer?: string; timer?: boolean } = {}) {
	await page.getByRole('button', { name: 'Gelezen' }).click();
	await page.getByLabel('Hoeveel spelers?').fill('2');
	await page.getByLabel('Hoeveel vragen per speler?').fill(opts.perPlayer ?? '1');
	await page.getByLabel('Leeftijd jongste speler?').fill('8');
	await page.getByLabel('Speler 1').fill('Kim');
	await page.getByLabel('Speler 2').fill('Papa');
	if (opts.skip) await page.getByRole('checkbox', { name: 'Mag vragen overslaan' }).first().check();
	if (opts.timer === false) await page.getByRole('button', { name: /Spelinstellingen/ }).click();
	if (opts.timer === false) await page.getByRole('checkbox', { name: 'Timer gebruiken' }).uncheck();
	await page.getByRole('button', { name: 'Start spel' }).click();
}

function captureLogs(page: Page) {
	const batches: Record<string, unknown>[] = [];
	const visits: Record<string, unknown>[] = [];
	page.on('request', (r) => {
		if (r.method() !== 'POST') return;
		if (r.url().endsWith('/api/spel/log')) batches.push(JSON.parse(r.postData() ?? '{}'));
		if (r.url().endsWith('/api/bezoek')) visits.push(JSON.parse(r.postData() ?? '{}'));
	});
	return { batches, visits };
}

test('feedback na andere vraag en na niet geraden, en alles wordt anoniem gelogd', async ({ page }) => {
	const log = captureLogs(page);
	await page.goto('/');
	await expect.poll(() => log.visits.length).toBe(1);
	const device = log.visits[0].device as string;
	expect(device).toMatch(/^[0-9a-f-]{36}$/);

	await page.getByRole('link', { name: /Raadspel/ }).click();
	await setup(page, { skip: true, timer: false });

	// Geval 1: Kim kiest een andere vraag
	await page.getByRole('button', { name: 'Laat soort opdracht zien' }).click();
	await page.getByRole('button', { name: 'Laat vraag zien' }).click();
	const eerste = (await page.getByTestId('vraag').textContent()) ?? '';
	await page.getByRole('button', { name: 'Overslaan, andere vraag' }).click();
	const bar = page.getByTestId('feedback');
	await expect(bar).toContainText(`Overgeslagen: ${eerste}`);
	await bar.getByRole('button', { name: 'Te moeilijk' }).click();
	await expect(bar).toContainText('Bedankt!');
	await expect(bar).toHaveCount(0);

	// Het spel gaat gewoon door
	await page.getByRole('button', { name: 'Laat vraag zien' }).click();
	const tweede = (await page.getByTestId('vraag').textContent()) ?? '';
	await page.getByRole('button', { name: 'Klaar!' }).click();
	await page.getByRole('button', { name: 'Niemand heeft het geraden' }).click();

	// Geval 2: niet geraden
	await expect(bar).toContainText(`Het was: ${tweede}`);
	await bar.getByRole('button', { name: 'Niet leuk genoeg' }).click();
	await expect(bar).toHaveCount(0);

	// Papa: geraden, geen balk
	await page.getByRole('button', { name: 'Laat soort opdracht zien' }).click();
	await page.getByRole('button', { name: 'Laat vraag zien' }).click();
	await page.getByRole('button', { name: 'Klaar!' }).click();
	await page.getByRole('button', { name: 'Kim', exact: true }).click();
	await expect(page.getByTestId('winnaar')).toHaveText('Kim!');
	await expect(bar).toHaveCount(0);

	// Aan het eind wordt alles in één keer verstuurd, zonder namen
	await expect.poll(() => log.batches.length).toBeGreaterThan(0);
	const all = JSON.stringify(log.batches);
	expect(all).not.toContain('Kim');
	expect(all).not.toContain('Papa');
	const events = log.batches.flatMap((b) => b.events as { kind: string }[]);
	expect(events.map((e) => e.kind)).toEqual(['swapped', 'not_guessed', 'guessed']);
	const feedback = log.batches.flatMap((b) => b.feedback as { reason: string; moment: string; age: number }[]);
	expect(feedback.map((f) => [f.reason, f.moment, f.age])).toEqual([
		['te_moeilijk', 'andere_vraag', 8],
		['niet_leuk', 'niet_geraden', 8]
	]);
	const last = log.batches.at(-1)!;
	const session = (last.sessions as Record<string, unknown>[])[0];
	expect(session).toMatchObject({ end_reason: 'done', players: 2, age: 8, skip_players: 1, turns: 2 });
	expect(last.device).toBe(device);

	// Op dezelfde dag geen tweede bezoekmelding
	await page.goto('/');
	await page.waitForTimeout(300);
	expect(log.visits.length).toBe(1);
});

test('feedbackbalk verdwijnt vanzelf als je niets kiest', async ({ page }) => {
	await page.clock.install();
	await page.goto('/spel/raadspel');
	await setup(page, { skip: true, timer: false });
	await page.getByRole('button', { name: 'Laat soort opdracht zien' }).click();
	await page.getByRole('button', { name: 'Laat vraag zien' }).click();
	await page.getByRole('button', { name: 'Overslaan, andere vraag' }).click();
	await expect(page.getByTestId('feedback')).toBeVisible();
	await page.clock.runFor(11_000);
	await expect(page.getByTestId('feedback')).toHaveCount(0);
});

test('tussentijds stoppen wordt gelogd als gestopt', async ({ page }) => {
	const log = captureLogs(page);
	await page.goto('/spel/raadspel');
	await setup(page, { perPlayer: '3', timer: false });
	await page.getByRole('button', { name: 'Laat soort opdracht zien' }).click();
	await page.getByRole('button', { name: 'Laat vraag zien' }).click();
	await page.getByRole('button', { name: 'Klaar!' }).click();
	await page.getByRole('button', { name: 'Papa', exact: true }).click();
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('button', { name: 'Stoppen en naar het hoofdmenu' }).click();
	await page.getByRole('button', { name: 'Ja, stoppen' }).click();
	await expect.poll(() => log.batches.length).toBeGreaterThan(0);
	const sessions = log.batches.flatMap((b) => b.sessions as { end_reason: string; turns: number }[]);
	expect(sessions.at(-1)).toMatchObject({ end_reason: 'quit', turns: 1 });
});

test('timer: telt af, geeft een seintje en is via het menu uit te zetten', async ({ page }) => {
	await page.clock.install();
	await page.goto('/spel/raadspel');
	await page.getByRole('button', { name: 'Gelezen' }).click();
	await expect(page.getByRole('button', { name: /Spelinstellingen/ })).toContainText('timer 60 sec');
	await page.getByRole('button', { name: /Spelinstellingen/ }).click();
	await expect(page.getByRole('checkbox', { name: 'Timer gebruiken' })).toBeChecked();
	await expect(page.getByLabel('Hoeveel seconden per beurt?')).toHaveValue('60');
	await page.getByLabel('Hoeveel seconden per beurt?').fill('10');
	await page.getByLabel('Hoeveel spelers?').fill('2');
	await page.getByLabel('Leeftijd jongste speler?').fill('8');
	await page.getByLabel('Speler 1').fill('Kim');
	await page.getByLabel('Speler 2').fill('Papa');
	await page.getByRole('button', { name: 'Start spel' }).click();

	await page.getByRole('button', { name: 'Laat soort opdracht zien' }).click();
	await page.getByRole('button', { name: 'Laat vraag zien' }).click();
	await expect(page.getByTestId('timer')).toContainText('10');
	await page.clock.runFor(4_000);
	await expect(page.getByTestId('timer')).toContainText('6');
	await page.clock.runFor(7_000);
	await expect(page.getByText('De tijd is om!')).toBeVisible();

	// Via het menu uit
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('group', { name: 'Timer' }).getByRole('checkbox', { name: 'Timer aan' }).uncheck();
	await expect(page.getByTestId('timer')).toHaveCount(0);

	// Keuze wordt onthouden voor een volgend spel
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('simplegames:timer') ?? '{}'));
	expect(saved).toMatchObject({ on: false, seconds: 10 });
});
