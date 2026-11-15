import { expect, test } from '@playwright/test';

test('hele spel: uitleg, invoer, beurten, score en winnaar', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: /Raadspel/ }).click();

	// Demomodus slaat de botcheck over; daarna de uitleg.
	await expect(page.getByRole('heading', { name: 'Zo speel je het raadspel' })).toBeVisible();
	await page.getByRole('button', { name: 'Gelezen' }).click();

	// Invoerscherm
	await page.getByLabel('Hoeveel spelers?').fill('3');
	await page.getByLabel('Hoeveel vragen per speler?').fill('2');
	await expect(page.getByTestId('duur')).toHaveText('Spel duurt ongeveer 6 minuten');
	await page.getByLabel('Leeftijd jongste speler?').fill('8');
	await page.getByLabel('Speler 1').fill('Lisa');
	await page.getByLabel('Speler 2').fill('Ben');
	// Soort opdrachten, categorieën en timer staan achter de knop Spelinstellingen
	await expect(page.getByRole('checkbox', { name: /^18\+/ })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /Spelinstellingen/ })).toContainText('alle opdrachten');
	await page.getByRole('button', { name: /Spelinstellingen/ }).click();
	// 18+ staat uit en is niet aan te klikken onder 18
	await expect(page.getByRole('checkbox', { name: /^18\+/ })).toBeDisabled();
	await expect(page.getByRole('checkbox', { name: /^18\+/ })).not.toBeChecked();

	// Een leeg naamveld (speler 3) telt niet mee.

	await page.getByRole('button', { name: 'Start spel' }).click();

	// Beurt 1: Lisa
	await expect(page.getByTestId('aan-de-beurt')).toHaveText('Lisa');
	await page.getByRole('button', { name: 'Laat soort opdracht zien' }).click();
	await expect(page.getByTestId('soort')).toHaveText(/Uitbeelden|Tekenen|Beschrijven|Raden \(ja of nee\)/);
	await page.getByRole('button', { name: 'Laat vraag zien' }).click();
	await expect(page.getByTestId('vraag')).not.toBeEmpty();
	await page.getByRole('button', { name: 'Klaar!' }).click();
	await page.getByRole('button', { name: 'Ben', exact: true }).click();
	await expect(page.getByText('Ben heeft het geraden: +1 punt!')).toBeVisible();

	// Tijdens het spel een speler toevoegen
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByLabel('Speler toevoegen').fill('Mo');
	await page.getByRole('button', { name: 'Toevoegen' }).click();
	await page.getByRole('button', { name: 'Sluit menu' }).click();

	// Resterende beurten: Ben, Mo, Lisa, Ben, Mo (Mo raadt steeds niet: "niemand")
	const expected = ['Ben', 'Mo', 'Lisa', 'Ben', 'Mo'];
	for (const name of expected) {
		await expect(page.getByTestId('aan-de-beurt')).toHaveText(name);
		await page.getByRole('button', { name: 'Laat soort opdracht zien' }).click();
		await page.getByRole('button', { name: 'Laat vraag zien' }).click();
		await page.getByRole('button', { name: 'Klaar!' }).click();
		if (name === 'Ben') await page.getByRole('button', { name: 'Lisa', exact: true }).click();
		else await page.getByRole('button', { name: 'Niemand heeft het geraden' }).click();
	}

	// Ben 1 punt, Lisa 2 punten: Lisa wint
	await expect(page.getByTestId('winnaar')).toHaveText('Lisa!');
	await expect(page.getByText('met 2 punten')).toBeVisible();
});

test('ververs halverwege: het spel gaat verder', async ({ page }) => {
	await page.goto('/spel/raadspel');
	await page.getByRole('button', { name: 'Gelezen' }).click();
	await page.getByLabel('Hoeveel spelers?').fill('2');
	await page.getByLabel('Leeftijd jongste speler?').fill('30');
	await page.getByLabel('Speler 1').fill('A');
	await page.getByLabel('Speler 2').fill('B');
	await page.getByRole('button', { name: /Spelinstellingen/ }).click();
	await expect(page.getByRole('checkbox', { name: /^18\+/ })).toBeEnabled();
	await page.getByRole('button', { name: 'Start spel' }).click();
	await page.getByRole('button', { name: 'Laat soort opdracht zien' }).click();
	await page.getByRole('button', { name: 'Laat vraag zien' }).click();
	const vraag = await page.getByTestId('vraag').textContent();
	await page.reload();
	await expect(page.getByTestId('vraag')).toHaveText(vraag ?? '');
});

