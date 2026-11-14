import { createHmac, timingSafeEqual } from 'node:crypto';

/** Spel-token: bewijs dat deze browser de botcheck heeft gehaald voor een spel. */
export interface GameTokenPayload {
	g: string; // spel-id
	exp: number; // verloopt (ms sinds 1970)
}

export const TOKEN_TTL_MS = 3 * 60 * 60 * 1000;

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export function signGameToken(gameId: string, secret: string, now = Date.now()): { token: string; exp: number } {
	if (!secret || secret.length < 32) throw new Error('GAME_TOKEN_SECRET ontbreekt of is te kort');
	const exp = now + TOKEN_TTL_MS;
	const body = b64(JSON.stringify({ g: gameId, exp } satisfies GameTokenPayload));
	const sig = createHmac('sha256', secret).update(body).digest('base64url');
	return { token: `${body}.${sig}`, exp };
}

export function verifyGameToken(token: string, secret: string, now = Date.now()): GameTokenPayload | null {
	if (!secret || typeof token !== 'string' || token.length > 512) return null;
	const [body, sig] = token.split('.');
	if (!body || !sig) return null;
	const expected = createHmac('sha256', secret).update(body).digest();
	let given: Buffer;
	try {
		given = Buffer.from(sig, 'base64url');
	} catch {
		return null;
	}
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	try {
		const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as GameTokenPayload;
		if (typeof payload.g !== 'string' || typeof payload.exp !== 'number' || payload.exp < now) return null;
		return payload;
	} catch {
		return null;
	}
}
