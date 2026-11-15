import { expect, test } from '@playwright/test';

// Contactformulier (demomodus: geen botcheck en geen mail).

test('contactknop onderaan het beginscherm, formulier invullen en versturen', async ({ page }) => {
	await page.goto('/');
	const knop = page.getByRole('link', { name: 'Contact' });
	await expect(knop).toBeVisible();
	await knop.click();
	await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();

	await page.getByLabel('Naam').fill('Kim');
	await page.getByLabel('E-mailadres').fill('geen-mail');
	await page.getByLabel('Bericht').fill('Wat een leuk spel!');
	await expect(page.getByText('Nog 982 tekens')).toBeVisible();
	await page.waitForTimeout(3100); // mensen doen er even over; bots niet
	await page.getByRole('button', { name: 'Versturen' }).click();
	await expect(page.getByRole('alert')).toHaveText('Vul een geldig e-mailadres in.');
	await expect(page.getByLabel('E-mailadres')).toHaveAttribute('aria-invalid', 'true');

	await page.getByLabel('E-mailadres').fill('kim@voorbeeld.nl');
	await page.getByLabel(/Telefoonnummer/).fill('06 12345678');
	await page.getByRole('button', { name: 'Versturen' }).click();
	await expect(page.getByText('Bedankt, je bericht is verstuurd!')).toBeVisible();
});

test('bericht is beperkt tot 1000 tekens', async ({ page }) => {
	await page.goto('/contact');
	await page.getByLabel('Bericht').fill('x'.repeat(1200));
	await expect(page.getByLabel('Bericht')).toHaveValue('x'.repeat(1000));
	await expect(page.getByText('Nog 0 tekens')).toBeVisible();
});

test('server weigert te lange berichten, en bots krijgen stil een nep-succes', async ({ request }) => {
	const base = { name: 'Bot', email: 'bot@spam.nl', phone: '', started: Date.now() - 10_000 };
	const lang = await request.post('/api/contact', { data: { ...base, message: 'x'.repeat(1001) } });
	expect(lang.status()).toBe(400);
	expect((await lang.json()).field).toBe('message');

	// Valstrikveld ingevuld of te snel verstuurd: lijkt gelukt, maar telt niet mee voor de limiet.
	for (let i = 0; i < 5; i++) {
		const r = await request.post('/api/contact', { data: { ...base, message: 'koop nu', website: 'http://spam.nl' } });
		expect(r.status()).toBe(200);
		const snel = await request.post('/api/contact', { data: { ...base, message: 'koop nu', started: Date.now() } });
		expect(snel.status()).toBe(200);
	}
});