test('validatie: minstens twee spelers en een leeftijd', async ({ page }) => {
	await page.goto('/spel/raadspel');
	await page.getByRole('button', { name: 'Gelezen' }).click();
	await page.getByLabel('Hoeveel spelers?').fill('1');
	await page.getByRole('button', { name: 'Start spel' }).click();
	await expect(page.getByRole('alert')).toHaveText('Vul minstens twee spelers in.');
	await page.getByLabel('Hoeveel spelers?').fill('2');
	await page.getByLabel('Speler 1').fill('A');
	await page.getByLabel('Speler 2').fill('B');
	await page.getByRole('button', { name: 'Start spel' }).click();
	await expect(page.getByRole('alert')).toHaveText('Vul de leeftijd van de jongste speler in.');
});

test('API weigert vragen zonder geldig spel-token', async ({ request }) => {
	const res = await request.post('/api/spel/vragen', {
		data: { token: 'nep.token', age: 30, taskCodes: ['uitbeelden'], categoryIds: ['c4'], count: 5, exclude: [] }
	});
	expect(res.status()).toBe(401);
});

test('API geeft onder 18 nooit 18+-vragen, ook niet als je erom vraagt', async ({ request }) => {
	const start = await (await request.post('/api/spel/start', { data: { slug: 'raadspel', captcha: '' } })).json();
	const res = await request.post('/api/spel/vragen', {
		data: {
			token: start.token,
			age: 12,
			taskCodes: ['uitbeelden', 'beschrijven', 'tekenen', 'vragen'],
			categoryIds: ['c1', 'c2', 'c3', 'c4'],
			count: 100,
			exclude: []
		}
	});
	const { questions } = await res.json();
	expect(questions.length).toBeGreaterThan(0);
	expect(questions.some((q: { adult: boolean; minAge: number }) => q.adult || q.minAge > 12)).toBe(false);
});

