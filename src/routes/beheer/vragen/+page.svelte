<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import QuestionEditor from '#lib/admin/QuestionEditor.svelte';
	import { gamePicker } from '#lib/admin/useGame.svelte.ts';
	import {
		deleteQuestions,
		loadMeta,
		loadQuestions,
		message,
		saveCategory,
		saveQuestion,
		setActive,
		type AdminCategory,
		type AdminQuestion,
		type AdminTaskType,
		type Draft
	} from '#lib/admin/api.ts';
	import { applyFilters, decorate, emptyFilters, sortRows, type Row, type SortKey } from '#lib/admin/filter.ts';
	import { exportCsv, exportXlsx, toRows } from '#lib/admin/export.ts';

	const picker = gamePicker();
	const PAGE = 50;

	let categories = $state<AdminCategory[]>([]);
	let taskTypes = $state<AdminTaskType[]>([]);
	let questions = $state<AdminQuestion[]>([]);
	let loading = $state(false);
	let error = $state('');
	let info = $state('');

	let filters = $state(emptyFilters());
	let sortKey = $state<SortKey>('created_at');
	let asc = $state(false);
	let pageNo = $state(0);
	const selected = new SvelteSet<string>();
	let confirmDelete = $state(false);
	let filtersOpen = $state(false);

	let editId = $state<string | null>(null);
	let editDraft = $state<Draft>(blank());
	let showNew = $state(false);
	let newDraft = $state<Draft>(blank());
	let saving = $state(false);

	const game = $derived(picker.current);
	const rows = $derived(decorate(questions, categories, taskTypes));
	const filtered = $derived(sortRows(applyFilters(rows, filters), sortKey, asc));
	const pages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE)));
	const visible = $derived(filtered.slice(pageNo * PAGE, pageNo * PAGE + PAGE));
	const allVisibleSelected = $derived(visible.length > 0 && visible.every((r) => selected.has(r.id)));

	function blank(): Draft {
		return { text: '', min_age: 6, active: true, categoryIds: [], taskTypeIds: [] };
	}

	onMount(() => picker.load());

	let loadedFor = '';
	$effect(() => {
		const id = game?.id;
		if (id && id !== loadedFor) {
			loadedFor = id;
			reload(id);
		}
	});

	// Terug naar pagina 1 als de filters veranderen.
	$effect(() => {
		void JSON.stringify(filters);
		pageNo = 0;
	});

	async function reload(gameId = game?.id) {
		if (!gameId) return;
		loading = true;
		error = '';
		try {
			const meta = await loadMeta(gameId);
			categories = meta.categories;
			taskTypes = meta.taskTypes;
			questions = await loadQuestions(gameId);
			selected.clear();
		} catch (e) {
			error = message(e);
		} finally {
			loading = false;
		}
	}

	function sortBy(key: SortKey) {
		if (sortKey === key) asc = !asc;
		else {
			sortKey = key;
			asc = key !== 'created_at';
		}
	}

	function startEdit(r: Row) {
		editId = r.id;
		editDraft = {
			text: r.text,
			min_age: r.min_age,
			active: r.active,
			categoryIds: [...r.categoryIds],
			taskTypeIds: [...r.taskTypeIds]
		};
	}

	function validate(d: Draft): string {
		if (!d.text.trim()) return 'Vul een vraag in.';
		if (!Number.isInteger(d.min_age) || d.min_age < 0 || d.min_age > 99) return 'Minimum leeftijd moet 0 tot 99 zijn.';
		if (d.categoryIds.length === 0) return 'Kies minstens één categorie.';
		if (d.taskTypeIds.length === 0) return 'Kies minstens één soort opdracht.';
		return '';
	}

	async function save(id: string | null, d: Draft, again = false) {
		if (!game) return;
		const problem = validate(d);
		if (problem) {
			error = problem;
			return;
		}
		saving = true;
		error = '';
		try {
			const saved = await saveQuestion(game.id, { id, ...d, text: d.text.trim() });
			info = id ? `Vraag ${saved.public_id} opgeslagen.` : `Vraag ${saved.public_id} toegevoegd.`;
			const updated: AdminQuestion = {
				id: saved.id,
				public_id: saved.public_id,
				text: d.text.trim(),
				min_age: saved.min_age,
				active: d.active,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				categoryIds: [...d.categoryIds],
				taskTypeIds: [...d.taskTypeIds]
			};
			if (id) {
				questions = questions.map((q) => (q.id === id ? { ...updated, created_at: q.created_at } : q));
				editId = null;
			} else {
				questions = [updated, ...questions];
				newDraft = again
					? { ...blank(), min_age: d.min_age, categoryIds: [...d.categoryIds], taskTypeIds: [...d.taskTypeIds] }
					: blank();
				if (!again) showNew = false;
			}
		} catch (e) {
			error = message(e);
		} finally {
			saving = false;
		}
	}

	async function addCategory(name: string, target: 'new' | 'edit') {
		if (!game) return;
		try {
			await saveCategory({ game_id: game.id, name, is_18plus: /18\s*\+/.test(name) });
			const meta = await loadMeta(game.id);
			categories = meta.categories;
			const created = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
			if (created) {
				if (target === 'new') newDraft.categoryIds = [...newDraft.categoryIds, created.id];
				else editDraft.categoryIds = [...editDraft.categoryIds, created.id];
			}
		} catch (e) {
			error = message(e);
		}
	}

	async function toggleActive(r: Row) {
		try {
			await setActive([r.id], !r.active);
			questions = questions.map((q) => (q.id === r.id ? { ...q, active: !r.active } : q));
		} catch (e) {
			error = message(e);
		}
	}

	async function bulkActive(active: boolean) {
		const ids = [...selected];
		if (!ids.length) return;
		try {
			await setActive(ids, active);
			const set = new Set(ids);
			questions = questions.map((q) => (set.has(q.id) ? { ...q, active } : q));
			info = `${ids.length} ${ids.length === 1 ? 'vraag' : 'vragen'} ${active ? 'geactiveerd' : 'gedeactiveerd'}.`;
			selected.clear();
		} catch (e) {
			error = message(e);
		}
	}

	async function bulkDelete() {
		const ids = [...selected];
		if (!ids.length) return;
		try {
			await deleteQuestions(ids);
			const set = new Set(ids);
			questions = questions.filter((q) => !set.has(q.id));
			info = `${ids.length} ${ids.length === 1 ? 'vraag' : 'vragen'} verwijderd.`;
			selected.clear();
			confirmDelete = false;
		} catch (e) {
			error = message(e);
		}
	}

	function toggleVisible(on: boolean) {
		for (const r of visible) on ? selected.add(r.id) : selected.delete(r.id);
	}

	function selectAllFiltered() {
		for (const r of filtered) selected.add(r.id);
	}

	async function doExport(kind: 'xlsx' | 'csv') {
		if (!game) return;
		const data = toRows(filtered, categories, taskTypes);
		const name = `${game.slug}-vragen-${new Date().toISOString().slice(0, 10)}.${kind}`;
		try {
			if (kind === 'xlsx') await exportXlsx(data, name);
			else await exportCsv(data, name);
		} catch (e) {
			error = message(e);
		}
	}

	const arrow = (k: SortKey) => (sortKey === k ? (asc ? ' ▲' : ' ▼') : '');
	const filtersActive = $derived(JSON.stringify(filters) !== JSON.stringify(emptyFilters()));
