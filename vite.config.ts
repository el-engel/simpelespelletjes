import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-netlify';
import { defineConfig } from 'vite';

const turnstile = 'https://challenges.cloudflare.com';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter(),
			// Content-Security-Policy: alleen scripts van deze site en van Cloudflare Turnstile.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', turnstile],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': ['self', 'https://*.supabase.co', 'wss://*.supabase.co', turnstile],
					'frame-src': [turnstile],
					'worker-src': ['self', 'blob:'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	]
});
