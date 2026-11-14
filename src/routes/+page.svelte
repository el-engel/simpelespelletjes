<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Simpele spelletjes</title>
	<meta name="description" content="Simpele spelletjes om samen op één telefoon te spelen." />
</svelte:head>

<main class="container stack">
	<header class="hero">
		<h1>Simpele spelletjes</h1>
		<p class="muted">Kies een spel en speel samen op één telefoon of tablet.</p>
	</header>

	{#if data.failed}
		<p class="error">De spellen konden niet worden geladen. Probeer het over een paar minuten opnieuw.</p>
	{:else if data.games.length === 0}
		<p class="notice">Er staan nog geen spellen klaar.</p>
	{:else}
		<ul class="games">
			{#each data.games as game (game.id)}
				<li>
					<a class="tile" href="/spel/{game.slug}">
						<span class="tile-name">{game.name}</span>
						{#if game.description}<span class="tile-desc">{game.description}</span>{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.hero {
		padding: 24px 0 8px;
		text-align: center;
	}
	.hero h1 {
		font-size: 2rem;
	}
	.games {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 12px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 22px 20px;
		border-radius: 18px;
		background: var(--brand);
		color: #fff;
		text-decoration: none;
		box-shadow: var(--shadow);
	}
	.tile:hover {
		background: var(--brand-dark);
	}
	.tile-name {
		font-size: 1.5rem;
		font-weight: 700;
	}
	.tile-desc {
		opacity: 0.95;
	}
</style>
