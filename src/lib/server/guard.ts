import { createHash } from 'node:crypto';
import { error, type RequestEvent } from '@sveltejs/kit';
import { data } from './data';
import { serverConfig } from './config';

/** Botbescherming: maximaal `max` verzoeken per IP-adres per `windowSeconds`. */
export async function rateLimit(event: RequestEvent, purpose: string, max: number, windowSeconds: number) {
	let ip = 'onbekend';
	try {
		ip = event.getClientAddress();
	} catch {
		/* lokaal zonder adres */
	}
	// Het IP-adres zelf wordt niet opgeslagen, alleen een onherleidbare hash.
	const hash = createHash('sha256').update(`${ip}|${serverConfig().tokenSecret}`).digest('hex').slice(0, 32);
	const ok = await data().hitRateLimit(`${purpose}:${hash}`, max, windowSeconds);
	if (!ok) error(429, 'Te veel verzoeken. Wacht een minuutje en probeer het opnieuw.');
	return ip;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
	const len = Number(request.headers.get('content-length') ?? 0);
	if (len > 64_000) error(413, 'Verzoek te groot');
	try {
		const body = await request.json();
		if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
		return body as Record<string, unknown>;
	} catch {
		error(400, 'Ongeldig verzoek');
	}
}

export const strArray = (v: unknown, max: number, maxLen = 64): string[] => {
	if (!Array.isArray(v) || v.length > max) error(400, 'Ongeldig verzoek');
	return v.map((x) => {
		if (typeof x !== 'string' || x.length === 0 || x.length > maxLen) error(400, 'Ongeldig verzoek');
		return x;
	});
};

export const intIn = (v: unknown, min: number, max: number): number => {
	const n = typeof v === 'number' ? v : Number.NaN;
	if (!Number.isInteger(n) || n < min || n > max) error(400, 'Ongeldig verzoek');
	return n;
};
