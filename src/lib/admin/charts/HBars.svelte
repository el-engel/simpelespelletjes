<script lang="ts">
	import { SERIES } from './colors.ts';

	let { rows, unit = '' }: { rows: { label: string; value: number; note?: string }[]; unit?: string } = $props();
	const max = $derived(Math.max(1, ...rows.map((r) => r.value)));
</script>

<ul class="hbars">
	{#each rows as r (r.label)}
		<li>
			<span class="label">{r.label}</span>
			<span class="track"><span class="fill" style="width: {(r.value / max) * 100}%; background: {SERIES[0]}"></span></span>
			<span class="value">{r.value}{unit}{#if r.note}<span class="note"> {r.note}</span>{/if}</span>
		</li>
	{/each}
</ul>

<style>
	.hbars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	li {
		display: grid;
		grid-template-columns: minmax(90px, 34%) 1fr auto;
		gap: 10px;
		align-items: center;
		font-size: 0.9rem;
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.track {
		height: 14px;
	}
	.fill {
		display: block;
		height: 100%;
		min-width: 2px;
		border-radius: 0 4px 4px 0;
	}
	.value {
		font-variant-numeric: tabular-nums;
		min-width: 3ch;
		text-align: right;
	}
	.note {
		color: var(--muted);
	}
</style>
