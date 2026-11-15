# De app online zetten (stap voor stap)

Deze handleiding is voor iemand zonder programmeerervaring. Je doet alles in de browser. Reken op 30 tot 45 minuten. Alles is gratis.

Je maakt vier dingen aan:

| Wat | Waarvoor | Gratis? |
| --- | --- | --- |
| **Supabase** | De database met vragen en de login met 2FA | Ja (Free plan) |
| **Cloudflare Turnstile** | De botbeveiliging | Ja |
| **Netlify** | Zet de app online | Ja (Free plan) |
| **GitHub** | Bewaart de code (heb je al) | Ja |

Houd een leeg tekstbestand of notitie open. Daarin plak je onderweg zes waarden. **Deel deze notitie met niemand.**

---

## Stap 1: Supabase (database en login)

### 1a. Account en project maken

1. Ga naar https://supabase.com/dashboard/sign-up en maak een account. Inloggen met GitHub mag.
2. Supabase vraagt om een **organisatie** aan te maken. Noem hem `simplegames` en kies **Free**. Een eigen organisatie houdt deze app gescheiden van al het andere.
3. Klik op **New project**.
   - **Name:** `simplegames`
   - **Database Password:** klik op **Generate a password** en bewaar het in je notitie.
   - **Region:** kies **Central EU (Frankfurt)**.
   - Klik op **Create new project** en wacht ongeveer twee minuten.

### 1b. De database inrichten

1. Klik in het linkermenu op **SQL Editor** (het icoon met `>_`).
2. Open in GitHub het bestand `supabase/migrations/20261114000000_init.sql`: https://github.com/el-engel/simpelespelletjes/blob/main/supabase/migrations/20261114000000_init.sql
3. Klik rechtsboven op het **kopieer-icoon** ("Copy raw file").
4. Plak het in de SQL Editor van Supabase en klik op **Run** (rechtsonder). Je ziet "Success. No rows returned".
5. Doe hetzelfde met `supabase/migrations/20261115000000_feedback_statistieken.sql`: https://github.com/el-engel/simpelespelletjes/blob/main/supabase/migrations/20261115000000_feedback_statistieken.sql
   Daarmee komen de feedbackknoppen en de statistieken erbij.
   Daarna ook `supabase/migrations/20261116000000_contact.sql`: https://github.com/el-engel/simpelespelletjes/blob/main/supabase/migrations/20261116000000_contact.sql
   Daarmee komt het contactformulier erbij (e-mail instellen: zie "Bijwerken: contactformulier toevoegen" verderop).
6. Doe hetzelfde met `supabase/seed.sql`: https://github.com/el-engel/simpelespelletjes/blob/main/supabase/seed.sql
   Daarmee komen het raadspel, de categorieën en 40 voorbeeldvragen erin.

### 1c. Inloggen beveiligen

1. Klik in het linkermenu op **Authentication**, daarna op **Sign In / Providers**.
2. Zet **Allow new users to sign up** **uit** en klik op **Save**. Zo kan niemand anders een account maken.
3. Klik in het menu **Authentication** op **Multi-Factor**. Controleer dat **TOTP (App Authenticator)** op **Enabled** staat.
4. Klik op **Password** of **Policies** (de naam verschilt soms) en zet de minimale wachtwoordlengte op **12**.

### 1d. Je eigen admin-account maken

