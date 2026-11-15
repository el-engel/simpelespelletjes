<script lang="ts">
	import type { AdminGame } from './api.ts';
	import { PERIODS } from './stats.ts';

	let {
		title,
		games,
		game,
		onGame,
		days = $bindable()
	}: { title: string; games: AdminGame[]; game: AdminGame | undefined; onGame: (slug: string) => void; days: number } =
		$props();
</script>

<div class="row head">
	<h1>{title}</h1>
	{#if games.length > 1}
		<label class="row">
			<span>Spel</span>
			<select value={game?.slug} onchange={(e) => onGame(e.currentTarget.value)}>
				{#each games as g (g.id)}<option value={g.slug}>{g.name}</option>{/each}
			</select>
		</label>
	{:else if game}
		<span class="badge">{game.name}</span>
	{/if}
	<label class="row">
		<span>Periode</span>
		<select bind:value={days}>
			{#each PERIODS as p (p.days)}<option value={p.days}>{p.label}</option>{/each}
		</select>
	</label>
</div>

<style>
	.head {
		gap: 16px;
	}
	.head h1 {
		margin: 0 auto 0 0;
	}
	select {
		width: auto;
	}
</style>
