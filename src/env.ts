import { defineEnvVars } from '@sveltejs/kit/env';

// Instellingen die op Netlify worden gezet (Site configuration > Environment variables).
// Ontbreekt er een, dan is de waarde een lege tekst en toont de app een duidelijke melding.
const optional = (value: string | undefined) => value ?? '';

export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: {
		public: true,
		schema: optional,
		description: 'Adres van je Supabase-project, bijvoorbeeld https://abcd.supabase.co'
	},
	PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
		public: true,
		schema: optional,
		description: 'Publishable key (of de oude "anon" key) van Supabase'
	},
	PUBLIC_TURNSTILE_SITE_KEY: {
		public: true,
		schema: optional,
		description: 'Site key van Cloudflare Turnstile'
	},
	SUPABASE_SECRET_KEY: {
		schema: optional,
		description: 'Secret key (of de oude "service_role" key) van Supabase. Nooit delen.'
	},
	TURNSTILE_SECRET_KEY: {
		schema: optional,
		description: 'Secret key van Cloudflare Turnstile'
	},
	GAME_TOKEN_SECRET: {
		schema: optional,
		description: 'Lange willekeurige tekst om spel-tokens te ondertekenen'
	},
	DEMO_MODE: {
		schema: optional,
		description: 'Alleen lokaal: 1 = spelen met voorbeeldvragen zonder Supabase'
	}
});
