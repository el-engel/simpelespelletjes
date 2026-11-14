<script lang="ts">
	import type { AdminCategory, AdminTaskType, Draft } from './api.ts';

	let {
		draft = $bindable(),
		categories,
		taskTypes,
		onAddCategory,
		compact = false,
		idPrefix = 'q'
	}: {
		draft: Draft;
		categories: AdminCategory[];
		taskTypes: AdminTaskType[];
		onAddCategory?: (name: string) => Promise<void>;
		compact?: boolean;
		idPrefix?: string;
	} = $props();

	let newCat = $state('');
	let adding = $state(false);

	const adult = $derived(categories.some((c) => c.is_18plus && draft.categoryIds.includes(c.id)));

	function toggle(list: string[], id: string, on: boolean) {
		return on ? [...new Set([...list, id])] : list.filter((x) => x !== id);
	}

	async function addCat() {
		const name = newCat.trim();
		if (!name || !onAddCategory) return;
		adding = true;
		try {
			await onAddCategory(name);
			newCat = '';
		} finally {
			adding = false;
		}
	}
</script>

<div class="editor" class:compact>
	<div class="field text">
		<label for="{idPrefix}-text">Vraag</label>
		<input id="{idPrefix}-text" type="text" maxlength="500" bind:value={draft.text} placeholder="Bijvoorbeeld: Pindarotsje" />
	</div>
	<div class="field age">
		<label for="{idPrefix}-age">Minimum leeftijd</label>
		<input id="{idPrefix}-age" type="number" min="0" max="99" bind:value={draft.min_age} />
		{#if adult && draft.min_age < 18}<span class="small muted">wordt 18 (18+-categorie)</span>{/if}
	</div>
	<fieldset>
		<legend>Categorieën</legend>
		<div class="options">
			{#each categories as c (c.id)}
				<label class="check">
					<input
						type="checkbox"
						checked={draft.categoryIds.includes(c.id)}
						onchange={(e) => (draft.categoryIds = toggle(draft.categoryIds, c.id, e.currentTarget.checked))}
					/>
					{c.name}
					{#if c.is_18plus}<span class="badge badge-adult">18+</span>{/if}
					{#if !c.active}<span class="badge">uit</span>{/if}
				</label>
			{/each}
		</div>
		{#if onAddCategory}
			<div class="row newcat">
				<input type="text" maxlength="60" placeholder="Nieuwe categorie" bind:value={newCat} aria-label="Nieuwe categorie" />
				<button type="button" class="btn btn-small" onclick={addCat} disabled={!newCat.trim() || adding}>
					Toevoegen
				</button>
			</div>
		{/if}
	</fieldset>
	<fieldset>
		<legend>Soort opdracht</legend>
		<div class="options">
			{#each taskTypes as t (t.id)}
				<label class="check">
					<input
						type="checkbox"
						checked={draft.taskTypeIds.includes(t.id)}
						onchange={(e) => (draft.taskTypeIds = toggle(draft.taskTypeIds, t.id, e.currentTarget.checked))}
					/>
					{t.name}
				</label>
			{/each}
		</div>
	</fieldset>
	<label class="check">
		<input type="checkbox" bind:checked={draft.active} />
		Actief (komt voor in het spel)
	</label>
</div>

<style>
	.editor {
		display: grid;
		grid-template-columns: 1fr 160px;
		gap: 12px 16px;
	}
	.text {
		grid-column: 1;
	}
	.age {
		grid-column: 2;
	}
	fieldset {
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 8px 12px;
		margin: 0;
		min-width: 0;
	}
	fieldset:first-of-type {
		grid-column: 1;
	}
	legend {
		font-weight: 600;
		padding: 0 4px;
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0 16px;
		max-height: 220px;
		overflow: auto;
	}
	.options .check {
		min-height: 32px;
	}
	.newcat input {
		width: auto;
		flex: 1;
		min-height: 34px;
	}
	@media (max-width: 700px) {
		.editor {
			grid-template-columns: 1fr;
		}
		.text,
		.age,
		fieldset:first-of-type {
			grid-column: 1;
		}
	}
</style>
