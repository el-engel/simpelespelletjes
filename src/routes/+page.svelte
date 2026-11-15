<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Simpele spelletjes</title>
	<meta name="description" content="Simpele spelletjes om samen op één telefoon te spelen." />
</svelte:head>

<main class="container stack">
	<header class="hero">
		<p class="ready">Player 1 ready</p>
		<h1>Simple<br />games</h1>
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
						<span class="tile-start" aria-hidden="true">Start</span>
					</a>
				</li>
			{/each}
			<li class="soon">Meer spellen komen eraan</li>
		</ul>
	{/if}

	<footer class="foot">
		<a class="btn contact" href="/contact">Contact</a>
	</footer>
</main>

<style>
	.hero {
		padding: 40px 0 8px;
		text-align: center;
	}
	.ready {
		margin: 0 0 8px;
		font-weight: 700;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--cyan);
		font-size: 0.85rem;
	}
	.hero h1 {
		font-size: clamp(2.6rem, 13vw, 3.4rem);
		line-height: 1;
		margin-bottom: 16px;
	}
	.games {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 16px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 24px 22px;
		border-radius: 20px;
		background: var(--surface);
		border: 2px solid var(--cyan);
		box-shadow: var(--glow-cyan);
		color: var(--text);
		text-decoration: none;
		transition: transform 0.1s ease;
	}
	.tile:hover {
		transform: translateY(-2px);
	}
	.tile:active {
		transform: scale(0.98);
	}
	.tile-name {
		font-family: var(--font-display);
		font-size: 1.9rem;
		color: var(--lime);
		line-height: 1.1;
	}
	.tile-desc {
		color: var(--muted);
	}
	.tile-start {
		margin-top: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 56px;
		border-radius: 14px;
		background: var(--lime);
		color: var(--on-neon);
		font-family: var(--font-display);
		font-size: 1.2rem;
		text-transform: uppercase;
		box-shadow: var(--glow-lime);
	}
	.foot {
		margin-top: 24px;
		padding-bottom: 24px;
		display: flex;
		justify-content: center;
	}
	.contact {
		min-width: 180px;
	}
	.soon {
		border: 2px dashed var(--line);
		border-radius: 20px;
		padding: 18px;
		text-align: center;
		color: var(--muted);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-size: 0.85rem;
		font-weight: 700;
	}
</style>