1. Ga naar **Authentication** > **Users** en klik op **Add user** > **Create new user**.
2. Vul je e-mailadres en een **sterk wachtwoord** in (minstens 12 tekens; gebruik bij voorkeur een wachtwoordmanager).
3. Vink **Auto Confirm User** aan en klik op **Create user**.
4. Ga terug naar de **SQL Editor**, plak de regel hieronder, **vervang het e-mailadres door het jouwe** en klik op **Run**:

   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
   where email = 'jouw@emailadres.nl';
   ```

   Je ziet "Success. 1 rows affected". Staat er 0, dan klopt het e-mailadres niet.

### 1e. De sleutels opzoeken

1. Klik linksonder op **Project Settings** (tandwiel) en dan op **API Keys**. (Zie je **Data API**, kijk daar ook.)
2. Zet in je notitie:
   - **Project URL**, iets als `https://abcdefgh.supabase.co`. Die staat bij **Data API** of bovenaan de pagina **Connect**.
   - **Publishable key**, begint met `sb_publishable_`. (Zie je alleen "anon public", gebruik die.)
   - **Secret key**, begint met `sb_secret_`. Klik op het oog om hem te zien. (Zie je alleen "service_role", gebruik die.) **Deze sleutel is geheim.**

---

## Stap 2: Cloudflare Turnstile (botbeveiliging)

1. Ga naar https://dash.cloudflare.com/sign-up en maak een gratis account (een website toevoegen is niet nodig).
2. Klik in het linkermenu op **Turnstile** (eventueel onder **Application security**) en dan op **Add widget**.
3. Vul in:
   - **Widget name:** `simplegames`
   - **Hostname:** voorlopig `netlify.app`. In stap 4 vervang je die door het precieze adres van je site.
   - **Widget Mode:** **Managed**.
4. Klik op **Create**. Zet in je notitie:
   - **Site Key**
   - **Secret Key**
5. Beveilig ook de beheerlogin: ga in Supabase naar **Authentication** > **Attack Protection**, zet **Enable Captcha protection** aan, kies **Cloudflare Turnstile**, plak de **Secret Key** en klik op **Save**.

---

## Stap 3: Netlify (de app online zetten)

1. Ga naar https://app.netlify.com/signup en log in met **GitHub**.
2. Klik op **Add new project** (of **Add new site**) > **Import an existing project**.
3. Kies **GitHub**. Er opent een GitHub-venster:
   - Kies **Only select repositories** en selecteer **simpelespelletjes**. Zo kan Netlify niet bij je andere repo's.
   - Klik op **Install** of **Save**.
4. Kies de repo **simpelespelletjes** in de lijst.
5. Netlify vult de bouwinstellingen zelf in uit het bestand `netlify.toml`. Verander niets.
6. Klik op **Add environment variables** (of later via **Project configuration** > **Environment variables** > **Add a variable**) en voeg deze zes toe. Kies bij elke variabele **Same value for all deploy contexts**:

   | Key | Value |
   | --- | --- |
   | `PUBLIC_SUPABASE_URL` | Project URL uit stap 1e |
   | `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key uit stap 1e |
   | `SUPABASE_SECRET_KEY` | Secret key uit stap 1e (vink **Contains secret values** aan) |
   | `PUBLIC_TURNSTILE_SITE_KEY` | Site Key uit stap 2 |
   | `TURNSTILE_SECRET_KEY` | Secret Key uit stap 2 (vink **Contains secret values** aan) |
   | `GAME_TOKEN_SECRET` | Een lange willekeurige tekst van minstens 40 tekens, bijvoorbeeld uit https://1password.com/password-generator (vink **Contains secret values** aan) |

7. Klik op **Deploy**. Na een paar minuten staat de site online op een adres als `https://iets-willekeurigs.netlify.app`.
8. Wil je een mooier adres? Ga naar **Project configuration** > **General** > **Change project name** en kies bijvoorbeeld `simpelespelletjes`. Het adres wordt dan `https://simpelespelletjes.netlify.app` (als die naam nog vrij is).

---

## Stap 4: Afmaken