test('elk nieuw scherm opent bovenaan', async ({ page }) => {
	await page.goto('/spel/raadspel');
	await expect(page.getByRole('button', { name: 'Gelezen' })).toBeVisible();
	// Naar beneden scrollen op de regels en dan "Gelezen": het invoerscherm moet bovenaan beginnen.
	await page.getByRole('button', { name: 'Gelezen' }).scrollIntoViewIfNeeded();
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await page.getByRole('button', { name: 'Gelezen' }).click();
	await expect(page.getByLabel('Hoeveel spelers?')).toBeVisible();
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

	// Ook na "Start spel" onderaan het lange invoerscherm.
	await page.getByLabel('Hoeveel spelers?').fill('2');
	await page.getByLabel('Leeftijd jongste speler?').fill('30');
	await page.getByLabel('Speler 1').fill('Ann');
	await page.getByLabel('Speler 2').fill('Bob');
	await page.getByRole('button', { name: 'Start spel' }).click();
	await expect(page.getByTestId('aan-de-beurt')).toBeVisible();
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

async function startTwoPlayers(page: import('@playwright/test').Page) {
	await page.goto('/');
	await page.getByRole('link', { name: /Raadspel/ }).click();
	await page.getByRole('button', { name: 'Gelezen' }).click();
	await page.getByLabel('Hoeveel spelers?').fill('2');
	await page.getByLabel('Leeftijd jongste speler?').fill('30');
	await page.getByLabel('Speler 1').fill('Ann');
	await page.getByLabel('Speler 2').fill('Bob');
	await page.getByRole('button', { name: 'Start spel' }).click();
	await expect(page.getByTestId('aan-de-beurt')).toHaveText('Ann');
}

test('via het menu stoppen en terug naar het hoofdmenu', async ({ page }) => {
	await startTwoPlayers(page);
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('button', { name: 'Stoppen en naar het hoofdmenu' }).click();
	await page.getByRole('button', { name: 'Nee, verder spelen' }).click();
	await expect(page.getByTestId('aan-de-beurt')).toHaveText('Ann');
	await page.getByRole('button', { name: 'Stoppen en naar het hoofdmenu' }).click();
	await page.getByRole('button', { name: 'Ja, stoppen' }).click();
	await expect(page).toHaveURL(/\/$/);
	// Een nieuw spel begint echt opnieuw, bij de uitleg.
	await page.getByRole('link', { name: /Raadspel/ }).click();
	await expect(page.getByRole('button', { name: 'Gelezen' })).toBeVisible();
	await page.getByRole('button', { name: 'Gelezen' }).click();
	await expect(page.getByLabel('Hoeveel spelers?')).toHaveValue('');
});

test('terug in de browser: kiezen tussen verder spelen en nieuw spel', async ({ page }) => {
	await startTwoPlayers(page);
	await page.goBack();
	await expect(page).toHaveURL(/\/$/);
	await page.getByRole('link', { name: /Raadspel/ }).click();
	await expect(page.getByRole('heading', { name: 'Je was nog bezig' })).toBeVisible();
	await page.getByRole('button', { name: 'Verder spelen' }).click();
	await expect(page.getByTestId('aan-de-beurt')).toHaveText('Ann');

	await page.goBack();
	await page.getByRole('link', { name: /Raadspel/ }).click();
	await page.getByRole('button', { name: 'Nieuw spel' }).click();
	await expect(page.getByLabel('Hoeveel spelers?')).toBeVisible();
	await expect(page.getByTestId('aan-de-beurt')).toHaveCount(0);
});

test('vragen overslaan alleen voor spelers met het vinkje', async ({ page }) => {
	await page.goto('/spel/raadspel');
	await page.getByRole('button', { name: 'Gelezen' }).click();
	await page.getByLabel('Hoeveel spelers?').fill('2');
	await page.getByLabel('Leeftijd jongste speler?').fill('6');
	await page.getByLabel('Speler 1').fill('Kim');
	await page.getByLabel('Speler 2').fill('Papa');
	await page.getByRole('checkbox', { name: 'Mag vragen overslaan' }).first().check();
	await page.getByRole('button', { name: 'Start spel' }).click();

	// Kim mag overslaan
	await expect(page.getByTestId('aan-de-beurt')).toHaveText('Kim');
	await page.getByRole('button', { name: 'Laat soort opdracht zien' }).click();
	await page.getByRole('button', { name: 'Laat vraag zien' }).click();
	const eerste = await page.getByTestId('vraag').textContent();
	await page.getByRole('button', { name: 'Overslaan, andere vraag' }).click();
	// Nieuwe vraag: eerst opnieuw de soort opdracht, dan de vraag.
	await page.getByRole('button', { name: 'Laat vraag zien' }).click();
	await expect(page.getByTestId('vraag')).not.toHaveText(eerste ?? '');
	await page.getByRole('button', { name: 'Klaar!' }).click();
	await page.getByRole('button', { name: 'Papa', exact: true }).click();

	// Papa niet
	await expect(page.getByTestId('aan-de-beurt')).toHaveText('Papa');
	await page.getByRole('button', { name: 'Laat soort opdracht zien' }).click();
	await page.getByRole('button', { name: 'Laat vraag zien' }).click();
	await expect(page.getByRole('button', { name: 'Overslaan, andere vraag' })).toHaveCount(0);

	// In het menu kun je het alsnog aanzetten
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('group', { name: 'Wie mag vragen overslaan?' }).getByRole('checkbox', { name: 'Papa' }).check();
	await expect(page.getByRole('button', { name: 'Overslaan, andere vraag' })).toBeVisible();
});

test('al gespeelde vragen: eerst nieuwe, anders kiezen om toch te spelen', async ({ page }) => {
	// Alle 18 demovragen zijn op deze telefoon al eens gespeeld.
	await page.goto('/');
	await page.evaluate(() => {
		const ids = Array.from({ length: 18 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
		localStorage.setItem('spel:raadspel:gespeeld', JSON.stringify(ids));
	});
	await page.goto('/spel/raadspel');
	await page.getByRole('button', { name: 'Gelezen' }).click();
	await page.getByLabel('Hoeveel spelers?').fill('2');
	await page.getByLabel('Leeftijd jongste speler?').fill('30');
	await page.getByLabel('Speler 1').fill('Ann');
	await page.getByLabel('Speler 2').fill('Bob');
	await page.getByRole('button', { name: 'Start spel' }).click();
	await expect(page.getByRole('heading', { name: 'Alles al gespeeld?' })).toBeVisible();
	await expect(page.getByTestId('aan-de-beurt')).toHaveCount(0);
	await page.getByRole('button', { name: 'Toch spelen, ook met vragen die al geweest zijn' }).click();
	await expect(page.getByTestId('aan-de-beurt')).toHaveText('Ann');
});

test('gespeelde vragen worden onthouden voor het volgende spel', async ({ page }) => {
	await page.goto('/spel/raadspel');
	await page.getByRole('button', { name: 'Gelezen' }).click();
	await page.getByLabel('Hoeveel spelers?').fill('2');
	await page.getByLabel('Hoeveel vragen per speler?').fill('1');
	await page.getByLabel('Leeftijd jongste speler?').fill('30');
	await page.getByLabel('Speler 1').fill('Ann');
	await page.getByLabel('Speler 2').fill('Bob');
	await page.getByRole('button', { name: 'Start spel' }).click();
	await page.getByRole('button', { name: 'Laat soort opdracht zien' }).click();
	await page.getByRole('button', { name: 'Laat vraag zien' }).click();
	const vraag = await page.getByTestId('vraag').textContent();
	const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('spel:raadspel:gespeeld') ?? '[]'));
	expect(seen.length).toBe(1);
	expect(vraag).toBeTruthy();
});
