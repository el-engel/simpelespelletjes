<script lang="ts">
	import { onMount } from 'svelte';
	import { gamePicker } from '#lib/admin/useGame.svelte.ts';
	import { importQuestions, loadMeta, loadQuestions, message, type ImportResult } from '#lib/admin/api.ts';
	import { buildPreview, readTable, type PreviewRow } from '#lib/admin/upload.ts';
	import { exportXlsx } from '#lib/admin/export.ts';

	const picker = gamePicker();
	const game = $derived(picker.current);

	let fileName = $state('');
	let rows = $state<PreviewRow[]>([]);
	let error = $state('');
	let busy = $state(false);
	let createCategories = $state(true);
	let result = $state<ImportResult | null>(null);
	let showOnly = $state<'alle' | 'fout'>('alle');
	let dragging = $state(false);

	const counts = $derived({
		nieuw: rows.filter((r) => r.status === 'nieuw').length,
		bijwerken: rows.filter((r) => r.status === 'bijwerken').length,
		fout: rows.filter((r) => r.status === 'fout').length
	});
	const newCats = $derived([...new Set(rows.filter((r) => r.status !== 'fout').flatMap((r) => r.newCategories))]);
	const shown = $derived(showOnly === 'fout' ? rows.filter((r) => r.status === 'fout') : rows);
	const importable = $derived(counts.nieuw + counts.bijwerken);

	onMount(() => picker.load());

	async function handle(file: File | undefined) {
		if (!file || !game) return;
		error = '';
		result = null;
		rows = [];
		fileName = file.name;
		busy = true;
		try {
			const [table, meta, existing] = await Promise.all([readTable(file), loadMeta(game.id), loadQuestions(game.id)]);
			const preview = buildPreview(table, {
				categories: meta.categories.map((c) => c.name),
				taskTypes: meta.taskTypes.map((t) => ({ code: t.code, name: t.name })),
				ids: new Map(existing.map((q) => [q.public_id, q.text])),
				texts: new Set(existing.map((q) => q.text.toLowerCase()))
			});
			if (preview.missing.length) {
				error = `Deze kolommen ontbreken: ${preview.missing.join(', ')}. De eerste rij moet de kolomnamen bevatten.`;
				return;
			}
			if (preview.rows.length === 0) {
				error = 'Er staan geen vragen in dit bestand.';
				return;
			}
			if (preview.rows.length > 5000) {
				error = 'Maximaal 5000 rijen per upload. Splits het bestand.';
				return;
			}
			rows = preview.rows;
		} catch (e) {
			error = message(e);
		} finally {
			busy = false;
		}
	}

	/** Een rij met een nieuwe categorie is alleen goed als je "aanmaken" aanvinkt. */
	const blocked = (r: PreviewRow) => r.status !== 'fout' && r.newCategories.length > 0 && !createCategories;

	async function doImport() {
		if (!game) return;
		busy = true;
		error = '';
		try {
			const payload = rows
				.filter((r) => r.status !== 'fout' && !blocked(r))
				.map(({ row, id, text, categories, task_types, min_age }) => ({ row, id, text, categories, task_types, min_age }));
			result = await importQuestions(game.id, payload, createCategories, fileName);
			rows = [];
		} catch (e) {
			error = message(e);
		} finally {
			busy = false;
		}
	}

	async function downloadErrors() {
		const bad = rows.filter((r) => r.status === 'fout');
		await exportXlsx(
			bad.map((r) => [r.id ?? '', r.text, r.categories.join(';'), r.task_types.join(';'), r.min_age, r.problems.join('; ')]),
			`fouten-${fileName.replace(/\.[^.]+$/, '')}.xlsx`
		);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		handle(e.dataTransfer?.files?.[0]);
	}
</script>

