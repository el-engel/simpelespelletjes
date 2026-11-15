<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Turnstile from '#lib/Turnstile.svelte';
	import { games } from '#lib/games/registry.ts';
	import { toTop } from '#lib/scroll.ts';
	import type { StartData } from '#lib/types.ts';

	let { data } = $props();

	type Phase = 'check' | 'starting' | 'rules' | 'play';
	let phase = $state<Phase>('check');
	let start = $state<StartData | null>(null);
	let message = $state('');
	let attempt = $state(0);

	const storageKey = $derived(`spel:${data.game.slug}:start`);
	const GameComponent = $derived(games[data.game.slug]);

	// Elk nieuw scherm (botcheck, regels, spel) begint bovenaan.
	$effect(() => {
		void phase;
		toTop();
	});

	function save(s: StartData | null) {
		try {
			if (s) sessionStorage.setItem(storageKey, JSON.stringify(s));
			else sessionStorage.removeItem(storageKey);
		} catch {
			/* opslag niet beschikbaar */
		}
	}

	onMount(() => {
		// Na verversen van de pagina: verder spelen zolang het token geldig is.
		try {
			const raw = sessionStorage.getItem(storageKey);
			if (raw) {
				const s = JSON.parse(raw) as StartData;
				if (s.expiresAt > Date.now() + 5 * 60 * 1000 && s.game.slug === data.game.slug) {
					start = s;
					phase = sessionStorage.getItem(`${storageKey}:rules`) ? 'play' : 'rules';
					return;
				}
			}
		} catch {
			/* negeren */
		}
		if (data.demo) begin('');
	});

	async function begin(captcha: string) {
		phase = 'starting';
		message = '';
		try {
			const res = await fetch('/api/spel/start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ slug: data.game.slug, captcha })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.message ?? 'Er ging iets mis. Probeer het opnieuw.');
			start = body as StartData;
			save(start);
			let read = false;
			try {
				read = !!sessionStorage.getItem(`${storageKey}:rules`);
			} catch {
				/* negeren */
			}
			phase = read ? 'play' : 'rules';
		} catch (e) {
			message = e instanceof Error ? e.message : 'Er ging iets mis.';
			phase = 'check';
			attempt++;
		}
	}

	function rulesRead() {
		try {
			sessionStorage.setItem(`${storageKey}:rules`, '1');
		} catch {
			/* negeren */
		}
		phase = 'play';
	}

	function exit() {
		save(null);
		try {
			sessionStorage.removeItem(`${storageKey}:rules`);
		} catch {
			/* negeren */
		}
		goto('/');
	}

	function expired() {
		save(null);
		start = null;
		message = 'Je sessie is verlopen. Doe de botcheck opnieuw; je spel blijft bewaard.';
		phase = 'check';
		attempt++;
	}
</script>

<svelte:head>
	<title>{data.game.name} · Simpele spelletjes</title>
</svelte:head>

{#if phase === 'play' && start}
	<GameComponent {start} onExit={exit} onExpired={expired} />
{:else}
	<main class="container stack">
		<a class="btn-link" href="/">← Alle spelletjes</a>
		<h1>{data.game.name}</h1>
		{#if phase === 'rules'}<p class="kicker">Spelregels</p>{/if}

		{#if phase === 'check' || phase === 'starting'}
			<section class="card stack" aria-live="polite">
				{#if data.demo}
					<p class="notice">Demomodus: botcheck staat uit.</p>
					{#if phase === 'check'}
						<button class="btn btn-primary btn-big" onclick={() => begin('')}>Start</button>
					{/if}
				{:else if !data.siteKey}
					<p class="error">De botbeveiliging is nog niet ingesteld (PUBLIC_TURNSTILE_SITE_KEY).</p>
				{:else}
					<p>Even checken of je geen robot bent…</p>
					{#key attempt}
						<Turnstile
							siteKey={data.siteKey}
							onToken={(t) => begin(t)}
							onError={() => (message = 'De botcheck kon niet laden. Ververs de pagina.')}
						/>
					{/key}
				{/if}
				{#if phase === 'starting'}<p class="muted">Spel wordt klaargezet…</p>{/if}
				{#if message}<p class="error">{message}</p>{/if}
			</section>
		{:else if phase === 'rules' && start}
			<section class="card card-neon stack">
				<div class="prose">{@html start.rulesHtml}</div>
				<button class="btn btn-primary btn-big" onclick={rulesRead}>Gelezen</button>
			</section>
		{/if}
	</main>
{/if}

<style>
	h1 {
		font-size: 2.2rem;
		margin-top: 8px;
	}
	.kicker {
		margin: -8px 0 0;
		font-weight: 700;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		color: var(--cyan);
		font-size: 0.85rem;
	}
</style>
