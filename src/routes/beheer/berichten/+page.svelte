<script lang="ts">
	import { onMount } from 'svelte';
	import { message as errorText } from '#lib/admin/api.ts';
	import {
		MAX_SHOWN,
		deleteMessage,
		formatDate,
		loadMessages,
		replyLink,
		setRead,
		type ContactMessage
	} from '#lib/admin/messages.ts';

	let rows = $state<ContactMessage[]>([]);
	let loading = $state(true);
	let error = $state('');
	let info = $state('');
	let onlyUnread = $state(false);
	let search = $state('');
	let confirmId = $state<string | null>(null);

	const unread = $derived(rows.filter((m) => !m.is_read).length);
	const shown = $derived.by(() => {
		const s = search.trim().toLowerCase();
		return rows.filter(
			(m) =>
				(!onlyUnread || !m.is_read) &&
				(!s || [m.name, m.email, m.phone, m.message].some((v) => v.toLowerCase().includes(s)))
		);
	});

	onMount(reload);

	async function reload() {
		loading = true;
		error = '';
		try {
			rows = await loadMessages();
		} catch (e) {
			error = errorText(e);
		} finally {
			loading = false;
		}
	}

	async function act(fn: () => Promise<void>, done: string) {
		error = '';
		info = '';
		try {
			await fn();
			info = done;
		} catch (e) {
			error = errorText(e);
		}
	}

	const toggleRead = (m: ContactMessage) =>
		act(async () => {
			await setRead([m.id], !m.is_read);
			m.is_read = !m.is_read;
		}, m.is_read ? `Bericht van ${m.name} staat weer op ongelezen.` : `Bericht van ${m.name} is gelezen.`);

	const allRead = () =>
		act(async () => {
			const ids = rows.filter((m) => !m.is_read).map((m) => m.id);
			await setRead(ids, true);
			rows.forEach((m) => (m.is_read = true));
		}, 'Alle berichten zijn gelezen.');

	const remove = (m: ContactMessage) =>
		act(async () => {
			await deleteMessage(m.id);
			rows = rows.filter((r) => r.id !== m.id);
			confirmId = null;
		}, `Bericht van ${m.name} is verwijderd.`);

	// Beantwoorden telt ook als gelezen.
	function replied(m: ContactMessage) {
		if (!m.is_read) setRead([m.id], true).then(() => (m.is_read = true)).catch(() => {});
	}
</script>

<main class="container wide stack">
	<h1>Berichten</h1>
	<p class="muted">
		Berichten die bezoekers sturen via <a href="/contact">Contact</a> onderaan het beginscherm. Is de e-mail ingesteld, dan
		krijg je elk bericht ook per mail.
	</p>

	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if info}<p class="success" role="status">{info}</p>{/if}

	<section class="card filters">
		<label class="check"><input type="checkbox" bind:checked={onlyUnread} /> Alleen ongelezen</label>
		<div class="field">
			<label for="zoek">Zoeken</label>
			<input id="zoek" type="search" placeholder="Naam, e-mail of tekst" bind:value={search} />
		</div>
		<div class="row end">
			<button class="btn" onclick={allRead} disabled={!unread}>Alles gelezen</button>
			<button class="btn" onclick={reload} disabled={loading}>Vernieuwen</button>
		</div>
	</section>

	{#if loading && !rows.length}
		<p class="muted">Berichten laden…</p>
	{:else if !rows.length}
		<p class="card">Nog geen berichten.</p>
	{:else}
		<p class="muted small" data-testid="telling">
			{shown.length} van {rows.length} berichten · {unread} ongelezen{rows.length >= MAX_SHOWN
				? ` · alleen de nieuwste ${MAX_SHOWN} worden getoond`
				: ''}
		</p>
		{#if !shown.length}
			<p class="card">Geen berichten gevonden.</p>
		{/if}
		<ul class="list">
			{#each shown as m (m.id)}
				<li class="card stack msg" class:unread={!m.is_read}>
					<div class="row head">
						<strong class="name">{m.name}</strong>
						{#if !m.is_read}<span class="badge badge-on">nieuw</span>{/if}
						{#if !m.emailed}<span class="badge" title="Er is geen mail verstuurd (e-mail niet ingesteld of mislukt)">niet gemaild</span>{/if}
						<span class="spacer"></span>
						<span class="muted small">{formatDate(m.created_at)}</span>
					</div>
					<div class="row contact small">
						<a href="mailto:{m.email}">{m.email}</a>
						{#if m.phone}<a href="tel:{m.phone.replace(/[^0-9+]/g, '')}">{m.phone}</a>{/if}
					</div>
					<p class="text">{m.message}</p>
					<div class="row actions">
						<a class="btn btn-small" href={replyLink(m)} onclick={() => replied(m)}>Beantwoorden</a>
						<button class="btn btn-small" onclick={() => toggleRead(m)}>
							{m.is_read ? 'Markeer als ongelezen' : 'Markeer als gelezen'}
						</button>
						{#if confirmId === m.id}
							<span class="small">Zeker weten?</span>
							<button class="btn btn-small btn-red" onclick={() => remove(m)}>Ja, verwijderen</button>
							<button class="btn btn-small" onclick={() => (confirmId = null)}>Nee</button>
						{:else}
							<button class="btn btn-small" onclick={() => (confirmId = m.id)}>Verwijderen</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.filters {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 12px;
		align-items: end;
	}
	.end {
		justify-content: flex-end;
		gap: 8px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.msg.unread {
		border-color: var(--cyan);
	}
	.head,
	.contact,
	.actions {
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
	}
	.name {
		font-size: 1.1rem;
	}
	.spacer {
		flex: 1;
	}
	.text {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
