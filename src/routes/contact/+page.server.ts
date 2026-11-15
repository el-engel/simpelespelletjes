import type { PageServerLoad } from './$types';
import { PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';
import { isDemo } from '#lib/server/config.ts';

export const load: PageServerLoad = () => ({ siteKey: PUBLIC_TURNSTILE_SITE_KEY, demo: isDemo() });