1. **Turnstile op het juiste adres:** ga terug naar Cloudflare > Turnstile > je widget > **Settings**, vervang `netlify.app` door je precieze adres (bijvoorbeeld `simpelespelletjes.netlify.app`) en sla op.
2. **Supabase het adres laten kennen:** in Supabase > **Authentication** > **URL Configuration**, zet **Site URL** op je Netlify-adres.
3. **Testen als speler:** open je site op je telefoon, kies Raadspel en speel een rondje.
4. **Testen als admin:** ga naar `https://jouw-adres.netlify.app/beheer`.
   - Log in met je e-mailadres en wachtwoord uit stap 1d.
   - De eerste keer zie je een QR-code. Installeer een authenticator-app op je telefoon (bijvoorbeeld **Google Authenticator** of **Microsoft Authenticator**), tik op **+**, scan de code en vul de 6 cijfers in.
   - Daarna vraagt de app bij elke login om een nieuwe code uit die app.

---

## Stap 5 (aanbevolen): Supabase wakker houden

Een gratis Supabase-project pauzeert na 7 dagen zonder gebruik. Een kleine automatische taak in GitHub voorkomt dat. Het kost niets.

1. Ga naar https://github.com/el-engel/simpelespelletjes/settings/secrets/actions
2. Klik op **New repository secret** en voeg er twee toe:
   - Name `SUPABASE_URL`, Secret: je Project URL
   - Name `SUPABASE_PUBLISHABLE_KEY`, Secret: je Publishable key
3. Klaar. Elke drie dagen doet GitHub een klein verzoek. Je ziet het onder **Actions** > **Supabase wakker houden**.

---

## Bijwerken: feedback en statistieken toevoegen (als de app al online staat)

Draai je de app al? Dan doe je dit één keer, direct nadat je de nieuwe versie hebt samengevoegd. (Het spel blijft ondertussen gewoon werken.)

1. Open je project in Supabase: https://supabase.com/dashboard/projects en klik op **simplegames**.
2. Klik in het linkermenu op **SQL Editor** (het icoon met `>_`) en daarna op **+ New query**.
3. Open in GitHub het bestand https://github.com/el-engel/simpelespelletjes/blob/main/supabase/migrations/20261115000000_feedback_statistieken.sql en klik rechtsboven op het **kopieer-icoon** ("Copy raw file").
4. Plak het in de SQL Editor en klik rechtsonder op **Run**. Je ziet "Success. No rows returned".
   - Zie je een melding over "destructive operations"? Klik dan op **Run this query**. Er wordt niets weggegooid; het bestand maakt alleen nieuwe tabellen aan.
5. Klaar. In `/beheer` staan nu de tabbladen **Feedback** en **Statistieken**. Ze vullen zich zodra er gespeeld wordt.

Het bestand mag je gerust nog een keer uitvoeren; dat kan geen kwaad.

## Bijwerken: contactformulier toevoegen (als de app al online staat)

Onderaan het beginscherm staat een knop **Contact**. Berichten komen altijd in `/beheer` onder **Berichten**. Wil je ze ook per e-mail krijgen, dan heb je een gratis account bij Resend nodig (geen creditcard).

Doe de stappen in deze volgorde, **vóór** je de nieuwe versie samenvoegt. Dan hoeft Netlify maar één keer te bouwen.

### A. De database uitbreiden (2 minuten)

1. Open je project in Supabase: https://supabase.com/dashboard/projects en klik op **simplegames**.
2. Klik links op **SQL Editor** (het icoon met `>_`) en daarna op **+ New query**.
3. Open https://github.com/el-engel/simpelespelletjes/blob/main/supabase/migrations/20261116000000_contact.sql en klik rechtsboven op het **kopieer-icoon** ("Copy raw file"). (Is de nieuwe versie nog niet samengevoegd, open dan het bestand via de link in de pull request.)
4. Plak het in de SQL Editor en klik rechtsonder op **Run**. Je ziet "Success. No rows returned".
   - Zie je een melding over "destructive operations"? Klik op **Run this query**. Er wordt niets weggegooid.

### B. Gratis account bij Resend (5 minuten, alleen voor e-mailmeldingen)

