<script lang="ts">
	import { onMount } from 'svelte';
	import { gamePicker } from '#lib/admin/useGame.svelte.ts';
	import {
		loadMeta,
		message,
		saveCategory,
		saveTaskType,
		type AdminCategory,
		type AdminTaskType
	} from '#lib/admin/api.ts';

	const picker = gamePicker();
	const game = $derived(picker.current);

	let categories = $state<AdminCategory[]>([]);
	let taskTypes = $state<AdminTaskType[]>([]);
	let error = $state('');
	let info = $state('');
	let newCat = $state('');
	let newCatAdult = $state(false);
	let newTt = $state('');

	onMount(() => picker.load());

	let loadedFor = '';
	$effect(() => {
		const id = game?.id;
		if (id && id !== loadedFor) {
			loadedFor = id;
			reload();
		}
	});

	async function reload() {
		if (!game) return;
		try {
			const meta = await loadMeta(game.id);
			categories = meta.categories;
			taskTypes = meta.taskTypes;
		} catch (e) {
			error = message(e);
		}
	}

	async function run(fn: () => Promise<void>, done: string) {
		error = '';
		info = '';
		try {
			await fn();
			info = done;
			await reload();
		} catch (e) {
			error = message(e);
			await reload();
		}
	}

	const updateCat = (c: AdminCategory, fields: Partial<AdminCategory>) =>
		run(() => saveCategory({ id: c.id, game_id: c.game_id, ...fields }), `Categorie "${fields.name ?? c.name}" opgeslagen.`);

	const updateTt = (t: AdminTaskType, fields: Partial<AdminTaskType>) =>
		run(() => saveTaskType({ id: t.id, game_id: t.game_id, ...fields }), `Soort "${fields.name ?? t.name}" opgeslagen.`);

	function addCat() {
		if (!game || !newCat.trim()) return;
		const name = newCat.trim();
		run(() => saveCategory({ game_id: game!.id, name, is_18plus: newCatAdult || /18\s*\+/.test(name) }), `Categorie "${name}" toegevoegd.`);
		newCat = '';
		newCatAdult = false;
	}

	function addTt() {
		if (!game || !newTt.trim()) return;
		const name = newTt.trim();
		const code = name
			.toLowerCase()
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 30);
		run(
			() => saveTaskType({ game_id: game!.id, name, code, sort_order: (taskTypes.at(-1)?.sort_order ?? 0) + 1 }),
			`Soort "${name}" toegevoegd.`
		);
		newTt = '';
	}
</script>

<main class="container wide stack">
	<h1>Categorieën en soorten opdrachten</h1>
	{#if picker.games.length > 1}
		<label class="row">
			<span>Spel</span>
			<select value={game?.slug} onchange={(e) => picker.select(e.currentTarget.value)}>
				{#each picker.games as g (g.id)}<option value={g.slug}>{g.name}</option>{/each}
			</select>
		</label>
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if info}<p class="success" role="status">{info}</p>{/if}

	<div class="cols">
		<section class="card stack">
			<h2>Categorieën</h2>
			<p class="small muted">
				Wijzig een naam en klik buiten het veld om op te slaan. Een 18+-categorie is nooit te kiezen als de jongste speler
				jonger dan 18 is.
			</p>
			<table>
				<thead><tr><th>Naam</th><th>18+</th><th>Actief</th></tr></thead>
				<tbody>
					{#each categories as c (c.id)}
						<tr>
							<td>
								<input
									type="text"
									maxlength="60"
									value={c.name}
									aria-label="Naam categorie"
									onchange={(e) => e.currentTarget.value.trim() && updateCat(c, { name: e.currentTarget.value.trim() })}
								/>
							</td>
							<td>
								<input type="checkbox" checked={c.is_18plus} aria-label="18+ {c.name}" onchange={(e) => updateCat(c, { is_18plus: e.currentTarget.checked })} />
							</td>
							<td>
								<input type="checkbox" checked={c.active} aria-label="Actief {c.name}" onchange={(e) => updateCat(c, { active: e.currentTarget.checked })} />
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<div class="row">
				<input type="text" maxlength="60" placeholder="Nieuwe categorie" bind:value={newCat} aria-label="Nieuwe categorie" />
				<label class="check"><input type="checkbox" bind:checked={newCatAdult} /> 18+</label>
				<button class="btn" onclick={addCat} disabled={!newCat.trim()}>Toevoegen</button>
			</div>
		</section>

		<section class="card stack">
			<h2>Soorten opdrachten</h2>
			<p class="small muted">De code wordt gebruikt bij uploaden (naast de naam). Wijzig de code liever niet.</p>
			<table>
				<thead><tr><th>Naam</th><th>Code</th><th>Volgorde</th><th>Actief</th></tr></thead>
				<tbody>
					{#each taskTypes as t (t.id)}
						<tr>
							<td>
								<input type="text" maxlength="60" value={t.name} aria-label="Naam soort" onchange={(e) => e.currentTarget.value.trim() && updateTt(t, { name: e.currentTarget.value.trim() })} />
							</td>
							<td class="mono">{t.code}</td>
							<td>
								<input type="number" class="short" value={t.sort_order} aria-label="Volgorde" onchange={(e) => updateTt(t, { sort_order: Number(e.currentTarget.value) || 0 })} />
							</td>
							<td>
								<input type="checkbox" checked={t.active} aria-label="Actief {t.name}" onchange={(e) => updateTt(t, { active: e.currentTarget.checked })} />
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<div class="row">
				<input type="text" maxlength="60" placeholder="Nieuwe soort opdracht" bind:value={newTt} aria-label="Nieuwe soort opdracht" />
				<button class="btn" onclick={addTt} disabled={!newTt.trim()}>Toevoegen</button>
			</div>
		</section>
	</div>
</main>

<style>
	select {
		width: auto;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 16px;
		align-items: start;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 6px;
		border-bottom: 1px solid var(--line);
		text-align: left;
	}
	td input[type='checkbox'] {
		width: 20px;
		height: 20px;
	}
	td input[type='text'] {
		min-height: 36px;
	}
	.short {
		width: 80px;
		min-height: 36px;
	}
	.row input[type='text'] {
		flex: 1;
		width: auto;
	}
	.mono {
		font-family: ui-monospace, monospace;
	}
</style>
