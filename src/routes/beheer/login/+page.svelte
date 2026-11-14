<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';
	import Turnstile from '#lib/Turnstile.svelte';
	import { message, supabase } from '#lib/admin/api.ts';
	import { markLogin } from '#lib/admin/auth.ts';

	let email = $state('');
	let password = $state('');
	let captcha = $state('');
	let busy = $state(false);
	let error = $state('');
	let attempt = $state(0);

	const notice = $derived(
		page.url.searchParams.get('melding') === 'inactief'
			? 'Je bent uitgelogd na 30 minuten zonder activiteit.'
			: page.url.searchParams.get('melding') === 'verlopen'
				? 'Je bent na 8 uur automatisch uitgelogd.'
				: ''
	);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (PUBLIC_TURNSTILE_SITE_KEY && !captcha) {
			error = 'Wacht tot de botcheck klaar is.';
			return;
		}
		busy = true;
		try {
			const { error: err } = await supabase().auth.signInWithPassword({
				email: email.trim(),
				password,
				options: captcha ? { captchaToken: captcha } : undefined
			});
			if (err) throw err;
			markLogin();
			password = '';
			goto('/beheer/2fa', { replace: true });
		} catch (e) {
			const m = message(e);
			error = /invalid login credentials/i.test(m) ? 'E-mailadres of wachtwoord klopt niet.' : m;
			captcha = '';
			attempt++;
		} finally {
			busy = false;
		}
	}
</script>

<main class="container stack narrow">
	<h1>Inloggen beheer</h1>
	{#if notice}<p class="notice">{notice}</p>{/if}
	<form class="card stack" onsubmit={submit}>
		<div class="field">
			<label for="email">E-mailadres</label>
			<input id="email" type="email" autocomplete="username" required bind:value={email} />
		</div>
		<div class="field">
			<label for="password">Wachtwoord</label>
			<input id="password" type="password" autocomplete="current-password" required bind:value={password} />
		</div>
		{#if PUBLIC_TURNSTILE_SITE_KEY}
			{#key attempt}
				<Turnstile siteKey={PUBLIC_TURNSTILE_SITE_KEY} onToken={(t) => (captcha = t)} />
			{/key}
		{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<button class="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Bezig…' : 'Inloggen'}</button>
	</form>
	<p class="muted small">Na het wachtwoord vraagt de app om de code uit je authenticator-app.</p>
</main>

<style>
	.narrow {
		max-width: 420px;
		padding-top: 48px;
	}
</style>
