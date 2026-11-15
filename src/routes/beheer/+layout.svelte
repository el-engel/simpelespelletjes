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
	let nav = $state<HTMLElement>();

	// Op de telefoon schuift het menu opzij: zorg dat het actieve tabblad in beeld staat.
	$effect(() => {
		void page.url.pathname;
		nav?.querySelector('a.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
	});

	const open = $derived(page.url.pathname === '/beheer/login' || page.url.pathname === '/beheer/2fa');
	const links = [
		{ href: '/beheer/vragen', label: 'Vragen' },
		{ href: '/beheer/upload', label: 'Upload' },
		{ href: '/beheer/categorieen', label: 'Categorieën en soorten' },
		{ href: '/beheer/spellen', label: 'Spellen en spelregels' },
		{ href: '/beheer/feedback', label: 'Feedback' },
		{ href: '/beheer/statistieken', label: 'Statistieken' },
		{ href: '/beheer/berichten', label: 'Berichten' }
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
	<div class="admin">{@render children()}</div>
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
		<div class="container wide bar">
			<strong class="title">Beheer</strong>
			<nav aria-label="Beheer" bind:this={nav}>
				{#each links as l (l.href)}
					<a
						href={l.href}
						class:active={page.url.pathname.startsWith(l.href)}
						aria-current={page.url.pathname.startsWith(l.href) ? 'page' : undefined}>{l.label}</a
					>
				{/each}
			</nav>
			<span class="muted small email">{email}</span>
			<button class="btn btn-small logout" onclick={() => signOut()}>Uitloggen</button>
		</div>
	</header>
	<div class="admin">{@render children()}</div>
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
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		padding-top: 10px;
		padding-bottom: 10px;
		gap: 8px 16px;
	}
	nav {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		gap: 4px;
		min-width: 0;
	}
	nav a {
		text-decoration: none;
		padding: 6px 10px;
		border-radius: 8px;
		color: var(--text);
		white-space: nowrap;
	}
	nav a.active {
		background: var(--surface-2);
		color: var(--brand-dark);
		font-weight: 600;
	}
	/* Vangnet: niets binnen het beheer mag de pagina breder maken dan het scherm. */
	.admin {
		overflow-x: clip;
	}

	/* Telefoon: compacte balk die niet blijft plakken, tabbladen op één regel om opzij te vegen. */
	@media (max-width: 700px) {
		.adminbar {
			position: static;
		}
		.bar {
			padding: 8px 0 0;
			gap: 4px 8px;
		}
		.title {
			padding-left: 16px;
			flex: 1;
		}
		.email {
			display: none;
		}
		.logout {
			margin-right: 16px;
		}
		nav {
			order: 3;
			flex: 0 0 100%;
			flex-wrap: nowrap;
			overflow-x: auto;
			scrollbar-width: none;
			padding: 4px 16px 8px;
			scroll-padding: 0 16px;
		}
		nav::-webkit-scrollbar {
			display: none;
		}
		nav a {
			padding: 8px 12px;
			background: var(--surface-2);
			border: 1px solid var(--line);
		}
		nav a.active {
			border-color: var(--cyan);
		}
		.admin :global(h1) {
			font-size: 1.6rem;
		}
	}
</style>
