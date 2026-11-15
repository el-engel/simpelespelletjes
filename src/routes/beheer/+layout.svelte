<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isConfigured } from '#lib/admin/api.ts';
	import { IDLE_MS, authState, logout, sessionTooOld } from '#lib/admin/auth.ts';

	let { children } = $props();

	let ready = $state(false);
	let problem = $state<'' | 'config' | 'notAdmin'>('');
	let email = $state('');
	let lastActivity = Date.now();

	const open = $derived(page.url.pathname === '/beheer/login' || page.url.pathname === '/beheer/2fa');
	const links = [
		{ href: '/beheer/vragen', label: 'Vragen' },
		{ href: '/beheer/upload', label: 'Upload' },
		{ href: '/beheer/categorieen', label: 'Categorieën en soorten' },
		{ href: '/beheer/spellen', label: 'Spellen en spelregels' }
	];

	async function guard() {
		if (!isConfigured()) {
			problem = 'config';
			ready = true;
			return;
		}
		if (open) {
			ready = true;
			return;
		}
		ready = false;
		const s = await authState();
		if (s.kind === 'loggedOut') return goto('/beheer/login', { replace: true });
		if (s.kind === 'needs2fa') return goto('/beheer/2fa', { replace: true });
		email = s.session.user.email ?? '';
		problem = s.kind === 'notAdmin' ? 'notAdmin' : '';
		ready = true;
	}

	$effect(() => {
		void page.url.pathname;
		guard();
	});

	async function signOut(reason = '') {
		await logout();
		goto(`/beheer/login${reason ? `?melding=${reason}` : ''}`, { replace: true });
	}

	onMount(() => {
		const touch = () => (lastActivity = Date.now());
		const events = ['pointerdown', 'keydown', 'scroll'] as const;
		events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
		const timer = setInterval(() => {
			if (open) return;
			if (Date.now() - lastActivity > IDLE_MS) signOut('inactief');
			else if (sessionTooOld()) signOut('verlopen');
		}, 30_000);
		return () => {
			events.forEach((e) => window.removeEventListener(e, touch));
			clearInterval(timer);
		};
	});
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	<title>Beheer · Simpele spelletjes</title>
</svelte:head>

{#if problem === 'config'}
	<main class="container stack">
		<h1>Beheer</h1>
		<p class="error">
			Supabase is nog niet ingesteld. Zet PUBLIC_SUPABASE_URL en PUBLIC_SUPABASE_PUBLISHABLE_KEY bij de
			omgevingsvariabelen van Netlify (zie SETUP.md).
		</p>
	</main>
{:else if open}
	{@render children()}
{:else if !ready}
	<main class="container"><p class="muted">Bezig met controleren…</p></main>
{:else if problem === 'notAdmin'}
	<main class="container stack">
		<h1>Geen toegang</h1>
		<p class="error">Dit account ({email}) is geen beheerder.</p>
		<button class="btn" onclick={() => signOut()}>Uitloggen</button>
	</main>
{:else}
	<header class="adminbar">
		<div class="container wide row bar">
			<strong>Beheer</strong>
			<nav class="row" aria-label="Beheer">
				{#each links as l (l.href)}
					<a href={l.href} class:active={page.url.pathname.startsWith(l.href)}>{l.label}</a>
				{/each}
			</nav>
			<span class="spacer"></span>
			<span class="muted small">{email}</span>
			<button class="btn btn-small" onclick={() => signOut()}>Uitloggen</button>
		</div>
	</header>
	{@render children()}
{/if}

<style>
	.adminbar {
		background: var(--surface);
		border-bottom: 1px solid var(--line);
		position: sticky;
		top: 0;
		z-index: 10;
	}
	.bar {
		padding-top: 10px;
		padding-bottom: 10px;
		gap: 16px;
	}
	nav a {
		text-decoration: none;
		padding: 6px 10px;
		border-radius: 8px;
		color: var(--text);
	}
	nav a.active {
		background: var(--surface-2);
		color: var(--brand-dark);
		font-weight: 600;
	}
	.spacer {
		flex: 1;
	}
</style>