</script>

<main class="container wide stack">
	<div class="row head">
		<h1>Vragen</h1>
		{#if picker.games.length > 1}
			<label class="row">
				<span>Spel</span>
				<select value={game?.slug} onchange={(e) => picker.select(e.currentTarget.value)}>
					{#each picker.games as g (g.id)}<option value={g.slug}>{g.name}</option>{/each}
				</select>
			</label>
		{:else if game}
			<span class="badge">{game.name}</span>
		{/if}
		<span class="spacer"></span>
		<button class="btn btn-primary" onclick={() => (showNew = !showNew)}>{showNew ? 'Sluiten' : '+ Nieuwe vraag'}</button>
	</div>

	{#if picker.error}<p class="error">{picker.error}</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if info}<p class="success" role="status">{info}</p>{/if}

	{#if showNew && game}
		<section class="card stack">
			<h2>Nieuwe vraag voor {game.name}</h2>
			<QuestionEditor
				bind:draft={newDraft}
				{categories}
				{taskTypes}
				idPrefix="nieuw"
				onAddCategory={(n) => addCategory(n, 'new')}
			/>
			<div class="row">
				<button class="btn btn-primary" disabled={saving} onclick={() => save(null, newDraft)}>Opslaan</button>
				<button class="btn" disabled={saving} onclick={() => save(null, newDraft, true)}>Opslaan en nog een</button>
				<button class="btn-link" onclick={() => ((showNew = false), (newDraft = blank()))}>Annuleren</button>
			</div>
		</section>
	{/if}

	<section class="card stack">
		<div class="field">
			<label for="zoek">Zoeken in alle kolommen</label>
			<input id="zoek" type="search" placeholder="Bijvoorbeeld: dieren tekenen" bind:value={filters.search} />
		</div>
		<details bind:open={filtersOpen}>
			<summary>Filters per kolom</summary>
			<div class="filters">
				<div class="field">
					<label for="f-id">ID</label>
					<input id="f-id" type="text" bind:value={filters.id} />
				</div>
				<div class="field">
					<label for="f-text">Vraag bevat</label>
					<input id="f-text" type="text" bind:value={filters.text} />
				</div>
				<div class="field">
					<label for="f-cat">Categorie</label>
					<select id="f-cat" bind:value={filters.categoryId}>
						<option value="">Alle</option>
						{#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label for="f-tt">Soort opdracht</label>
					<select id="f-tt" bind:value={filters.taskTypeId}>
						<option value="">Alle</option>
						{#each taskTypes as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label for="f-min">Leeftijd van</label>
					<input id="f-min" type="number" min="0" max="99" bind:value={filters.ageMin} />
				</div>
				<div class="field">
					<label for="f-max">Leeftijd tot en met</label>
					<input id="f-max" type="number" min="0" max="99" bind:value={filters.ageMax} />
				</div>
				<div class="field">
					<label for="f-status">Status</label>
					<select id="f-status" bind:value={filters.status}>
						<option value="alle">Alle</option>
						<option value="actief">Actief</option>
						<option value="inactief">Inactief</option>
					</select>
				</div>
				<div class="field end">
					<button class="btn" onclick={() => (filters = emptyFilters())} disabled={!filtersActive}>Filters wissen</button>
				</div>
			</div>
		</details>
	</section>

	<div class="row toolbar">
		<span data-testid="telling"><strong>{filtered.length}</strong> van {questions.length} vragen</span>
		{#if selected.size > 0}
			<span class="badge badge-on">{selected.size} geselecteerd</span>
			<button class="btn btn-small" onclick={() => bulkActive(true)}>Activeren</button>
			<button class="btn btn-small" onclick={() => bulkActive(false)}>De-activeren</button>
			{#if confirmDelete}
				<button class="btn btn-small btn-red" onclick={bulkDelete}>Ja, definitief verwijderen</button>
				<button class="btn-link" onclick={() => (confirmDelete = false)}>Nee</button>
			{:else}
				<button class="btn btn-small" onclick={() => (confirmDelete = true)}>Verwijderen</button>
			{/if}
			<button class="btn-link" onclick={() => selected.clear()}>Selectie wissen</button>
		{:else if filtered.length > 0}
			<button class="btn-link" onclick={selectAllFiltered}>Selecteer alle {filtered.length} gefilterde vragen</button>
		{/if}
		<span class="spacer"></span>
		<button class="btn btn-small" onclick={() => doExport('xlsx')}>Export Excel</button>
		<button class="btn btn-small" onclick={() => doExport('csv')}>Export CSV</button>
	</div>

	<div class="field mobile-sort">
		<label for="sorteer">Sorteren op</label>
		<select
			id="sorteer"
			value={`${sortKey}:${asc ? 'op' : 'af'}`}
			onchange={(e) => {
				const [k, dir] = e.currentTarget.value.split(':');
				sortKey = k as SortKey;
				asc = dir === 'op';
			}}
		>
			<option value="created_at:af">Nieuwste eerst</option>
			<option value="created_at:op">Oudste eerst</option>
			<option value="public_id:op">ID</option>
			<option value="text:op">Vraag (A-Z)</option>
			<option value="categories:op">Categorie (A-Z)</option>
			<option value="taskTypes:op">Soort opdracht (A-Z)</option>
			<option value="min_age:op">Leeftijd (laag-hoog)</option>
			<option value="min_age:af">Leeftijd (hoog-laag)</option>
			<option value="active:op">Uit eerst</option>
		</select>
	</div>

	{#if loading}
		<p class="muted">Vragen laden…</p>
	{:else}
		<div class="tablewrap">
			<table class="stacked">
				<thead>
					<tr>
						<th class="sel">
							<input
								type="checkbox"
								aria-label="Selecteer alles op deze pagina"
								checked={allVisibleSelected}
								onchange={(e) => toggleVisible(e.currentTarget.checked)}
							/>
						</th>
						<th><button class="sort" onclick={() => sortBy('public_id')}>ID{arrow('public_id')}</button></th>
						<th><button class="sort" onclick={() => sortBy('text')}>Vraag{arrow('text')}</button></th>
						<th><button class="sort" onclick={() => sortBy('categories')}>Categorieën{arrow('categories')}</button></th>
						<th><button class="sort" onclick={() => sortBy('taskTypes')}>Soort opdracht{arrow('taskTypes')}</button></th>
						<th><button class="sort" onclick={() => sortBy('min_age')}>Min. leeftijd{arrow('min_age')}</button></th>
						<th><button class="sort" onclick={() => sortBy('active')}>Actief{arrow('active')}</button></th>
						<th><span class="sr-only">Acties</span></th>
					</tr>
				</thead>
				<tbody>
					{#each visible as r (r.id)}
						{#if editId === r.id}
							<tr class="editing">
								<td colspan="8">
									<div class="stack">
										<strong>{r.public_id} bewerken</strong>
										<QuestionEditor
											bind:draft={editDraft}
											{categories}
											{taskTypes}
											idPrefix="edit"
											onAddCategory={(n) => addCategory(n, 'edit')}
										/>
										<div class="row">
											<button class="btn btn-primary btn-small" disabled={saving} onclick={() => save(r.id, editDraft)}>
												Opslaan
											</button>
											<button class="btn-link" onclick={() => (editId = null)}>Annuleren</button>
										</div>
									</div>
								</td>
							</tr>
						{:else}
							<tr class="qrow" class:inactive={!r.active}>
								<td class="sel">
									<input
										type="checkbox"
										aria-label="Selecteer {r.public_id}"
										checked={selected.has(r.id)}
										onchange={(e) => (e.currentTarget.checked ? selected.add(r.id) : selected.delete(r.id))}
									/>
								</td>
								<td class="mono id">{r.public_id}</td>
								<td class="click text" ondblclick={() => startEdit(r)}>{r.text}</td>
								<td class="click cats" data-label="Categorieën" ondblclick={() => startEdit(r)}>
									{r.categoryNames}
									{#if r.adult}<span class="badge badge-adult">18+</span>{/if}
								</td>
								<td class="click types" data-label="Soort opdracht" ondblclick={() => startEdit(r)}>{r.taskTypeNames}</td>
								<td class="num click age" data-label="Min. leeftijd" ondblclick={() => startEdit(r)}>{r.min_age}</td>
								<td class="act">
									<label class="switch">
										<input type="checkbox" checked={r.active} onchange={() => toggleActive(r)} aria-label="Actief {r.public_id}" />
										<span>{r.active ? 'aan' : 'uit'}</span>
									</label>
								</td>
								<td class="edit"><button class="btn btn-small" onclick={() => startEdit(r)}>Bewerken</button></td>
							</tr>
						{/if}
					{:else}
						<tr><td colspan="8" class="muted empty">Geen vragen gevonden.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if pages > 1}
			<div class="row pager">
				<button class="btn btn-small" disabled={pageNo === 0} onclick={() => pageNo--}>Vorige</button>
				<span>Pagina {pageNo + 1} van {pages}</span>
				<button class="btn btn-small" disabled={pageNo >= pages - 1} onclick={() => pageNo++}>Volgende</button>
			</div>
		{/if}
		<p class="muted small desktop-only">Tip: dubbelklik op een cel om de vraag te bewerken.</p>
	{/if}
</main>

<style>
	.head h1 {
		margin: 0;
	}
	.spacer {
		flex: 1;
	}
	.head select {
		width: auto;
	}
	.filters {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: 12px;
		margin-top: 12px;
	}
	.filters .end {
		justify-content: flex-end;
	}
	summary {
		cursor: pointer;
		font-weight: 600;
	}
	.toolbar {
		gap: 10px;
	}
	.tablewrap {
		position: relative;
		overflow-x: auto;
		background: var(--surface);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.95rem;
	}
	th,
	td {
		padding: 8px 10px;
		border-bottom: 1px solid var(--line);
		text-align: left;
		vertical-align: top;
	}
	th {
		background: var(--surface-2);
		white-space: nowrap;
	}
	.sort {
		background: none;
		border: none;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
		color: var(--text);
	}
	.sel {
		width: 36px;
	}
	.sel input {
		width: 18px;
		height: 18px;
	}
	.mono {
		font-family: ui-monospace, monospace;
		white-space: nowrap;
	}
	.num {
		text-align: right;
	}
	.click {
		cursor: text;
	}
	tr.inactive td {
		color: var(--muted);
	}
	tr.editing td {
		background: rgb(255 210 63 / 0.12);
	}
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 500;
	}
	.empty {
		text-align: center;
		padding: 24px;
	}
	.pager {
		justify-content: center;
	}
	.mobile-sort {
		display: none;
	}

	/* Telefoon: elke vraag als kaartje. */
	@media (max-width: 700px) {
		.mobile-sort {
			display: flex;
		}
		.desktop-only {
			display: none;
		}
		.head h1 {
			flex: 1;
		}
		.toolbar .spacer {
			display: none;
		}
		table {
			font-size: 1rem;
		}
		tr.qrow {
			display: grid;
			grid-template-columns: auto 1fr auto;
			grid-template-areas:
				'sel id act'
				'text text text'
				'cats cats cats'
				'types types age'
				'edit edit edit';
			column-gap: 10px;
			align-items: center;
		}
		tr.qrow > td {
			width: auto;
		}
		tr.qrow > .sel {
			grid-area: sel;
		}
		tr.qrow > .sel input {
			width: 24px;
			height: 24px;
		}
		tr.qrow > .id {
			grid-area: id;
			font-size: 0.85rem;
			color: var(--muted);
		}
		tr.qrow > .act {
			grid-area: act;
		}
		tr.qrow > .text {
			grid-area: text;
			font-weight: 600;
			font-size: 1.1rem;
		}
		tr.qrow > .cats {
			grid-area: cats;
		}
		tr.qrow > .types {
			grid-area: types;
		}
		tr.qrow > .age {
			grid-area: age;
			text-align: right;
		}
		tr.qrow > .edit {
			grid-area: edit;
			padding-top: 6px;
		}
		tr.qrow > .edit .btn {
			width: 100%;
			min-height: 44px;
		}
		.switch input {
			width: 22px;
			height: 22px;
		}
		tr.editing > td {
			padding: 12px;
		}
	}
</style>
