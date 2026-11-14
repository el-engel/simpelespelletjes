import {
	DEMO_MODE,
	GAME_TOKEN_SECRET,
	SUPABASE_SECRET_KEY,
	TURNSTILE_SECRET_KEY
} from '$app/env/private';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';

export const isDemo = () => DEMO_MODE === '1' || DEMO_MODE === 'true';

export function serverConfig() {
	return {
		supabaseUrl: PUBLIC_SUPABASE_URL,
		supabaseSecretKey: SUPABASE_SECRET_KEY,
		turnstileSecret: TURNSTILE_SECRET_KEY,
		tokenSecret: GAME_TOKEN_SECRET || (isDemo() ? 'demo-only-secret-demo-only-secret' : '')
	};
}
