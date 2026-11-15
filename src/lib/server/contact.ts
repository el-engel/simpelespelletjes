// Contactformulier: invoer controleren en de mail opstellen.
// Dit bestand gebruikt niets van SvelteKit, zodat het los te testen is.

export const CONTACT_LIMITS = { name: 100, email: 200, phone: 30, message: 1000 } as const;

/** Formulier dat sneller dan dit wordt verstuurd, is vrijwel zeker een bot. */
export const MIN_FILL_MS = 3000;

export interface ContactInput {
	name: string;
	email: string;
	phone: string;
	message: string;
}

export type ContactCheck =
	| { ok: true; value: ContactInput }
	| { ok: false; field: keyof ContactInput | 'form'; message: string };

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const PHONE = /^[0-9+()\-. ]{6,30}$/;

// Onzichtbare stuurtekens weghalen (behalve regeleinden in het bericht).
const clean = (v: unknown, keepNewlines = false): string => {
	if (typeof v !== 'string') return '';
	const s = v.normalize('NFC').replace(/\r\n?/g, '\n');
	return (keepNewlines ? s.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '') : s.replace(/[\u0000-\u001f\u007f]/g, ' ')).trim();
};

/** Controleert wat de bezoeker invult. Geeft een duidelijke Nederlandse melding terug. */
export function checkContact(body: Record<string, unknown>): ContactCheck {
	const name = clean(body.name).replace(/\s+/g, ' ');
	const email = clean(body.email).toLowerCase();
	const phone = clean(body.phone).replace(/\s+/g, ' ');
	const message = clean(body.message, true).replace(/\n{4,}/g, '\n\n\n');

	if (!name) return { ok: false, field: 'name', message: 'Vul je naam in.' };
	if (name.length > CONTACT_LIMITS.name) return { ok: false, field: 'name', message: 'Je naam is te lang.' };
	if (!email || email.length > CONTACT_LIMITS.email || !EMAIL.test(email))
		return { ok: false, field: 'email', message: 'Vul een geldig e-mailadres in.' };
	if (phone && !PHONE.test(phone))
		return { ok: false, field: 'phone', message: 'Vul een geldig telefoonnummer in (alleen cijfers, spaties en +).' };
	if (!message) return { ok: false, field: 'message', message: 'Schrijf een bericht.' };
	if (message.length > CONTACT_LIMITS.message)
		return { ok: false, field: 'message', message: `Je bericht mag maximaal ${CONTACT_LIMITS.message} tekens zijn.` };
	// Spam bestaat vaak uit veel links; een gewone vraag heeft er hooguit een paar.
	if ((message.match(/https?:\/\/|www\./gi) ?? []).length > 3)
		return { ok: false, field: 'message', message: 'Je bericht bevat te veel links.' };

	return { ok: true, value: { name, email, phone, message } };
}

/** Valstrikken voor bots: een verborgen veld dat mensen niet zien, en een minimale invultijd. */
export function looksLikeBot(body: Record<string, unknown>, now = Date.now()): boolean {
	if (typeof body.website === 'string' && body.website.trim() !== '') return true;
	const started = typeof body.started === 'number' ? body.started : 0;
	return !started || now - started < MIN_FILL_MS || now - started > 24 * 60 * 60 * 1000;
}

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** De mail aan de beheerder: platte tekst en eenvoudige HTML. */
export function contactMail(c: ContactInput, site: string) {
	const subject = `Nieuw contactbericht van ${c.name}`.slice(0, 150);
	const lines = [
		`Naam: ${c.name}`,
		`E-mail: ${c.email}`,
		`Telefoon: ${c.phone || '-'}`,
		'',
		c.message,
		'',
		`Alle berichten staan ook in ${site}/beheer/berichten`,
		'Je kunt deze mail direct beantwoorden; je antwoord gaat naar de afzender.'
	];
	const html = `<p><strong>Naam:</strong> ${esc(c.name)}<br><strong>E-mail:</strong> ${esc(c.email)}<br><strong>Telefoon:</strong> ${esc(c.phone || '-')}</p>
<p style="white-space:pre-wrap">${esc(c.message)}</p>
<p style="color:#666">Alle berichten staan ook in <a href="${esc(site)}/beheer/berichten">${esc(site)}/beheer/berichten</a>.<br>Je kunt deze mail direct beantwoorden; je antwoord gaat naar de afzender.</p>`;
	return { subject, text: lines.join('\n'), html };
}

/** Verstuurt de mail via Resend. Geeft true als het gelukt is; gooit nooit een fout. */
export async function sendViaResend(
	opts: { apiKey: string; from: string; to: string },
	c: ContactInput,
	site: string,
	fetcher: typeof fetch = fetch
): Promise<boolean> {
	if (!opts.apiKey || !opts.to) return false;
	const mail = contactMail(c, site);
	try {
		const res = await fetcher('https://api.resend.com/emails', {
			method: 'POST',
			headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				from: opts.from,
				to: opts.to.split(',').map((s) => s.trim()).filter(Boolean),
				reply_to: c.email,
				subject: mail.subject,
				text: mail.text,
				html: mail.html
			}),
			signal: AbortSignal.timeout(8000)
		});
		if (!res.ok) console.error('resend', res.status, (await res.text().catch(() => '')).slice(0, 300));
		return res.ok;
	} catch (e) {
		console.error('resend', e instanceof Error ? e.message : e);
		return false;
	}
}
