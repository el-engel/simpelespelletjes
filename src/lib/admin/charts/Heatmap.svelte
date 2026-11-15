<script lang="ts">
	import { DAYS } from '../statcalc.ts';

	let { cells }: { cells: { dow: number; hour: number; games: number }[] } = $props();

	const grid = $derived.by(() => {
		const m = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.games]));
		return DAYS.map((_, d) => Array.from({ length: 24 }, (_, h) => m.get(`${d + 1}-${h}`) ?? 0));
	});
	const max = $derived(Math.max(1, ...cells.map((c) => c.games)));
	// Eén kleur, van licht (weinig) naar vol (veel).
	const shade = (n: number) => (n === 0 ? 'transparent' : `rgb(42 159 214 / ${0.2 + 0.8 * (n / max)})`);
</script>

<div class="wrap">
	<table class="heat">
		<caption class="sr-only">Gespeelde spellen per dag van de week en uur</caption>
		<thead>
			<tr>
				<th></th>
				{#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
					<th scope="col">{h % 3 === 0 ? h : ''}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each grid as row, d (d)}
				<tr>
					<th scope="row">{DAYS[d]}</th>
					{#each row as n, h (h)}
						<td style="background: {shade(n)}" title="{DAYS[d]} {h}:00–{h + 1}:00: {n} {n === 1 ? 'spel' : 'spellen'}">
							<span class="sr-only">{n}</span>
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.wrap {
		overflow-x: auto;
	}
	.heat {
		border-collapse: separate;
		border-spacing: 2px;
		font-size: 0.7rem;
		color: var(--muted);
	}
	th {
		font-weight: 500;
		padding: 0 4px 0 0;
		text-align: right;
	}
	thead th {
		text-align: left;
	}
	td {
		width: 18px;
		height: 18px;
		min-width: 18px;
		border-radius: 3px;
		border: 1px solid rgb(179 170 222 / 0.12);
	}
</style>
