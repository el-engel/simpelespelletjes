<script lang="ts">
	import { onMount } from 'svelte';
	import Turnstile from '#lib/Turnstile.svelte';

	let { data } = $props();

	const MAX = 1000;

	let name = $state('');
	let email = $state('');
	let phone = $state('');
	let message = $state('');
	let website = $state(''); // valstrik voor bots, blijft voor mensen leeg
	let started = 0;

	let captcha = $state('');
	let attempt = $state(0);
	let sending = $state(false);
	let sent = $state(false);
	let problem = $state('');
	let badField = $state('');

	const left = $derived(MAX - message.length);
	const needsCheck = $derived(!data.demo);
	const waitingForCheck = $derived(needsCheck && !!data.siteKey && !captcha);

	onMount(() => {
		started = Date.now();
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (sending) return;
		if (needsCheck && !captcha) {
			problem = 'Even geduld: de botcheck is nog bezig.';
			return;
		}
		sending = true;
		problem = '';
		badField = '';
		try {
			const res = await fetch('/api/contact', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, email, phone, message, website, started, captcha })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok || body.ok !== true) {
				badField = typeof body.field === 'string' ? body.field : '';
				throw new Error(body.message ?? 'Er ging iets mis. Probeer het opnieuw.');
			}
			sent = true;
		} catch (err) {
			problem = err instanceof Error ? err.message : 'Er ging iets mis.';
			// Een botcheck-bewijs is maar één keer bruikbaar: vraag een nieuwe aan.
			captcha = '';
			attempt++;
		} finally {
			sending = false;
		}
	}
</script>

<svelte:head>
	<title>Contact · Simpele spelletjes</title>
	<meta name="description" content="Stuur een bericht naar de makers van Simpele spelletjes." />
</svelte:head>

<main class="container stack">
	<a class="btn-link" href="/">← Alle spelletjes</a>
	<h1>Contact</h1>

	{#if sent}
		<section class="card card-neon stack" aria-live="polite">
			<p class="success">Bedankt, je bericht is verstuurd!</p>
			<p>We lezen alle berichten en reageren zo snel mogelijk via je e-mailadres.</p>
			<a class="btn btn-primary btn-big" href="/">Terug naar de spelletjes</a>
		</section>
	{:else}
		<p class="muted">Een vraag, idee of foutje gezien? Laat het ons weten.</p>
		<form class="card stack" onsubmit={submit} novalidate>
			<div class="field">
				<label for="c-name">Naam</label>
				<input
					id="c-name"
					type="text"
					autocomplete="name"
					maxlength="100"
					required
					aria-invalid={badField === 'name'}
					bind:value={name}
				/>
			</div>
			<div class="field">
				<label for="c-email">E-mailadres</label>
				<input
					id="c-email"
					type="email"
					autocomplete="email"
					inputmode="email"
					maxlength="200"
					required
					aria-invalid={badField === 'email'}
					bind:value={email}
				/>
			</div>
			<div class="field">
				<label for="c-phone">Telefoonnummer <span class="muted small">(niet verplicht)</span></label>
				<input
					id="c-phone"
					type="tel"
					autocomplete="tel"
					inputmode="tel"
					maxlength="30"
					aria-invalid={badField === 'phone'}
					bind:value={phone}
				/>
			</div>
			<div class="field">
				<label for="c-message">Bericht</label>
				<textarea
					id="c-message"
					maxlength={MAX}
					required
					aria-invalid={badField === 'message'}
					aria-describedby="c-count"
					bind:value={message}
				></textarea>
				<span id="c-count" class="muted small count" class:low={left < 50}>Nog {left} tekens</span>
			</div>

			<!-- Valstrik voor bots: mensen zien en gebruiken dit veld niet. -->
			<div class="trap" aria-hidden="true">
				<label for="c-website">Website</label>
				<input id="c-website" type="text" tabindex="-1" autocomplete="off" bind:value={website} />
			</div>

			{#if data.demo}
				<p class="notice">Demomodus: botcheck staat uit en er wordt niets gemaild.</p>
			{:else if !data.siteKey}
				<p class="error">De botbeveiliging is nog niet ingesteld (PUBLIC_TURNSTILE_SITE_KEY).</p>
			{:else}
				{#key attempt}
					<Turnstile
						siteKey={data.siteKey}
						onToken={(t) => (captcha = t)}
						onError={() => (problem = 'De botcheck kon niet laden. Ververs de pagina.')}
					/>
				{/key}
			{/if}

			{#if problem}<p class="error" role="alert">{problem}</p>{/if}

			<button class="btn btn-primary btn-big" type="submit" disabled={sending || (needsCheck && !data.siteKey)}>
				{sending ? 'Bezig met versturen…' : waitingForCheck ? 'Even checken…' : 'Versturen'}
			</button>
		</form>
	{/if}
</main>

<style>
	.count {
		align-self: flex-end;
	}
	.count.low {
		color: var(--yellow);
	}
	.trap {
		position: absolute;
		left: -10000px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
	[aria-invalid='true'] {
		border-color: var(--red);
	}
</style>
