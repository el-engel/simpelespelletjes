/** Controleert het bewijs van Cloudflare Turnstile op de server. */
export async function verifyTurnstile(token: string, secret: string, ip?: string): Promise<boolean> {
	if (!secret) return false;
	if (typeof token !== 'string' || !token || token.length > 4096) return false;
	const body = new URLSearchParams({ secret, response: token });
	if (ip) body.set('remoteip', ip);
	try {
		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			body,
			signal: AbortSignal.timeout(8000)
		});
		const data = (await res.json()) as { success?: boolean };
		return data.success === true;
	} catch {
		return false;
	}
}
