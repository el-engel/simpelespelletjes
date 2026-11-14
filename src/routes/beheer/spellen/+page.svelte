<script lang="ts">
	import { onMount } from 'svelte';
	import { loadGames, message, saveGame, type AdminGame } from '#lib/admin/api.ts';
	import { renderMarkdown } from '#lib/markdown.ts';
	import { games as registry } from '#lib/games/registry.ts';

	let games = $state<AdminGame[]>([]);
	let editing = $state<AdminGame | null>(null);
	let error = $state('');
	let info = $state('');
	let busy = $state(false);
	let preview = $state(false);

	const preview_html = $derived(editing ? renderMarkdown(editing.rules) : '');

	onMount(load);

	async function load() {
		try {
			games = await loadGames();
		} catch (e) {
			error = message(e);
		}
	}

	function edit(g: AdminGame) {
		editing = { ...g };
		preview = false;
		info = '';
		error = '';
	}

	function create() {
		editing = {
			id: '',
			slug: '',
			name: '',
			description: '',
			rules: '## Zo speel je het spel\n\n1. …',
			id_prefix: 'V',
			minutes_per_question: 1,
			active: false,
			sort_order: games.length * 10 + 10
		};
	}

	async function save() {
		if (!editing) return;
		const g = editing;
		if (!/^[a-z0-9-]{2,40}$/.test(g.slug)) return (error = 'De korte naam (slug) mag alleen kleine letters, cijfers en - bevatten.');
		if (!g.name.trim()) return (error = 'Vul een naam in.');
		if (!/^[A-Z]{1,5}$/.test(g.id_prefix)) return (error = 'Het ID-voorvoegsel is 1 tot 5 hoofdletters, bijvoorbeeld RS.');
		const minutes = Number(g.minutes_per_question);
		if (!(minutes > 0 && minutes <= 60)) return (error = 'Minuten per vraag moet tussen 0 en 60 liggen.');
		busy = true;
		error = '';
		try {
			const { id, ...fields } = g;
			await saveGame({ ...(id ? { id } : {}), ...fields, minutes_per_question: minutes, name: g.name.trim() });
			info = `${g.name} opgeslagen.`;
			editing = null;
			await load();
		} catch (e) {
			error = message(e);
		} finally {
			busy = false;
		}
	}
</script>

<main class="container wide stack">
	<div class="row">
		<h1>Spellen en spelregels</h1>
		<span class="spacer"></span>
		<button class="btn" onclick={create}>+ Nieuw spel</button>
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if info}<p class="success" role="status">{info}</p>{/if}

	{#if editing}
		<section class="card stack">
			<h2>{editing.id ? `${editing.name} bewerken` : 'Nieuw spel'}</h2>
			<div class="grid">
				<div class="field">
					<label for="g-name">Naam</label>
					<input id="g-name" type="text" maxlength="60" bind:value={editing.name} />
				</div>
				<div class="field">
					<label for="g-slug">Korte naam in de link (slug)</label>
					<input id="g-slug" type="text" maxlength="40" bind:value={editing.slug} disabled={!!editing.id} />
					{#if !registry[editing.slug]}
						<span class="small muted">Let op: voor deze slug is nog geen spel gebouwd. Zet het spel pas aan als het gebouwd is.</span>
					{/if}
				</div>
				<div class="field">
					<label for="g-min">Minuten per vraag (voor "Spel duurt ongeveer…")</label>
					<input id="g-min" type="number" min="0.5" max="60" step="0.5" bind:value={editing.minutes_per_question} />
				</div>
				<div class="field">
					<label for="g-prefix">Voorvoegsel vraag-ID</label>
					<input id="g-prefix" type="text" maxlength="5" bind:value={editing.id_prefix} />
				</div>
				<div class="field">
					<label for="g-sort">Volgorde in het menu</label>
					<input id="g-sort" type="number" bind:value={editing.sort_order} />
				</div>
				<label class="check">
					<input type="checkbox" bind:checked={editing.active} />
					Zichtbaar in het hoofdmenu
				</label>
			</div>
			<div class="field">
				<label for="g-desc">Korte omschrijving (op de knop in het menu)</label>
				<input id="g-desc" type="text" maxlength="300" bind:value={editing.description} />
			</div>
			<div class="field">
				<div class="row">
					<label for="g-rules">Uitleg van de spelregels</label>
					<span class="spacer"></span>
					<button class="btn btn-small" onclick={() => (preview = !preview)}>{preview ? 'Bewerken' : 'Voorbeeld'}</button>
				</div>
				{#if preview}
					<div class="card prose rules-preview">{@html preview_html}</div>
				{:else}
					<textarea id="g-rules" rows="16" maxlength="10000" bind:value={editing.rules}></textarea>
					<span class="small muted">
						Opmaak: ## Kopje, **vet**, *schuin*, - opsomming, 1. genummerde lijst. Een lege regel begint een nieuwe alinea.
					</span>
				{/if}
			</div>
			<div class="row">
				<button class="btn btn-primary" disabled={busy} onclick={save}>Opslaan</button>
				<button class="btn-link" onclick={() => (editing = null)}>Annuleren</button>
			</div>
		</section>
	{/if}

	<section class="card">
		<table>
			<thead><tr><th>Naam</th><th>Slug</th><th>Min/vraag</th><th>ID</th><th>In menu</th><th></th></tr></thead>
			<tbody>
				{#each games as g (g.id)}
					<tr>
						<td><strong>{g.name}</strong><br /><span class="small muted">{g.description}</span></td>
						<td class="mono">{g.slug}</td>
						<td>{g.minutes_per_question}</td>
						<td class="mono">{g.id_prefix}-…</td>
						<td>{#if g.active}<span class="badge badge-on">aan</span>{:else}<span class="badge">uit</span>{/if}</td>
						<td><button class="btn btn-small" onclick={() => edit(g)}>Bewerken</button></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
</main>

<style>
	.spacer {
		flex: 1;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 12px 16px;
		align-items: end;
	}
	textarea {
		font-family: ui-monospace, monospace;
		font-size: 0.9rem;
	}
	.rules-preview {
		box-shadow: none;
		border: 1px solid var(--line);
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 8px;
		border-bottom: 1px solid var(--line);
		text-align: left;
		vertical-align: top;
	}
	.mono {
		font-family: ui-monospace, monospace;
	}
</style>
