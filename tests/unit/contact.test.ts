import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkContact, contactMail, looksLikeBot, sendViaResend } from '../../src/lib/server/contact.ts';

const good = { name: '  Jan  de Vries ', email: 'Jan@Voorbeeld.NL ', phone: '06 12345678', message: 'Leuk spel!\r\nGroetjes' };

test('geldig bericht wordt opgeschoond', () => {
	const r = checkContact(good);
	assert.ok(r.ok);
	assert.deepEqual(r.value, { name: 'Jan de Vries', email: 'jan@voorbeeld.nl', phone: '06 12345678', message: 'Leuk spel!\nGroetjes' });
});

test('telefoon is niet verplicht', () => {
	assert.ok(checkContact({ ...good, phone: '' }).ok);
	assert.ok(checkContact({ ...good, phone: undefined }).ok);
});

test('fouten geven het juiste veld terug', () => {
	const field = (b: Record<string, unknown>) => {
		const r = checkContact({ ...good, ...b });
		return r.ok ? null : r.field;
	};
	assert.equal(field({ name: '   ' }), 'name');
	assert.equal(field({ name: 'x'.repeat(101) }), 'name');
	assert.equal(field({ email: 'geen-mail' }), 'email');
	assert.equal(field({ email: 'a@b' }), 'email');
	assert.equal(field({ email: 'a b@c.nl' }), 'email');
	assert.equal(field({ phone: 'bel me' }), 'phone');
	assert.equal(field({ message: '' }), 'message');
	assert.equal(field({ message: 'x'.repeat(1001) }), 'message');
	assert.equal(field({ message: 'http://a.nl http://b.nl http://c.nl www.d.nl' }), 'message');
	assert.equal(field({ message: 'x'.repeat(1000) }), null);
	assert.equal(field({ name: 42 }), 'name');
});

test('valstrik en te snel invullen worden herkend', () => {
	const now = 1_000_000;
	assert.equal(looksLikeBot({ website: '', started: now - 10_000 }, now), false);
	assert.equal(looksLikeBot({ website: 'http://spam', started: now - 10_000 }, now), true);
	assert.equal(looksLikeBot({ started: now - 500 }, now), true);
	assert.equal(looksLikeBot({}, now), true);
});

test('mail ontsnapt HTML en zet het e-mailadres als antwoordadres', async () => {
	const c = { name: '<b>Hacker</b>', email: 'a@b.nl', phone: '', message: '<script>x</script>' };
	const m = contactMail(c, 'https://site.nl');
	assert.ok(!m.html.includes('<script>'));
	assert.ok(m.html.includes('&lt;script&gt;'));
	assert.ok(m.text.includes('Telefoon: -'));

	let sent: { url: string; body: Record<string, unknown>; auth: string } | null = null;
	const fake = (async (url: string, init: RequestInit) => {
		sent = { url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get('authorization') ?? '' };
		return new Response('{}', { status: 200 });
	}) as unknown as typeof fetch;
	const ok = await sendViaResend({ apiKey: 're_x', from: 'S <onboarding@resend.dev>', to: 'beheer@x.nl' }, c, 'https://site.nl', fake);
	assert.equal(ok, true);
	assert.equal(sent!.url, 'https://api.resend.com/emails');
	assert.equal(sent!.auth, 'Bearer re_x');
	assert.deepEqual(sent!.body.to, ['beheer@x.nl']);
	assert.equal(sent!.body.reply_to, 'a@b.nl');
});

test('zonder sleutel of ontvanger wordt niets gemaild; fout van Resend geeft false', async () => {
	const c = { name: 'a', email: 'a@b.nl', phone: '', message: 'x' };
	let calls = 0;
	const fake = (async () => {
		calls++;
		return new Response('nee', { status: 403 });
	}) as unknown as typeof fetch;
	assert.equal(await sendViaResend({ apiKey: '', from: 'x', to: 'b@c.nl' }, c, '', fake), false);
	assert.equal(await sendViaResend({ apiKey: 're', from: 'x', to: '' }, c, '', fake), false);
	assert.equal(calls, 0);
	const orig = console.error;
	console.error = () => {};
	assert.equal(await sendViaResend({ apiKey: 're', from: 'x', to: 'b@c.nl' }, c, '', fake), false);
	console.error = orig;
});
