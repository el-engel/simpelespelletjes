import type { Session } from '@supabase/supabase-js';
import { supabase } from './api.ts';

export type AuthState =
	| { kind: 'loggedOut' }
	| { kind: 'needs2fa'; enrolled: boolean; session: Session }
	| { kind: 'notAdmin'; session: Session }
	| { kind: 'ok'; session: Session };

export const IDLE_MS = 30 * 60 * 1000;
export const MAX_SESSION_MS = 8 * 60 * 60 * 1000;
const LOGIN_AT = 'simplegames-beheer:loginAt';

export function markLogin() {
	try {
		localStorage.setItem(LOGIN_AT, String(Date.now()));
	} catch {
		/* negeren */
	}
}

export function sessionTooOld(): boolean {
	try {
		const at = Number(localStorage.getItem(LOGIN_AT) ?? 0);
		return !at || Date.now() - at > MAX_SESSION_MS;
	} catch {
		return false;
	}
}

/** Bepaalt waar de admin staat: uitgelogd, 2FA nodig, geen admin, of klaar. */
export async function authState(): Promise<AuthState> {
	const db = supabase();
	const { data } = await db.auth.getSession();
	const session = data.session;
	if (!session) return { kind: 'loggedOut' };
	if (sessionTooOld()) {
		await logout();
		return { kind: 'loggedOut' };
	}
	const aal = await db.auth.mfa.getAuthenticatorAssuranceLevel();
	if (aal.error) return { kind: 'loggedOut' };
	if (aal.data.currentLevel !== 'aal2') {
		const factors = await db.auth.mfa.listFactors();
		const enrolled = (factors.data?.totp ?? []).some((f) => f.status === 'verified');
		return { kind: 'needs2fa', enrolled, session };
	}
	if (session.user.app_metadata?.role !== 'admin') return { kind: 'notAdmin', session };
	return { kind: 'ok', session };
}

export async function logout() {
	try {
		localStorage.removeItem(LOGIN_AT);
	} catch {
		/* negeren */
	}
	await supabase().auth.signOut();
}
