<script lang="ts">
	import type { Player } from './logic';

	let { players, perPlayer, showTurns = true }: { players: Player[]; perPlayer: number; showTurns?: boolean } =
		$props();

	const sorted = $derived([...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)));
</script>

<section class="card" aria-label="Score">
	<table>
		<thead>
			<tr>
				<th scope="col">Speler</th>
				<th scope="col" class="num">Punten</th>
				{#if showTurns}<th scope="col" class="num">Beurten</th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each sorted as p (p.id)}
				<tr>
					<td>{p.name}</td>
					<td class="num"><strong>{p.score}</strong></td>
					{#if showTurns}<td class="num muted">{p.turns}/{perPlayer}</td>{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<style>
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 6px 4px;
		text-align: left;
		border-bottom: 1px solid var(--line);
	}
	tr:last-child td {
		border-bottom: none;
	}
	th {
		font-size: 0.85rem;
		color: var(--muted);
		font-weight: 600;
	}
	.num {
		text-align: right;
		width: 80px;
	}
</style>
