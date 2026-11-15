import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { data } from '#lib/server/data.ts';
import { isDemo, serverConfig } from '#lib/server/config.ts';
import { rateLimit, readJson } from '#lib/server/guard.ts';
import { verifyTurnstile } from '#lib/server/turnstile.ts';
import { checkContact, looksLikeBot, sendViaResend } from '#lib/server/contact.ts';

// Contactformulier: controleren, tegen spam beschermen, mailen en bewaren.
export const POST: RequestHandler = async (event) => {
	const len = Number(event.request.headers.get('content-length') ?? 0);
	if (len > 12_000) error(413, 'Je bericht is te lang.');
	const body = await readJson(event.request);

	const check = checkContact(body);
	if (!check.ok) return json({ ok: false, field: check.field, message: check.message }, { status: 400 });

	// Valstrik of te snel ingevuld: doe alsof het gelukt is, maar bewaar en mail niets.
	if (looksLikeBot(body)) return json({ ok: true });

	const ip = await rateLimit(event, 'contact', 3, 10 * 60, 'Je hebt net al een bericht gestuurd. Probeer het over 10 minuten opnieuw.');
	await rateLimit(event, 'contact-dag', 10, 24 * 60 * 60, 'Je hebt vandaag al veel berichten gestuurd. Probeer het morgen opnieuw.');

	const cfg = serverConfig();
	if (!isDemo()) {
		const ok = await verifyTurnstile(String(body.captcha ?? ''), cfg.turnstileSecret, ip);
		if (!ok) error(403, 'De botcheck is niet gelukt. Probeer het opnieuw.');
	}

	const emailed = isDemo()
		? false
		: await sendViaResend({ apiKey: cfg.resendKey, from: cfg.contactFrom, to: cfg.contactTo }, check.value, event.url.origin);

	try {
		await data().saveContactMessage(check.value, emailed);
	} catch (e) {
		console.error('contact opslaan', e);
		// Is de mail wel verstuurd, dan is het bericht niet kwijt.
		if (!emailed) error(500, 'Je bericht kon niet worden verstuurd. Probeer het later opnieuw.');
	}
	return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
};