1. Ga naar https://resend.com/signup en maak een account met **het e-mailadres waarop je de berichten wilt ontvangen**. Bevestig je e-mailadres via de mail die je krijgt.
   - Zonder eigen domeinnaam mag Resend alleen mailen naar het adres waarmee je het account hebt gemaakt. Dat is precies wat we nodig hebben.
2. Sla vragen over een domein ("Add domain") over.
3. Ga naar https://resend.com/api-keys en klik op **Create API key**.
   - Name: `simpelespelletjes`
   - Permission: **Sending access**
   - Klik op **Add** (of **Create**).
4. Je ziet een sleutel die begint met `re_`. **Kopieer hem meteen**; je ziet hem maar één keer.

Gratis bij Resend: 3.000 mails per maand en 100 per dag. Er komt geen rekening, want je koppelt geen creditcard.

### C. De sleutel in Netlify zetten (2 minuten)

1. Ga naar https://app.netlify.com, klik op je project **simpelespelletjes** en dan links op **Project configuration** > **Environment variables**.
2. Klik op **Add a variable** > **Add a single variable** en voeg deze twee toe (kies steeds **Same value for all deploy contexts**):

   | Key | Value |
   | --- | --- |
   | `RESEND_API_KEY` | De sleutel uit stap B4 (vink **Contains secret values** aan) |
   | `CONTACT_EMAIL_TO` | Het e-mailadres van je Resend-account (uit stap B1) |

3. Klik op **Create variable**. Je hoeft nu niet opnieuw te publiceren; dat gebeurt vanzelf als je de nieuwe versie samenvoegt.

### D. Samenvoegen en testen

1. Voeg de pull request samen (**Merge pull request**). Netlify zet de nieuwe versie binnen een paar minuten online.
2. Open je site, scroll helemaal naar beneden en tik op **Contact**. Stuur een testbericht.
3. Kijk in je mailbox (ook in de map **Spam** of **Ongewenst**, de eerste keer). De mail komt van `onboarding@resend.dev`. Tik je op **Beantwoorden**, dan gaat je antwoord direct naar de bezoeker.
4. In `/beheer` > **Berichten** staat het bericht ook. Zie je daar **niet gemaild**, dan klopt de sleutel of het e-mailadres in stap C niet. Pas het aan en kies daarna in Netlify **Deploys** > **Trigger deploy** > **Deploy site**.

**Spambeveiliging:** dezelfde onzichtbare botcheck als bij Start spel, een verborgen valstrikveld voor bots, een minimale invultijd, maximaal 1.000 tekens en hooguit 3 berichten per 10 minuten (10 per dag) per bezoeker.

## Kosten en grenzen

- **Netlify Free:** een vast maandelijks tegoed. Elke publicatie kost tegoed, daarom bouwt Netlify alleen de hoofdtak `main` (zie `netlify.toml`). Is het tegoed op, dan pauzeert de site tot de volgende maand; er komt geen rekening.
- **Supabase Free:** 500 MB database, ruim genoeg voor tienduizenden vragen.
- **Resend Free:** 3.000 mails per maand, 100 per dag. Alleen nodig voor e-mailmeldingen van het contactformulier.
- Koppel nergens een creditcard, dan kan er nooit een rekening komen.

## Lukt iets niet?

- **"Supabase is nog niet ingesteld"**: een van de omgevingsvariabelen in Netlify ontbreekt of heeft een typfout. Na het aanpassen: **Deploys** > **Trigger deploy** > **Deploy site**.
- **"De botcheck is niet gelukt"**: de hostname in Turnstile klopt niet met je adres (stap 4.1).
- **"Geen toegang" na inloggen**: de SQL-regel uit stap 1d is niet gelukt (controleer het e-mailadres).
- **2FA-telefoon kwijt**: in Supabase > **Authentication** > **Users** > jouw account > **Remove MFA factors** (of de ⋯-knop). Daarna stel je 2FA opnieuw in bij de volgende login.
