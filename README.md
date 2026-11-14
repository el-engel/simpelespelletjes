# Simpele spelletjes

Webapp voor simpele spelletjes om samen op één telefoon te spelen. Het eerste spel is **het raadspel**: uitbeelden, tekenen, beschrijven of vragen beantwoorden, met score en winnaar.

- **Online zetten:** volg [SETUP.md](SETUP.md), stap voor stap en zonder programmeerkennis.
- **Beheer:** `/beheer`, met inloggen plus 2FA (authenticator-app). Hier beheer je vragen (upload, zoeken, filteren, bewerken, (de)activeren, export), categorieën, soorten opdrachten en spelregels.
- **Uploadformaat:** kolommen `ID`, `vraag`, `categorieën`, `soort opdracht`, `minimum leeftijd`. Meerdere waarden scheid je met `;`. Een lege ID = nieuwe vraag, een ingevulde ID = bijwerken.

## Techniek

| Onderdeel | Keuze |
| --- | --- |
| App | SvelteKit 3 (Svelte 5, TypeScript) |
| Hosting | Netlify (alleen `main` wordt gepubliceerd) |
| Database en login | Supabase (Postgres met Row Level Security, Auth met TOTP-2FA) |
| Botbeveiliging | Cloudflare Turnstile, ondertekend spel-token, rate limiting per IP |

Belangrijke mappen:

```
src/routes/                 pagina's: hoofdmenu, /spel/[slug], /beheer, /api/spel
src/lib/games/registry.ts   lijst van spellen
src/lib/games/raadspel/     het raadspel (Raadspel.svelte en logic.ts)
src/lib/admin/              beheer: database-aanroepen, upload, export, filters
supabase/migrations/        databaseschema en toegangsregels
supabase/seed.sql           raadspel, categorieën en voorbeeldvragen
```

**Nieuw spel toevoegen:** maak `src/lib/games/<slug>/` met een hoofdcomponent, zet het in `registry.ts` en maak het spel aan in `/beheer` > Spellen met dezelfde slug.

## Lokaal ontwikkelen

```bash
npm install
cp .env.example .env          # zet DEMO_MODE=1 om zonder Supabase te spelen
npm run dev
```

Testen:

```bash
npm run check                 # TypeScript en Svelte
npm run test:unit             # spelregels en spel-token
npm run test:db               # database en toegangsregels (lokale Postgres nodig)
npm run test:e2e              # klikproeven in een browser
```