<main class="container wide stack">
	<h1>Vragen uploaden</h1>
	{#if picker.games.length > 1}
		<label class="row">
			<span>Spel</span>
			<select value={game?.slug} onchange={(e) => picker.select(e.currentTarget.value)}>
				{#each picker.games as g (g.id)}<option value={g.slug}>{g.name}</option>{/each}
			</select>
		</label>
	{/if}

	<section class="card stack">
		<p>
			Upload een Excel-bestand (.xlsx) of CSV met deze kolommen in de eerste rij:
			<strong>ID</strong>, <strong>vraag</strong>, <strong>categorieën</strong>, <strong>soort opdracht</strong>,
			<strong>minimum leeftijd</strong>. Meerdere categorieën of soorten scheid je met een puntkomma (;).
		</p>
		<ul class="small muted">
			<li>ID leeg = nieuwe vraag. ID ingevuld = die vraag wordt bijgewerkt.</li>
			<li>Een vraag in een categorie met "18+" in de naam krijgt automatisch minimumleeftijd 18.</li>
			<li>Je ziet eerst een voorbeeld; er wordt pas iets opgeslagen als je op Importeren klikt.</li>
		</ul>
		<label
			class="drop"
			class:dragging
			ondragover={(e) => ((dragging = true), e.preventDefault())}
			ondragleave={() => (dragging = false)}
			ondrop={onDrop}
		>
			<input
				type="file"
				accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
				onchange={(e) => handle(e.currentTarget.files?.[0])}
			/>
			<span>{busy ? 'Bezig met lezen…' : 'Kies een bestand of sleep het hierheen'}</span>
			{#if fileName}<span class="small muted">{fileName}</span>{/if}
		</label>
	</section>

	{#if error}<p class="error" role="alert">{error}</p>{/if}

	{#if result}
		<section class="success stack" role="status">
			<p>
				<strong>Klaar.</strong> {result.created} nieuw, {result.updated} bijgewerkt{#if result.failed}, {result.failed}
					afgekeurd door de database{/if}.
			</p>
			{#if result.errors.length}
				<ul>
					{#each result.errors as e (e.row)}<li>Rij {e.row}: {e.message}</li>{/each}
				</ul>
			{/if}
			<a class="btn" href="/beheer/vragen?spel={game?.slug}">Naar de vragen</a>
		</section>
	{/if}

	{#if rows.length}
		<section class="card stack">
			<div class="row">
				<span class="badge badge-on">{counts.nieuw} nieuw</span>
				<span class="badge">{counts.bijwerken} bijwerken</span>
				<span class="badge badge-adult">{counts.fout} fout</span>
				<span class="spacer"></span>
				<label class="row small"
					><input type="radio" bind:group={showOnly} value="alle" /> Alles tonen</label
				>
				<label class="row small"><input type="radio" bind:group={showOnly} value="fout" /> Alleen fouten</label>
			</div>
			{#if newCats.length}
				<label class="check notice">
					<input type="checkbox" bind:checked={createCategories} />
					<span>Nieuwe categorieën aanmaken: <strong>{newCats.join(', ')}</strong></span>
				</label>
			{/if}
			<div class="tablewrap">
				<table>
					<thead>
						<tr><th>Rij</th><th>Status</th><th>ID</th><th>Vraag</th><th>Categorieën</th><th>Soort</th><th>Leeftijd</th></tr>
					</thead>
					<tbody>
						{#each shown as r (r.row)}
							<tr class={r.status}>
								<td>{r.row}</td>
								<td>
									{#if r.status === 'fout'}
										<strong>Fout:</strong> {r.problems.join('; ')}
									{:else if blocked(r)}
										Overslaan (nieuwe categorie)
									{:else}
										{r.status}
									{/if}
								</td>
								<td class="mono">{r.id ?? ''}</td>
								<td>{r.text}</td>
								<td>
									{#each r.categories as c, i (c)}{i ? ', ' : ''}{#if r.newCategories.includes(c)}<em>{c} (nieuw)</em>{:else}{c}{/if}{/each}
								</td>
								<td>{r.task_types.join(', ')}</td>
								<td>{r.min_age}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="row">
				<button class="btn btn-primary" disabled={busy || importable === 0} onclick={doImport}>
					{importable} {importable === 1 ? 'vraag' : 'vragen'} importeren
				</button>
				{#if counts.fout}
					<button class="btn" onclick={downloadErrors}>Foute rijen downloaden (Excel)</button>
				{/if}
				<button class="btn-link" onclick={() => ((rows = []), (fileName = ''))}>Annuleren</button>
			</div>
		</section>
	{/if}
</main>

<style>
	.spacer {
		flex: 1;
	}
	select {
		width: auto;
	}
	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 28px;
		border: 2px dashed var(--line);
		border-radius: var(--radius);
		cursor: pointer;
		text-align: center;
		font-weight: 600;
	}
	.drop.dragging {
		border-color: var(--brand);
		background: var(--surface-2);
	}
	.tablewrap {
		overflow: auto;
		max-height: 60vh;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	th,
	td {
		padding: 6px 8px;
		border-bottom: 1px solid var(--line);
		text-align: left;
		vertical-align: top;
	}
	th {
		position: sticky;
		top: 0;
		background: var(--surface-2);
	}
	tr.fout td {
		background: rgb(255 59 92 / 0.15);
	}
	.mono {
		font-family: ui-monospace, monospace;
	}
</style>
