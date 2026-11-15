<script lang="ts">
	import type { Player } from './logic';

	let { players, perPlayer, showTurns = true }: { players: Player[]; perPlayer: number; showTurns?: boolean } =
		$props();

	const sorted = $derived([...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)));
</script>

<section class="card" aria-label="Score">
	<p class="title">Highscores</p>
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
				<tr class:top={p.score > 0 && p.score === sorted[0].score}>
					<td class="name">{p.name}</td>
					<td class="num score">{p.score}</td>
					{#if showTurns}<td class="num muted">{p.turns}/{perPlayer}</td>{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<style>
	.title {
		margin: 0 0 8px;
		font-weight: 700;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		color: var(--muted);
		font-size: 0.8rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 8px 4px;
		text-align: left;
		border-bottom: 1px solid var(--line);
	}
	tr:last-child td {
		border-bottom: none;
	}
	th {
		font-size: 0.8rem;
		color: var(--muted);
		font-weight: 600;
	}
	.name {
		font-weight: 700;
		font-size: 1.1rem;
		word-break: break-word;
	}
	.score {
		font-family: var(--font-display);
		font-size: 1.3rem;
	}
	.top .score,
	.top .name {
		color: var(--yellow);
	}
	.num {
		text-align: right;
		width: 80px;
	}
</style>
