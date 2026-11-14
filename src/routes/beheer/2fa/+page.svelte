<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { message, supabase } from '#lib/admin/api.ts';
	import { logout } from '#lib/admin/auth.ts';

	let mode = $state<'loading' | 'enroll' | 'verify'>('loading');
	let factorId = $state('');
	let qr = $state('');
	let secret = $state('');
	let code = $state('');
	let busy = $state(false);
	let error = $state('');

	onMount(async () => {
		const db = supabase();
		const { data } = await db.auth.getSession();
		if (!data.session) return goto('/beheer/login', { replace: true });
		const aal = await db.auth.mfa.getAuthenticatorAssuranceLevel();
		if (aal.data?.currentLevel === 'aal2') return goto('/beheer/vragen', { replace: true });

		const factors = await db.auth.mfa.listFactors();
		const all = factors.data?.all ?? [];
		const verified = all.find((f) => f.factor_type === 'totp' && f.status === 'verified');
		if (verified) {
			factorId = verified.id;
			mode = 'verify';
			return;
		}
		// Eerste keer: oude, niet-afgemaakte koppelingen opruimen en een nieuwe QR-code maken.
		for (const f of all.filter((f) => f.status !== 'verified')) await db.auth.mfa.unenroll({ factorId: f.id });
		const res = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${Date.now()}` });
		if (res.error) {
			error = message(res.error);
			return;
		}
		factorId = res.data.id;
		qr = res.data.totp.qr_code;
		secret = res.data.totp.secret;
		mode = 'enroll';
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		const clean = code.replace(/\s/g, '');
		if (!/^\d{6}$/.test(clean)) {
			error = 'Vul de 6 cijfers uit je authenticator-app in.';
			return;
		}
		busy = true;
		try {
			const { error: err } = await supabase().auth.mfa.challengeAndVerify({ factorId, code: clean });
			if (err) throw err;
			goto('/beheer/vragen', { replace: true });
		} catch (e) {
			const m = message(e);
			error = /invalid|expired/i.test(m) ? 'De code klopt niet of is verlopen. Probeer de nieuwe code.' : m;
			code = '';
		} finally {
			busy = false;
		}
	}

	async function cancel() {
		await logout();
		goto('/beheer/login', { replace: true });
	}
</script>

<main class="container stack narrow">
	<h1>Tweestapsverificatie</h1>

	{#if mode === 'loading'}
		<p class="muted">Even geduld…</p>
	{:else}
		<form class="card stack" onsubmit={submit}>
			{#if mode === 'enroll'}
				<p><strong>Eenmalig instellen.</strong> Open een authenticator-app op je telefoon (bijvoorbeeld Google Authenticator, Microsoft Authenticator of 1Password) en scan deze QR-code.</p>
				<img class="qr" src={qr} alt="QR-code voor je authenticator-app" width="200" height="200" />
				<details>
					<summary>Lukt scannen niet? Typ deze code over</summary>
					<code class="secret">{secret}</code>
				</details>
			{:else}
				<p>Open je authenticator-app en vul de code van 6 cijfers in.</p>
			{/if}
			<div class="field">
				<label for="code">Code</label>
				<input
					id="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength="7"
					required
					bind:value={code}
				/>
			</div>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<button class="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Bezig…' : 'Bevestigen'}</button>
		</form>
	{/if}
	{#if error && mode === 'loading'}<p class="error">{error}</p>{/if}
	<button class="btn-link" onclick={cancel}>Annuleren en uitloggen</button>
</main>

<style>
	.narrow {
		max-width: 420px;
		padding-top: 48px;
	}
	.qr {
		display: block;
		margin: 0 auto;
		background: #fff;
		padding: 8px;
		border-radius: 8px;
	}
	.secret {
		display: block;
		word-break: break-all;
		margin-top: 8px;
		font-size: 1rem;
	}
</style>
