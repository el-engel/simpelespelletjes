import { defineConfig, devices } from '@playwright/test';

// Klikproeven in een echte browser, met voorbeeldvragen (DEMO_MODE) zodat er geen Supabase nodig is.
export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 30_000,
	use: { baseURL: 'http://localhost:4173', trace: 'off' },
	projects: [{ name: 'telefoon', use: { ...devices['Pixel 7'] } }],
	webServer: {
		command: 'npx vite dev --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: false,
		env: {
			DEMO_MODE: '1',
			GAME_TOKEN_SECRET: 'test-secret-test-secret-test-secret-123',
			// nep-adres: in de beheertests wordt Supabase in de browser nagebootst
			PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key'
		}
	}
});
